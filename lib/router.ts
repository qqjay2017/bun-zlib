import { createRouter, createRoute, createRootRoute, redirect } from "@tanstack/react-router";
import { RootLayout } from "../routes/__root";
import { NovelPage } from "../routes/novel";
import { ComicPage } from "../routes/comic";
import { NotFound } from "../components/not-found";
import { queryClient } from "./query";

// 根路由
const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

// 首页重定向到 /novel
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/novel" });
  },
});

// 小说路由
const novelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/novel",
  component: NovelPage,
});

// 漫画路由
const comicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/comic",
  component: ComicPage,
});

// 路由树
const routeTree = rootRoute.addChildren([indexRoute, novelRoute, comicRoute]);

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
