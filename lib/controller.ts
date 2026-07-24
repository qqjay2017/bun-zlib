// ============================================================
// 轻量级路由注册框架
// 灵感来自 NestJS @Controller 装饰器模式
// ============================================================

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type RouteHandler = (req: Request, params: Record<string, string>) => Promise<Response> | Response;

interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
}

// 全局路由注册表
const routeRegistry: RouteDefinition[] = [];

/**
 * 定义一个控制器（路由组），自动注册所有路由
 * @param basePath 路由前缀，如 "/api/download"
 * @param routes 路由映射，格式为 "METHOD /sub-path": handler
 */
export function defineController(
  basePath: string,
  routes: Record<string, RouteHandler>,
): void {
  for (const [key, handler] of Object.entries(routes)) {
    const [method, ...pathParts] = key.split(" ");
    const subPath = pathParts.join(" ");

    if (!method || !subPath) {
      throw new Error(`Invalid route key: "${key}". Expected format: "METHOD /path"`);
    }

    const normalizedMethod = method.toUpperCase() as HttpMethod;
    const fullPath = normalizePath(basePath + subPath);

    routeRegistry.push({
      method: normalizedMethod,
      path: fullPath,
      handler,
    });
  }
}

/**
 * 路径参数解析：匹配 URL 与模式，提取 :param 参数
 */
function matchPath(url: string, pattern: string): Record<string, string> | null {
  const urlParts = url.split("?")[0]!.split("/").filter(Boolean);
  const patParts = pattern.split("/").filter(Boolean);
  if (urlParts.length !== patParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    const pat = patParts[i]!;
    const val = urlParts[i]!;
    if (pat.startsWith(":")) {
      params[pat.slice(1)] = decodeURIComponent(val);
    } else if (pat !== val) {
      return null;
    }
  }
  return params;
}

/**
 * 标准化路径：确保以 / 开头且无重复斜杠
 */
function normalizePath(path: string): string {
  return "/" + path.split("/").filter(Boolean).join("/");
}

/**
 * 创建统一的路由处理器，兼容 Bun.serve 的 fetch 回调
 * 支持路径参数（:param）和全局错误捕获
 */
export function createRouter(): (req: Request) => Promise<Response> {
  // 冻结注册表，构建匹配链
  const routes = [...routeRegistry];

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    for (const route of routes) {
      if (route.method !== method) continue;

      const params = matchPath(path, route.path);
      if (params === null) continue;

      try {
        return await route.handler(req, params);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Router] ${method} ${path} 处理失败:`, error);
        return Response.json({ success: false, error: message }, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  };
}
