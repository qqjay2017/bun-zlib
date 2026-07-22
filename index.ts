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

async function run() {
  const view = new Bun.WebView({
    dataStore: { directory: "./browser-profile" },
    backend: await getChromeBackend(),
  });

  try {
    await view.navigate("https://www.69shuba.com/book/58851.htm");
    const html = await view.evaluate("document.documentElement.outerHTML");

    console.log(html);
  } finally {
    view.close();
  }
}

await run();
