import { registerSource } from '../source-config';
import type { BookSourceConfig } from '../source-config';
import type { BookMetadata } from '../cache-types';

function text(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function meta(doc: Document, property: string): string {
  return text(doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content'));
}

function absoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function stripChapterPrefix(title: string): string {
  return text(title).replace(/^\d+\.(?=第)/, '');
}

function isCfChallenge(html: string): boolean {
  return /Just a moment|请稍候|正在进行安全验证|cf-turnstile|onloadTurnstileCallback|challenges\.cloudflare\.com/i.test(html);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function extractByRegex(html: string, pattern: RegExp): string {
  return decodeHtml(pattern.exec(html)?.[1] ?? '').replace(/<[^>]*>/g, '').trim();
}

function normalizeContent(raw: string, chapterTitle?: string): string {
  const blocked = [
    chapterTitle,
    /.*作者：.*/,
    /\(本章完\)|（本章完）/,
    /PS：.*/i,
    /P\.S\..*/i,
    /感谢.*打赏.*/,
    /感谢.*推荐票.*/,
    /感谢.*月票.*/,
    /为防止采集.*/,
    /请记住本站.*/,
    /loadAdv.*/,
  ];

  return raw
    .split(/\n+/)
    .map((line) => text(line))
    .filter((line) => {
      if (!line) return false;
      return !blocked.some((rule) => {
        if (!rule) return false;
        return typeof rule === 'string' ? line === rule : rule.test(line);
      });
    })
    .join('\n\n');
}

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

  getTocUrl(url: string): string {
    return url.endsWith('/') ? url : url.replace(/\.htm(?:[?#].*)?$/, '/');
  },

  extractors: {
    getBookMetadata(doc: Document) {
      const sourceId = source69shuba.sourceId;
      const detailPageUrl = meta(doc, 'og:url') || doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
      const bookId = source69shuba.getBookId(detailPageUrl) || source69shuba.getBookId(globalThis.location?.href ?? '') || '';
      const name = meta(doc, 'og:novel:book_name') || meta(doc, 'og:title') || text(doc.querySelector('h1')?.textContent);
      const author = meta(doc, 'og:novel:author');
      const coverImageUrl = meta(doc, 'og:image');
      const description = meta(doc, 'og:description');

      if (!name || !author) return null;

      return {
        bookId,
        sourceId,
        contentType: 'novel',
        name,
        author,
        coverImageUrl,
        description,
        detailPageUrl,
        cachedAt: Date.now(),
      } satisfies BookMetadata;
    },
    getChapterList(doc: Document) {
      const anchors = [...doc.querySelectorAll('#catalog ul a, .catalog ul a, ul.catalog a')];
      const seen = new Set<string>();

      return anchors
        .map((anchor, fallbackIndex) => {
          const href = anchor.getAttribute('href') ?? '';
          const chapterDetailUrl = absoluteUrl(href, doc.baseURI || source69shuba.domain);
          const idMatch = chapterDetailUrl.match(/\/txt\/\d+\/(\d+)(?:[/?#].*)?$/) || chapterDetailUrl.match(/\/(\d+)\.htm(?:[?#].*)?$/);
          const chapterId = idMatch?.[1] ?? `chapter-${fallbackIndex + 1}`;
          const chapterName = stripChapterPrefix(anchor.textContent ?? '');
          const dataNum = Number(anchor.closest('li')?.getAttribute('data-num') ?? fallbackIndex + 1);

          return { chapterId, chapterName, chapterDetailUrl, chapterIndex: Number.isFinite(dataNum) ? dataNum - 1 : fallbackIndex };
        })
        .filter((chapter) => {
          if (!chapter.chapterName || seen.has(chapter.chapterDetailUrl)) return false;
          seen.add(chapter.chapterDetailUrl);
          return true;
        })
        .sort((a, b) => a.chapterIndex - b.chapterIndex)
        .map((chapter, chapterIndex) => ({ ...chapter, chapterIndex }));
    },
    extractContent(html: string) {
      if (!html || isCfChallenge(html)) return null;

      const chapterName = stripChapterPrefix(extractByRegex(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i));
      const navStart = html.search(/<div[^>]+class=["'][^"']*\btxtnav\b[^"']*["'][^>]*>/i);
      if (navStart < 0) return null;
      const navEnd = html.search(/<div[^>]+class=["'][^"']*\bpage1\b/i);
      const navHtml = html.slice(navStart, navEnd > navStart ? navEnd : undefined);

      const raw = decodeHtml(
        navHtml
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<(?:br|p|div)\b[^>]*>/gi, '\n')
          .replace(/<\/(?:p|div)>/gi, '\n')
          .replace(/<[^>]+>/g, ''),
      );
      const content = normalizeContent(raw, chapterName);
      if (!content) return null;

      return { content, chapterName };
    },
  },
};

// 注册源
registerSource(source69shuba);

export { source69shuba };
