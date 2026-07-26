import path from 'node:path';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { getDb } from './db';
import type { ContentType, BookMetadata, ChapterMetadata, ChapterListCache } from './cache-types';
import { normalizeChapterOrder } from './chapter-order';

// ============================================================
// 路径工具（图片仍以文件形式存储，元数据/章节已迁移至 SQLite）
// ============================================================

/** 获取缓存根目录的绝对路径 */
export function getCacheRoot(): string {
  return path.resolve(process.cwd(), '.cache');
}

/** 获取书籍缓存目录 */
export function getBookCacheDir(contentType: ContentType, sourceId: string, bookId: string): string {
  return path.join(getCacheRoot(), contentType, `${sourceId}_${bookId}`);
}

/** 获取漫画章节图片缓存目录 */
export function getChapterImagesCacheDir(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapterId: string,
): string {
  return path.join(getBookCacheDir(contentType, sourceId, bookId), 'images', chapterId);
}

// ============================================================
// 行 <-> 类型 映射
// ============================================================

interface BookRow {
  content_type: ContentType;
  source_id: string;
  book_id: string;
  name: string;
  author: string;
  cover_image_url: string;
  description: string;
  detail_page_url: string;
  cached_at: number;
  chapter_list_updated_at: number | null;
}

function rowToBookMetadata(row: BookRow): BookMetadata {
  return {
    contentType: row.content_type,
    sourceId: row.source_id,
    bookId: row.book_id,
    name: row.name,
    author: row.author,
    coverImageUrl: row.cover_image_url,
    description: row.description,
    detailPageUrl: row.detail_page_url,
    cachedAt: row.cached_at,
  };
}

interface ChapterRow {
  chapter_id: string;
  chapter_detail_url: string;
  chapter_index: number;
  chapter_name: string;
  content: string | null;
  cached_at: number;
}

function rowToChapterMetadata(row: ChapterRow): ChapterMetadata {
  return {
    chapterId: row.chapter_id,
    chapterDetailUrl: row.chapter_detail_url,
    chapterIndex: row.chapter_index,
    chapterName: row.chapter_name,
    content: row.content ?? undefined,
    cachedAt: row.cached_at,
  };
}

// ============================================================
// 元数据操作
// ============================================================

/**
 * 保存书籍元数据
 * 自动添加 cachedAt = Date.now()
 */
export async function saveBookMetadata(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  metadata: Omit<BookMetadata, 'cachedAt'>,
): Promise<void> {
  const db = getDb();
  const cachedAt = Date.now();
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
    metadata.name,
    metadata.author,
    metadata.coverImageUrl,
    metadata.description,
    metadata.detailPageUrl,
    cachedAt,
  );
}

/**
 * 加载书籍元数据
 * @returns 未缓存时返回 null
 */
export async function loadBookMetadata(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): Promise<BookMetadata | null> {
  const db = getDb();
  const row = db
    .query('SELECT * FROM books WHERE content_type = ? AND source_id = ? AND book_id = ? AND cached_at > 0')
    .get(contentType, sourceId, bookId) as BookRow | null;
  return row ? rowToBookMetadata(row) : null;
}

// ============================================================
// 章节操作
// ============================================================

/**
 * 保存章节列表
 * 自动为每个章节添加 cachedAt = Date.now()，不会覆盖已缓存的章节正文
 */
export async function saveChapterList(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapters: Omit<ChapterMetadata, 'cachedAt'>[],
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const normalized = normalizeChapterOrder(chapters);

  const upsertBook = db.query(`
    INSERT INTO books (content_type, source_id, book_id, chapter_list_updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (content_type, source_id, book_id) DO UPDATE SET
      chapter_list_updated_at = excluded.chapter_list_updated_at
  `);

  const upsertChapter = db.query(`
    INSERT INTO chapters (content_type, source_id, book_id, chapter_id, chapter_detail_url, chapter_index, chapter_name, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (content_type, source_id, book_id, chapter_id) DO UPDATE SET
      chapter_detail_url = excluded.chapter_detail_url,
      chapter_index = excluded.chapter_index,
      chapter_name = excluded.chapter_name,
      cached_at = excluded.cached_at
  `);

  db.transaction(() => {
    upsertBook.run(contentType, sourceId, bookId, now);
    for (const chapter of normalized) {
      upsertChapter.run(
        contentType,
        sourceId,
        bookId,
        chapter.chapterId,
        chapter.chapterDetailUrl,
        chapter.chapterIndex,
        chapter.chapterName,
        now,
      );
    }
  })();
}

/**
 * 加载章节列表
 * @returns 从未保存过章节列表时返回 null
 */
