import path from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type {
  DownloadTask,
  CreateDownloadRequest,
  ChapterDownloadItem,
  ProgressListener,
  TaskProgress,
} from './download-types';
import { fetchPageHtml } from '../backend';
import { loadChapter, saveChapter, getCacheRoot } from './cache-manager';
import { getSourceById } from './source-config';

// ============================================================
// 常量
// ============================================================

const MAX_CONCURRENCY = 1;
const CHAPTER_DELAY_MS = 2_000;

class CloudflareChallengeError extends Error {
  constructor() {
    super('触发 Cloudflare 校验，已停止缓存任务。请先在 Chrome/WebView 中通过验证后再继续。');
    this.name = 'CloudflareChallengeError';
  }
}

function isChallengePage(html: string): boolean {
  return /Just a moment|请稍候|正在进行安全验证|cf-turnstile|challenges\.cloudflare\.com/i.test(html);
}

function getTasksFilePath(): string {
  return path.join(getCacheRoot(), 'downloads', 'tasks.json');
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
    this.persist();
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
      }
    }

    this.notifyListeners(task);
    this.persist();
    return true;
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
        chapter.status = 'completed';
        task.progress.completed++;
        this.updateProgress(task);
        this.notifyListeners(task);
        this.afterChapterDone(task);
        return;
      }

      // === Executor 流程：fetchPageHtml → extractContent → saveChapter ===

      // 1. 获取 HTML
      const html = await this.fetchChapterHtml(chapter.chapterDetailUrl);
      if (isChallengePage(html)) {
        throw new CloudflareChallengeError();
      }

      // 2. 通过 executor 提取正文内容
      const sourceConfig = getSourceById(task.sourceId);
      let content = html; // 默认保存完整 HTML
      let chapterName = chapter.chapterName;

      if (sourceConfig?.extractors) {
        try {
          const extracted = sourceConfig.extractors.extractContent(html);
          if (extracted) {
            content = extracted.content;
            if (extracted.chapterName) chapterName = extracted.chapterName;
          }
        } catch (err) {
          console.error(`[DownloadManager] extractor 提取失败，回退到完整 HTML:`, err);
        }
      }

      // 3. 保存到缓存
      await saveChapter(task.contentType, task.sourceId, task.bookId, {
        chapterId: chapter.chapterId,
        chapterDetailUrl: chapter.chapterDetailUrl,
        chapterIndex: task.chapters.indexOf(chapter),
        chapterName,
        content,
      });

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

    this.updateProgress(task);
    this.notifyListeners(task);

    // 章节间延迟防止限频
    await Bun.sleep(CHAPTER_DELAY_MS);

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
      this.persist();
    } else if (task.status !== 'cancelled') {
      this.persist();
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

  private async fetchChapterHtml(url: string): Promise<string> {
    return fetchPageHtml(url);
  }

  private notifyListeners(task: DownloadTask): void {
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

  private async persist(): Promise<void> {
    try {
      const filePath = getTasksFilePath();
      await mkdir(path.dirname(filePath), { recursive: true });
      const data = JSON.stringify([...this.tasks.values()], null, 2);
      await Bun.write(filePath, data);
    } catch (err) {
      console.error('[DownloadManager] 持久化失败:', err);
    }
  }

  private restore(): void {
    try {
      const filePath = getTasksFilePath();
      const json = readFileSync(filePath, 'utf-8');
      const tasks: DownloadTask[] = JSON.parse(json);

      for (const task of tasks) {
        if (task.status === 'downloading' || task.status === 'pending') {
          task.status = 'cancelled';
          task.error = '服务重启后已停止未完成的缓存任务，请手动重新开始。';
          for (const ch of task.chapters) {
            if (ch.status === 'downloading' || ch.status === 'pending') {
              ch.status = 'failed';
            }
          }
        }
        this.tasks.set(task.taskId, task);
      }
    } catch {
      // 文件不存在或解析失败，忽略
    }
  }
}

// ============================================================
// 全局单例
// ============================================================

export const downloadManager = new DownloadManager();
