---
kind: build_system
name: Bun 单进程全栈构建与开发体系
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - tsconfig.json
    - index.ts
    - index.html
    - frontend.tsx
    - CLAUDE.md
---

本项目采用 Bun 单一运行时作为唯一的构建、开发与部署工具，完全摒弃 Node.js、npm/pnpm/yarn、Vite/Webpack/esbuild 等传统工具链，形成极简的零配置构建体系。

核心架构：
- 入口统一：index.ts 通过 Bun.serve() 同时提供 HTTP 服务与静态 HTML 路由（routes: { "/": index }），并挂载 API 控制器（fetch: router）
- 前端直连：index.html 以 script type="module" src="./frontend.tsx" 直接引用 TSX 源码，由 Bun 在运行时自动完成 import 解析、TS/JSX 转译与 CSS 打包，无需预编译步骤
- HMR 热重载：通过 bun --hot 启动时启用 development.hmr，修改任意 .ts/.tsx/.css/.html 文件即时生效

构建脚本约定：
- package.json 仅定义两个脚本：start（bun run index.ts）与 dev（bun --hot index.ts），无 build 命令
- 生产环境可直接 bun index.ts 运行，Bun 原生支持 TypeScript、JSX、CSS 模块导入
- 文档 CLAUDE.md 明确禁止使用 webpack/esbuild/vite，强制使用 bun build <file> 进行独立资源打包

TypeScript 配置策略：
- tsconfig.json 设置 noEmit: true + moduleDetection: force + verbatimModuleSyntax: true，完全依赖 Bun 的内置转译管线
- types: ["bun"] 引入全局类型，jsx: "react-jsx" 启用 React 17+ JSX 转换
- moduleResolution: "bundler" 配合 allowImportingTsExtensions: true，允许直接 import .ts/.tsx 扩展名

关键约束：
- 禁止引入 express/better-sqlite3/ioredis 等 Node 生态包，优先使用 Bun.serve()/bun:sqlite/Bun.redis 等原生能力
- 禁止使用 dotenv，Bun 自动加载 .env
- 测试统一使用 bun test，CLI 统一使用 bunx 替代 npx
- 浏览器渲染依赖 Bun.WebView（backend.ts），需本地 Chrome 调试端口或自动拉起 Chrome 实例