import { defineController } from "../lib/controller";
import { listVisitHistory, saveVisitHistory } from "../lib/history-manager";
import type { ContentType } from "../lib/cache-types";

defineController("/api/history", {
  "GET /:type": async (_req, params) => {
    const type = params.type as ContentType;
    const data = await listVisitHistory(type);
    return Response.json({ success: true, data });
  },

  "POST /": async (req) => {
    const body = await req.json();
    await saveVisitHistory(body);
    return Response.json({ success: true });
  },
});
