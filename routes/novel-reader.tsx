import { createRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { novelDetailRoute } from "./novel-detail";
import { source69shuba } from "../lib/sources/69shuba";
import type { ChapterMetadata } from "../lib/cache-types";

export const novelReaderRoute = createRoute({
  getParentRoute: () => novelDetailRoute,
  path: "$chapterId",
  component: NovelReaderPage,
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

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch("/api/fetch-book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const result = (await res.json()) as ApiResult<string>;
  if (!result.success || !result.data) throw new Error(result.error || "章节页获取失败");
  if (/Just a moment|请稍候|正在进行安全验证|cf-turnstile|challenges\.cloudflare\.com/i.test(result.data)) {
    throw new Error("当前仍是人机验证页，请先在 WebView/浏览器中通过 69 书吧验证");
  }
  return result.data;
}

async function getChapterList(sourceId: string, bookId: string): Promise<ChapterMetadata[]> {
  const cached = await readCache<{ chapters: ChapterMetadata[] }>(
    `/api/cache/novel/${sourceId}/${bookId}/chapter-list`,
  );
  if (!cached?.chapters.length) throw new Error("目录缓存不存在，请先打开详情页");
  return cached.chapters;
}

async function getChapter(
  sourceId: string,
  bookId: string,
  chapter: ChapterMetadata,
): Promise<ChapterMetadata> {
  const cacheUrl = `/api/cache/novel/${sourceId}/${bookId}/chapter/${chapter.chapterId}`;
  const cached = await readCache<ChapterMetadata>(cacheUrl);
  if (cached?.content) return cached;

  const html = await fetchHtml(chapter.chapterDetailUrl);
  const extracted = source69shuba.extractors.extractContent(html);
  if (!extracted?.content) throw new Error("章节正文解析失败");

  const nextChapter = {
    ...chapter,
    chapterName: extracted.chapterName || chapter.chapterName,
    content: extracted.content,
  };
  await writeCache(cacheUrl, nextChapter);
  return { ...nextChapter, cachedAt: Date.now() };
}

function NovelReaderPage() {
  const { sourceId, bookId, chapterId } = novelReaderRoute.useParams();
  const queryClient = useQueryClient();

  const chapterListQuery = useQuery({
    queryKey: ["novel", sourceId, bookId, "chapters"],
    queryFn: () => getChapterList(sourceId, bookId),
    staleTime: 60_000,
  });

  const chapters = chapterListQuery.data ?? [];
  const currentIndex = chapters.findIndex((c) => c.chapterId === chapterId);
  const chapterMeta = currentIndex >= 0 ? chapters[currentIndex] : undefined;

  const chapterQuery = useQuery({
    queryKey: ["novel", sourceId, bookId, "chapter", chapterId],
    queryFn: () => getChapter(sourceId, bookId, chapterMeta!),
    enabled: !!chapterMeta,
    staleTime: 60_000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!chapterMeta) return;
      await queryClient.invalidateQueries({
        queryKey: ["novel", sourceId, bookId, "chapter", chapterMeta.chapterId],
      });
    },
  });

  const chapter = chapterQuery.data;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < chapters.length - 1;
  const error = chapterListQuery.error || chapterQuery.error || refreshMutation.error;

  return (
    <div className="page reader-page">
      <div className="reader-header">
        <Link
          to={"/novel/$sourceId/$bookId" as any}
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
          重新缓存
        </button>
      </div>

      {error instanceof Error && <div className="error-message">{error.message}</div>}
      {(chapterListQuery.isPending || chapterQuery.isPending) && (
        <div className="empty-state">章节加载中...</div>
      )}

      {chapter && (
        <article className="reader-content">
          <h2 className="reader-chapter-title">{chapter.chapterName}</h2>
          <div className="reader-text">
            {(chapter.content || "").split(/\n{2,}/).map((paragraph, idx) => (
              <p key={idx}>{paragraph.trim()}</p>
            ))}
          </div>
        </article>
      )}

      <div className="reader-nav">
        {hasPrev ? (
          <Link
            to={"/novel/$sourceId/$bookId/$chapterId" as any}
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
          to={"/novel/$sourceId/$bookId" as any}
          params={{ sourceId, bookId } as any}
          className="btn-nav btn-catalog"
        >
          目录
        </Link>
        {hasNext ? (
          <Link
            to={"/novel/$sourceId/$bookId/$chapterId" as any}
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