export async function loadChapterList(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): Promise<ChapterListCache | null> {
  const db = getDb();
  const bookRow = db
    .query('SELECT chapter_list_updated_at FROM books WHERE content_type = ? AND source_id = ? AND book_id = ?')
    .get(contentType, sourceId, bookId) as { chapter_list_updated_at: number | null } | null;

  if (!bookRow || bookRow.chapter_list_updated_at === null) return null;

  const rows = db
    .query(
      'SELECT chapter_id, chapter_detail_url, chapter_index, chapter_name, content, cached_at FROM chapters WHERE content_type = ? AND source_id = ? AND book_id = ? ORDER BY chapter_index ASC',
    )
    .all(contentType, sourceId, bookId) as ChapterRow[];

  return {
    chapters: rows.map(rowToChapterMetadata),
    updatedAt: bookRow.chapter_list_updated_at,
  };
}

/**
 * 保存单个章节
 * 自动添加 cachedAt = Date.now()，不会覆盖列表中已记录的 chapterIndex
 */
export async function saveChapter(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapter: Omit<ChapterMetadata, 'cachedAt'>,
): Promise<void> {
  const db = getDb();
  const cachedAt = Date.now();
  db.query(`
    INSERT INTO chapters (content_type, source_id, book_id, chapter_id, chapter_detail_url, chapter_index, chapter_name, content, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (content_type, source_id, book_id, chapter_id) DO UPDATE SET
      chapter_detail_url = excluded.chapter_detail_url,
      chapter_name = excluded.chapter_name,
      content = excluded.content,
      cached_at = excluded.cached_at
  `).run(
    contentType,
    sourceId,
    bookId,
    chapter.chapterId,
    chapter.chapterDetailUrl,
    chapter.chapterIndex,
    chapter.chapterName,
    chapter.content ?? null,
    cachedAt,
  );
}

/**
 * 加载单个章节
 * @returns 未缓存时返回 null
 */
export async function loadChapter(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapterId: string,
): Promise<ChapterMetadata | null> {
  const db = getDb();
  const row = db
    .query(
      'SELECT chapter_id, chapter_detail_url, chapter_index, chapter_name, content, cached_at FROM chapters WHERE content_type = ? AND source_id = ? AND book_id = ? AND chapter_id = ?',
    )
    .get(contentType, sourceId, bookId, chapterId) as ChapterRow | null;
  return row ? rowToChapterMetadata(row) : null;
}

export interface CachedImageFile {
  filename: string;
  path: string;
}

export async function saveChapterImage(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapterId: string,
  filename: string,
  bytes: Uint8Array,
): Promise<string> {
  const dir = getChapterImagesCacheDir(contentType, sourceId, bookId, chapterId);
  await mkdir(dir, { recursive: true });
  const safeName = path.basename(filename);
  const filePath = path.join(dir, safeName);
  await Bun.write(filePath, bytes);
  return filePath;
}

export async function loadChapterImage(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapterId: string,
  filename: string,
): Promise<Uint8Array | null> {
  try {
    const safeName = path.basename(filename);
    if (safeName !== filename) return null;
    const filePath = path.join(getChapterImagesCacheDir(contentType, sourceId, bookId, chapterId), safeName);
    return new Uint8Array(await Bun.file(filePath).arrayBuffer());
  } catch {
    return null;
  }
}

export async function listChapterImages(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapterId: string,
): Promise<CachedImageFile[]> {
  try {
    const dir = getChapterImagesCacheDir(contentType, sourceId, bookId, chapterId);
    const entries = await readdir(dir);
    return entries
      .filter((filename) => /^\d+\.(?:jpg|jpeg|png|webp|gif)$/i.test(filename))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((filename) => ({ filename, path: path.join(dir, filename) }));
  } catch {
    return [];
  }
}

// ============================================================
// 查询工具
// ============================================================

/** 检查指定书籍的缓存是否存在 */
export async function cacheExists(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): Promise<boolean> {
  const db = getDb();
  const row = db
    .query('SELECT 1 FROM books WHERE content_type = ? AND source_id = ? AND book_id = ? AND cached_at > 0 LIMIT 1')
    .get(contentType, sourceId, bookId);
  return row !== null;
}

/** 删除指定书籍的整个缓存（元数据、章节及图片文件） */
export async function deleteBookCache(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): Promise<void> {
  const db = getDb();
  db.transaction(() => {
    db.query('DELETE FROM books WHERE content_type = ? AND source_id = ? AND book_id = ?').run(
      contentType,
      sourceId,
      bookId,
    );
    db.query('DELETE FROM chapters WHERE content_type = ? AND source_id = ? AND book_id = ?').run(
      contentType,
      sourceId,
      bookId,
    );
  })();

  const dir = getBookCacheDir(contentType, sourceId, bookId);
  await rm(dir, { recursive: true, force: true });
}

/** 列出指定内容类型下所有已缓存的书籍 */
export async function listCachedBooks(contentType: ContentType): Promise<BookMetadata[]> {
  const db = getDb();
  const rows = db
    .query('SELECT * FROM books WHERE content_type = ? AND cached_at > 0 ORDER BY cached_at DESC')
    .all(contentType) as BookRow[];
  return rows.map(rowToBookMetadata);
}
