#!/usr/bin/env node

import { spawn } from "node:child_process";

import { isAiAgent } from "./ai.js";
import { printFailureSummary, runMetric, type MetricExecution } from "./fitness.js";
import { loadHookMetrics } from "./metrics.js";
import { runCommand, tailOutput } from "./process.js";
import { promptYesNo } from "./prompt.js";
import { runReviewTriggerPhase } from "./review.js";

type CliOptions = {
  autoFix: boolean;
  dryRun: boolean;
  failFast: boolean;
};

const LOCAL_METRICS = ["eslint_pass", "ts_typecheck_pass", "ts_test_pass"];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    autoFix: false,
    dryRun: false,
    failFast: true,
  };

  for (const arg of argv) {
    if (arg === "--fix") {
      options.autoFix = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-fail-fast") {
      options.failFast = false;
    }
  }

  return options;
}

function buildFixPrompt(results: MetricExecution[]): string {
  const sections = results
    .filter((result) => !result.passed)
    .map((result) => {
      const body = tailOutput(result.output, 8_000).trim();
      return `## ${result.metric.name}\n\`\`\`\n${body}\n\`\`\``;
    })
    .join("\n\n");

  return [
    "Pre-push fitness checks failed. Please fix the following issues:",
    "",
    sections,
    "",
    "After fixing all issues, rerun the pre-push hook and verify it passes.",
  ].join("\n");
}

async function runClaudeFix(prompt: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", prompt], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function handleFitnessFailure(results: MetricExecution[], options: CliOptions): Promise<never> {
  printFailureSummary(results);

  if (isAiAgent()) {
    throw new Error("Running in AI agent environment. Please fix the errors shown above.");
  }

  const claudeCheck = await runCommand("command -v claude", { stream: false });
  if (claudeCheck.exitCode !== 0) {
    throw new Error("Claude CLI not found. Please fix errors manually.");
  }

  let shouldFix = options.autoFix;
  if (!shouldFix) {
    shouldFix = await promptYesNo("Would you like Claude to fix these issues? [y/N]");
  }

  if (!shouldFix) {
    throw new Error("Aborted. Please fix errors manually.");
  }

  console.log("Starting Claude to fix issues...");
  console.log("");
  const exitCode = await runClaudeFix(buildFixPrompt(results));
  if (exitCode !== 0) {
    throw new Error("Claude fix attempt failed.");
  }

  throw new Error("Claude has attempted to fix the issues. Please review the changes and run 'git push' again.");
}

async function runSubmodulePhase(dryRun: boolean): Promise<void> {
  console.log("[phase 1/3] submodule refs");
  if (dryRun) {
    console.log("[dry-run] ./scripts/check-submodule-refs.sh");
    console.log("");
    return;
  }

  const result = await runCommand("./scripts/check-submodule-refs.sh");
  if (result.exitCode !== 0) {
    throw new Error("Submodule ref check failed.");
  }
  console.log("");
}

async function runFitnessPhase(options: CliOptions): Promise<void> {
  console.log("[phase 2/3] local fitness");
  console.log(`[fitness] Metrics: ${LOCAL_METRICS.join(", ")}`);
  console.log("");

  const metrics = await loadHookMetrics(LOCAL_METRICS);
  if (options.dryRun) {
    for (const metric of metrics) {
      console.log(`[dry-run] ${metric.name} -> ${metric.command}`);
    }
    console.log("");
    return;
  }

  const results: MetricExecution[] = [];
  for (const [index, metric] of metrics.entries()) {
    const result = await runMetric(metric, index + 1, metrics.length);
    results.push(result);
    if (!result.passed && options.failFast) {
      break;
    }
  }

  if (results.some((result) => !result.passed)) {
    await handleFitnessFailure(results, options);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  await runSubmodulePhase(options.dryRun);
  await runFitnessPhase(options);
  if (!options.dryRun) {
    await runReviewTriggerPhase();
  }

  console.log("All checks passed! Ready to push.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
