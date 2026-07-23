import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { rootRoute } from "./__root";

export const novelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/novel",
  component: NovelPage,
});

const BOOK_SOURCES = [
  { id: "69shuba", name: "69书吧", domain: "https://www.69shuba.com" },
];

interface FetchBookResult {
  success: boolean;
  data?: string;
  error?: string;
}

function NovelPage() {
  const [selectedSource, setSelectedSource] = useState(BOOK_SOURCES[0]!.id);
  const [url, setUrl] = useState("");

  const currentSource = BOOK_SOURCES.find((s) => s.id === selectedSource)!;

  const mutation = useMutation({
    mutationFn: async (bookUrl: string): Promise<FetchBookResult> => {
      const res = await fetch("/api/fetch-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: bookUrl }),
      });
      return res.json() as Promise<FetchBookResult>;
    },
  });

  const handleFetch = () => {
    if (!url.trim()) return;
    mutation.mutate(url.trim());
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
          disabled={mutation.isPending}
        />
        <button onClick={handleFetch} disabled={mutation.isPending || !url.trim()}>
          {mutation.isPending ? "加载中..." : "跳转"}
        </button>
      </div>

      {mutation.isError && (
        <div className="error-message">
          {mutation.error instanceof Error ? mutation.error.message : "网络错误"}
        </div>
      )}

      {mutation.isSuccess && !mutation.data.success && (
        <div className="error-message">
          {mutation.data.error || "请求失败"}
        </div>
      )}

      {mutation.isSuccess && mutation.data.success && mutation.data.data && (
        <div className="result-area">
          <pre><code>{mutation.data.data}</code></pre>
        </div>
      )}
    </div>
  );
}
