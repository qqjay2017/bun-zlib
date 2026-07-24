import { createRouter, createRoute, redirect } from "@tanstack/react-router";
import { rootRoute } from "../routes/__root";
import { novelRoute } from "../routes/novel";
import { comicRoute } from "../routes/comic";
import { downloadRoute } from "../routes/download";
import { NotFound } from "../components/not-found";
import { queryClient } from "./query";

// 首页重定向到 /novel
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/novel" });
  },
});

// 路由树
const routeTree = rootRoute.addChildren([indexRoute, novelRoute, comicRoute, downloadRoute]);

// 创建 router 实例
export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultNotFoundComponent: NotFound,
});

// 类型注册
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
