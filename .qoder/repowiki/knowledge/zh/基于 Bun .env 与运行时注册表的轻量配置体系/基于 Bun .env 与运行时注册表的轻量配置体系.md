---
kind: configuration_system
name: 基于 Bun .env 与运行时注册表的轻量配置体系
category: configuration_system
scope:
    - '**'
source_files:
    - index.ts
    - lib/source-config.ts
    - lib/sources/index.ts
    - backend.ts
    - frontend.tsx
    - routes/__root.tsx
    - package.json
    - .gitignore
    - CLAUDE.md
---

本仓库未引入独立配置框架，而是依赖 Bun 运行时的内置能力，形成一套极简的环境变量加运行时注册表双层配置模型。

1. 系统/工具
- 环境变量：Bun 自动加载 .env、.env.development.local、.env.test.local、.env.production.local、.env.local（见 .gitignore 与 CLAUDE.md），无需 dotenv；后端通过 process.env.* 读取，前端通过 import.meta.env.DEV 等编译期常量访问。
- 书源配置：采用运行时内存注册表模式，由 lib/source-config.ts 提供 registerSource / getAllSources 等 API，各书源模块在导入时以副作用方式调用 registerSource 完成自注册。
- 启动装配：index.ts 通过直接 import 控制器与 lib/sources 入口触发所有副作用，从而一次性完成路由与书源的注册。

2. 关键文件
- index.ts：应用入口，集中 import 控制器与 lib/sources，驱动全局注册。
- lib/source-config.ts：书源配置类型定义与内存注册表核心。
- lib/sources/index.ts：书源导出聚合入口，被 index.ts 统一 import。
- backend.ts：使用 process.env.HOME 探测本地 Chrome DevTools 端口，作为 WebView 后端配置。
- frontend.tsx、routes/__root.tsx：使用 import.meta.env.DEV 进行开发期开关。
- package.json：仅声明脚本 start / dev，无构建期配置注入。
- .gitignore、CLAUDE.md：约定 .env* 不被提交，且明确 Bun 自动加载 .env。

3. 架构与约定
- 分层职责：进程级配置（端口、路径、调试开关）全部走 process.env，由 Bun 从 .env* 注入；业务扩展点（书源）通过 BookSourceConfig 接口描述，按模块即配置的方式在运行时注册。
- 装配顺序：index.ts 先 import 控制器（注册 /api/* 路由），再 import lib/sources（触发各书源 registerSource），最后创建 Router 并启动服务。
- 环境区分：开发期 import.meta.env.DEV 控制前端 Devtools 显示，--hot 开启 HMR；生产期无显式构建产物，直接 bun run index.ts 启动。

4. 开发者应遵循的规则
- 新增环境变量：写入 .env 或对应环境的 .env.*.local，后端用 process.env.XXX 读取，前端用 import.meta.env.XXX 访问；不要引入 dotenv。
- 新增书源：新建 lib/sources/<name>.ts，实现 BookSourceConfig 并通过 registerSource 注册，同时在 lib/sources/index.ts 中导出，确保被 index.ts 的 import 链覆盖。
- 避免硬编码：URL、路径、调试开关等外部化到环境变量；仅在 backend.ts 等基础设施层访问 process.env。
- 保持副作用注册：不要在业务逻辑中主动查询注册表，而是在模块顶层以副作用方式完成注册，由入口统一编排。