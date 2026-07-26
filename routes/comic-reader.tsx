import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { comicDetailRoute } from "./comic-detail";
import { getManwapiImageApiUrl, sourceManwapi } from "../lib/sources/manwapi";
import { sourceManhuafree } from "../lib/sources/manhuafree";
import { saveVisitHistory } from "../lib/history-api";
import type { BookSourceConfig } from "../lib/source-config";
import type { BookMetadata } from "../lib/cache-types";
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

async function getBook(sourceId: string, bookId: string): Promise<BookMetadata> {
  const cached = await readCache<BookMetadata>(`/api/cache/comic/${sourceId}/${bookId}/metadata`);
  if (!cached) throw new Error("书籍缓存不存在");
  return cached;
}

function getComicSource(sourceId: string): BookSourceConfig {
  if (sourceId === "manhuafree") return sourceManhuafree;
  return sourceManwapi;
}

function getChapterContentUrl(sourceId: string, chapter: ChapterMetadata): string {
  if (sourceId === "manwapi") return getManwapiImageApiUrl(chapter.chapterId);
  return chapter.chapterDetailUrl;
}

async function getChapter(
  sourceId: string,
  bookId: string,
  chapter: ChapterMetadata,
): Promise<ChapterMetadata> {
  const cacheUrl = `/api/cache/comic/${sourceId}/${bookId}/chapter/${chapter.chapterId}`;
  const cached = await readCache<ChapterMetadata>(cacheUrl);
  if (cached?.content) return cached;

  const source = getComicSource(sourceId);
  const jsonText = await fetchText(getChapterContentUrl(sourceId, chapter));
  const extracted = source.extractors.extractContent(jsonText);
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
    return <div className="comic-reader-placeholder">图片加载中...</div>;
  }

  return (
    <img
      src={src}
      alt={alt}
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
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} />;
}

type PageMode = "single" | "spread";

const PAGE_MODE_STORAGE_KEY = "comic-reader:page-mode";
const WHEEL_TURN_THRESHOLD = 60;
const WHEEL_COOLDOWN_MS = 400;

function readStoredPageMode(): PageMode {
  return window.localStorage.getItem(PAGE_MODE_STORAGE_KEY) === "spread" ? "spread" : "single";
}

/**
 * 单页模式每页一组；双页模式两两配对，总页数为奇数时第1页单独作封面，
 * 保证不管奇偶都恰好配完、不留残页。
 */
function buildPageSlots(pageCount: number, mode: PageMode): number[][] {
  if (pageCount <= 0) return [];
  if (mode === "single") {
    return Array.from({ length: pageCount }, (_, index) => [index]);
  }

  const slots: number[][] = [];
  const hasCoverPage = pageCount % 2 === 1;
  if (hasCoverPage) slots.push([0]);
  for (let index = hasCoverPage ? 1 : 0; index < pageCount; index += 2) {
    slots.push([index, index + 1]);
  }
  return slots;
}

function findSlotIndexForPage(slots: number[][], pageIndex: number): number {
  const found = slots.findIndex((slot) => slot.includes(pageIndex));
  return found >= 0 ? found : 0;
}


