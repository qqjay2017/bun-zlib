---
kind: logging_system
name: 基于原生 console 的轻量日志输出
category: logging_system
scope:
    - '**'
source_files:
    - index.ts
    - lib/controller.ts
    - lib/download-manager.ts
---

本仓库未引入任何第三方日志框架，也未定义统一的 logger 模块或日志级别体系。后端与共享库中的日志输出全部依赖 Bun/Node 原生的 console.log、console.error，以字符串拼接加前缀标签（如 [DownloadManager]、[Router]）的形式进行简单分类。

启动阶段：index.ts 使用 console.log 打印服务地址；Bun.serve 配置了 development.console: true，将开发环境控制台输出透传到浏览器 DevTools。
错误路径：lib/controller.ts 在路由处理异常时通过 console.error 记录；lib/download-manager.ts 在下载器各阶段（提取失败、章节下载失败、listener 回调异常、持久化失败）均以 console.error 形式输出。
前端侧：路由组件中未发现 console.* 调用，前端调试主要依赖浏览器 DevTools。

由于没有集中式日志初始化、结构化字段约定或可配置的 sink，该项目的日志系统本质上就是裸 console 输出，不具备跨进程聚合、分级过滤或持久化能力。