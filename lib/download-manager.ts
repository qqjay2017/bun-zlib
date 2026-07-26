import type {
  DownloadTask,
  CreateDownloadRequest,
  ChapterDownloadItem,
  ProgressListener,
  TaskProgress,
  TaskStatus,
} from './download-types';
import { fetchPageHtml, fetchRemoteText } from '../backend';
import { loadChapter, saveChapter } from './cache-manager';
import { getDb } from './db';
import type { ContentType } from './cache-types';
import { getSourceById } from './source-config';
import { getManwapiImageApiUrl } from './sources/manwapi';
import { cacheComicChapterImages } from './comic-assets';

// ============================================================
// 常量
// ============================================================

const MAX_CONCURRENCY = 4;
const HTTP_ONLY_SOURCES = new Set(['manwapi']);
const CHAPTER_DELAY_MS = 2_000;
const HTTP_ONLY_CHAPTER_DELAY_MS = 0;

function getChapterDelayMs(sourceId: string): number {
  return HTTP_ONLY_SOURCES.has(sourceId) ? HTTP_ONLY_CHAPTER_DELAY_MS : CHAPTER_DELAY_MS;
}

class CloudflareChallengeError extends Error {
  constructor() {
    super('触发 Cloudflare 校验，已停止缓存任务。请先在 Chrome/WebView 中通过验证后再继续。');
    this.name = 'CloudflareChallengeError';
  }
}

function isChallengePage(html: string): boolean {
  return /Just a moment|请稍候|正在进行安全验证|cf-turnstile|challenges\.cloudflare\.com/i.test(html);
}

// ============================================================
// 持久化行类型
// ============================================================

interface DownloadTaskRow {
  task_id: string;
  source_id: string;
  book_id: string;
  content_type: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  percent: number;
  error: string | null;
  created_at: number;
  updated_at: number;
}

interface DownloadTaskChapterRow {
  task_id: string;
  seq: number;
  chapter_id: string;
  chapter_name: string;
  chapter_detail_url: string;
  status: string;
}

// ============================================================
// DownloadManager
// ============================================================

class DownloadManager {
  private tasks: Map<string, DownloadTask> = new Map();
  private activeCount = 0;
  private listeners: Set<ProgressListener> = new Set();

  constructor() {
    this.restore();
  }

  // ----------------------------------------------------------
  // 公开 API
  // ----------------------------------------------------------

  createTask(req: CreateDownloadRequest): DownloadTask {
    const now = Date.now();
    const taskId = `dl_${now}_${Math.random().toString(36).slice(2, 8)}`;

    const chapters: ChapterDownloadItem[] = req.chapters.map((ch) => ({
      ...ch,
      status: 'pending' as const,
    }));

    const progress: TaskProgress = {
      total: chapters.length,
      completed: 0,
      failed: 0,
      percent: 0,
    };

    const task: DownloadTask = {
      taskId,
      sourceId: req.sourceId,
      bookId: req.bookId,
      contentType: req.contentType,
      chapters,
      status: 'pending',
      progress,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(taskId, task);
    this.persistTaskHeader(task);
    this.insertTaskChapters(task);
    this.processNext();

    return task;
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status === 'completed' || task.status === 'cancelled') return false;

    task.status = 'cancelled';
    task.updatedAt = Date.now();

    for (const ch of task.chapters) {
      if (ch.status === 'pending' || ch.status === 'downloading') {
        ch.status = 'failed';
        this.persistChapterStatus(taskId, ch.chapterId, ch.status);
      }
    }

    this.notifyListeners(task);
    this.persistTaskHeader(task);
    return true;
  }

  async clearTasks(): Promise<number> {
    const count = this.tasks.size;

    for (const task of this.tasks.values()) {
      if (task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled') {
        task.status = 'cancelled';
        task.updatedAt = Date.now();

        for (const ch of task.chapters) {
          if (ch.status === 'pending' || ch.status === 'downloading') {
            ch.status = 'failed';
          }
        }
      }
    }

    this.tasks.clear();
    getDb().run('DELETE FROM download_tasks');
    return count;
  }

