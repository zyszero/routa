import { describe, expect, it, vi } from "vitest";

import { runHookRuntime, type HookRuntimeOptions, type HookRuntimeProfile, type ReviewPhaseResult } from "../runtime.js";

describe("runHookRuntime", () => {
  it("executes phases strictly by profile order through adapters", async () => {
    const options = {
      autoFix: false,
      dryRun: false,
      failFast: true,
      jobs: 2,
      metricNames: ["eslint_pass"],
      outputMode: "human" as const,
      profile: "local-validate",
      tailLines: 10,
    } satisfies HookRuntimeOptions;

    const profile: HookRuntimeProfile = {
      fallbackMetrics: ["eslint_pass"],
      name: "local-validate",
      phases: ["fitness", "review"],
    };

    const reviewResult: ReviewPhaseResult = {
      allowed: true,
      base: "origin/main",
      bypassed: false,
      changedFiles: 0,
      diffFileCount: 0,
      message: "review passed",
      status: "passed",
      triggers: [],
    };

    const runSubmodulePhase = vi.fn();
    const runFitnessPhase = vi.fn(async () => []);
    const runReviewPhase = vi.fn(async () => reviewResult);

    await runHookRuntime(
      options,
      profile,
      {
        runSubmodulePhase,
        runFitnessPhase,
        runReviewPhase,
      },
    );

    expect(runFitnessPhase).toHaveBeenCalledTimes(1);
    expect(runFitnessPhase).toHaveBeenCalledWith(options, 1, 2);
    expect(runReviewPhase).toHaveBeenCalledTimes(1);
    expect(runReviewPhase).toHaveBeenCalledWith(false, "human", 2, 2);
    expect(runSubmodulePhase).not.toHaveBeenCalled();
  });
});

