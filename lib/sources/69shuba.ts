import { registerSource } from '../source-config';
import type { BookSourceConfig } from '../source-config';

/** 69书吧书源配置 */
const source69shuba: BookSourceConfig = {
  sourceId: '69shuba',
  name: '69书吧',
  domain: 'https://www.69shuba.com',
  contentType: 'novel',

  getBookId(url: string): string | null {
    const match = url.match(/\/book\/(\d+)/);
    return match?.[1] ?? null;
  },

  extractors: {
    // 骨架实现，CSS选择器待爬取页面确认后补充
    getBookMetadata(doc: Document) {
      // TODO: 待确认页面选择器后实现
      return null;
    },
    getChapterList(doc: Document) {
      // TODO: 待确认页面选择器后实现
      return [];
    },
  },
};

// 注册源
registerSource(source69shuba);

export { source69shuba };
