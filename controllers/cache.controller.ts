import { defineController } from "../lib/controller";
import { loadBookMetadata, loadChapterList, loadChapter } from "../lib/cache-manager";
import type { ContentType } from "../lib/cache-types";

defineController("/api/cache", {
  // 读取书籍元数据
  "GET /:type/:sourceId/:bookId/metadata": async (_req, params) => {
    const { type, sourceId, bookId } = params;
    const data = await loadBookMetadata(type as ContentType, sourceId!, bookId!);
    return Response.json({ success: true, data });
  },

  // 读取章节列表
  "GET /:type/:sourceId/:bookId/chapter-list": async (_req, params) => {
    const { type, sourceId, bookId } = params;
    const data = await loadChapterList(type as ContentType, sourceId!, bookId!);
    return Response.json({ success: true, data });
  },

  // 读取章节内容
  "GET /:type/:sourceId/:bookId/chapter/:chapterId": async (_req, params) => {
    const { type, sourceId, bookId, chapterId } = params;
    const data = await loadChapter(type as ContentType, sourceId!, bookId!, chapterId!);
    return Response.json({ success: true, data });
  },

  // 封面图片代理
  "GET /:type/:sourceId/:bookId/cover": async (_req, params) => {
    const { type, sourceId, bookId } = params;
    const meta = await loadBookMetadata(type as ContentType, sourceId!, bookId!);
    if (!meta?.coverImageUrl) {
      return Response.json({ success: false, error: "No cover image" }, { status: 404 });
    }
    try {
      const imgRes = await fetch(meta.coverImageUrl);
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      return new Response(imgRes.body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return Response.json({ success: false, error: "Failed to fetch cover" }, { status: 502 });
    }
  },
});
