import { Link, Outlet } from "@tanstack/react-router";

export function RootLayout() {
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
      </div>
      <Outlet />
    </div>
  );
}
