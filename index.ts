import index from "./index.html";
import { createRouter } from "./lib/controller";

// 注册所有控制器（副作用：向路由注册表添加路由）
import "./controllers/book.controller";
import "./controllers/download.controller";
import "./controllers/cache.controller";
import "./controllers/source.controller";

// 触发源注册
import "./lib/sources";

const router = createRouter();
const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  routes: {
    "/": index,
    "/novel": index,
    "/novel/*": index,
    "/comic": index,
    "/comic/*": index,
    "/download": index,
    "/bookshelf": index,
  },
  fetch: router,
  development: { hmr: true, console: true },
});

console.log(`Server running at http://localhost:${port}`);
