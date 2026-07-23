import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <div className="page" style={{ textAlign: "center", padding: "60px 0" }}>
      <h2 style={{ fontSize: "24px", color: "#333", marginBottom: "12px" }}>
        404 - 页面未找到
      </h2>
      <p style={{ color: "#999", marginBottom: "24px" }}>
        您访问的页面不存在
      </p>
      <Link to="/novel" style={{ color: "#1890ff" }}>
        返回首页
      </Link>
    </div>
  );
}
