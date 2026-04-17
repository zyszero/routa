import type { RuntimeFitnessStatusResponse } from "@/core/fitness/runtime-status-types";
import type { FitnessSpecSummary } from "@/client/hooks/use-harness-settings-data";
import type { PlanResponse } from "@/client/components/harness-execution-plan-flow";

function summarizeRuntimeFitness(runtimeFitness: RuntimeFitnessStatusResponse | null | undefined) {
  if (!runtimeFitness) {
    return null;
  }

  const current = runtimeFitness.hasRunning
    ? runtimeFitness.modes.find((summary) => summary.currentStatus === "running")
      ?? runtimeFitness.latest
      ?? null
    : runtimeFitness.latest ?? null;

  return current ? {
    mode: current.mode,
    status: current.currentStatus,
    observedAt: current.currentObservedAt,
    score: current.finalScore ?? current.lastCompleted?.finalScore ?? null,
    hardGateBlocked: current.hardGateBlocked ?? current.lastCompleted?.hardGateBlocked ?? null,
    scoreBlocked: current.scoreBlocked ?? current.lastCompleted?.scoreBlocked ?? null,
    metricCount: current.metricCount ?? current.lastCompleted?.metricCount ?? null,
  } : null;
}

function summarizeSpecFiles(specFiles: FitnessSpecSummary[]) {
  return specFiles.slice(0, 10).map((file) => ({
    name: file.name,
    relativePath: file.relativePath,
    kind: file.kind,
    language: file.language,
    dimension: file.dimension ?? null,
    metricCount: file.metricCount,
    weight: file.weight ?? null,
    thresholdPass: file.thresholdPass ?? null,
    thresholdWarn: file.thresholdWarn ?? null,
    metrics: file.metrics.slice(0, 6).map((metric) => ({
      name: metric.name,
      tier: metric.tier,
      gate: metric.gate,
      runner: metric.runner,
      hardGate: metric.hardGate,
    })),
  }));
}

function summarizeExecutionPlan(plan: PlanResponse | null) {
  if (!plan) {
    return null;
  }

  return {
    tier: plan.tier,
    scope: plan.scope,
    dimensionCount: plan.dimensionCount,
    metricCount: plan.metricCount,
    hardGateCount: plan.hardGateCount,
    runnerCounts: plan.runnerCounts,
    dimensions: plan.dimensions.slice(0, 8).map((dimension) => ({
      name: dimension.name,
      weight: dimension.weight,
      thresholdPass: dimension.thresholdPass,
      thresholdWarn: dimension.thresholdWarn,
      sourceFile: dimension.sourceFile,
      metrics: dimension.metrics.slice(0, 6).map((metric) => ({
        name: metric.name,
        tier: metric.tier,
        gate: metric.gate,
        runner: metric.runner,
        hardGate: metric.hardGate,
        executionScope: metric.executionScope,
      })),
    })),
  };
}

export function buildKanbanFitnessWorkbenchUserPrompt(input: {
  workspaceId: string;
  repoPath: string;
  repoLabel: string;
  branch?: string | null;
  runtimeFitness?: RuntimeFitnessStatusResponse | null;
  specFiles: FitnessSpecSummary[];
  plan: PlanResponse | null;
}): string {
  const context = {
    workspaceId: input.workspaceId,
    repoPath: input.repoPath,
    repoLabel: input.repoLabel,
    branch: input.branch ?? null,
    runtimeFitness: summarizeRuntimeFitness(input.runtimeFitness),
    specFiles: summarizeSpecFiles(input.specFiles),
    executionPlan: summarizeExecutionPlan(input.plan),
  };

  return [
    "Create an Entrix Fitness canvas for a Kanban popup.",
    "This canvas is only the left-side preview pane. The real live session/process pane exists outside the canvas on the right, so do not render chat logs, terminals, or fake agent transcripts.",
    "The layout must feel close to `/settings/harness?section=entrix-fitness`:",
    "- dense engineering workbench",
    "- source/file explorer area",
    "- detailed fitness file view",
    "- compact execution plan summary",
    "- repo/status badges at the top",
    "Popup constraints:",
    "- no outer app shell",
    "- no top navigation",
    "- no left global sidebar",
    "- no fake browser frame",
    "- designed to sit inside a modal around 1200x760",
    "- responsive down to narrow widths",
    "Visual direction:",
    "- serious engineering console",
    "- flat and minimal",
    "- no gradients, no emojis, no box shadows",
    "- avoid repeating identical cards everywhere",
    "- use accent color sparingly",
    "Data handling rules:",
    "- embed the provided data inline as constants",
    "- do not fetch anything",
    "- use the repo and fitness data below as the content source",
    "- if you import from @canvas-sdk, only use exports that exist in src/client/canvas-sdk/index.ts",
    "",
    "Structured context JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}
