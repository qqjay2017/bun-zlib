---
kind: dependency_management
name: Bun 包管理与依赖锁定策略
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - bun.lock
---

本项目采用 Bun 作为单一运行时与包管理器，通过 package.json 声明依赖、bun.lock 进行版本锁定，形成轻量且确定性的依赖管理体系。

## 使用的系统与工具
- 包管理器：Bun（bun run index.ts / bun --hot index.ts）
- 锁文件：bun.lock（lockfileVersion: 1），提交至版本控制以保证构建可复现
- 模块系统：ESM（"type": "module"，入口 "module": "index.ts"）
- 类型声明：通过 @types/bun、@types/react、@types/react-dom 提供 TS 类型支持

## 关键文件
- package.json — 依赖声明、脚本入口、peerDependencies
- bun.lock — 精确到 tarball URL + sha512 的完整依赖快照
- tsconfig.json — TypeScript 编译配置（约束依赖版本范围）

## 架构与约定
- 单仓库、无 workspaces：所有依赖集中在根 package.json，不存在子包或 monorepo 结构。
- 私有镜像源：bun.lock 中大量包来自阿里云 npm 镜像（packages.aliyun.com）与淘宝镜像（registry.npmmirror.com），说明团队已配置私有/加速 registry，用于内网拉取与缓存。
- 版本策略：业务依赖使用主版本号范围（如 ^5、^19、^3.10.1），由 bun.lock 锁定具体解析结果；TypeScript 通过 peerDependencies 声明为 ^7.0.2，避免将编译器打包进产物。
- 无 vendoring：未使用 vendor/ 目录或 git submodule 方式托管第三方源码，完全依赖 Bun 的 node_modules + lockfile 机制。
- 开发/生产分离：devDependencies 仅包含类型定义与 Bun 类型，不引入额外运行时代码。

## 开发者应遵循的规则
1. 新增依赖必须更新 package.json 并重新生成 bun.lock，禁止手动编辑 lock 文件。
2. 优先使用主版本号范围（如 ^5、^19），保持语义化版本升级空间，同时依靠 lockfile 保证 CI 一致性。
3. 类型声明放入 devDependencies，不要混入 dependencies，以减少产物体积。
4. 如需访问私有包，应在项目级 .npmrc 或 Bun 配置中设置 registry/token，而非在代码中硬编码。
5. 发布前执行 bun install --frozen-lockfile（或等价命令）确保本地与 CI 使用同一份依赖树。