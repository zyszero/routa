#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readJson, resolveOutputPath } from "./ppt-theme.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(toolRoot, "..", "..");
const outputDir = resolveOutputPath(toolRoot);
const manifestPath = resolveOutputPath(toolRoot, "screenshots", "manifest.json");
const devServerLogPath = resolveOutputPath(toolRoot, "dev-server.log");

const defaults = {
  baseUrl: process.env.ROUTA_PPT_BASE_URL || "http://127.0.0.1:3000",
  workspaceId: process.env.ROUTA_PPT_WORKSPACE_ID || "default",
  capture: true,
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") options.baseUrl = argv[++index];
    else if (arg === "--workspace-id") options.workspaceId = argv[++index];
    else if (arg === "--skip-capture") options.capture = false;
    else if (arg === "--help") options.help = true;
  }
  return options;
}

function printHelp() {
  console.log("Usage: node src/generate-all.js [--base-url http://127.0.0.1:3000] [--workspace-id default] [--skip-capture]");
}

function commandExists(command) {
  const result = spawnSync("/bin/zsh", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
    cwd: toolRoot,
  });
  return result.status === 0;
}

function runNodeScript(scriptName, args = []) {
  const result = spawnSync("node", [path.join("src", scriptName), ...args], {
    encoding: "utf8",
    cwd: toolRoot,
  });

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
    throw new Error(`${scriptName} failed: ${detail}`);
  }

  if (result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
}

function checkUrlReachable(targetUrl) {
  const result = spawnSync("/bin/zsh", ["-lc", `curl -I -s -o /dev/null -w "%{http_code}" "${targetUrl}"`], {
    encoding: "utf8",
    cwd: toolRoot,
  });
  const statusCode = Number.parseInt(result.stdout.trim(), 10);
  return result.status === 0 && Number.isFinite(statusCode) && statusCode > 0 && statusCode < 500;
}

async function waitForUrl(targetUrl, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (checkUrlReachable(targetUrl)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return false;
}

function startLocalDevServer() {
  const logStream = fs.openSync(devServerLogPath, "a");
  const child = spawn("npm", ["run", "dev"], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", logStream, logStream],
    env: process.env,
  });
  child.unref();
  return child.pid;
}

async function ensureBaseUrl(options) {
  if (checkUrlReachable(options.baseUrl)) {
    return;
  }

  console.log(`${options.baseUrl} is not reachable. Starting local dev server...`);
  const pid = startLocalDevServer();
  const ready = await waitForUrl(options.baseUrl);
  if (!ready) {
    throw new Error(`Failed to start local dev server for ${options.baseUrl}. Check ${devServerLogPath} (pid ${pid}).`);
  }
  console.log(`Local dev server is ready on ${options.baseUrl} (pid ${pid}).`);
}

async function maybeCaptureScreenshots(options) {
  if (!options.capture) {
    console.log("Skipping screenshots: --skip-capture provided.");
    return;
  }

  if (!commandExists("agent-browser")) {
    console.log("Skipping screenshots: agent-browser is not installed.");
    return;
  }

  await ensureBaseUrl(options);

  console.log(`Capturing screenshots from ${options.baseUrl} ...`);
  try {
    runNodeScript("capture-app-screenshots.js", ["--base-url", options.baseUrl, "--workspace-id", options.workspaceId]);
  } catch (error) {
    console.log(`Skipping screenshots after capture failure: ${error.message}`);
  }
}

function printArtifactSummary() {
  const artifacts = [
    "routa-v0.2.7-release-notes.pptx",
  ].map((file) => path.join(outputDir, file));

  console.log("Generated artifacts:");
  artifacts.forEach((artifact) => console.log(`- ${artifact}`));

  const manifest = readJson(manifestPath, []);
  if (manifest.length > 0) {
    console.log(`Screenshot manifest: ${manifestPath}`);
    console.log(`Captured screens: ${manifest.map((entry) => entry.id).join(", ")}`);
  } else {
    console.log("Screenshot manifest: not available");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await maybeCaptureScreenshots(options);
  runNodeScript("release-notes-to-ppt.js");
  printArtifactSummary();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
