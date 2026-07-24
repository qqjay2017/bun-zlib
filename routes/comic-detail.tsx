import { createRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { comicRoute } from "./comic";

export const comicDetailRoute = createRoute({
  getParentRoute: () => comicRoute,
  path: "$sourceId/$bookId",
  component: ComicDetailLayout,
});

const MOCK_COMIC = {
  bookId: "one-piece",
  sourceId: "manhuagui",
  contentType: "comic" as const,
  name: "海贼王",
  author: "尾田荣一郎",
  coverImageUrl: "https://placehold.co/200x280/e74c3c/fff?text=海贼王",
  description:
    "拥有财富、名声、权力，拥有这世上一切的男人——海贼王哥尔·D·罗杰，在临死前留下了一句话，让全世界的人奔向大海：「想要我的财宝吗？想要的话可以全部给你，去找吧！我把所有财宝都放在那里。」从此，全世界的人们踏上了寻找海贼王宝藏的旅程，世界迎来了大海贼时代。而故事的主人公路飞，一个吃了橡胶果实的少年，也怀揣着成为海贼王的梦想，踏上了他的冒险旅程。",
};

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
  chapterDetailUrl: `#ep-${i + 1}`,
  cachedAt: Date.now(),
}));

function ComicDetailLayout() {
  const matches = useMatches();
  // 当没有子路由匹配时显示默认详情页内容
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
  const comic = MOCK_COMIC;
  const chapters = MOCK_CHAPTERS;

  return (
    <div className="page detail-page">
      <div className="detail-header">
        <Link to="/comic" className="back-btn">
          ← 返回
        </Link>
      </div>

      <div className="book-info">
        <div className="book-cover">
          <img src={comic.coverImageUrl} alt={comic.name} />
        </div>
        <div className="book-meta">
          <h1 className="book-title">{comic.name}</h1>
          <p className="book-author">作者：{comic.author}</p>
          <p className="book-source">
            来源：{sourceId} / ID：{bookId}
          </p>
          <p className="book-desc">{comic.description}</p>
          <div className="book-actions">
            <button className="btn-primary">缓存全部</button>
            <Link
              to={'/comic/$sourceId/$bookId/$chapterId' as any}
              params={{ sourceId, bookId, chapterId: 'ep-1' } as any}
              className="btn-secondary"
            >
              开始阅读
            </Link>
          </div>
        </div>
      </div>

      <div className="chapter-section">
        <h2 className="section-title">
          章节列表
          <span className="chapter-count">（共{chapters.length}话）</span>
        </h2>
        <div className="chapter-grid">
          {chapters.map((ch) => (
            <Link
              key={ch.chapterId}
              to={'/comic/$sourceId/$bookId/$chapterId' as any}
              params={{ sourceId, bookId, chapterId: ch.chapterId } as any}
              className="chapter-grid-item"
            >
              <span className="chapter-grid-num">第{ch.chapterIndex + 1}话</span>
              <span className="chapter-grid-name">{ch.chapterName.replace(/^第\d+话\s*/, '')}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
