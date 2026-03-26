import { spawn } from "node:child_process";

import { isAiAgent } from "./ai.js";
import { type ReviewPhaseResult as ImportedReviewPhaseResult, runReviewTriggerPhase } from "./review.js";
import { runSubmoduleRefsCheckWithSummary } from "./check-submodule-refs.js";
import { MetricExecution, printFailureSummary, runMetric, summarizeFailures } from "./fitness.js";
import { loadHookMetrics } from "./metrics.js";
import { runCommand, tailOutput } from "./process.js";
import { promptYesNo } from "./prompt.js";
import { createHumanMetricReporter } from "./renderer.js";
import { runMetrics } from "./scheduler.js";
import { type HookProfileName } from "./config.js";

export type HookRuntimeOutputMode = "human" | "jsonl";
export type RuntimePhase = "submodule" | "fitness" | "review";

export type HookRuntimeProfile = {
  name: HookProfileName;
  phases: readonly RuntimePhase[];
  fallbackMetrics: readonly string[];
};

export type ReviewPhaseResult = ImportedReviewPhaseResult;

export type HookRuntimeOptions = {
  autoFix: boolean;
  dryRun: boolean;
  failFast: boolean;
  jobs: number;
  metricNames: string[];
  outputMode: HookRuntimeOutputMode;
  profile: HookProfileName;
  tailLines: number;
};

export type HookPhaseResult = {
  phase: RuntimePhase;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  details?: string;
};

export type RuntimePhaseAdapters = {
  runSubmodulePhase(
    dryRun: boolean,
    outputMode: HookRuntimeOutputMode,
    step: number,
    totalSteps: number,
  ): Promise<HookPhaseResult>;
  runFitnessPhase(
    options: HookRuntimeOptions,
    step: number,
    totalSteps: number,
  ): Promise<MetricExecution[]>;
  runReviewPhase(
    dryRun: boolean,
    outputMode: HookRuntimeOutputMode,
    step: number,
    totalSteps: number,
  ): Promise<ReviewPhaseResult | null>;
};

export function formatReviewPhaseLabel(result: ReviewPhaseResult): string {
  if (result.status === "unavailable") {
    return result.bypassed ? "unavailable (bypassed)" : "unavailable";
  }

  if (result.status === "blocked") {
    return "blocked";
  }

  if (result.status === "error") {
    return "error";
  }

  return "passed";
}

function emitEvent(outputMode: HookRuntimeOutputMode, event: Record<string, unknown>): void {
  if (outputMode !== "jsonl") {
    return;
  }

  const payload = { ts: new Date().toISOString(), ...event };
  console.log(JSON.stringify(payload));
}

function logPhaseHeader(phase: string, step: number, outputMode: HookRuntimeOutputMode, total: number): void {
  if (outputMode === "human") {
    console.log(`[phase ${step}/${total}] ${phase}`);
  }
}

function buildFixPrompt(profileName: string, results: MetricExecution[]): string {
  const sections = results
    .filter((result) => !result.passed)
    .map((result) => {
      const body = tailOutput(result.output, 8_000).trim();
      return `## ${result.metric.name}\n\`\`\`\n${body}\n\`\`\``;
    })
    .join("\n\n");

  return [
    `${profileName} fitness checks failed. Please fix the following issues:`,
    "",
    sections,
    "",
    `After fixing all issues, rerun the ${profileName} flow and verify it passes.`,
  ].join("\n");
}

