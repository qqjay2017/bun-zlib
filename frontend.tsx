/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const BOOK_SOURCES = [
  { id: "69shuba", name: "69书吧", domain: "https://www.69shuba.com" },
];

function TabBar({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: "novel" | "comic") => void }) {
  return (
    <div className="tab-bar">
      <button
        className={`tab-btn ${activeTab === "novel" ? "active" : ""}`}
        onClick={() => onTabChange("novel")}
      >
        小说
      </button>
      <button
        className={`tab-btn ${activeTab === "comic" ? "active" : ""}`}
        onClick={() => onTabChange("comic")}
      >
        漫画
      </button>
    </div>
  );
}

function NovelPage() {
  const [selectedSource, setSelectedSource] = useState(BOOK_SOURCES[0]!.id);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentSource = BOOK_SOURCES.find((s) => s.id === selectedSource)!;

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/fetch-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as { success: boolean; data?: string; error?: string };
      if (data.success) {
        setResult(data.data ?? null);
      } else {
        setError(data.error || "请求失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false);
    }
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
          disabled={loading}
        />
        <button onClick={handleFetch} disabled={loading || !url.trim()}>
          {loading ? "加载中..." : "跳转"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {result && (
        <div className="result-area">
          <pre><code>{result}</code></pre>
        </div>
      )}
    </div>
  );
}

function ComicPage() {
  return (
    <div className="page comic-page">
      <p className="placeholder-text">漫画功能即将开放，敬请期待...</p>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<"novel" | "comic">("novel");

  return (
    <div className="container">
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "novel" ? <NovelPage /> : <ComicPage />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
