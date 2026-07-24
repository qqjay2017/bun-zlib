import type { ContentType, BookMetadata, ChapterMetadata } from './cache-types';

/**
 * DOM 提取器函数集
 * 所有提取操作在 WebView 中执行，直接操作 Document 对象
 */
export interface ExtractedContent {
  content: string;
  chapterName?: string;
}

export interface SourceExtractors {
  /** 从详情页 DOM 提取书籍完整元数据 */
  getBookMetadata(doc: Document): BookMetadata | null;
  /** 从详情页 DOM 提取章节列表 */
  getChapterList(doc: Document): Omit<ChapterMetadata, 'cachedAt'>[];
  /** 从章节页 HTML 提取正文内容 */
  extractContent(html: string): ExtractedContent | null;
}

/** 书源配置 */
export interface BookSourceConfig {
  /** 源唯一标识 */
  sourceId: string;
  /** 源显示名称 */
  name: string;
  /** 源域名 */
  domain: string;
  /** 内容类型 */
  contentType: ContentType;
  /** 从URL中提取书籍ID（纯正则，在后端执行） */
  getBookId(url: string): string | null;
  /** DOM 提取器（在 WebView 中执行） */
  extractors: SourceExtractors;
}

// 内部源注册表
const sourceRegistry: Map<string, BookSourceConfig> = new Map();

/** 注册书源配置 */
export function registerSource(config: BookSourceConfig): void {
  sourceRegistry.set(config.sourceId, config);
}

/** 根据 sourceId 获取书源配置 */
export function getSourceById(sourceId: string): BookSourceConfig | undefined {
  return sourceRegistry.get(sourceId);
}

/** 根据域名获取书源配置 */
export function getSourceByDomain(domain: string): BookSourceConfig | undefined {
  for (const source of sourceRegistry.values()) {
    if (source.domain === domain) {
      return source;
    }
  }
  return undefined;
}

/** 获取所有已注册的书源，可按内容类型过滤 */
export function getAllSources(contentType?: ContentType): BookSourceConfig[] {
  const all = [...sourceRegistry.values()];
  if (contentType) {
    return all.filter((s) => s.contentType === contentType);
  }
  return all;
}
