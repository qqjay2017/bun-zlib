import { defineController } from "../lib/controller";
import { fetchBookPageHtml } from "../backend.ts";

defineController("/api", {
  "POST /fetch-book": async (req) => {
    const body = await req.json();
    const { url } = body as { url: string };

    if (!url) {
      return Response.json({ success: false, error: "URL is required" }, { status: 400 });
    }

    const html = await fetchBookPageHtml(url);
    return Response.json({ success: true, data: html });
  },
});
