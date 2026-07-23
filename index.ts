import index from "./index.html";
import { fetchBookPageHtml } from "./backend.ts";

Bun.serve({
  port: 3000,
  routes: {
    "/": index,
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
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Server running at http://localhost:3000");
