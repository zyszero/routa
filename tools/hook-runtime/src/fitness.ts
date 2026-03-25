import { HookMetric } from "./metrics.js";
import { runCommand, tailOutput } from "./process.js";

export type MetricExecution = {
  durationMs: number;
  metric: HookMetric;
  output: string;
  passed: boolean;
};

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function evaluateMetric(metric: HookMetric, exitCode: number, output: string): boolean {
  if (!metric.pattern) {
    return exitCode === 0;
  }

  const matcher = new RegExp(metric.pattern, "i");
  return matcher.test(output);
}

export async function runMetric(metric: HookMetric, index: number, total: number): Promise<MetricExecution> {
  console.log(`[fitness ${index}/${total}] ${metric.name}`);
  console.log(`  source: ${metric.sourceFile}`);
  if (metric.description) {
    console.log(`  note: ${metric.description}`);
  }
  console.log("");

  const result = await runCommand(metric.command);
  const passed = evaluateMetric(metric, result.exitCode, result.output);

  console.log("");
  console.log(
    `[fitness ${index}/${total}] ${metric.name} ${passed ? "PASS" : "FAIL"} in ${formatDuration(result.durationMs)}`,
  );
  console.log("");

  return {
    metric,
    durationMs: result.durationMs,
    passed,
    output: result.output,
  };
}

export function printFailureSummary(results: MetricExecution[]): void {
  const failures = results.filter((result) => !result.passed);
  if (failures.length === 0) {
    return;
  }

  console.log("===============================================================");
  console.log("Pre-push fitness checks failed");
  console.log("===============================================================");
  console.log("");

  for (const failure of failures) {
    console.log(`- ${failure.metric.name} (${(failure.durationMs / 1000).toFixed(1)}s)`);
    const snippet = tailOutput(failure.output).trim();
    if (snippet) {
      console.log(snippet);
      console.log("");
    }
  }
}
