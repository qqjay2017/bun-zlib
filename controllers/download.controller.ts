import { defineController } from "../lib/controller";
import { downloadManager } from "../lib/download-manager";
import { exportComicCbzToProject, exportNovelEpubToProject } from "../lib/export-manager";
import { exportJobManager } from "../lib/export-job-manager";
import type { ContentType } from "../lib/cache-types";
import type { CreateDownloadRequest, DownloadTask, ProgressListener } from "../lib/download-types";

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
    if (contentType !== "novel") {
      return Response.json({ success: false, error: "EPUB 仅支持小说" }, { status: 400 });
    }

    try {
      const result = await exportNovelEpubToProject(sourceId!, bookId!);
      return Response.json({ success: true, data: result });
    } catch (error) {
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : "EPUB 导出失败" },
        { status: 500 },
      );
    }
  },

  "GET /cbz/comic/:sourceId/:bookId": async (_req, params) => {
    const { sourceId, bookId } = params;
    const job = exportJobManager.start(() => exportComicCbzToProject(sourceId!, bookId!));
    return Response.json({ success: true, data: { jobId: job.jobId } });
  },

  "GET /export-jobs/:jobId": async (_req, params) => {
    const job = exportJobManager.get(params.jobId!);
    if (!job) {
      return Response.json({ success: false, error: "导出任务不存在" }, { status: 404 });
    }
    return Response.json({ success: true, data: job });
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
