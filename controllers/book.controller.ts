import { defineController } from "../lib/controller";
import { fetchBookPageHtml, fetchRemoteResponse, fetchRemoteText } from "../backend.ts";

const ALLOWED_IMAGE_HOSTS = new Set([
  "tu.mwzu.cc",
  "mwtuwu.cc",
  "118.25.141.191",
  "mwtuyi.cc",
  "svip.mwtt.cc",
  "mwtusan.cc",
  "mwtusi.cc",
  "mg.mwre.cc",
  "c-nd2-1.6wm.top",
  "c-nd3-1.6wm.top",
  "t-nd2-1.6wm.top",
  "t-nd3-1.6wm.top",
  "c-nc-1.6wm.top",
]);

function isAllowedImageUrl(url: string): boolean {
  try {
    const target = new URL(url);
    return target.protocol === "https:"
      && (ALLOWED_IMAGE_HOSTS.has(target.hostname) || target.hostname.endsWith(".g-mh.online"));
  } catch {
    return false;
  }
}

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

  "POST /fetch-text": async (req) => {
    const body = await req.json();
    const { url } = body as { url: string };

    if (!url) {
      return Response.json({ success: false, error: "URL is required" }, { status: 400 });
    }

    const text = await fetchRemoteText(url);
    return Response.json({ success: true, data: text });
  },

  "GET /proxy-image": async (req) => {
    const url = new URL(req.url).searchParams.get("url") ?? "";
    if (!isAllowedImageUrl(url)) {
      return Response.json({ success: false, error: "Image URL is not allowed" }, { status: 400 });
    }

    try {
      const imgRes = await fetchRemoteResponse(url);
      return new Response(imgRes.body, {
        headers: {
          "Content-Type": imgRes.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (error) {
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : "Image proxy failed" },
        { status: 502 },
      );
    }
  },
});
