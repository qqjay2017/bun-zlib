import { registerSource } from '../source-config';
import type { BookSourceConfig } from '../source-config';
import type { BookMetadata } from '../cache-types';

const API_HOST = 'https://v2.apikk.top';
const IMAGE_HOST_BY_LINE: Record<number | 'default', string> = {
  2: 'https://c-nd2-1.6wm.top',
  default: 'https://c-nd3-1.6wm.top',
};

const ENCODED_PREFIX = 'J7r';
const ENCODED_SUFFIX = 'nQ';
const FIRST_MARKER = 'kD';
const SECOND_MARKER = 'W4s';
const CHUNK_SIZE = 7;
const SOURCE_ALPHABET = '_-9876543210abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TARGET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function text(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function meta(doc: Document, property: string): string {
  return text(doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content'));
}

function parseJsonText(html: string): any {
  const raw = html.trim().startsWith('{')
    ? html.trim()
    : new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || html;
  return JSON.parse(raw);
}

function parseJsonLd(doc: Document): any | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      return JSON.parse(script.textContent || '');
    } catch {
      // 继续尝试下一个 JSON-LD
    }
  }
  return null;
}

function getMidFromUrl(url: string): string {
  try {
    return new URL(url).searchParams.get('mid') || '';
  } catch {
    return '';
  }
}

function getApiHostFromUrl(url: string): string {
  try {
    return new URL(url).searchParams.get('apiHost') || API_HOST;
  } catch {
    return API_HOST;
  }
}

