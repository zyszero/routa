#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { URL, fileURLToPath } from "node:url";

import { ensureDir, resolveOutputPath } from "./ppt-theme.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolRoot = path.resolve(__dirname, "..");
const screenshotDir = resolveOutputPath(toolRoot, "screenshots");
const manifestPath = path.join(screenshotDir, "manifest.json");

const defaults = {
  baseUrl: process.env.ROUTA_PPT_BASE_URL || "http://127.0.0.1:3000",
  workspaceId: process.env.ROUTA_PPT_WORKSPACE_ID || "default",
  sessionId: process.env.ROUTA_PPT_SESSION_ID || "__placeholder__",
  full: true,
};

const targets = [
  {
    id: "home",
    route: "/",
    description: "Home entry and workspace launch surface",
  },
  {
    id: "workspace",
    route: ({ workspaceId }) => `/workspace/${workspaceId}`,
    description: "Workspace overview page",
  },
  {
    id: "kanban",
    route: ({ workspaceId }) => `/workspace/${workspaceId}/kanban`,
    description: "Kanban board and automation lanes",
  },
  {
    id: "team",
    route: ({ workspaceId }) => `/workspace/${workspaceId}/team`,
    description: "Team coordination overview",
  },
  {
    id: "traces",
    route: "/traces",
    description: "Trace explorer surface",
  },
  {
    id: "settings",
    route: "/settings",
    description: "Settings and provider controls",
  },
];

function parseArgs(argv) {
  const options = { ...defaults, only: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") options.baseUrl = argv[++index];
    else if (arg === "--workspace-id") options.workspaceId = argv[++index];
    else if (arg === "--session-id") options.sessionId = argv[++index];
    else if (arg === "--only") options.only = new Set(argv[++index].split(",").map((item) => item.trim()).filter(Boolean));
    else if (arg === "--viewport") options.viewport = argv[++index];
    else if (arg === "--no-full") options.full = false;
    else if (arg === "--help") options.help = true;
  }
  return options;
}

function printHelp() {
  console.log("Usage: node src/capture-app-screenshots.js [--base-url http://127.0.0.1:3000] [--workspace-id default] [--only home,kanban]");
}

function runAgentBrowser(args) {
  const result = spawnSync("agent-browser", args, {
    encoding: "utf8",
    cwd: toolRoot,
  });

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
    throw new Error(`agent-browser ${args.join(" ")} failed: ${detail}`);
  }

  return result.stdout.trim();
}

function tryCloseBrowser() {
  spawnSync("agent-browser", ["close"], {
    encoding: "utf8",
    cwd: toolRoot,
  });
}

function formatRoute(target, options) {
  const route = typeof target.route === "function"
    ? target.route({ workspaceId: options.workspaceId, sessionId: options.sessionId })
    : target.route;
  return new URL(route, options.baseUrl).toString();
}

function captureTarget(target, options) {
  const url = formatRoute(target, options);
  const outputPath = path.join(screenshotDir, `${target.id}.png`);

  tryCloseBrowser();
  runAgentBrowser(["open", url]);
  runAgentBrowser(["wait", "--load", "networkidle"]);
  runAgentBrowser(["screenshot", ...(options.full ? ["--full"] : []), outputPath]);

  const title = runAgentBrowser(["get", "title"]);
  const currentUrl = runAgentBrowser(["get", "url"]);

  return {
    id: target.id,
    title,
    description: target.description,
    route: currentUrl,
    file: outputPath,
    capturedAt: new Date().toISOString(),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  ensureDir(screenshotDir);
  const selected = options.only
    ? targets.filter((target) => options.only.has(target.id))
    : targets;

  const manifest = [];
  for (const target of selected) {
    console.log(`Capturing ${target.id}...`);
    manifest.push(captureTarget(target, options));
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Saved manifest: ${manifestPath}`);
  tryCloseBrowser();
}

main();
