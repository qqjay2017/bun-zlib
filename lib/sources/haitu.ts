import { registerSource } from '../source-config';
import type { BookSourceConfig } from '../source-config';

/** 海棠文学网源配置 */
const sourceHaitu: BookSourceConfig = {
  sourceId: 'haitu',
  name: '海棠文学',
  domain: 'https://www.haituuxs.com',
  contentType: 'novel',

  getBookId(url: string): string | null {
    // 书籍详情页格式示例: /book/12345/ 或 /novel/12345.html
    const patterns = [
      /\/book\/(\d+)/,
      /\/novel\/(\d+)/,
      /\/(\d+)\.html/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  },

  extractors: {
    getBookMetadata(doc: Document) {
      // TODO: 爬取海棠文学网页面结构后确认 CSS 选择器
      return null;
    },

    getChapterList(doc: Document) {
      // TODO: 爬取海棠文学网页面结构后确认 CSS 选择器
      return [];
    },

    extractContent(html: string) {
      // TODO: 爬取海棠文学网章节页后确认 CSS 选择器
      return null;
    },
  },
};

// 注册源
registerSource(sourceHaitu);

export { sourceHaitu };
