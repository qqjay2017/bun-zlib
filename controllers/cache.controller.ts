import { defineController } from "../lib/controller";
import {
  loadBookMetadata,
  loadChapterList,
  loadChapter,
  saveBookMetadata,
  saveChapterList,
  saveChapter,
  loadChapterImage,
  listChapterImages,
} from "../lib/cache-manager";
import type { BookMetadata, ChapterMetadata, ContentType } from "../lib/cache-types";

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

  "GET /:type/:sourceId/:bookId/chapter/:chapterId/image/:filename": async (_req, params) => {
    const { type, sourceId, bookId, chapterId, filename } = params;
    const data = await loadChapterImage(type as ContentType, sourceId!, bookId!, chapterId!, filename!);
    if (!data) {
      return Response.json({ success: false, error: "Image not found" }, { status: 404 });
    }

    const ext = filename!.split(".").pop()?.toLowerCase();
    const contentType = ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/jpeg";

    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  },

  "GET /:type/:sourceId/:bookId/chapter/:chapterId/images": async (_req, params) => {
    const { type, sourceId, bookId, chapterId } = params;
    const files = await listChapterImages(type as ContentType, sourceId!, bookId!, chapterId!);
    return Response.json({ success: true, data: files.map((file) => file.filename) });
  },

  // 写入书籍元数据
  "POST /:type/:sourceId/:bookId/metadata": async (req, params) => {
    const { type, sourceId, bookId } = params;
    const body = (await req.json()) as Omit<BookMetadata, "cachedAt">;
    await saveBookMetadata(type as ContentType, sourceId!, bookId!, body);
    return Response.json({ success: true });
  },

  // 写入章节列表
  "POST /:type/:sourceId/:bookId/chapter-list": async (req, params) => {
    const { type, sourceId, bookId } = params;
    const body = (await req.json()) as Omit<ChapterMetadata, "cachedAt">[];
    await saveChapterList(type as ContentType, sourceId!, bookId!, body);
    return Response.json({ success: true });
  },

  // 写入章节内容
  "POST /:type/:sourceId/:bookId/chapter/:chapterId": async (req, params) => {
    const { type, sourceId, bookId } = params;
    const body = (await req.json()) as Omit<ChapterMetadata, "cachedAt">;
    await saveChapter(type as ContentType, sourceId!, bookId!, body);
    return Response.json({ success: true });
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
