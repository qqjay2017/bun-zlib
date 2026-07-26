import path from 'node:path';
import { fetchRemoteResponse } from '../backend';
import {
  listChapterImages,
  saveChapterImage,
  type CachedImageFile,
} from './cache-manager';
import type { ChapterMetadata } from './cache-types';

const MANWAPI_AES_KEY = '0B6666A0-BB59-1381-B746-a0E4C9AC';

export function getChapterImageUrls(chapter: ChapterMetadata): string[] {
  return (chapter.content ?? '')
    .split(/\n+/)
    .map((url) => url.trim())
    .filter(Boolean);
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
  const res = await fetchRemoteResponse(url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return decryptManwapiImage(bytes);
}

async function fetchComicImage(sourceId: string, url: string): Promise<Uint8Array> {
  if (sourceId === 'manwapi') return fetchManwapiImage(url);

  const res = await fetchRemoteResponse(url, 'https://manhuafree.com/');
  return new Uint8Array(await res.arrayBuffer());
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
  const urls = getChapterImageUrls(chapter);
  if (cached.length >= urls.length && urls.length > 0) return cached;

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
