import path from 'node:path';
import { mkdir, readdir, rm } from 'node:fs/promises';
import type { ContentType, BookMetadata, ChapterMetadata, ChapterListCache } from './cache-types';

// ============================================================
// 路径工具
// ============================================================

/** 获取缓存根目录的绝对路径 */
export function getCacheRoot(): string {
  return path.resolve(process.cwd(), '.cache');
}

/** 获取书籍缓存目录 */
export function getBookCacheDir(contentType: ContentType, sourceId: string, bookId: string): string {
  return path.join(getCacheRoot(), contentType, `${sourceId}_${bookId}`);
}

/** 获取章节缓存目录 */
export function getChaptersCacheDir(contentType: ContentType, sourceId: string, bookId: string): string {
  return path.join(getBookCacheDir(contentType, sourceId, bookId), 'chapters');
}

// ============================================================
// 元数据操作
// ============================================================

/**
 * 保存书籍元数据到 metadata.json
 * 自动添加 cachedAt = Date.now()
 */
export async function saveBookMetadata(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  metadata: Omit<BookMetadata, 'cachedAt'>,
): Promise<void> {
  const dir = getBookCacheDir(contentType, sourceId, bookId);
  await mkdir(dir, { recursive: true });
  const data: BookMetadata = { ...metadata, cachedAt: Date.now() };
  await Bun.write(path.join(dir, 'metadata.json'), JSON.stringify(data, null, 2));
}

/**
 * 加载书籍元数据
 * @returns 文件不存在或解析失败时返回 null
 */
export async function loadBookMetadata(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): Promise<BookMetadata | null> {
  try {
    const filePath = path.join(getBookCacheDir(contentType, sourceId, bookId), 'metadata.json');
    const file = Bun.file(filePath);
    const text = await file.text();
    return JSON.parse(text) as BookMetadata;
  } catch {
    return null;
  }
}

// ============================================================
// 章节操作
// ============================================================

/**
 * 保存章节列表到 chapters/index.json
 * 自动为每个章节添加 cachedAt = Date.now()
 */
export async function saveChapterList(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapters: Omit<ChapterMetadata, 'cachedAt'>[],
): Promise<void> {
  const dir = getChaptersCacheDir(contentType, sourceId, bookId);
  await mkdir(dir, { recursive: true });
  const now = Date.now();
  const stamped: ChapterMetadata[] = chapters.map((ch) => ({ ...ch, cachedAt: now }));
  const data: ChapterListCache = { chapters: stamped, updatedAt: now };
  await Bun.write(path.join(dir, 'index.json'), JSON.stringify(data, null, 2));
}

/**
 * 加载章节列表
 * @returns 文件不存在或解析失败时返回 null
 */
export async function loadChapterList(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): Promise<ChapterListCache | null> {
  try {
    const filePath = path.join(getChaptersCacheDir(contentType, sourceId, bookId), 'index.json');
    const file = Bun.file(filePath);
    const text = await file.text();
    return JSON.parse(text) as ChapterListCache;
  } catch {
    return null;
  }
}

/**
 * 保存单个章节到 chapters/{chapterId}.json
 * 自动添加 cachedAt = Date.now()
 */
export async function saveChapter(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapter: Omit<ChapterMetadata, 'cachedAt'>,
): Promise<void> {
  const dir = getChaptersCacheDir(contentType, sourceId, bookId);
  await mkdir(dir, { recursive: true });
  const data: ChapterMetadata = { ...chapter, cachedAt: Date.now() };
  await Bun.write(path.join(dir, `${chapter.chapterId}.json`), JSON.stringify(data, null, 2));
}

/**
 * 加载单个章节
 * @returns 文件不存在或解析失败时返回 null
 */
export async function loadChapter(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
  chapterId: string,
): Promise<ChapterMetadata | null> {
  try {
    const filePath = path.join(getChaptersCacheDir(contentType, sourceId, bookId), `${chapterId}.json`);
    const file = Bun.file(filePath);
    const text = await file.text();
    return JSON.parse(text) as ChapterMetadata;
  } catch {
    return null;
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
  try {
    const metaPath = path.join(getBookCacheDir(contentType, sourceId, bookId), 'metadata.json');
    const file = Bun.file(metaPath);
    return await file.exists();
  } catch {
    return false;
  }
}

/** 删除指定书籍的整个缓存目录 */
export async function deleteBookCache(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): Promise<void> {
  const dir = getBookCacheDir(contentType, sourceId, bookId);
  await rm(dir, { recursive: true, force: true });
}

/**
 * 列出指定内容类型下所有已缓存的书籍
 * @returns "sourceId_bookId" 格式的数组
 */
export async function listCachedBooks(contentType: ContentType): Promise<string[]> {
  try {
    const dir = path.join(getCacheRoot(), contentType);
    const entries = await readdir(dir);
    // 过滤出符合 "sourceId_bookId" 格式的目录名
    return entries.filter((name) => name.includes('_'));
  } catch {
    return [];
  }
}
