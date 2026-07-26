import { useState } from "react";
import { createRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rootRoute } from "./__root";
import { source69shuba } from "../lib/sources/69shuba";
import { readVisitHistory } from "../lib/history-api";

export const novelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "novel",
  component: NovelPage,
});

const BOOK_SOURCES = [
  { id: "69shuba", name: "69书吧", domain: "https://www.69shuba.com" },
];

function NovelPage() {
  const matches = useMatches();
  const showDefault = matches.length === 2;

  return (
    <>
      {showDefault && <NovelSearchPage />}
      <Outlet />
    </>
  );
}

function NovelSearchPage() {
  const [selectedSource, setSelectedSource] = useState(BOOK_SOURCES[0]!.id);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const currentSource = BOOK_SOURCES.find((s) => s.id === selectedSource)!;
  const historyQuery = useQuery({
    queryKey: ["history", "novel"],
    queryFn: () => readVisitHistory("novel"),
    staleTime: 10_000,
  });

  const handleFetch = () => {
    const bookUrl = url.trim();
    if (!bookUrl) return;

    const bookId = source69shuba.getBookId(bookUrl);
    if (!bookId) {
      setError("无法从 URL 识别书籍 ID");
      return;
    }

    setError("");
    navigate({
      to: "/novel/$sourceId/$bookId" as any,
      params: { sourceId: selectedSource, bookId } as any,
    });
  };

  return (
    <div className="page novel-page">
      <div className="source-selector">
        <label htmlFor="source-select">书源选择：</label>
        <select
          id="source-select"
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
        >
          {BOOK_SOURCES.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </div>

      <div className="source-info">
        当前书源域名: {currentSource.domain}
      </div>

      <div className="input-group">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="请输入书籍详情页地址，如 https://www.69shuba.com/book/58851.htm"
        />
        <button onClick={handleFetch} disabled={!url.trim()}>
          跳转
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="history-section">
        <div className="section-title">最近访问</div>
        {historyQuery.data?.length ? (
          <div className="history-list">
            {historyQuery.data.map((item) => (
              <Link
                key={`${item.path}-${item.visitedAt}`}
                to={"/novel/$sourceId/$bookId" as any}
                params={{ sourceId: item.sourceId, bookId: item.bookId } as any}
                className="history-item"
              >
                <div className="history-item-title">{item.bookName}</div>
                <div className="history-item-subtitle">
                  {item.chapterName ? `章节：${item.chapterName}` : `来源：${item.sourceId}`}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">暂无历史记录</div>
        )}
      </div>
    </div>
  );
}
