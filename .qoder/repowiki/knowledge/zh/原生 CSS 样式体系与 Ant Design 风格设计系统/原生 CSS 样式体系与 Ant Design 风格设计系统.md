---
kind: frontend_style
name: 原生 CSS 样式体系与 Ant Design 风格设计系统
category: frontend_style
scope:
    - '**'
source_files:
    - index.css
    - frontend.tsx
    - index.html
---

本项目采用**纯原生 CSS + React 组件**的轻量级前端样式方案，未引入任何 CSS 框架（如 Tailwind、Ant Design、Bootstrap），所有视觉样式集中在单一 `index.css` 文件中管理。

## 样式架构
- **全局重置**：通过 `* { margin: 0; padding: 0; box-sizing: border-box; }` 统一盒模型
- **单文件样式**：全部 618 行 CSS 集中在 `index.css`，按功能模块分段注释组织（详情页、阅读页、下载中心等）
- **BEM 命名约定**：使用 `.container`、`.tab-bar`、`.btn-primary`、`.reader-content` 等语义化类名
- **CSS 变量缺失**：颜色值直接硬编码（主色 `#1890ff`、背景 `#f5f5f5`、边框 `#e8e8e8` 等），未提取为 CSS 自定义属性

## 设计系统与主题
- **色彩体系**：基于 Ant Design 经典蓝色 `#1890ff` 作为主色调，配合灰色系 `#333`、`#666`、`#999` 构建层次
- **字体栈**：`-apple-system, BlinkMacFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` 优先系统字体
- **间距规范**：固定使用 `4px`、`8px`、`12px`、`16px`、`20px`、`24px` 等 4px 倍数间距
- **圆角与阴影**：统一 `border-radius: 4px/6px/8px`，阴影使用 `box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08)` 等轻量效果

## 响应式策略
- **移动端优先**：基础布局适配小屏幕，通过 `max-width: 800px` 限制内容宽度
- **网格布局**：漫画章节使用 `grid-template-columns: repeat(4, 1fr)` 实现四列网格
- **弹性布局**：大量使用 `display: flex` 和 `gap` 属性进行组件内布局
- **无媒体查询**：未发现 `@media` 查询，响应式主要依赖弹性布局和相对单位

## 组件样式模式
- **按钮系统**：`.btn-primary`（主按钮）、`.btn-secondary`（次按钮）、`.btn-cancel`（取消按钮）、`.btn-nav`（导航按钮）
- **表单控件**：统一的输入框样式、下拉选择器、禁用状态处理
- **状态反馈**：错误信息 `.error-message`（红色背景）、加载占位符 `.placeholder-text`（灰色文字）
- **卡片容器**：`.task-card`、`.source-info` 等带边框和圆角的卡片样式

## 开发工具链
- **Bun Hot Reload**：通过 `import.meta.hot` 实现热更新
- **React DevTools**：开发环境启用 `@tanstack/react-query-devtools`
- **无构建优化**：直接引用 CSS 文件，无 CSS 压缩、前缀自动添加等优化步骤