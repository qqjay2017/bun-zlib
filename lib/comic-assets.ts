import path from 'node:path';
import { fetchRemoteBytes } from '../backend';
import {
  listChapterImages,
  saveChapterImage,
  saveChapter,
  type CachedImageFile,
} from './cache-manager';
import type { ChapterMetadata } from './cache-types';
import { getSourceById } from './source-config';

const MANWAPI_AES_KEY = '0B6666A0-BB59-1381-B746-a0E4C9AC';

export function getChapterImageUrls(chapter: ChapterMetadata): string[] {
  return (chapter.content ?? '')
    .split(/\n+/)
    .map((url) => url.trim())
    .filter((url) => /^https?:\/\//i.test(url));
}

export function imageExt(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'webp';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif';
  return 'jpg';
}

function isImageBytes(bytes: Uint8Array): boolean {
  return imageExt(bytes) !== 'jpg' || (bytes[0] === 0xff && bytes[1] === 0xd8);
}

export async function decryptManwapiImage(bytes: Uint8Array): Promise<Uint8Array> {
  if (isImageBytes(bytes)) return bytes;

  const iv = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + 16);
  const ciphertext = bytes.buffer.slice(bytes.byteOffset + 16, bytes.byteOffset + bytes.byteLength);
  const keyBytes = new TextEncoder().encode(MANWAPI_AES_KEY).slice(0, 32);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: new Uint8Array(iv) }, key, ciphertext);
  return new Uint8Array(decrypted);
}

export async function fetchManwapiImage(url: string): Promise<Uint8Array> {
  return decryptManwapiImage(await fetchRemoteBytes(url));
}

async function fetchComicImage(sourceId: string, url: string): Promise<Uint8Array> {
  if (sourceId === 'manwapi') return fetchManwapiImage(url);

  return fetchRemoteBytes(url, 'https://manhuafree.com/');
}

async function normalizeComicChapterContent(
  sourceId: string,
  bookId: string,
  chapter: ChapterMetadata,
): Promise<{ chapter: ChapterMetadata; urls: string[] }> {
  const urls = getChapterImageUrls(chapter);
  if (urls.length > 0) return { chapter, urls };

  const extracted = getSourceById(sourceId)?.extractors.extractContent(chapter.content ?? '');
  if (!extracted?.content) return { chapter, urls };

  const normalized: ChapterMetadata = {
    ...chapter,
    chapterName: extracted.chapterName || chapter.chapterName,
    content: extracted.content,
    cachedAt: Date.now(),
  };

  await saveChapter('comic', sourceId, bookId, normalized);
  return { chapter: normalized, urls: getChapterImageUrls(normalized) };
}

export function cachedImageApiUrl(
  sourceId: string,
  bookId: string,
  chapterId: string,
  filename: string,
): string {
  return `/api/cache/comic/${sourceId}/${bookId}/chapter/${chapterId}/image/${encodeURIComponent(filename)}`;
}

export async function getCachedComicChapterImages(
  sourceId: string,
  bookId: string,
  chapterId: string,
): Promise<CachedImageFile[]> {
  return listChapterImages('comic', sourceId, bookId, chapterId);
}

export async function cacheComicChapterImages(
  sourceId: string,
  bookId: string,
  chapter: ChapterMetadata,
): Promise<CachedImageFile[]> {
  if (sourceId !== 'manwapi' && sourceId !== 'manhuafree') {
    throw new Error(`暂不支持缓存该漫画源图片: ${sourceId}`);
  }

  const cached = await getCachedComicChapterImages(sourceId, bookId, chapter.chapterId);
  const { urls } = await normalizeComicChapterContent(sourceId, bookId, chapter);
  if (cached.length >= urls.length && urls.length > 0) return cached;
  if (urls.length === 0) {
    if (cached.length > 0) return cached;
    throw new Error(`章节没有可缓存的图片地址: ${chapter.chapterName || chapter.chapterId}`);
  }

  const files: CachedImageFile[] = [];
  for (let i = 0; i < urls.length; i++) {
    const existing = cached.find((file) => file.filename.startsWith(`${String(i + 1).padStart(3, '0')}.`));
    if (existing) {
      files.push(existing);
      continue;
    }

    const image = await fetchComicImage(sourceId, urls[i]!);
    const filename = `${String(i + 1).padStart(3, '0')}.${imageExt(image)}`;
    const filePath = await saveChapterImage('comic', sourceId, bookId, chapter.chapterId, filename, image);
    files.push({ filename, path: filePath });
  }

  return files.sort((a, b) => path.basename(a.filename).localeCompare(path.basename(b.filename), undefined, { numeric: true }));
}
