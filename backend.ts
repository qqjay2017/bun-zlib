async function getChromeBackend() {
  const activePortFile = Bun.file(
    `${process.env.HOME}/Library/Application Support/Google/Chrome/DevToolsActivePort`,
  );

  if (await activePortFile.exists()) {
    const [port, browserPath] = (await activePortFile.text()).trim().split("\n");

    if (port && browserPath) {
      const url = `ws://127.0.0.1:${port}${browserPath}`;
      console.error("Using local Chrome:", url);

      return {
        type: "chrome" as const,
        url,
      };
    }
  }

  console.error("Local Chrome remote debugging is not available; spawning Chrome.");

  return {
    type: "chrome" as const,
    url: false as const,
  };
}

let sharedBookView: Promise<Bun.WebView> | null = null;
let bookViewQueue: Promise<void> = Promise.resolve();
let lastBookViewNavigationAt = 0;

const MIN_BOOK_VIEW_NAVIGATION_INTERVAL_MS = 300;
const MAX_BOOK_VIEW_NAVIGATION_INTERVAL_MS = 2_000;
const FETCH_HTML_TTL_MS = 30_000;
const htmlFetchCache = new Map<string, {
  fetchedAt: number;
  html?: string;
  promise?: Promise<string>;
}>();

async function createBookView(): Promise<Bun.WebView> {
  return new Bun.WebView({
    dataStore: { directory: "./browser-profile" },
    backend: await getChromeBackend(),
  });
}

function getSharedBookView(): Promise<Bun.WebView> {
  sharedBookView ??= createBookView();
  return sharedBookView;
}

function getRandomNavigationInterval(): number {
  return Math.floor(
    MIN_BOOK_VIEW_NAVIGATION_INTERVAL_MS
    + Math.random() * (MAX_BOOK_VIEW_NAVIGATION_INTERVAL_MS - MIN_BOOK_VIEW_NAVIGATION_INTERVAL_MS + 1),
  );
}

export async function fetchBookPageHtml(url: string): Promise<string> {
  const cached = htmlFetchCache.get(url);
  if (cached?.promise) return cached.promise;
  if (cached?.html && Date.now() - cached.fetchedAt < FETCH_HTML_TTL_MS) {
    return cached.html;
  }

  const task = bookViewQueue.then(async () => {
    try {
      const view = await getSharedBookView();
      const waitMs = Math.max(
        0,
        getRandomNavigationInterval() - (Date.now() - lastBookViewNavigationAt),
      );
      if (waitMs > 0) await Bun.sleep(waitMs);
      lastBookViewNavigationAt = Date.now();

      await view.navigate(url);
      let html = await view.evaluate<string>("document.documentElement.outerHTML");

      const deadline = Date.now() + 30_000;
      while (isChallengePage(html) && Date.now() < deadline) {
        await Bun.sleep(1_000);
        html = await view.evaluate<string>("document.documentElement.outerHTML");
      }

      return html;
    } catch (error) {
      sharedBookView = null;
      throw error;
    }
  });

  htmlFetchCache.set(url, { fetchedAt: Date.now(), promise: task });

  bookViewQueue = task.then(
    () => {},
    () => {},
  );

  try {
    const html = await task;
    htmlFetchCache.set(url, { fetchedAt: Date.now(), html });
    return html;
  } catch (error) {
    htmlFetchCache.delete(url);
    throw error;
  }
}

function isChallengePage(html: string): boolean {
  return /Just a moment|请稍候|正在进行安全验证|cf-turnstile|challenges\.cloudflare\.com/i.test(html);
}

/**
 * 通过 WebView 获取页面完整 HTML（供下载管理器使用）
 * 与 fetchBookPageHtml 相同，但命名更明确地表达下载场景
 */
export async function fetchPageHtml(url: string): Promise<string> {
  return fetchBookPageHtml(url);
}
