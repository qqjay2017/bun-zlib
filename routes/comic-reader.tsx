import { createRoute, Link } from "@tanstack/react-router";
import { comicDetailRoute } from "./comic-detail";

export const comicReaderRoute = createRoute({
  getParentRoute: () => comicDetailRoute,
  path: "$chapterId",
  component: ComicReaderPage,
});

const MOCK_CHAPTERS = Array.from({ length: 24 }, (_, i) => ({
  chapterId: `ep-${i + 1}`,
  chapterName: `第${i + 1}话 ${
    [
      "冒险的黎明",
      "草帽小子登场",
      "索隆的约定",
      "航海士娜美",
      "厨师山治",
      "乌索普的谎言",
      "乔巴的奇迹",
      "罗宾的眼泪",
      "弗兰奇的梦想",
      "布鲁克的音乐",
      "阿拉巴斯坦篇",
      "空岛篇",
      "水之都篇",
      "司法岛篇",
      "恐怖三角帆篇",
      "香波地群岛篇",
      "推进城篇",
      "顶上战争篇",
      "两年后重聚",
      "鱼人岛篇",
      "德雷斯罗萨篇",
      "蛋糕岛篇",
      "和之国篇",
      "最终章",
    ][i] ?? `未知话`
  }`,
  chapterIndex: i,
}));

// 模拟每话有8张图片
const MOCK_PAGES = Array.from(
  { length: 8 },
  (_, i) => `https://placehold.co/800x1200/f5f5f5/333?text=Page+${i + 1}`
);

function ComicReaderPage() {
  const { sourceId, bookId, chapterId } = comicReaderRoute.useParams();

  const currentIndex = MOCK_CHAPTERS.findIndex((c) => c.chapterId === chapterId);
  const chapter = MOCK_CHAPTERS[currentIndex] ?? MOCK_CHAPTERS[0]!;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < MOCK_CHAPTERS.length - 1;

  return (
    <div className="page reader-page comic-reader-page-inner">
      <div className="reader-header">
        <Link
          to={'/comic/$sourceId/$bookId' as any}
          params={{ sourceId, bookId } as any}
          className="back-btn"
        >
          ← 返回目录
        </Link>
        <span className="chapter-title-header">{chapter.chapterName}</span>
      </div>

      <div className="comic-strip">
        {MOCK_PAGES.map((url, idx) => (
          <img
            key={idx}
            src={url}
            alt={`第${idx + 1}页`}
            className="comic-strip-img"
          />
        ))}
      </div>

      <div className="reader-nav">
        {hasPrev ? (
          <Link
            to={'/comic/$sourceId/$bookId/$chapterId' as any}
            params={{
              sourceId,
              bookId,
              chapterId: MOCK_CHAPTERS[currentIndex - 1]!.chapterId,
            } as any}
            className="btn-nav"
          >
            上一章
          </Link>
        ) : (
          <span className="btn-nav disabled">上一章</span>
        )}
        <Link
          to={'/comic/$sourceId/$bookId' as any}
          params={{ sourceId, bookId } as any}
          className="btn-nav btn-catalog"
        >
          目录
        </Link>
        {hasNext ? (
          <Link
            to={'/comic/$sourceId/$bookId/$chapterId' as any}
            params={{
              sourceId,
              bookId,
              chapterId: MOCK_CHAPTERS[currentIndex + 1]!.chapterId,
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
