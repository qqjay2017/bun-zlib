import index from "./index.html";
import { fetchBookPageHtml } from "./backend.ts";
import { downloadManager } from "./lib/download-manager";
import type { CreateDownloadRequest, DownloadTask } from "./lib/download-types";
import type { ProgressListener } from "./lib/download-types";
import { loadBookMetadata, loadChapterList, loadChapter } from "./lib/cache-manager";
import type { ContentType } from "./lib/cache-types";
// 触发源注册
import "./lib/sources";

// ============================================================
// 辅助：路径参数解析
// ============================================================

function matchPath(url: string, pattern: string): Record<string, string> | null {
  const urlParts = url.split("?")[0]!.split("/").filter(Boolean);
  const patParts = pattern.split("/").filter(Boolean);
  if (urlParts.length !== patParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    const pat = patParts[i]!;
    const val = urlParts[i]!;
    if (pat.startsWith(":")) {
      params[pat.slice(1)] = decodeURIComponent(val);
    } else if (pat !== val) {
      return null;
    }
  }
  return params;
}

// ============================================================
// 动态路由处理
// ============================================================

async function handleDynamicRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // DELETE /api/download/:taskId — 取消下载任务
  if (method === "DELETE") {
    const m = matchPath(path, "/api/download/:taskId");
    if (m) {
      const ok = downloadManager.cancelTask(m.taskId!);
      return Response.json({ success: ok });
    }
  }

  // GET /api/cache/:type/:sourceId/:bookId/metadata — 读取书籍元数据
  if (method === "GET") {
    const metaMatch = matchPath(path, "/api/cache/:type/:sourceId/:bookId/metadata");
    if (metaMatch) {
      const type = metaMatch.type!;
      const sourceId = metaMatch.sourceId!;
      const bookId = metaMatch.bookId!;
      const data = await loadBookMetadata(type as ContentType, sourceId, bookId);
      return Response.json({ success: true, data });
    }

    // GET /api/cache/:type/:sourceId/:bookId/chapter-list — 读取章节列表
    const listMatch = matchPath(path, "/api/cache/:type/:sourceId/:bookId/chapter-list");
    if (listMatch) {
      const type = listMatch.type!;
      const sourceId = listMatch.sourceId!;
      const bookId = listMatch.bookId!;
      const data = await loadChapterList(type as ContentType, sourceId, bookId);
      return Response.json({ success: true, data });
    }

    // GET /api/cache/:type/:sourceId/:bookId/chapter/:chapterId — 读取章节内容
    const chMatch = matchPath(path, "/api/cache/:type/:sourceId/:bookId/chapter/:chapterId");
    if (chMatch) {
      const type = chMatch.type!;
      const sourceId = chMatch.sourceId!;
      const bookId = chMatch.bookId!;
      const chapterId = chMatch.chapterId!;
      const data = await loadChapter(type as ContentType, sourceId, bookId, chapterId);
      return Response.json({ success: true, data });
    }

    // GET /api/cache/:type/:sourceId/:bookId/cover — 封面图片代理
    const coverMatch = matchPath(path, "/api/cache/:type/:sourceId/:bookId/cover");
    if (coverMatch) {
      const type = coverMatch.type!;
      const sourceId = coverMatch.sourceId!;
      const bookId = coverMatch.bookId!;
      const meta = await loadBookMetadata(type as ContentType, sourceId, bookId);
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
    }
  }

  return null;
}

// ============================================================
// Bun.serve 启动
// ============================================================

Bun.serve({
  port: 3000,
  routes: {
    "/": index,

    // --------------------------------------------------------
    // 已有：fetch-book
    // --------------------------------------------------------
    "/api/fetch-book": {
      POST: async (req) => {
        try {
          const body = await req.json();
          const { url } = body as { url: string };

          if (!url) {
            return Response.json({ success: false, error: "URL is required" }, { status: 400 });
          }

          const html = await fetchBookPageHtml(url);
          return Response.json({ success: true, data: html });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },

    // --------------------------------------------------------
    // 下载中心
    // --------------------------------------------------------
    "/api/download/create": {
      POST: async (req) => {
        try {
          const body = (await req.json()) as CreateDownloadRequest;
          const task = downloadManager.createTask(body);
          return Response.json({ success: true, data: task });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },

    "/api/download/tasks": {
      GET: async () => {
        return Response.json({ success: true, data: downloadManager.getTasks() });
      },
    },

    "/api/download/progress": {
      GET: async () => {
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
    },

    // --------------------------------------------------------
    // 源列表
    // --------------------------------------------------------
    "/api/sources": {
      GET: async () => {
        const { getAllSources } = await import("./lib/source-config");
        const sources = getAllSources();
        // 返回时去掉 extractors 函数（不序列化到前端）
        const safe = sources.map(({ extractors, getBookId, ...rest }) => rest);
        return Response.json({ success: true, data: safe });
      },
    },
  },

  // 动态路由回退
  async fetch(req) {
    const res = await handleDynamicRoutes(req);
    if (res) return res;
    return new Response("Not Found", { status: 404 });
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log("Server running at http://localhost:3000");
