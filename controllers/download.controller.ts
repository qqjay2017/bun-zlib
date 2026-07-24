import { defineController } from "../lib/controller";
import { downloadManager } from "../lib/download-manager";
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
