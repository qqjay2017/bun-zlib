import { createRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { novelRoute } from "./novel";

export const novelDetailRoute = createRoute({
  getParentRoute: () => novelRoute,
  path: "$sourceId/$bookId",
  component: NovelDetailLayout,
});

const MOCK_BOOK = {
  bookId: "58851",
  sourceId: "69shuba",
  contentType: "novel" as const,
  name: "斗破苍穹",
  author: "天蚕土豆",
  coverImageUrl: "https://placehold.co/200x280/1890ff/fff?text=斗破苍穹",
  description:
    "这里是斗气的世界，没有花俏艳丽的魔法，有的，仅仅是繁衍到巅峰的斗气！萧炎，主人公，萧家历史上空前绝后的斗气修炼天才。4岁就开始修炼斗之气，10岁拥有了九段斗之气，11岁突破了十段斗之气，一跃成为百年来斗之气修炼速度最快的人。然而就在12岁那年，他变成了废人，整整三年时间，家族冷遇，旁人轻视，被未婚妻退婚……种种打击接踵而来。就在他即将绝望的时候，一缕幽魂从他手上的戒指里浮现，一扇全新的大门在面前开启！",
};

const MOCK_CHAPTERS = Array.from({ length: 30 }, (_, i) => ({
  chapterId: `chapter-${i + 1}`,
  chapterName: `第${i + 1}章 ${
    [
      "陨落的天才",
      "斗之气三段",
      "成人仪式",
      "纳兰嫣然",
      "聚气散",
      "炼药师",
      "休夫",
      "神秘老者",
      "药老",
      "焚诀",
      "吞噬进化",
      "紫云翼",
      "沙漠之行",
      "青莲地心火",
      "异火榜",
      "加玛帝国",
      "炼药大会",
      "三年之约",
      "云岚宗",
      "佛怒火莲",
      "中州",
      "丹塔",
      "远古八族",
      "魂殿",
      "天府联盟",
      "净莲妖火",
      "双帝之战",
      "大结局",
      "番外一",
      "番外二",
    ][i] ?? `未知章节`
  }`,
  chapterIndex: i,
  chapterDetailUrl: `#chapter-${i + 1}`,
  cachedAt: Date.now(),
}));

function NovelDetailLayout() {
  const matches = useMatches();
  // 当没有子路由匹配时显示默认详情页内容
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
  const book = MOCK_BOOK;
  const chapters = MOCK_CHAPTERS;

  return (
    <div className="page detail-page">
      <div className="detail-header">
        <Link to="/novel" className="back-btn">
          ← 返回
        </Link>
      </div>

      <div className="book-info">
        <div className="book-cover">
          <img src={book.coverImageUrl} alt={book.name} />
        </div>
        <div className="book-meta">
          <h1 className="book-title">{book.name}</h1>
          <p className="book-author">作者：{book.author}</p>
          <p className="book-source">
            来源：{sourceId} / ID：{bookId}
          </p>
          <p className="book-desc">{book.description}</p>
          <div className="book-actions">
            <button className="btn-primary">缓存全部</button>
            <Link
              to={'/novel/$sourceId/$bookId/$chapterId' as any}
              params={{ sourceId, bookId, chapterId: 'chapter-1' } as any}
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
          <span className="chapter-count">（共{chapters.length}章）</span>
        </h2>
        <div className="chapter-list">
          {chapters.map((ch) => (
            <Link
              key={ch.chapterId}
              to={'/novel/$sourceId/$bookId/$chapterId' as any}
              params={{ sourceId, bookId, chapterId: ch.chapterId } as any}
              className="chapter-item"
            >
              {ch.chapterName}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
