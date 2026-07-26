import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import JSZip from 'jszip';
import { fetchPageHtml, fetchRemoteText } from '../backend';
import { buildEpub } from './epub-builder';
import { loadBookMetadata, loadChapter, loadChapterList, saveChapter } from './cache-manager';
import { getSourceById } from './source-config';
import { getManwapiImageApiUrl } from './sources/manwapi';
import { cacheComicChapterImages } from './comic-assets';
import type { BookMetadata, ChapterMetadata, ContentType } from './cache-types';
import type { EpubChapter } from './epub-builder';

const MAX_CBZ_PART_BYTES = 300 * 1024 * 1024;

export interface ExportedFile {
  path: string;
  filename: string;
  size: number;
}

export interface ExportResult {
  outputDir: string;
  files: ExportedFile[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtmlParagraphs(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n');
}

export function filenameSafe(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'book';
}

function getExportsRoot(): string {
  return path.resolve(process.cwd(), 'exports');
}

async function ensureBookExportDir(meta: BookMetadata): Promise<string> {
  const dirname = filenameSafe(`${meta.name}_${meta.sourceId}_${meta.bookId}`);
  const dir = path.join(getExportsRoot(), dirname);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function getRequiredBook(contentType: ContentType, sourceId: string, bookId: string): Promise<BookMetadata> {
  const meta = await loadBookMetadata(contentType, sourceId, bookId);
  if (!meta) {
    throw new Error('请先打开详情页，完成书籍元数据缓存');
  }
  return meta;
}

async function getRequiredChapterList(contentType: ContentType, sourceId: string, bookId: string): Promise<ChapterMetadata[]> {
  const chapterList = await loadChapterList(contentType, sourceId, bookId);
  if (!chapterList?.chapters.length) {
    throw new Error('请先打开详情页，完成目录缓存');
  }
  return chapterList.chapters;
}

async function getNovelChapter(
  sourceId: string,
  bookId: string,
  chapterMeta: ChapterMetadata,
): Promise<ChapterMetadata> {
  const cached = await loadChapter('novel', sourceId, bookId, chapterMeta.chapterId);
  if (cached?.content) return cached;

  const source = getSourceById(sourceId);
  if (!source) throw new Error(`找不到书源: ${sourceId}`);

  const html = await fetchPageHtml(chapterMeta.chapterDetailUrl);
  const extracted = source.extractors.extractContent(html);
  if (!extracted?.content) throw new Error(`章节抓取失败: ${chapterMeta.chapterName}`);

  const chapter = {
    ...chapterMeta,
    chapterName: extracted.chapterName || chapterMeta.chapterName,
    content: extracted.content,
  };
  await saveChapter('novel', sourceId, bookId, chapter);
  return { ...chapter, cachedAt: Date.now() };
}

async function getComicChapter(
  sourceId: string,
  bookId: string,
  chapterMeta: ChapterMetadata,
): Promise<ChapterMetadata> {
  const cached = await loadChapter('comic', sourceId, bookId, chapterMeta.chapterId);
  if (cached?.content) return cached;

  if (sourceId !== 'manwapi') throw new Error(`暂不支持导出该漫画源: ${sourceId}`);
  const source = getSourceById(sourceId);
  if (!source) throw new Error(`找不到书源: ${sourceId}`);

  const jsonText = await fetchRemoteText(getManwapiImageApiUrl(chapterMeta.chapterId));
  const extracted = source.extractors.extractContent(jsonText);
  if (!extracted?.content) throw new Error(`图片列表抓取失败: ${chapterMeta.chapterName}`);

  const chapter = {
    ...chapterMeta,
    content: extracted.content,
  };
  await saveChapter('comic', sourceId, bookId, chapter);
  return { ...chapter, cachedAt: Date.now() };
}

async function writeZip(zip: JSZip, outputDir: string, filename: string): Promise<ExportedFile> {
  const data = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const bytes = new Uint8Array(data);
  const filePath = path.join(outputDir, filename);
  await Bun.write(filePath, bytes);
  return { path: filePath, filename, size: bytes.byteLength };
}

export async function exportNovelEpubToProject(
  sourceId: string,
  bookId: string,
): Promise<ExportResult> {
  const meta = await getRequiredBook('novel', sourceId, bookId);
  const chapterList = await getRequiredChapterList('novel', sourceId, bookId);
  const outputDir = await ensureBookExportDir(meta);

  const chapters: EpubChapter[] = [];
  for (const chapterMeta of chapterList) {
    const chapter = await getNovelChapter(sourceId, bookId, chapterMeta);
    chapters.push({
      title: chapter.chapterName,
      content: textToHtmlParagraphs(chapter.content ?? ''),
    });
  }

  let cover: Uint8Array | undefined;
  if (meta.coverImageUrl) {
    try {
      const coverRes = await fetch(meta.coverImageUrl);
      if (coverRes.ok) cover = new Uint8Array(await coverRes.arrayBuffer());
    } catch {
      // 封面失败不影响 EPUB 导出
    }
  }

  const epub = await buildEpub({
    title: meta.name,
    author: meta.author || '未知作者',
    description: meta.description,
    cover,
    chapters,
    identifier: `${sourceId}_${bookId}`,
  });

  const filename = `${filenameSafe(meta.name)}.epub`;
  const filePath = path.join(outputDir, filename);
  await Bun.write(filePath, new Uint8Array(epub));
  return {
    outputDir,
    files: [{ path: filePath, filename, size: epub.byteLength }],
  };
}

export async function exportComicCbzToProject(
  sourceId: string,
  bookId: string,
): Promise<ExportResult> {
  const meta = await getRequiredBook('comic', sourceId, bookId);
  const chapterList = await getRequiredChapterList('comic', sourceId, bookId);
  const outputDir = await ensureBookExportDir(meta);
  const files: ExportedFile[] = [];

  let partIndex = 1;
  let partBytes = 0;
  let hasImages = false;
  let zip = new JSZip();

  async function flushPart() {
    if (!hasImages) return;
    const filename = `${filenameSafe(meta.name)}.part${String(partIndex).padStart(3, '0')}.cbz`;
    files.push(await writeZip(zip, outputDir, filename));
    partIndex++;
    partBytes = 0;
    hasImages = false;
    zip = new JSZip();
  }

  for (const chapterMeta of chapterList) {
    const chapter = await getComicChapter(sourceId, bookId, chapterMeta);
    const images = await cacheComicChapterImages(sourceId, bookId, chapter);

    for (let i = 0; i < images.length; i++) {
      const image = new Uint8Array(await Bun.file(images[i]!.path).arrayBuffer());
      if (hasImages && partBytes + image.byteLength > MAX_CBZ_PART_BYTES) {
        await flushPart();
      }

      const chapterDir = `${String(chapter.chapterIndex + 1).padStart(4, '0')}_${filenameSafe(chapter.chapterName)}`;
      const filename = `${chapterDir}/${images[i]!.filename}`;
      zip.file(filename, image);
      partBytes += image.byteLength;
      hasImages = true;
    }
  }

  await flushPart();
  if (!files.length) throw new Error('没有可导出的漫画图片');

  return { outputDir, files };
}
