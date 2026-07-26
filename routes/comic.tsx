import { useState } from "react";
import { createRoute, Outlet, useMatches } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { sourceManwapi } from "../lib/sources/manwapi";
import { sourceManhuafree } from "../lib/sources/manhuafree";

export const comicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "comic",
  component: ComicPage,
});

function ComicPage() {
  const matches = useMatches();
  const showDefault = matches.length === 2;

  return (
    <>
      {showDefault && <ComicSearchPage />}
      <Outlet />
    </>
  );
}

const COMIC_SOURCES = [
  { id: "manwapi", name: "漫蛙漫画", domain: "https://manwapi.cc" },
  { id: "manhuafree", name: "G社漫画/包子漫画", domain: "https://manhuafree.com" },
];

function ComicSearchPage() {
  const [selectedSource, setSelectedSource] = useState(COMIC_SOURCES[0]!.id);
  const [url, setUrl] = useState("https://manwapi.cc/comic/3340");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const currentSource = COMIC_SOURCES.find((source) => source.id === selectedSource)!;

  const handleFetch = () => {
    const comicUrl = url.trim();
    if (!comicUrl) return;

    const source = selectedSource === "manhuafree" ? sourceManhuafree : sourceManwapi;
    const bookId = source.getBookId(comicUrl);
    if (!bookId) {
      setError("无法从 URL 识别漫画 ID");
      return;
    }

    setError("");
    navigate({
      to: "/comic/$sourceId/$bookId" as any,
      params: { sourceId: selectedSource, bookId } as any,
    });
  };

  return (
    <div className="page comic-page">
      <div className="source-selector">
        <label htmlFor="comic-source-select">漫画源选择：</label>
        <select
          id="comic-source-select"
          value={selectedSource}
          onChange={(event) => setSelectedSource(event.target.value)}
        >
          {COMIC_SOURCES.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </div>

      <div className="source-info">
        当前漫画源域名: {currentSource.domain}
      </div>

      <div className="input-group">
        <input
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="请输入漫画详情页地址，如 https://manhuafree.com/manga/diqiujintou-qiduyu"
        />
        <button onClick={handleFetch} disabled={!url.trim()}>
          跳转
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
