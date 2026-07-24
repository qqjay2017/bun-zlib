import { defineController } from "../lib/controller";
import { getAllSources } from "../lib/source-config";

defineController("/api", {
  "GET /sources": async () => {
    const sources = getAllSources();
    // 返回时去掉 extractors 函数和 getBookId（不序列化到前端）
    const safe = sources.map(({ extractors, getBookId, ...rest }) => rest);
    return Response.json({ success: true, data: safe });
  },
});
