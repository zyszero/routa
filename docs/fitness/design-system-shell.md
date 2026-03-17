---
dimension: maintainability
weight: 8
threshold:
  pass: 90
  warn: 80
  block: 0

metrics:
  - name: design_system_shell_e2e
    command: npm run test:e2e -- e2e/layout-changes.spec.ts e2e/layout-verification.spec.ts 2>&1
    pattern: '(\d+\s+passed)|No tests found'
    hard_gate: true
    description: "桌面 Shell 与主色系统改造的导航/布局验证（traces、workspace、kanban、导航入口）"
---

# Design System Shell + 主题一致性验收

## 目标

该文件作为 `设计系统统一桌面侧边栏、壳体主题与路由导航` 问题的验证项。

## 验收场景

- 主页与工作区相关页面（含 `/workspace/[workspaceId]`、`/workspace/[workspaceId]/kanban`、`/traces`）在桌面主题下背景、shell、侧边栏风格一致。
- 导航行为无 dead-link，settings 与主要入口跳转不回退。
- 桌面/浏览器两端的关键布局差异在 Playwright 回归中通过。

## 测试命令

```bash
npm run test:e2e -- e2e/layout-changes.spec.ts e2e/layout-verification.spec.ts
```

## 风险与边界

- 命令依赖当前 e2e 环境可用（数据库、服务和本地 session 启动状态）。
- 若测试文件不存在或未覆盖某些新页面，则该条目不会自动覆盖该页面，需同步补齐测试。