function runClaudeFix(prompt: string): Promise<number> {
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

async function handleFitnessFailure(
  results: MetricExecution[],
  options: HookRuntimeOptions,
): Promise<never> {
  if (options.outputMode === "human") {
    printFailureSummary(results);
  }
  emitEvent(options.outputMode, {
    event: "fitness.failed",
    phase: "fitness",
    status: "failed",
    failures: summarizeFailures(results),
  });

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

  if (options.outputMode === "human") {
    console.log("Starting Claude to fix issues...");
    console.log("");
  }

  const exitCode = await runClaudeFix(buildFixPrompt(options.profile, results));
  if (exitCode !== 0) {
    throw new Error("Claude fix attempt failed.");
  }

  throw new Error(`Claude has attempted to fix the issues. Please review the changes and rerun ${options.profile}.`);
}

async function runSubmodulePhase(
  dryRun: boolean,
  outputMode: HookRuntimeOutputMode,
  step: number,
  totalSteps: number,
): Promise<HookPhaseResult> {
  const startedAt = Date.now();
  logPhaseHeader("submodule refs", step, outputMode, totalSteps);
  emitEvent(outputMode, {
    event: "phase.start",
    phase: "submodule",
    index: step,
    total: totalSteps,
  });

  if (dryRun) {
    emitEvent(outputMode, {
      event: "phase.skip",
      phase: "submodule",
      status: "skipped",
      durationMs: Date.now() - startedAt,
      reason: "dry_run",
      command: "tools/hook-runtime/src/check-submodule-refs.ts",
    });
    if (outputMode === "human") {
      console.log("[dry-run] tools/hook-runtime/src/check-submodule-refs.ts");
      console.log("");
    }
    return { phase: "submodule", status: "skipped", durationMs: Date.now() - startedAt };
  }

  const summary = await runSubmoduleRefsCheckWithSummary();
  const passed = !summary.failures.length;
  const durationMs = Date.now() - startedAt;

  const status = passed ? 0 : 1;

  emitEvent(outputMode, {
    event: "phase.complete",
    phase: "submodule",
    status: status === 0 ? "passed" : "failed",
    durationMs,
    command: "tools/hook-runtime/src/check-submodule-refs.ts",
    exitCode: status,
    checked: summary.checked,
    skipped: summary.skipped,
  });

  if (!passed) {
    const failureDetails = summary.failures.join(", ");
    const message = `Submodule ref check failed: ${summary.failures.length} unreachable refs.`;
    if (outputMode === "human" && failureDetails) {
      console.error(`[submodule] ${failureDetails}`);
    }
    throw new Error(message);
  }

  return { phase: "submodule", status: "passed", durationMs };
}

async function runFitnessPhase(
  options: HookRuntimeOptions,
  step: number,
  totalSteps: number,
): Promise<MetricExecution[]> {
  logPhaseHeader("local fitness", step, options.outputMode, totalSteps);
  emitEvent(options.outputMode, {
    event: "phase.start",
    phase: "fitness",
    index: step,
    total: totalSteps,
    jobs: options.jobs,
  });

  if (options.dryRun) {
    const metrics = await loadHookMetrics(options.metricNames);
    if (options.outputMode === "human") {
      console.log(
        `[fitness] Metrics (${options.jobs} workers): ${options.metricNames.join(", ")}`,
      );
      for (const metric of metrics) {
        console.log(`[dry-run] ${metric.name} -> ${metric.command}`);
      }
      console.log("");
    }
    if (options.outputMode === "human") {
      console.log("");
    }
    emitEvent(options.outputMode, {
      event: "phase.skip",
      phase: "fitness",
      status: "skipped",
      durationMs: 0,
      reason: "dry_run",
      jobs: options.jobs,
      metrics: options.metricNames,
    });
    return [];
  }

  const metrics = await loadHookMetrics(options.metricNames);
  const reporter =
    options.outputMode === "human"
      ? createHumanMetricReporter(metrics, {
          concurrency: options.jobs,
          stream: process.stdout,
          tailLines: options.tailLines,
        })
      : null;
  const startedAt = Date.now();
  let reporterClosed = false;

  reporter?.start();

  try {
    const batch = await runMetrics(
      metrics,
      async (metric) =>
        runMetric(metric, {
          onOutput: (event) => reporter?.onMetricOutput(metric.name, event),
        }),
      {
        concurrency: options.jobs,
        failFast: options.failFast,
        onMetricStart: (metric, index, total) => {
          reporter?.onMetricStart(metric, index, total);
          emitEvent(options.outputMode, {
            event: "metric.start",
            phase: "fitness",
            name: metric.name,
            index,
            total,
            sourceFile: metric.sourceFile,
            command: metric.command,
          });
        },
        onMetricComplete: (result, index, total) => {
          reporter?.onMetricComplete(result, index, total);
          emitEvent(options.outputMode, {
            event: "metric.complete",
            phase: "fitness",
            name: result.metric.name,
            index,
            total,
            passed: result.passed,
            durationMs: result.durationMs,
            exitCode: result.exitCode,
            sourceFile: result.metric.sourceFile,
            command: result.metric.command,
            outputTail: tailOutput(result.output, 6_000),
          });
        },
      },
    );
    reporter?.close();
    reporterClosed = true;

    if (batch.skippedMetrics.length > 0) {
      emitEvent(options.outputMode, {
        event: "metric.skip",
        phase: "fitness",
        reason: "fail_fast",
        metrics: batch.skippedMetrics.map((metric) => metric.name),
      });
      if (options.outputMode === "human") {
        console.log(
          `[fitness] fail-fast left ${batch.skippedMetrics.length} queued metrics unstarted: ${batch.skippedMetrics
            .map((metric) => metric.name)
            .join(", ")}`,
        );
        console.log("");
      }
    }

    const durationMs = Date.now() - startedAt;
    emitEvent(options.outputMode, {
      event: "phase.complete",
      phase: "fitness",
      status: batch.results.every((result) => result.passed) ? "passed" : "failed",
      durationMs,
      totalMetrics: metrics.length,
      runMetrics: batch.results.length,
      skippedMetrics: batch.skippedMetrics.map((metric) => metric.name),
      metricFailures: summarizeFailures(batch.results),
    });

    if (batch.results.some((result) => !result.passed)) {
      await handleFitnessFailure(batch.results, options);
    }

    return batch.results;
  } finally {
    if (!reporterClosed) {
      reporter?.close();
    }
  }
}

async function runReviewPhase(
  dryRun: boolean,
  outputMode: HookRuntimeOutputMode,
  step: number,
  totalSteps: number,
): Promise<ReviewPhaseResult | null> {
  emitEvent(outputMode, {
    event: "phase.start",
    phase: "review",
    index: step,
    total: totalSteps,
  });

  if (dryRun) {
    if (outputMode === "human") {
      console.log(`[phase ${step}/${totalSteps}] review checks skipped in dry-run.`);
      console.log("");
    }
    emitEvent(outputMode, {
      event: "phase.skip",
      phase: "review",
      status: "skipped",
      durationMs: 0,
      reason: "dry_run",
    });
    return null;
  }

  const startedAt = Date.now();
  const result = await runReviewTriggerPhase(outputMode);
  if (outputMode === "human") {
    console.log(`[phase ${step}/${totalSteps}] review checks ${formatReviewPhaseLabel(result)}`);
  }
  emitEvent(outputMode, {
    event: "phase.complete",
    phase: "review",
    status: result.allowed ? "passed" : "failed",
    allowed: result.allowed,
    durationMs: Date.now() - startedAt,
    base: result.base,
    bypassed: result.bypassed,
    matched: result.triggers.length,
    changedFiles: result.changedFiles,
    diffFileCount: result.diffFileCount,
    message: result.message,
    reviewStatus: result.status,
  });

  return result;
}

const DEFAULT_RUNTIME_PHASE_ADAPTERS: RuntimePhaseAdapters = {
  runSubmodulePhase,
  runFitnessPhase,
  runReviewPhase,
};

export async function runHookRuntime(
  options: HookRuntimeOptions,
  runtimeProfile: HookRuntimeProfile,
  phaseAdapters?: Partial<RuntimePhaseAdapters>,
): Promise<void> {
  const adapters: RuntimePhaseAdapters = {
    ...DEFAULT_RUNTIME_PHASE_ADAPTERS,
    ...phaseAdapters,
  };

  emitEvent(options.outputMode, {
    event: "hook.start",
    profile: options.profile,
    mode: options.outputMode,
    dryRun: options.dryRun,
    autoFix: options.autoFix,
    failFast: options.failFast,
    jobs: options.jobs,
    metrics: options.metricNames,
    profilePhases: runtimeProfile.phases,
    tailLines: options.tailLines,
  });

  let reviewResult: ReviewPhaseResult | null = null;
  const startedAt = Date.now();
  for (let index = 0; index < runtimeProfile.phases.length; index += 1) {
    const step = index + 1;
    const totalSteps = runtimeProfile.phases.length;
    const phase = runtimeProfile.phases[index];

    if (phase === "submodule") {
      await adapters.runSubmodulePhase(options.dryRun, options.outputMode, step, totalSteps);
      continue;
    }
    if (phase === "fitness") {
      await adapters.runFitnessPhase(options, step, totalSteps);
      continue;
    }

    reviewResult = await adapters.runReviewPhase(options.dryRun, options.outputMode, step, totalSteps);
  }

  if (!options.dryRun && reviewResult && !reviewResult.allowed) {
    throw new Error(reviewResult.message);
  }

  emitEvent(options.outputMode, {
    event: "hook.complete",
    status: "passed",
    durationMs: Date.now() - startedAt,
  });

  if (options.outputMode === "human") {
    console.log("All checks passed! Ready to continue.");
  }
}
