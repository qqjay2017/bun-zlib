import { useEffect, useState } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { comicDetailRoute } from "./comic-detail";
import { getManwapiImageApiUrl, sourceManwapi } from "../lib/sources/manwapi";
import type { ChapterMetadata } from "../lib/cache-types";

export const comicReaderRoute = createRoute({
  getParentRoute: () => comicDetailRoute,
  path: "$chapterId",
  component: ComicReaderPage,
});

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function readCache<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  const result = (await res.json()) as ApiResult<T | null>;
  if (!result.success) throw new Error(result.error || "缓存读取失败");
  return result.data ?? null;
}

async function writeCache(url: string, data: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = (await res.json()) as ApiResult<unknown>;
  if (!result.success) throw new Error(result.error || "缓存写入失败");
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch("/api/fetch-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const result = (await res.json()) as ApiResult<string>;
  if (!result.success || !result.data) throw new Error(result.error || "图片列表获取失败");
  return result.data;
}

async function getChapterList(sourceId: string, bookId: string): Promise<ChapterMetadata[]> {
  const cached = await readCache<{ chapters: ChapterMetadata[] }>(
    `/api/cache/comic/${sourceId}/${bookId}/chapter-list`,
  );
  if (!cached?.chapters.length) throw new Error("目录缓存不存在，请先打开详情页");
  return cached.chapters;
}

async function getChapter(
  sourceId: string,
  bookId: string,
  chapter: ChapterMetadata,
): Promise<ChapterMetadata> {
  const cacheUrl = `/api/cache/comic/${sourceId}/${bookId}/chapter/${chapter.chapterId}`;
  const cached = await readCache<ChapterMetadata>(cacheUrl);
  if (cached?.content) return cached;

  const jsonText = await fetchText(getManwapiImageApiUrl(chapter.chapterId));
  const extracted = sourceManwapi.extractors.extractContent(jsonText);
  if (!extracted?.content) throw new Error("漫画图片解析失败");

  const nextChapter = {
    ...chapter,
    content: extracted.content,
  };
  await writeCache(cacheUrl, nextChapter);
  return { ...nextChapter, cachedAt: Date.now() };
}

function getImageUrls(content: string | undefined): string[] {
  return (content ?? "")
    .split(/\n+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function getProxiedImageUrl(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function getCachedImageUrl(sourceId: string, bookId: string, chapterId: string, filename: string): string {
  return `/api/cache/comic/${sourceId}/${bookId}/chapter/${chapterId}/image/${encodeURIComponent(filename)}`;
}

async function getCachedImageFilenames(sourceId: string, bookId: string, chapterId: string): Promise<string[]> {
  const res = await fetch(`/api/cache/comic/${sourceId}/${bookId}/chapter/${chapterId}/images`);
  const result = (await res.json()) as ApiResult<string[]>;
  if (!result.success) throw new Error(result.error || "图片缓存读取失败");
  return result.data ?? [];
}

async function cacheChapterImages(sourceId: string, bookId: string, chapterId: string): Promise<string[]> {
  const res = await fetch(`/api/cache/comic/${sourceId}/${bookId}/chapter/${chapterId}/images/cache`, {
    method: "POST",
  });
  const result = (await res.json()) as ApiResult<string[]>;
  if (!result.success) throw new Error(result.error || "本章图片缓存失败");
  return result.data ?? [];
}

const MANWAPI_AES_KEY = "0B6666A0-BB59-1381-B746-a0E4C9AC";

function isImageBytes(view: Uint8Array): boolean {
  return (view[0] === 0xFF && view[1] === 0xD8)
    || (view[0] === 0x89 && view[1] === 0x50)
    || (view[0] === 0x47 && view[1] === 0x49)
    || (view[0] === 0x52 && view[1] === 0x49);
}

async function createManwapiImageObjectUrl(url: string): Promise<string> {
  const res = await fetch(getProxiedImageUrl(url));
  if (!res.ok) return url;

  const arrayBuffer = await res.arrayBuffer();
  const view = new Uint8Array(arrayBuffer);
  if (isImageBytes(view)) {
    return URL.createObjectURL(new Blob([arrayBuffer]));
  }

  const iv = arrayBuffer.slice(0, 16);
  const ciphertext = arrayBuffer.slice(16);
  const keyBytes = new TextEncoder().encode(MANWAPI_AES_KEY).slice(0, 32);
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-CBC", iv: new Uint8Array(iv) },
    cryptoKey,
    ciphertext,
  );

  return URL.createObjectURL(new Blob([decryptedBuffer]));
}

function ComicImage({ url, alt, eager }: { url: string; alt: string; eager: boolean }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    setSrc("");
    setFailed(false);
    createManwapiImageObjectUrl(url)
      .then((nextSrc) => {
        if (cancelled) {
          if (nextSrc.startsWith("blob:")) URL.revokeObjectURL(nextSrc);
          return;
        }
        objectUrl = nextSrc.startsWith("blob:") ? nextSrc : "";
        setSrc(nextSrc);
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(url);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!src) {
    return <div className="comic-strip-placeholder">图片加载中...</div>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className="comic-strip-img"
      loading={eager ? "eager" : "lazy"}
      onError={() => {
        if (failed) return;
        setFailed(true);
        setSrc(url);
      }}
    />
  );
}

function CachedComicImage({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
  return (
    <img
      src={src}
      alt={alt}
      className="comic-strip-img"
      loading={eager ? "eager" : "lazy"}
    />
  );
}

function ComicReaderPage() {
  const { sourceId, bookId, chapterId } = comicReaderRoute.useParams();
  const queryClient = useQueryClient();

  const chapterListQuery = useQuery({
    queryKey: ["comic", sourceId, bookId, "chapters"],
    queryFn: () => getChapterList(sourceId, bookId),
    staleTime: 60_000,
  });

  const chapters = chapterListQuery.data ?? [];
  const currentIndex = chapters.findIndex((chapter) => chapter.chapterId === chapterId);
  const chapterMeta = currentIndex >= 0 ? chapters[currentIndex] : undefined;

  const chapterQuery = useQuery({
    queryKey: ["comic", sourceId, bookId, "chapter", chapterId],
    queryFn: () => getChapter(sourceId, bookId, chapterMeta!),
    enabled: !!chapterMeta,
    staleTime: 60_000,
  });

  const cachedImagesQuery = useQuery({
    queryKey: ["comic", sourceId, bookId, "chapter", chapterId, "images"],
    queryFn: () => getCachedImageFilenames(sourceId, bookId, chapterId),
    enabled: !!chapterMeta,
    staleTime: 60_000,
  });

  const cacheImagesMutation = useMutation({
    mutationFn: () => cacheChapterImages(sourceId, bookId, chapterId),
    onSuccess: (filenames) => {
      queryClient.setQueryData(["comic", sourceId, bookId, "chapter", chapterId, "images"], filenames);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!chapterMeta) return;
      await writeCache(`/api/cache/comic/${sourceId}/${bookId}/chapter/${chapterMeta.chapterId}`, {
        ...chapterMeta,
        content: "",
      });
      await queryClient.invalidateQueries({
        queryKey: ["comic", sourceId, bookId, "chapter", chapterMeta.chapterId],
      });
    },
  });

  const chapter = chapterQuery.data;
  const imageUrls = getImageUrls(chapter?.content);
  const cachedImages = cachedImagesQuery.data ?? [];
  const shouldUseCachedImages = cachedImages.length > 0;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < chapters.length - 1;
  const error = chapterListQuery.error || chapterQuery.error || refreshMutation.error || cacheImagesMutation.error;

  useEffect(() => {
    if (chapter?.content && !cachedImages.length && !cacheImagesMutation.isPending && !cacheImagesMutation.error) {
      cacheImagesMutation.mutate();
    }
  }, [cachedImages.length, cacheImagesMutation, chapter?.content]);

  return (
    <div className="page reader-page comic-reader-page-inner">
      <div className="reader-header">
        <Link
          to={"/comic/$sourceId/$bookId" as any}
          params={{ sourceId, bookId } as any}
          className="back-btn"
        >
          返回目录
        </Link>
        <span className="chapter-title-header">
          {chapter?.chapterName || chapterMeta?.chapterName || "章节加载中..."}
        </span>
        <button
          className="btn-secondary reader-cache-btn"
          disabled={!chapterMeta || refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
        >
          {refreshMutation.isPending ? "刷新中..." : "重新缓存"}
        </button>
      </div>

      {error instanceof Error && <div className="error-message">{error.message}</div>}
      {(chapterListQuery.isPending || chapterQuery.isPending) && (
        <div className="empty-state">图片加载中...</div>
      )}

      {(shouldUseCachedImages || imageUrls.length > 0) && (
        <div className="comic-strip">
          {shouldUseCachedImages
            ? cachedImages.map((filename, index) => (
                <CachedComicImage
                  key={filename}
                  src={getCachedImageUrl(sourceId, bookId, chapterId, filename)}
                  alt={`${chapter?.chapterName || "漫画"} 第${index + 1}页`}
                  eager={index < 2}
                />
              ))
            : imageUrls.map((url, index) => (
                <ComicImage
                  key={url}
                  url={url}
                  alt={`${chapter?.chapterName || "漫画"} 第${index + 1}页`}
                  eager={index < 2}
                />
              ))}
        </div>
      )}

      <div className="reader-nav">
        {hasPrev ? (
          <Link
            to={"/comic/$sourceId/$bookId/$chapterId" as any}
            params={{
              sourceId,
              bookId,
              chapterId: chapters[currentIndex - 1]!.chapterId,
            } as any}
            className="btn-nav"
          >
            上一章
          </Link>
        ) : (
          <span className="btn-nav disabled">上一章</span>
        )}
        <Link
          to={"/comic/$sourceId/$bookId" as any}
          params={{ sourceId, bookId } as any}
          className="btn-nav btn-catalog"
        >
          目录
        </Link>
        {hasNext ? (
          <Link
            to={"/comic/$sourceId/$bookId/$chapterId" as any}
            params={{
              sourceId,
              bookId,
              chapterId: chapters[currentIndex + 1]!.chapterId,
            } as any}
            className="btn-nav"
          >
            下一章
          </Link>
        ) : (
          <span className="btn-nav disabled">下一章</span>
        )}
      </div>
    </div>
  );
}
