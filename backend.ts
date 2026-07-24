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

export async function fetchBookPageHtml(url: string): Promise<string> {
  const view = new Bun.WebView({
    dataStore: { directory: "./browser-profile" },
    backend: await getChromeBackend(),
  });

  try {
    await view.navigate(url);
    const html = await view.evaluate("document.documentElement.outerHTML");
    return html as string;
  } finally {
    view.close();
  }
}

/**
 * 通过 WebView 获取页面完整 HTML（供下载管理器使用）
 * 与 fetchBookPageHtml 相同，但命名更明确地表达下载场景
 */
export async function fetchPageHtml(url: string): Promise<string> {
  return fetchBookPageHtml(url);
}
