import { defineController } from "../lib/controller";
import { downloadManager } from "../lib/download-manager";
import { buildEpub } from "../lib/epub-builder";
import { loadBookMetadata, loadChapter, loadChapterList, saveChapter } from "../lib/cache-manager";
import { fetchPageHtml } from "../backend";
import { getSourceById } from "../lib/source-config";
import type { ContentType } from "../lib/cache-types";
import type { CreateDownloadRequest, DownloadTask, ProgressListener } from "../lib/download-types";
import type { EpubChapter } from "../lib/epub-builder";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtmlParagraphs(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("\n");
}

function filenameSafe(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "_").trim() || "book";
}

defineController("/api/download", {
  "POST /create": async (req) => {
    const body = (await req.json()) as CreateDownloadRequest;
    const task = downloadManager.createTask(body);
    return Response.json({ success: true, data: task });
  },

  "GET /tasks": async () => {
    return Response.json({ success: true, data: downloadManager.getTasks() });
  },

  "GET /epub/:type/:sourceId/:bookId": async (_req, params) => {
    const { type, sourceId, bookId } = params;
    const contentType = type as ContentType;
    const meta = await loadBookMetadata(contentType, sourceId!, bookId!);
    const chapterList = await loadChapterList(contentType, sourceId!, bookId!);

    if (!meta || !chapterList?.chapters.length) {
      return Response.json(
        { success: false, error: "请先打开详情页，完成书籍元数据和目录缓存" },
        { status: 404 },
      );
    }

    const source = getSourceById(sourceId!);
    const chapters: EpubChapter[] = [];

    for (const chapterMeta of chapterList.chapters) {
      let chapter = await loadChapter(contentType, sourceId!, bookId!, chapterMeta.chapterId);

      if (!chapter?.content) {
        if (!source) {
          return Response.json(
            { success: false, error: `找不到书源: ${sourceId}` },
            { status: 400 },
          );
        }

        const html = await fetchPageHtml(chapterMeta.chapterDetailUrl);
        const extracted = source.extractors.extractContent(html);
        if (!extracted?.content) {
          return Response.json(
            { success: false, error: `章节抓取失败: ${chapterMeta.chapterName}` },
            { status: 502 },
          );
        }

        chapter = {
          ...chapterMeta,
          chapterName: extracted.chapterName || chapterMeta.chapterName,
          content: extracted.content,
          cachedAt: Date.now(),
        };

        await saveChapter(contentType, sourceId!, bookId!, chapter);
      }

      chapters.push({
        title: chapter.chapterName,
        content: textToHtmlParagraphs(chapter.content ?? ""),
      });
    }

    let cover: Uint8Array | undefined;
    if (meta.coverImageUrl) {
      try {
        const coverRes = await fetch(meta.coverImageUrl);
        if (coverRes.ok) cover = new Uint8Array(await coverRes.arrayBuffer());
      } catch {
        // 封面失败不影响 EPUB 主流程
      }
    }

    const epub = await buildEpub({
      title: meta.name,
      author: meta.author || "未知作者",
      description: meta.description,
      cover,
      chapters,
      identifier: `${sourceId}_${bookId}`,
    });

    const filename = `${filenameSafe(meta.name)}.epub`;
    return new Response(new Uint8Array(epub), {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  },

  "GET /progress": async () => {
    let listener: ProgressListener;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        listener = (task: DownloadTask) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(task)}\n\n`));
          } catch {
            // 连接已关闭
          }
        };
        downloadManager.addListener(listener);
      },
      cancel() {
        downloadManager.removeListener(listener);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  },

  "DELETE /:taskId": async (_req, params) => {
    const ok = downloadManager.cancelTask(params.taskId!);
    return Response.json({ success: ok });
  },
});
