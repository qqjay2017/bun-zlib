import { registerSource } from '../source-config';
import type { BookSourceConfig } from '../source-config';
import type { BookMetadata } from '../cache-types';

function text(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function parseJsonFromHtml(html: string): unknown {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const preText = doc.querySelector('pre')?.textContent;
  const raw = preText || doc.body.textContent || html;
  return JSON.parse(raw);
}

type ManwapiImageResponse = {
  code: number;
  data?: {
    images?: Array<{ url?: string }>;
  };
};

const sourceManwapi: BookSourceConfig = {
  sourceId: 'manwapi',
  name: '漫蛙漫画',
  domain: 'https://manwapi.cc',
  contentType: 'comic',

  getBookId(url: string): string | null {
    const match = url.match(/\/comic\/(\d+)(?:[/?#]|$)/);
    return match?.[1] ?? null;
  },

  extractors: {
    getBookMetadata(doc: Document) {
      const detailPageUrl = doc.querySelector('link[rel="canonical"]')?.getAttribute('href')
        || doc.baseURI
        || '';
      const bookId = sourceManwapi.getBookId(detailPageUrl) || sourceManwapi.getBookId(globalThis.location?.href ?? '') || '';
      const name = text(
        doc.querySelector('#page-title')?.textContent
        || doc.querySelector('.comic-title')?.textContent
        || doc.querySelector('h1')?.textContent,
      );
      const author = text(doc.querySelector('#author-container')?.textContent) || '未知作者';
      const coverImageUrl = absoluteUrl(
        doc.querySelector('.comic-cover')?.getAttribute('data-original-cover')
        || doc.querySelector('.comic-cover')?.getAttribute('src')
        || '',
        detailPageUrl || sourceManwapi.domain,
      );
      const description = text(doc.querySelector('.comic-desc')?.textContent);

      if (!name || !bookId) return null;

      return {
        bookId,
        sourceId: sourceManwapi.sourceId,
        contentType: 'comic',
        name,
        author,
        coverImageUrl,
        description,
        detailPageUrl: detailPageUrl || `${sourceManwapi.domain}/comic/${bookId}`,
        cachedAt: Date.now(),
      } satisfies BookMetadata;
    },

    getChapterList(doc: Document) {
      const anchors = [...doc.querySelectorAll<HTMLAnchorElement>('.chapter-grid .chapter-item[href], a.chapter-item[href]')];
      const seen = new Set<string>();

      return anchors
        .map((anchor, fallbackIndex) => {
          const chapterDetailUrl = absoluteUrl(anchor.getAttribute('href') ?? '', doc.baseURI || sourceManwapi.domain);
          const idMatch = chapterDetailUrl.match(/\/comic\/\d+\/(\d+)(?:_[0-9]+)?(?:[/?#]|$)/);
          const chapterId = idMatch?.[1] || anchor.dataset.id || `chapter-${fallbackIndex + 1}`;
          const chapterName = text(
            anchor.dataset.title
            || anchor.querySelector('.chapter-name')?.textContent
            || anchor.textContent,
          );

          return {
            chapterId,
            chapterName: chapterName || `第 ${fallbackIndex + 1} 话`,
            chapterDetailUrl,
            chapterIndex: fallbackIndex,
          };
        })
        .filter((chapter) => {
          if (!chapter.chapterId || seen.has(chapter.chapterId)) return false;
          seen.add(chapter.chapterId);
          return true;
        });
    },

    extractContent(html: string) {
      try {
        const json = parseJsonFromHtml(html) as ManwapiImageResponse;
        const urls = unique(
          (json.data?.images ?? [])
            .map((image) => text(image.url))
            .filter(Boolean),
        );
        if (!urls.length) return null;
        return { content: urls.join('\n') };
      } catch {
        return null;
      }
    },
  },
};

registerSource(sourceManwapi);

export { sourceManwapi };
