/**
 * 一次性迁移脚本：把 .cache/ 下基于 JSON 文件的书籍元数据、章节、
 * 访问历史、下载任务状态迁移到 SQLite（lib/db.ts）。
 *
 * 运行方式：bun run scripts/migrate-cache-to-sqlite.ts
 *
 * 不会删除、修改任何原有 JSON 文件（保留作为回滚/核对基准），
 * 也完全不触碰 images/ 目录。可安全重复运行（全部走 upsert）。
 */
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { getDb } from '../lib/db';
import { getCacheRoot } from '../lib/cache-manager';
import { normalizeChapterOrder } from '../lib/chapter-order';
import { getAllSources } from '../lib/source-config';
import '../lib/sources'; // 注册所有书源，供 getAllSources() 使用
import type { ContentType, BookMetadata, ChapterMetadata, ChapterListCache } from '../lib/cache-types';
import { saveVisitHistory } from '../lib/history-manager';
import type { VisitHistoryItem } from '../lib/history-manager';
import type { DownloadTask } from '../lib/download-types';

const CONTENT_TYPES: ContentType[] = ['novel', 'comic'];

interface Summary {
  books: number;
  chapterLists: number;
  chaptersFromList: number;
  chaptersFromFiles: number;
  historyItems: number;
  tasks: number;
  taskChapters: number;
  unmatchedDirs: string[];
  parseErrors: string[];
}

