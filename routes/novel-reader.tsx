import { createRoute, Link } from "@tanstack/react-router";
import { novelDetailRoute } from "./novel-detail";

export const novelReaderRoute = createRoute({
  getParentRoute: () => novelDetailRoute,
  path: "$chapterId",
  component: NovelReaderPage,
});

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
}));

const MOCK_CONTENT = `  萧炎站在悬崖边缘，俯瞰着脚下翻涌的云海。晨风拂过他的衣袂，猎猎作响。他的目光穿透层层云雾，落在远处那座巍峨的山峰之上。

  "药老，你真的确定异火就在那座山里？"萧炎低声问道，语气中带着一丝期待与紧张。

  戒指中传来药老苍老而沉稳的声音："小子，老夫什么时候骗过你？那里的确有异火的痕迹，不过，能不能得到就看你的造化了。"

  萧炎深吸一口气，将体内斗气运转至巅峰状态。他知道，这一次的机会来之不易。异火，那是天地间最为狂暴也最为珍贵的火焰，每一位炼药师都梦寐以求的至宝。

  他纵身跃下悬崖，斗气在脚下凝聚成一双淡蓝色的翅膀——紫云翼。这是他历经千辛万苦才得到的飞行斗技，此刻正好派上用场。

  紫云翼振动，带着萧炎向那座山峰飞去。云海在他身下翻滚，偶尔有几只巨大的飞鸟从旁边掠过，用好奇的目光打量着这个不速之客。

  飞行了大约半个时辰，萧炎终于来到了那座山峰的近前。从远处看，这座山峰并不算特别高大，但走近了才发现，它通体赤红，仿佛被烈火焚烧过一般，空气中弥漫着一股灼热的气息。

  "这是……火属性斗气凝聚成实质？"萧炎震惊地看着眼前的景象。他修炼斗气这么多年，还是第一次见到如此浓郁的火属性斗气。

  药老的声音再次响起："这里的火属性斗气确实异常浓郁，看来异火在此地沉睡了很长时间。小子，小心行事，异火周围往往有强大的守护兽。"

  萧炎点点头，小心翼翼地降落在山脚下。他环顾四周，发现山壁上有一个天然形成的洞穴，洞口隐约透出暗红色的光芒。

  "就是那里了。"萧炎深吸一口气，迈步向洞穴走去。每走一步，周围的温度就升高一分，到了洞口时，空气已经热得让人难以呼吸。

  他运起斗气护体，走进洞穴。洞内曲折幽深，两侧的岩壁上布满了暗红色的晶体，散发着幽幽的光芒。这些晶体都是上等的火属性矿石，价值连城，但萧炎此刻无暇顾及，他的全部注意力都放在了前方。

  走了约莫一刻钟，洞穴豁然开朗，一个巨大的地下空间出现在眼前。空间的正中央，一团拳头大小的青色火焰静静地悬浮在半空中，火焰周围环绕着无数细小的火蛇，看起来既美丽又危险。

  "青莲地心火！"药老激动地叫道，"果然是异火榜上排名第十九的青莲地心火！小子，快，用焚诀吞噬它！"

  萧炎眼中闪过一抹坚定之色。他知道，吞噬异火是一件极其危险的事情，稍有不慎就会被异火反噬，轻则重伤，重则灰飞烟灭。但他已经没有退路了。

  三年之约即将到来，他必须变得更强。为了这一天，他付出了太多的努力和汗水。

  "来吧！"萧炎大喝一声，双手结印，体内的焚诀功法开始运转。一股强大的吸力从他体内涌出，向那团青色火焰笼罩而去。

  青莲地心火似乎感受到了威胁，火焰猛地暴涨，整个地下空间都被青色的火光所充斥。滚烫的热浪向四面八方扩散，岩壁上的晶体纷纷碎裂，发出噼里啪啦的声响。

  萧炎咬紧牙关，强忍着体内传来的剧痛，继续催动焚诀。他知道，这是一场意志的较量，谁先坚持不住，谁就会输掉一切。`;

function NovelReaderPage() {
  const { sourceId, bookId, chapterId } = novelReaderRoute.useParams();

  const currentIndex = MOCK_CHAPTERS.findIndex((c) => c.chapterId === chapterId);
  const chapter = MOCK_CHAPTERS[currentIndex] ?? MOCK_CHAPTERS[0]!;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < MOCK_CHAPTERS.length - 1;

  return (
    <div className="page reader-page">
      <div className="reader-header">
        <Link
          to={'/novel/$sourceId/$bookId' as any}
          params={{ sourceId, bookId } as any}
          className="back-btn"
        >
          ← 返回目录
        </Link>
        <span className="chapter-title-header">{chapter.chapterName}</span>
      </div>

      <article className="reader-content">
        <h2 className="reader-chapter-title">{chapter.chapterName}</h2>
        <div className="reader-text">
          {MOCK_CONTENT.split("\n\n").map((paragraph, idx) => (
            <p key={idx}>{paragraph.trim()}</p>
          ))}
        </div>
      </article>

      <div className="reader-nav">
        {hasPrev ? (
          <Link
            to={'/novel/$sourceId/$bookId/$chapterId' as any}
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
          to={'/novel/$sourceId/$bookId' as any}
          params={{ sourceId, bookId } as any}
          className="btn-nav btn-catalog"
        >
          目录
        </Link>
        {hasNext ? (
          <Link
            to={'/novel/$sourceId/$bookId/$chapterId' as any}
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
