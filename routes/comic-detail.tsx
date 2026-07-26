import { useEffect, useState } from "react";
import { createRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { comicRoute } from "./comic";
import { sourceManwapi } from "../lib/sources/manwapi";
import type { BookMetadata, ChapterMetadata } from "../lib/cache-types";

export const comicDetailRoute = createRoute({
  getParentRoute: () => comicRoute,
  path: "$sourceId/$bookId",
  component: ComicDetailLayout,
});

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ChapterItem = Omit<ChapterMetadata, "cachedAt">;
type ShelfBook = Pick<
  BookMetadata,
  | "bookId"
  | "sourceId"
  | "contentType"
  | "name"
  | "author"
  | "coverImageUrl"
  | "description"
  | "detailPageUrl"
> & {
  addedAt: number;
};

type ExportResult = {
  outputDir: string;
  files: Array<{ path: string; filename: string; size: number }>;
};

const COMIC_SHELF_KEY = "bookshelf:comic";

function getDetailUrl(bookId: string): string {
  return `${sourceManwapi.domain}/comic/${bookId}`;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch("/api/fetch-book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const result = (await res.json()) as ApiResult<string>;
  if (!result.success || !result.data) throw new Error(result.error || "页面获取失败");
  if (/Just a moment|请稍候|正在进行安全验证|cf-turnstile|challenges\.cloudflare\.com/i.test(result.data)) {
    throw new Error("当前仍是人机验证页，请先在 WebView/浏览器中通过漫蛙验证");
  }
  return result.data;
}

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

function readShelfBooks(): ShelfBook[] {
  try {
    const raw = localStorage.getItem(COMIC_SHELF_KEY);
    return raw ? JSON.parse(raw) as ShelfBook[] : [];
  } catch {
    return [];
  }
}

function isBookInShelf(sourceId: string, bookId: string): boolean {
  return readShelfBooks().some((book) => book.sourceId === sourceId && book.bookId === bookId);
}

function addBookToShelf(book: BookMetadata): void {
  const books = readShelfBooks();
  const nextBook: ShelfBook = {
    bookId: book.bookId,
    sourceId: book.sourceId,
    contentType: book.contentType,
    name: book.name,
    author: book.author,
    coverImageUrl: book.coverImageUrl,
    description: book.description,
    detailPageUrl: book.detailPageUrl,
    addedAt: Date.now(),
  };
  const nextBooks = [
    nextBook,
    ...books.filter((item) => item.sourceId !== book.sourceId || item.bookId !== book.bookId),
  ];
  localStorage.setItem(COMIC_SHELF_KEY, JSON.stringify(nextBooks));
}

function parseHtml(html: string, url: string): Document {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);
  return doc;
}

async function getComic(sourceId: string, bookId: string): Promise<BookMetadata> {
  const cacheUrl = `/api/cache/comic/${sourceId}/${bookId}/metadata`;
  const cached = await readCache<BookMetadata>(cacheUrl);
  if (cached) return cached;
  return fetchComicFromSource(sourceId, bookId);
}

async function fetchComicFromSource(sourceId: string, bookId: string): Promise<BookMetadata> {
  const cacheUrl = `/api/cache/comic/${sourceId}/${bookId}/metadata`;
  const detailUrl = getDetailUrl(bookId);
  const html = await fetchHtml(detailUrl);
  const parsed = sourceManwapi.extractors.getBookMetadata(parseHtml(html, detailUrl));
  if (!parsed) throw new Error("漫画详情页解析失败");

  const comic: Omit<BookMetadata, "cachedAt"> = {
    ...parsed,
    bookId,
    sourceId,
    contentType: "comic",
    detailPageUrl: parsed.detailPageUrl || detailUrl,
  };
  await writeCache(cacheUrl, comic);
  return { ...comic, cachedAt: Date.now() };
}

async function fetchChaptersFromSource(sourceId: string, bookId: string, detailUrl: string): Promise<ChapterMetadata[]> {
  const cacheUrl = `/api/cache/comic/${sourceId}/${bookId}/chapter-list`;
  const html = await fetchHtml(detailUrl || getDetailUrl(bookId));
  const chapters: ChapterItem[] = sourceManwapi.extractors.getChapterList(parseHtml(html, detailUrl || getDetailUrl(bookId)));
  if (!chapters.length) throw new Error("漫画目录解析失败");

  await writeCache(cacheUrl, chapters);
  const now = Date.now();
  return chapters.map((chapter) => ({ ...chapter, cachedAt: now }));
}

async function getChapters(sourceId: string, bookId: string, detailUrl: string): Promise<ChapterMetadata[]> {
  const cacheUrl = `/api/cache/comic/${sourceId}/${bookId}/chapter-list`;
  const cached = await readCache<{ chapters: ChapterMetadata[] }>(cacheUrl);
  if (cached?.chapters.length) return cached.chapters;
  return fetchChaptersFromSource(sourceId, bookId, detailUrl);
}

function ComicDetailLayout() {
  const matches = useMatches();
  const showDefault = matches.length === 3;

  return (
    <>
      {showDefault && <ComicDetailContent />}
      <Outlet />
    </>
  );
}

function ComicDetailContent() {
  const { sourceId, bookId } = comicDetailRoute.useParams();
  const queryClient = useQueryClient();
  const [inShelf, setInShelf] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  const comicQuery = useQuery({
    queryKey: ["comic", sourceId, bookId, "metadata"],
    queryFn: () => getComic(sourceId, bookId),
    staleTime: 60_000,
  });

  const chapterQuery = useQuery({
    queryKey: ["comic", sourceId, bookId, "chapters"],
    queryFn: () => getChapters(sourceId, bookId, comicQuery.data!.detailPageUrl),
    enabled: !!comicQuery.data,
    staleTime: 60_000,
  });

  const refreshDetailMutation = useMutation({
    mutationFn: () => fetchComicFromSource(sourceId, bookId),
    onSuccess: (comic) => {
      queryClient.setQueryData(["comic", sourceId, bookId, "metadata"], comic);
    },
  });

  const refreshChaptersMutation = useMutation({
    mutationFn: () => fetchChaptersFromSource(
      sourceId,
      bookId,
      comicQuery.data?.detailPageUrl ?? getDetailUrl(bookId),
    ),
    onSuccess: (chapters) => {
      queryClient.setQueryData(["comic", sourceId, bookId, "chapters"], chapters);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (chapters: ChapterMetadata[]) => {
      const res = await fetch("/api/download/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId,
          bookId,
          contentType: "comic",
          chapters: chapters.map(({ cachedAt, content, chapterIndex, ...chapter }) => chapter),
        }),
      });
      const result = (await res.json()) as ApiResult<unknown>;
      if (!result.success) throw new Error(result.error || "创建缓存任务失败");
      await queryClient.invalidateQueries({ queryKey: ["download", "tasks"] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/download/cbz/comic/${sourceId}/${bookId}`);
      const result = (await res.json()) as ApiResult<ExportResult>;
      if (!result.success || !result.data) throw new Error(result.error || "CBZ 导出失败");
      return result.data;
    },
    onSuccess: (result) => {
      setExportResult(result);
    },
  });

  const comic = comicQuery.data;
  const chapters = chapterQuery.data ?? [];
  const firstChapter = chapters[0];
  const error = comicQuery.error
    || chapterQuery.error
    || refreshDetailMutation.error
    || refreshChaptersMutation.error
    || downloadMutation.error
    || exportMutation.error;

  useEffect(() => {
    if (comic) setInShelf(isBookInShelf(sourceId, bookId));
  }, [bookId, comic, sourceId]);

  const handleAddShelf = () => {
    if (!comic) return;
    addBookToShelf(comic);
    setInShelf(true);
  };

  return (
    <div className="page detail-page">
      <div className="detail-header">
        <Link to="/comic" className="back-btn">
          返回
        </Link>
      </div>

      {comicQuery.isPending && <div className="empty-state">详情加载中...</div>}
      {error instanceof Error && <div className="error-message">{error.message}</div>}

      {comic && (
        <>
          <div className="book-info">
            <div className="book-cover">
              <img src={comic.coverImageUrl || "https://placehold.co/200x280?text=No+Cover"} alt={comic.name} />
            </div>
            <div className="book-meta">
              <h1 className="book-title">{comic.name}</h1>
              <p className="book-author">作者：{comic.author}</p>
              <p className="book-source">
                来源：{sourceId} / ID：{bookId}
              </p>
              <p className="book-desc">{comic.description}</p>
              <div className="book-actions">
                <button
                  className="btn-secondary"
                  disabled={inShelf}
                  onClick={handleAddShelf}
                >
                  {inShelf ? "已在书架" : "添加书架"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={refreshDetailMutation.isPending}
                  onClick={() => refreshDetailMutation.mutate()}
                >
                  {refreshDetailMutation.isPending ? "刷新中..." : "刷新详情"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={refreshChaptersMutation.isPending}
                  onClick={() => refreshChaptersMutation.mutate()}
                >
                  {refreshChaptersMutation.isPending ? "刷新中..." : "刷新目录"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={!chapters.length || downloadMutation.isPending}
                  onClick={() => downloadMutation.mutate(chapters)}
                >
                  {downloadMutation.isPending ? "任务创建中..." : "缓存全部章节"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={!chapters.length || exportMutation.isPending}
                  onClick={() => exportMutation.mutate()}
                >
                  {exportMutation.isPending ? "导出中..." : "导出 CBZ"}
                </button>
                {firstChapter && (
                  <Link
                    to={"/comic/$sourceId/$bookId/$chapterId" as any}
                    params={{ sourceId, bookId, chapterId: firstChapter.chapterId } as any}
                    className="btn-primary"
                  >
                    开始阅读
                  </Link>
                )}
              </div>
            </div>
          </div>

          {exportResult && (
            <div className="success-message">
              已导出到：{exportResult.outputDir}（{exportResult.files.length} 个文件）
            </div>
          )}

          <div className="chapter-section">
            <h2 className="section-title">
              章节列表
              <span className="chapter-count">
                {chapterQuery.isPending ? "（加载中）" : `（共${chapters.length}话）`}
              </span>
            </h2>
            <div className="chapter-grid">
              {chapters.map((chapter) => (
                <Link
                  key={chapter.chapterId}
                  to={"/comic/$sourceId/$bookId/$chapterId" as any}
                  params={{ sourceId, bookId, chapterId: chapter.chapterId } as any}
                  className="chapter-grid-item"
                >
                  <span className="chapter-grid-num">第{chapter.chapterIndex + 1}话</span>
                  <span className="chapter-grid-name">{chapter.chapterName}</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