function splitDirName(
  dirName: string,
  contentType: ContentType,
): { sourceId: string; bookId: string } | null {
  const candidates = getAllSources(contentType)
    .filter((source) => dirName.startsWith(`${source.sourceId}_`))
    .sort((a, b) => b.sourceId.length - a.sourceId.length);

  const match = candidates[0];
  if (!match) return null;

  return { sourceId: match.sourceId, bookId: dirName.slice(match.sourceId.length + 1) };
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const text = await Bun.file(filePath).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function migrateBook(
  db: ReturnType<typeof getDb>,
  contentType: ContentType,
  dirName: string,
  summary: Summary,
): Promise<void> {
  const parsed = splitDirName(dirName, contentType);
  if (!parsed) {
    summary.unmatchedDirs.push(`${contentType}/${dirName}`);
    return;
  }
  const { sourceId, bookId } = parsed;
  const bookDir = path.join(getCacheRoot(), contentType, dirName);

  // 1. 元数据
  const meta = await readJson<BookMetadata>(path.join(bookDir, 'metadata.json'));
  if (meta) {
    db.query(`
      INSERT INTO books (content_type, source_id, book_id, name, author, cover_image_url, description, detail_page_url, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (content_type, source_id, book_id) DO UPDATE SET
        name = excluded.name,
        author = excluded.author,
        cover_image_url = excluded.cover_image_url,
        description = excluded.description,
        detail_page_url = excluded.detail_page_url,
        cached_at = excluded.cached_at
    `).run(
      contentType,
      sourceId,
      bookId,
      meta.name,
      meta.author,
      meta.coverImageUrl,
      meta.description,
      meta.detailPageUrl,
      meta.cachedAt,
    );
    summary.books++;
  }

  // 2. 章节列表
  const list = await readJson<ChapterListCache>(path.join(bookDir, 'chapters', 'index.json'));
  if (list) {
    const normalized = normalizeChapterOrder(list.chapters);

    db.query(`
      INSERT INTO books (content_type, source_id, book_id, chapter_list_updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (content_type, source_id, book_id) DO UPDATE SET
        chapter_list_updated_at = excluded.chapter_list_updated_at
    `).run(contentType, sourceId, bookId, list.updatedAt);

    const upsertChapter = db.query(`
      INSERT INTO chapters (content_type, source_id, book_id, chapter_id, chapter_detail_url, chapter_index, chapter_name, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (content_type, source_id, book_id, chapter_id) DO UPDATE SET
        chapter_detail_url = excluded.chapter_detail_url,
        chapter_index = excluded.chapter_index,
        chapter_name = excluded.chapter_name,
        cached_at = excluded.cached_at
    `);
    for (const chapter of normalized) {
      upsertChapter.run(
        contentType,
        sourceId,
        bookId,
        chapter.chapterId,
        chapter.chapterDetailUrl,
        chapter.chapterIndex,
        chapter.chapterName,
        chapter.cachedAt,
      );
      summary.chaptersFromList++;
    }
    summary.chapterLists++;
  }

  // 3. 单章正文文件（不覆盖 chapter_index）
  try {
    const chaptersDir = path.join(bookDir, 'chapters');
    const files = await readdir(chaptersDir);
    const upsertChapterContent = db.query(`
      INSERT INTO chapters (content_type, source_id, book_id, chapter_id, chapter_detail_url, chapter_index, chapter_name, content, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (content_type, source_id, book_id, chapter_id) DO UPDATE SET
        chapter_detail_url = excluded.chapter_detail_url,
        chapter_name = excluded.chapter_name,
        content = excluded.content,
        cached_at = excluded.cached_at
    `);

    for (const filename of files) {
      if (filename === 'index.json' || !filename.endsWith('.json')) continue;

      const chapter = await readJson<ChapterMetadata>(path.join(chaptersDir, filename));
      if (!chapter) {
        summary.parseErrors.push(path.join(bookDir, 'chapters', filename));
        continue;
      }

      upsertChapterContent.run(
        contentType,
        sourceId,
        bookId,
        chapter.chapterId,
        chapter.chapterDetailUrl,
        chapter.chapterIndex,
        chapter.chapterName,
        chapter.content ?? null,
        chapter.cachedAt,
      );
      summary.chaptersFromFiles++;
    }
  } catch {
    // chapters/ 目录不存在，忽略
  }
}

async function migrateVisitHistory(summary: Summary): Promise<void> {
  const filePath = path.join(getCacheRoot(), 'visit-history.json');
  const items = await readJson<VisitHistoryItem[]>(filePath);
  if (!items) return;

  // 复用 history-manager 的去重/50 条上限逻辑，保证脚本可安全重复运行
  for (const item of items) {
    await saveVisitHistory(item);
    summary.historyItems++;
  }
}

async function migrateDownloadTasks(db: ReturnType<typeof getDb>, summary: Summary): Promise<void> {
  const filePath = path.join(getCacheRoot(), 'downloads', 'tasks.json');
  const tasks = await readJson<DownloadTask[]>(filePath);
  if (!tasks) return;

  const insertTask = db.query(`
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
  `);

  const insertChapter = db.query(`
    INSERT INTO download_task_chapters (task_id, seq, chapter_id, chapter_name, chapter_detail_url, status)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (task_id, chapter_id) DO UPDATE SET
      seq = excluded.seq,
      chapter_name = excluded.chapter_name,
      chapter_detail_url = excluded.chapter_detail_url,
      status = excluded.status
  `);

  for (const task of tasks) {
    insertTask.run(
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
    summary.tasks++;

    task.chapters.forEach((chapter, seq) => {
      insertChapter.run(
        task.taskId,
        seq,
        chapter.chapterId,
        chapter.chapterName,
        chapter.chapterDetailUrl,
        chapter.status,
      );
      summary.taskChapters++;
    });
  }
}

async function main(): Promise<void> {
  const db = getDb();
  const summary: Summary = {
    books: 0,
    chapterLists: 0,
    chaptersFromList: 0,
    chaptersFromFiles: 0,
    historyItems: 0,
    tasks: 0,
    taskChapters: 0,
    unmatchedDirs: [],
    parseErrors: [],
  };

  for (const contentType of CONTENT_TYPES) {
    const typeDir = path.join(getCacheRoot(), contentType);
    let entries: string[] = [];
    try {
      entries = await readdir(typeDir);
    } catch {
      continue;
    }

    for (const dirName of entries) {
      await migrateBook(db, contentType, dirName, summary);
    }
  }

  await migrateVisitHistory(summary);
  await migrateDownloadTasks(db, summary);

  console.log('迁移完成:');
  console.log(`  书籍元数据: ${summary.books}`);
  console.log(`  章节列表: ${summary.chapterLists}（共 ${summary.chaptersFromList} 章）`);
  console.log(`  单章正文文件: ${summary.chaptersFromFiles}`);
  console.log(`  访问历史: ${summary.historyItems}`);
  console.log(`  下载任务: ${summary.tasks}（共 ${summary.taskChapters} 个章节条目）`);

  if (summary.unmatchedDirs.length > 0) {
    console.log(`\n⚠️  无法匹配书源的目录（${summary.unmatchedDirs.length} 个）:`);
    for (const dir of summary.unmatchedDirs) console.log(`  - ${dir}`);
  }

  if (summary.parseErrors.length > 0) {
    console.log(`\n⚠️  解析失败的文件（${summary.parseErrors.length} 个）:`);
    for (const file of summary.parseErrors) console.log(`  - ${file}`);
  }
}

await main();
