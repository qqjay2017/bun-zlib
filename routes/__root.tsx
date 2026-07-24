import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { NotFound } from "../components/not-found";

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <div className="container">
      <div className="tab-bar">
        <Link
          to="/novel"
          className="tab-btn"
          activeProps={{ className: "tab-btn active" }}
        >
          小说
        </Link>
        <Link
          to="/comic"
          className="tab-btn"
          activeProps={{ className: "tab-btn active" }}
        >
          漫画
        </Link>
        <Link
          to="/download"
          className="tab-btn"
          activeProps={{ className: "tab-btn active" }}
        >
          下载
        </Link>
        <Link
          to="/bookshelf"
          className="tab-btn"
          activeProps={{ className: "tab-btn active" }}
        >
          书架
        </Link>
      </div>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </div>
  );
}
