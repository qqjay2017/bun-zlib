import { createRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { novelRoute } from "./novel";
import { source69shuba } from "../lib/sources/69shuba";
import type { BookMetadata, ChapterMetadata } from "../lib/cache-types";

export const novelDetailRoute = createRoute({
  getParentRoute: () => novelRoute,
  path: "$sourceId/$bookId",
  component: NovelDetailLayout,
});

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ChapterItem = Omit<ChapterMetadata, "cachedAt">;

function getDetailUrl(bookId: string): string {
  return `${source69shuba.domain}/book/${bookId}.htm`;
}

function assertRealPage(html: string): void {
  if (/Just a moment|请稍候|正在进行安全验证|cf-turnstile|challenges\.cloudflare\.com/i.test(html)) {
    throw new Error("当前仍是人机验证页，请先在 WebView/浏览器中通过 69 书吧验证");
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch("/api/fetch-book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const result = (await res.json()) as ApiResult<string>;
  if (!result.success || !result.data) throw new Error(result.error || "页面获取失败");
  assertRealPage(result.data);
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

function parseHtml(html: string, url: string): Document {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);
  return doc;
}

async function getBook(sourceId: string, bookId: string): Promise<BookMetadata> {
  const cacheUrl = `/api/cache/novel/${sourceId}/${bookId}/metadata`;
  const cached = await readCache<BookMetadata>(cacheUrl);
  if (cached) return cached;

  const detailUrl = getDetailUrl(bookId);
  const html = await fetchHtml(detailUrl);
  const parsed = source69shuba.extractors.getBookMetadata(parseHtml(html, detailUrl));
  if (!parsed) throw new Error("详情页解析失败");

  const book: Omit<BookMetadata, "cachedAt"> = {
    ...parsed,
    bookId,
    sourceId,
    contentType: "novel",
    detailPageUrl: parsed.detailPageUrl || detailUrl,
  };
  await writeCache(cacheUrl, book);
  return { ...book, cachedAt: Date.now() };
}

async function getChapters(
  sourceId: string,
  bookId: string,
  detailUrl: string,
): Promise<ChapterMetadata[]> {
  const cacheUrl = `/api/cache/novel/${sourceId}/${bookId}/chapter-list`;
  const cached = await readCache<{ chapters: ChapterMetadata[] }>(cacheUrl);
  if (cached?.chapters.length) return cached.chapters;

  const tocUrl = source69shuba.getTocUrl?.(detailUrl, bookId) ?? detailUrl;
  const html = await fetchHtml(tocUrl);
  const chapters: ChapterItem[] = source69shuba.extractors.getChapterList(parseHtml(html, tocUrl));
  if (!chapters.length) throw new Error("目录页解析失败");

  await writeCache(cacheUrl, chapters);
  const now = Date.now();
  return chapters.map((chapter) => ({ ...chapter, cachedAt: now }));
}

function NovelDetailLayout() {
  const matches = useMatches();
  const showDefault = matches.length === 3;

  return (
    <>
      {showDefault && <NovelDetailContent />}
      <Outlet />
    </>
  );
}

function NovelDetailContent() {
  const { sourceId, bookId } = novelDetailRoute.useParams();
  const queryClient = useQueryClient();

  const bookQuery = useQuery({
    queryKey: ["novel", sourceId, bookId, "metadata"],
    queryFn: () => getBook(sourceId, bookId),
    staleTime: 60_000,
  });

  const chapterQuery = useQuery({
    queryKey: ["novel", sourceId, bookId, "chapters"],
    queryFn: () => getChapters(sourceId, bookId, bookQuery.data!.detailPageUrl),
    enabled: !!bookQuery.data,
    staleTime: 60_000,
  });

  const downloadMutation = useMutation({
    mutationFn: async (chapters: ChapterMetadata[]) => {
      const res = await fetch("/api/download/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId,
          bookId,
          contentType: "novel",
          chapters: chapters.map(({ cachedAt, content, chapterIndex, ...chapter }) => chapter),
        }),
      });
      const result = (await res.json()) as ApiResult<unknown>;
      if (!result.success) throw new Error(result.error || "创建下载任务失败");
      await queryClient.invalidateQueries({ queryKey: ["download", "tasks"] });
    },
  });

  const book = bookQuery.data;
  const chapters = chapterQuery.data ?? [];
  const firstChapter = chapters[0];
  const error = bookQuery.error || chapterQuery.error || downloadMutation.error;

  return (
    <div className="page detail-page">
      <div className="detail-header">
        <Link to="/novel" className="back-btn">
          返回
        </Link>
      </div>

      {bookQuery.isPending && <div className="empty-state">详情加载中...</div>}
      {error instanceof Error && <div className="error-message">{error.message}</div>}

      {book && (
        <>
          <div className="book-info">
            <div className="book-cover">
              <img src={book.coverImageUrl || "https://placehold.co/200x280?text=No+Cover"} alt={book.name} />
            </div>
            <div className="book-meta">
              <h1 className="book-title">{book.name}</h1>
              <p className="book-author">作者：{book.author}</p>
              <p className="book-source">
                来源：{sourceId} / ID：{bookId}
              </p>
              <p className="book-desc">{book.description}</p>
              <div className="book-actions">
                <button
                  className="btn-primary"
                  disabled={!chapters.length || downloadMutation.isPending}
                  onClick={() => downloadMutation.mutate(chapters)}
                >
                  {downloadMutation.isPending ? "任务创建中..." : "缓存全部章节"}
                </button>
                <a
                  className={`btn-secondary${chapters.length ? "" : " disabled"}`}
                  href={chapters.length ? `/api/download/epub/novel/${sourceId}/${bookId}` : undefined}
                >
                  下载 EPUB
                </a>
                {firstChapter && (
                  <Link
                    to={"/novel/$sourceId/$bookId/$chapterId" as any}
                    params={{ sourceId, bookId, chapterId: firstChapter.chapterId } as any}
                    className="btn-secondary"
                  >
                    开始阅读
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="chapter-section">
            <h2 className="section-title">
              章节列表
              <span className="chapter-count">
                {chapterQuery.isPending ? "（加载中）" : `（共${chapters.length}章）`}
              </span>
            </h2>
            <div className="chapter-list">
              {chapters.map((ch) => (
                <Link
                  key={ch.chapterId}
                  to={"/novel/$sourceId/$bookId/$chapterId" as any}
                  params={{ sourceId, bookId, chapterId: ch.chapterId } as any}
                  className="chapter-item"
                >
                  {ch.chapterName}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
