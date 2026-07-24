import { useState } from "react";
import { createRoute, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { source69shuba } from "../lib/sources/69shuba";

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
    </div>
  );
}