function ComicReaderPage() {
  const { sourceId, bookId, chapterId } = comicReaderRoute.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const bookQuery = useQuery({
    queryKey: ["comic", sourceId, bookId, "metadata"],
    queryFn: () => getBook(sourceId, bookId),
    staleTime: 60_000,
  });

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
  const pageCount = shouldUseCachedImages ? cachedImages.length : imageUrls.length;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < chapters.length - 1;
  const error = chapterListQuery.error || chapterQuery.error || refreshMutation.error || cacheImagesMutation.error;

  const [pageMode, setPageMode] = useState<PageMode>(() => readStoredPageMode());
  const [slotIndex, setSlotIndex] = useState(0);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const slots = useMemo(() => buildPageSlots(pageCount, pageMode), [pageCount, pageMode]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wheelAccumRef = useRef(0);
  const wheelCooldownRef = useRef(false);

  useEffect(() => {
    if (chapter?.content && !cachedImages.length && !cacheImagesMutation.isPending && !cacheImagesMutation.error) {
      cacheImagesMutation.mutate();
    }
  }, [cachedImages.length, cacheImagesMutation, chapter?.content]);

  useEffect(() => {
    if (!chapter || !chapterMeta || !bookQuery.data) return;
    void saveVisitHistory({
      type: "comic",
      sourceId,
      bookId,
      bookName: bookQuery.data.name,
      chapterId: chapter.chapterId,
      chapterName: chapter.chapterName,
      path: window.location.pathname,
      visitedAt: Date.now(),
    });
  }, [bookId, bookQuery.data, chapter, chapterMeta, sourceId]);

  useEffect(() => {
    setSlotIndex(0);
  }, [chapterId]);

  useEffect(() => {
    if (slots.length && slotIndex > slots.length - 1) {
      setSlotIndex(slots.length - 1);
    }
  }, [slots.length, slotIndex]);

  useEffect(() => {
    wheelAccumRef.current = 0;
  }, [slotIndex]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const goToChapter = useCallback(
    (targetChapterId: string) => {
      navigate({
        to: "/comic/$sourceId/$bookId/$chapterId" as any,
        params: { sourceId, bookId, chapterId: targetChapterId } as any,
      });
    },
    [navigate, sourceId, bookId],
  );

  const goNext = useCallback(() => {
    if (slotIndex < slots.length - 1) {
      setSlotIndex(slotIndex + 1);
      return;
    }
    if (hasNext) goToChapter(chapters[currentIndex + 1]!.chapterId);
  }, [slotIndex, slots.length, hasNext, chapters, currentIndex, goToChapter]);

  const goPrev = useCallback(() => {
    if (slotIndex > 0) {
      setSlotIndex(slotIndex - 1);
      return;
    }
    if (hasPrev) goToChapter(chapters[currentIndex - 1]!.chapterId);
  }, [slotIndex, hasPrev, chapters, currentIndex, goToChapter]);

  const togglePageMode = useCallback(() => {
    const nextMode: PageMode = pageMode === "single" ? "spread" : "single";
    const currentFirstPage = slots[slotIndex]?.[0] ?? 0;
    const nextSlots = buildPageSlots(pageCount, nextMode);
    setPageMode(nextMode);
    setSlotIndex(findSlotIndexForPage(nextSlots, currentFirstPage));
    window.localStorage.setItem(PAGE_MODE_STORAGE_KEY, nextMode);
  }, [pageMode, slots, slotIndex, pageCount]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === " ") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "Escape" && catalogOpen) {
        setCatalogOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, catalogOpen]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      if (wheelCooldownRef.current) return;

      wheelAccumRef.current += event.deltaY;
      if (wheelAccumRef.current > WHEEL_TURN_THRESHOLD) {
        wheelAccumRef.current = 0;
        wheelCooldownRef.current = true;
        goNext();
        window.setTimeout(() => { wheelCooldownRef.current = false; }, WHEEL_COOLDOWN_MS);
      } else if (wheelAccumRef.current < -WHEEL_TURN_THRESHOLD) {
        wheelAccumRef.current = 0;
        wheelCooldownRef.current = true;
        goPrev();
        window.setTimeout(() => { wheelCooldownRef.current = false; }, WHEEL_COOLDOWN_MS);
      }
    }

    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [goNext, goPrev]);

  function renderPage(pageIndex: number, eager: boolean) {
    if (shouldUseCachedImages) {
      const filename = cachedImages[pageIndex];
      if (!filename) return null;
      return (
        <CachedComicImage
          key={filename}
          src={getCachedImageUrl(sourceId, bookId, chapterId, filename)}
          alt={`${chapter?.chapterName || "漫画"} 第${pageIndex + 1}页`}
          eager={eager}
        />
      );
    }
    const url = imageUrls[pageIndex];
    if (!url) return null;
    return (
      <ComicImage
        key={url}
        url={url}
        alt={`${chapter?.chapterName || "漫画"} 第${pageIndex + 1}页`}
        eager={eager}
      />
    );
  }

  const visibleSlotIndices = [slotIndex - 1, slotIndex, slotIndex + 1].filter(
    (index) => index >= 0 && index < slots.length,
  );
  const isFirstSlot = slotIndex === 0;
  const isLastSlot = slotIndex === slots.length - 1;

  return (
    <div className="comic-reader-shell">
      <div className="comic-reader-topbar">
        <Link
          to={"/comic/$sourceId/$bookId" as any}
          params={{ sourceId, bookId } as any}
          className="comic-reader-back-btn"
        >
          返回目录
        </Link>
        <span className="comic-reader-title">
          {chapter?.chapterName || chapterMeta?.chapterName || "章节加载中..."}
        </span>
        <button
          type="button"
          className="comic-reader-cache-btn"
          disabled={!chapterMeta || refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
        >
          {refreshMutation.isPending ? "刷新中..." : "重新缓存"}
        </button>
      </div>

      <div className="comic-reader-viewport" ref={viewportRef}>
        {error instanceof Error && <div className="comic-reader-error">{error.message}</div>}
        {(chapterListQuery.isPending || chapterQuery.isPending) && (
          <div className="comic-reader-empty">图片加载中...</div>
        )}

        {visibleSlotIndices.map((index) => (
          <div
            key={index}
            className="comic-reader-slot"
            style={{ display: index === slotIndex ? "flex" : "none" }}
          >
            {slots[index]!.map((pageIndex) => renderPage(pageIndex, index === slotIndex))}
          </div>
        ))}

        <button
          type="button"
          className="comic-reader-arrow comic-reader-arrow-left"
          onClick={goPrev}
          disabled={isFirstSlot && !hasPrev}
          aria-label="上一页"
        >
          ‹
        </button>
        <button
          type="button"
          className="comic-reader-arrow comic-reader-arrow-right"
          onClick={goNext}
          disabled={isLastSlot && !hasNext}
          aria-label="下一页"
        >
          ›
        </button>
      </div>

      <div className="comic-reader-toolbar">
        {hasPrev ? (
          <Link
            to={"/comic/$sourceId/$bookId/$chapterId" as any}
            params={{
              sourceId,
              bookId,
              chapterId: chapters[currentIndex - 1]!.chapterId,
            } as any}
            className="comic-reader-toolbar-btn"
          >
            上一章
          </Link>
        ) : (
          <span className="comic-reader-toolbar-btn disabled">上一章</span>
        )}
        <button
          type="button"
          className="comic-reader-toolbar-btn"
          onClick={goPrev}
          disabled={isFirstSlot && !hasPrev}
        >
          ‹ 上一页
        </button>
        <span className="comic-reader-page-indicator">
          {slots.length ? `${slotIndex + 1} / ${slots.length}` : "-- / --"}
        </span>
        <button
          type="button"
          className="comic-reader-toolbar-btn"
          onClick={goNext}
          disabled={isLastSlot && !hasNext}
        >
          下一页 ›
        </button>
        {hasNext ? (
          <Link
            to={"/comic/$sourceId/$bookId/$chapterId" as any}
            params={{
              sourceId,
              bookId,
              chapterId: chapters[currentIndex + 1]!.chapterId,
            } as any}
            className="comic-reader-toolbar-btn"
          >
            下一章
          </Link>
        ) : (
          <span className="comic-reader-toolbar-btn disabled">下一章</span>
        )}
        <button type="button" className="comic-reader-toolbar-btn" onClick={togglePageMode}>
          {pageMode === "single" ? "单页" : "双页"}
        </button>
        <button
          type="button"
          className="comic-reader-toolbar-btn"
          onClick={() => setCatalogOpen((open) => !open)}
        >
          目录
        </button>
      </div>

      {catalogOpen && (
        <div className="comic-reader-catalog-overlay" onClick={() => setCatalogOpen(false)}>
          <div className="comic-reader-catalog-panel" onClick={(event) => event.stopPropagation()}>
            <div className="comic-reader-catalog-header">
              <span>目录（共{chapters.length}话）</span>
              <button
                type="button"
                className="comic-reader-catalog-close"
                onClick={() => setCatalogOpen(false)}
                aria-label="关闭目录"
              >
                ✕
              </button>
            </div>
            <div className="comic-reader-catalog-list">
              {chapters.map((item) => (
                <Link
                  key={item.chapterId}
                  to={"/comic/$sourceId/$bookId/$chapterId" as any}
                  params={{ sourceId, bookId, chapterId: item.chapterId } as any}
                  className={
                    item.chapterId === chapterId
                      ? "comic-reader-catalog-item active"
                      : "comic-reader-catalog-item"
                  }
                  onClick={() => setCatalogOpen(false)}
                >
                  第{item.chapterIndex + 1}话 {item.chapterName}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
