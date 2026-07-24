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

export async function fetchBookPageHtml(url: string): Promise<string> {
  const task = bookViewQueue.then(async () => {
    const view = await getSharedBookView();
    await view.navigate(url);
    let html = await view.evaluate<string>("document.documentElement.outerHTML");

    const deadline = Date.now() + 30_000;
    while (isChallengePage(html) && Date.now() < deadline) {
      await Bun.sleep(1_000);
      html = await view.evaluate<string>("document.documentElement.outerHTML");
    }

    return html;
  });

  bookViewQueue = task.then(
    () => {},
    () => {},
  );

  return task;
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
