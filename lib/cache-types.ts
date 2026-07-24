/** 内容类型：小说或漫画 */
export type ContentType = 'novel' | 'comic';

/** 书籍元数据 */
export interface BookMetadata {
  bookId: string;
  sourceId: string;
  contentType: ContentType;
  name: string;
  author: string;
  coverImageUrl: string;
  description: string;
  /** 书籍详情页URL，WebView内导航用 */
  detailPageUrl: string;
  cachedAt: number;
}

/** 章节元数据 */
export interface ChapterMetadata {
  chapterId: string;
  chapterDetailUrl: string;
  chapterIndex: number;
  chapterName: string;
  cachedAt: number;
}

/** 章节列表缓存 */
export interface ChapterListCache {
  chapters: ChapterMetadata[];
  updatedAt: number;
}

/**
 * 缓存键
 * - 对象形式：包含 sourceId 和 bookId
 * - 字符串形式：格式为 "sourceId_bookId"
 */
export type CacheKey =
  | { sourceId: string; bookId: string }
  | string;