function decodeBase64Url(value: string): string {
  const pad = value.length % 4 ? '='.repeat(4 - (value.length % 4)) : '';
  const normalized = `${value}${pad}`.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function remapAlphabet(value: string): string {
  let out = '';
  for (const ch of value) {
    const index = SOURCE_ALPHABET.indexOf(ch);
    if (index < 0) throw new Error('Invalid encoded image character');
    out += TARGET_ALPHABET[index];
  }
  return out;
}

function unshuffleChunks(value: string): string {
  let out = '';
  for (let offset = 0, chunkIndex = 0; offset < value.length; offset += CHUNK_SIZE, chunkIndex++) {
    const chunk = value.slice(offset, offset + CHUNK_SIZE);
    out += chunkIndex % 2 ? [...chunk].reverse().join('') : chunk;
  }
  return out;
}

function decodeImagePayload(value: string): Array<{ order?: number; url?: string }> {
  if (!value.startsWith(ENCODED_PREFIX) || !value.endsWith(ENCODED_SUFFIX)) {
    throw new Error('Invalid encoded image payload');
  }

  const body = value.slice(ENCODED_PREFIX.length, -ENCODED_SUFFIX.length);
  const payloadLength = body.length - FIRST_MARKER.length - SECOND_MARKER.length;
  const tailLength = Math.floor(payloadLength / 3);
  const headLength = Math.floor((payloadLength - tailLength) / 2);
  const middleLength = payloadLength - tailLength - headLength;

  const head = body.slice(0, headLength);
  const firstMarker = body.slice(headLength, headLength + FIRST_MARKER.length);
  const middle = body.slice(headLength + FIRST_MARKER.length, headLength + FIRST_MARKER.length + middleLength);
  const secondMarker = body.slice(
    headLength + FIRST_MARKER.length + middleLength,
    headLength + FIRST_MARKER.length + middleLength + SECOND_MARKER.length,
  );
  const tail = body.slice(headLength + FIRST_MARKER.length + middleLength + SECOND_MARKER.length);

  if (firstMarker !== FIRST_MARKER || secondMarker !== SECOND_MARKER || tail.length !== tailLength) {
    throw new Error('Invalid encoded image markers');
  }

  return JSON.parse(decodeBase64Url(remapAlphabet(unshuffleChunks(tail + head + middle))));
}

function imageHost(line: number | undefined): string {
  return IMAGE_HOST_BY_LINE[line === 2 ? 2 : 'default'];
}

const sourceManhuafree: BookSourceConfig = {
  sourceId: 'manhuafree',
  name: 'G社漫画/包子漫画',
  domain: 'https://manhuafree.com',
  contentType: 'comic',

  getBookId(url: string): string | null {
    const match = url.match(/\/manga\/([^/?#]+)/);
    return match?.[1] ?? null;
  },

  getTocUrl(url: string): string {
    const mid = getMidFromUrl(url);
    return `${getApiHostFromUrl(url)}/api/manga/get?mid=${mid}`;
  },

  extractors: {
    getBookMetadata(doc: Document) {
      const sourceId = sourceManhuafree.sourceId;
      const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || doc.baseURI || '';
      const bookId = sourceManhuafree.getBookId(canonical) || sourceManhuafree.getBookId(globalThis.location?.href ?? '') || '';
      const mid = doc.querySelector('#chapterDrawerConfig')?.getAttribute('data-mid')
        || doc.documentElement.innerHTML.match(/data-mid="(\d+)"/)?.[1]
        || '';
      const apiHost = doc.querySelector('#chapterDrawerConfig')?.getAttribute('data-api-host') || API_HOST;
      const jsonLd = parseJsonLd(doc);
      const name = text(jsonLd?.name) || meta(doc, 'og:title').replace(/-G站漫畫.*/, '');
      const author = Array.isArray(jsonLd?.author)
        ? text(jsonLd.author.map((item: any) => item?.name).filter(Boolean).join('、'))
        : text(jsonLd?.author?.name) || '未知作者';
      const coverImageUrl = text(jsonLd?.image) || meta(doc, 'og:image');
      const description = text(jsonLd?.description) || meta(doc, 'og:description');

      if (!bookId || !name || !mid) return null;

      const detailPageUrl = `${canonical || `${sourceManhuafree.domain}/manga/${bookId}`}?mid=${encodeURIComponent(mid)}&apiHost=${encodeURIComponent(apiHost)}`;
      return {
        bookId,
        sourceId,
        contentType: 'comic',
        name,
        author,
        coverImageUrl,
        description,
        detailPageUrl,
        cachedAt: Date.now(),
      } satisfies BookMetadata;
    },

    getChapterList(doc: Document) {
      const data = parseJsonText(doc.documentElement.outerHTML);
      const mid = data?.data?.id || getMidFromUrl(doc.baseURI || '');
      const apiHost = getApiHostFromUrl(doc.baseURI || '');
      const slug = data?.data?.slug || '';
      const chapters = Array.isArray(data?.data?.chapters) ? data.data.chapters : [];

      return chapters
        .slice()
        .sort((a: any, b: any) => Number(a?.attributes?.order ?? 0) - Number(b?.attributes?.order ?? 0))
        .map((chapter: any, index: number) => {
          const chapterId = String(chapter?.id || `chapter-${index + 1}`);
          return {
            chapterId,
            chapterName: text(chapter?.attributes?.title) || `第 ${index + 1} 话`,
            chapterDetailUrl: `${apiHost}/api/v2/chapter/getinfo?m=${encodeURIComponent(mid)}&c=${encodeURIComponent(chapterId)}&slug=${encodeURIComponent(slug)}`,
            chapterIndex: index,
          };
        });
    },

    extractContent(html: string) {
      try {
        const data = parseJsonText(html);
        const info = data?.data?.info;
        const images = info?.images;
        const rawImages = Array.isArray(images?.images)
          ? images.images
          : decodeImagePayload(String(images?.images || ''));
        const host = imageHost(Number(images?.line));
        const urls = rawImages
          .map((item: any) => text(item?.url))
          .filter(Boolean)
          .map((url: string) => (url.startsWith('http') ? url : `${host}${url}`));
        if (!urls.length) return null;
        return {
          chapterName: text(info?.title),
          content: urls.join('\n'),
        };
      } catch {
        return null;
      }
    },
  },
};

registerSource(sourceManhuafree);

export { sourceManhuafree };