  getTasks(): DownloadTask[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId);
  }

  addListener(fn: ProgressListener): void {
    this.listeners.add(fn);
  }

  removeListener(fn: ProgressListener): void {
    this.listeners.delete(fn);
  }

  // ----------------------------------------------------------
  // 调度
  // ----------------------------------------------------------

  private processNext(): void {
    if (this.activeCount >= MAX_CONCURRENCY) return;

    for (const task of this.tasks.values()) {
      if (task.status === 'cancelled' || task.status === 'completed' || task.status === 'failed') {
        continue;
      }

      const nextChapter = task.chapters.find((ch) => ch.status === 'pending');
      if (!nextChapter) continue;

      if (task.status === 'pending') {
        task.status = 'downloading';
        task.updatedAt = Date.now();
      }

      nextChapter.status = 'downloading';
      this.persistChapterStatus(task.taskId, nextChapter.chapterId, nextChapter.status);
      this.activeCount++;
      this.executeChapter(task, nextChapter);

      if (this.activeCount >= MAX_CONCURRENCY) return;
    }
  }

  // ----------------------------------------------------------
  // 章节执行（executor 模式）
  // ----------------------------------------------------------

  private async executeChapter(task: DownloadTask, chapter: ChapterDownloadItem): Promise<void> {
    try {
      // 去重：如果缓存中已存在该章节，直接标记完成
      const existing = await loadChapter(
        task.contentType,
        task.sourceId,
        task.bookId,
        chapter.chapterId,
      );

      if (existing) {
        if (task.contentType === 'comic') {
          await cacheComicChapterImages(task.sourceId, task.bookId, existing);
        }
        chapter.status = 'completed';
        this.persistChapterStatus(task.taskId, chapter.chapterId, chapter.status);
        task.progress.completed++;
        this.updateProgress(task);
        this.notifyListeners(task);
        this.afterChapterDone(task);
        return;
      }

      // === Executor 流程：fetch page/json → extractContent → saveChapter ===
      const raw = await this.fetchChapterContent(task, chapter);
      if (isChallengePage(raw)) {
        throw new CloudflareChallengeError();
      }

      // 2. 通过 executor 提取正文内容
      const sourceConfig = getSourceById(task.sourceId);
      let content = raw; // 默认保存原始内容
      let chapterName = chapter.chapterName;

      if (sourceConfig?.extractors) {
        try {
          const extracted = sourceConfig.extractors.extractContent(raw);
          if (extracted) {
            content = extracted.content;
            if (extracted.chapterName) chapterName = extracted.chapterName;
          }
        } catch (err) {
          console.error(`[DownloadManager] extractor 提取失败，回退到完整 HTML:`, err);
        }
      }

      // 3. 保存到缓存
      const cachedChapter = {
        chapterId: chapter.chapterId,
        chapterDetailUrl: chapter.chapterDetailUrl,
        chapterIndex: task.chapters.indexOf(chapter),
        chapterName,
        content,
      };

      await saveChapter(task.contentType, task.sourceId, task.bookId, cachedChapter);
      if (task.contentType === 'comic') {
        await cacheComicChapterImages(task.sourceId, task.bookId, {
          ...cachedChapter,
          cachedAt: Date.now(),
        });
      }

      chapter.status = 'completed';
      task.progress.completed++;
    } catch (err) {
      chapter.status = 'failed';
      task.progress.failed++;
      if (err instanceof CloudflareChallengeError) {
        task.status = 'failed';
        task.error = err.message;
      }
      console.error(`[DownloadManager] 章节下载失败: ${chapter.chapterName}`, err);
    }

    this.persistChapterStatus(task.taskId, chapter.chapterId, chapter.status);
    this.updateProgress(task);
    this.notifyListeners(task);

    // 章节间延迟防止限频（仅对经过 WebView 池的来源生效，HTTP-only 来源无需等待）
    await Bun.sleep(getChapterDelayMs(task.sourceId));

    this.afterChapterDone(task);
  }

  private afterChapterDone(task: DownloadTask): void {
    this.activeCount--;

    const allDone = task.chapters.every(
      (ch) => ch.status === 'completed' || ch.status === 'failed',
    );

    if (allDone && task.status !== 'cancelled') {
      if (task.progress.failed === task.progress.total) {
        task.status = 'failed';
        task.error = '所有章节下载失败';
      } else {
        task.status = 'completed';
      }
      task.updatedAt = Date.now();
      this.notifyListeners(task);
      this.persistTaskHeader(task);
    } else if (task.status !== 'cancelled') {
      this.persistTaskHeader(task);
    }

    // 调度下一个
    this.processNext();
  }

  // ----------------------------------------------------------
  // 工具方法
  // ----------------------------------------------------------

  private updateProgress(task: DownloadTask): void {
    task.progress.percent = Math.round(
      ((task.progress.completed + task.progress.failed) / task.progress.total) * 100,
    );
    task.updatedAt = Date.now();
  }

  private async fetchChapterContent(task: DownloadTask, chapter: ChapterDownloadItem): Promise<string> {
    if (task.contentType === 'comic' && task.sourceId === 'manwapi') {
      return fetchRemoteText(getManwapiImageApiUrl(chapter.chapterId));
    }

    return this.fetchChapterHtml(chapter.chapterDetailUrl);
  }

  private async fetchChapterHtml(url: string): Promise<string> {
    return fetchPageHtml(url);
  }

  private notifyListeners(task: DownloadTask): void {
    if (!this.tasks.has(task.taskId)) return;

    for (const fn of this.listeners) {
      try {
        fn(task);
      } catch (err) {
        console.error('[DownloadManager] listener 回调异常:', err);
      }
    }
  }

  // ----------------------------------------------------------
  // 持久化
  // ----------------------------------------------------------

  private persistTaskHeader(task: DownloadTask): void {
    if (!this.tasks.has(task.taskId)) return;

    getDb().query(`
      INSERT INTO download_tasks (task_id, source_id, book_id, content_type, status, total, completed, failed, percent, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (task_id) DO UPDATE SET
        status = excluded.status,
        total = excluded.total,
        completed = excluded.completed,
        failed = excluded.failed,
        percent = excluded.percent,
        error = excluded.error,
        updated_at = excluded.updated_at
    `).run(
      task.taskId,
      task.sourceId,
      task.bookId,
      task.contentType,
      task.status,
      task.progress.total,
      task.progress.completed,
      task.progress.failed,
      task.progress.percent,
      task.error ?? null,
      task.createdAt,
      task.updatedAt,
    );
  }

  private insertTaskChapters(task: DownloadTask): void {
    const db = getDb();
    const insertChapter = db.query(`
      INSERT INTO download_task_chapters (task_id, seq, chapter_id, chapter_name, chapter_detail_url, status)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (task_id, chapter_id) DO UPDATE SET
        seq = excluded.seq,
        chapter_name = excluded.chapter_name,
        chapter_detail_url = excluded.chapter_detail_url,
        status = excluded.status
    `);

    db.transaction(() => {
      task.chapters.forEach((chapter, seq) => {
        insertChapter.run(task.taskId, seq, chapter.chapterId, chapter.chapterName, chapter.chapterDetailUrl, chapter.status);
      });
    })();
  }

  private persistChapterStatus(taskId: string, chapterId: string, status: ChapterDownloadItem['status']): void {
    if (!this.tasks.has(taskId)) return;

    getDb().query(`
      UPDATE download_task_chapters SET status = ? WHERE task_id = ? AND chapter_id = ?
    `).run(status, taskId, chapterId);
  }

  private restore(): void {
    const db = getDb();
    const taskRows = db.query('SELECT * FROM download_tasks').all() as DownloadTaskRow[];
    const chapterRows = db
      .query('SELECT * FROM download_task_chapters ORDER BY task_id ASC, seq ASC')
      .all() as DownloadTaskChapterRow[];

    const chaptersByTask = new Map<string, ChapterDownloadItem[]>();
    for (const row of chapterRows) {
      const list = chaptersByTask.get(row.task_id) ?? [];
      list.push({
        chapterId: row.chapter_id,
        chapterName: row.chapter_name,
        chapterDetailUrl: row.chapter_detail_url,
        status: row.status as ChapterDownloadItem['status'],
      });
      chaptersByTask.set(row.task_id, list);
    }

    for (const row of taskRows) {
      const task: DownloadTask = {
        taskId: row.task_id,
        sourceId: row.source_id,
        bookId: row.book_id,
        contentType: row.content_type as ContentType,
        chapters: chaptersByTask.get(row.task_id) ?? [],
        status: row.status as TaskStatus,
        progress: {
          total: row.total,
          completed: row.completed,
          failed: row.failed,
          percent: row.percent,
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        error: row.error ?? undefined,
      };

      this.tasks.set(task.taskId, task);

      if (task.status === 'downloading' || task.status === 'pending') {
        task.status = 'cancelled';
        task.error = '服务重启后已停止未完成的缓存任务，请手动重新开始。';

        for (const ch of task.chapters) {
          if (ch.status === 'downloading' || ch.status === 'pending') {
            ch.status = 'failed';
            this.persistChapterStatus(task.taskId, ch.chapterId, ch.status);
          }
        }

        this.persistTaskHeader(task);
      }
    }
  }
}

// ============================================================
// 全局单例
// ============================================================

export const downloadManager = new DownloadManager();
