---
title: "Docker OpenCode image starts but CLI command set mismatches expected HTTP mode"
date: "2026-03-06"
status: open
severity: high
area: "acp"
tags: ["docker", "opencode", "agent-runtime"]
reported_by: "GitHub Copilot"
related_issues: ["https://github.com/phodal/routa/issues/55"]
---

# Docker OpenCode 镜像中的 CLI 命令与预期 HTTP 模式不匹配

## What Happened

在实现 Docker-based agent execution 时，基于 `opencode-ai` 全局安装构建了容器镜像，并尝试使用 `opencode serve` 启动 HTTP 服务。

观察到以下现象：
- 初次运行报错：`spawnSync /usr/local/lib/node_modules/opencode-ai/bin/.opencode ENOENT`
- 添加 `libc6-compat` 后上述报错消失，但启动命令报错：`error: Script not found "serve"`
- 进一步尝试 `opencode acp --help`，同样报错：`error: Script not found "acp"`
- `opencode --help` 输出为 Bun CLI 帮助，而不是预期的 OpenCode agent CLI 子命令列表

这导致容器内未能启动预期的 OpenCode HTTP/SSE endpoint（例如 `/health`、`/session/new`、`/session/prompt`）。

## Expected Behavior

容器内应可通过固定命令启动 OpenCode agent HTTP 服务，并暴露健康检查与会话接口，供 Routa 的 Docker provider 正常创建和交互会话。

## Reproduction Context

- Environment: web
- Trigger: 在 Colima + Docker 环境中构建并运行 `docker/Dockerfile.opencode-agent`，执行容器启动命令后检查 `/health`

## Why This Might Happen

- `opencode-ai` npm 包当前发布内容可能与项目预期的 OpenCode CLI 版本/分发形态不一致
- 现有启动命令（`serve` / `acp`）可能来自旧版或不同安装渠道（非 npm global）的 CLI 语义
- Alpine + 包内二进制/包装脚本组合可能改变了入口行为，最终落到 Bun 默认帮助而非 agent 命令路由

## Relevant Files

- `docker/Dockerfile.opencode-agent`
- `src/core/acp/docker/docker-opencode-adapter.ts`
- `src/core/acp/docker/process-manager.ts`
- `src/app/api/acp/route.ts`

## Observations

- `colima status` 显示运行正常（runtime: docker）
- `docker build` 成功
- `docker run` 容器启动后立即退出，日志持续报 `Script not found` 对应子命令

## References

- https://github.com/phodal/routa/issues/55
