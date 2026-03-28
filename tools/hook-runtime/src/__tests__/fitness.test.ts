import { describe, expect, it, vi } from "vitest";

import type { HookMetric } from "../metrics.js";

const runCommandMock = vi.hoisted(() => vi.fn());

vi.mock("../process.js", async () => {
  const actual = await vi.importActual<typeof import("../process.js")>("../process.js");
  return {
    ...actual,
    runCommand: runCommandMock,
  };
});

import { runMetric, summarizeFailures } from "../fitness.js";

function buildMetric(overrides: Partial<HookMetric> = {}): HookMetric {
  return {
    command: "fake-command",
    hardGate: true,
    name: "rust_test_pass",
    pattern: "test result: ok",
    sourceFile: "docs/fitness/unit-test.md",
    ...overrides,
  };
}

describe("runMetric", () => {
  it("fails when the command exits non-zero even if the pattern appears in output", async () => {
    runCommandMock.mockResolvedValueOnce({
      command: "fake-command",
      durationMs: 10,
      exitCode: 1,
      output: "test result: ok\nerror: later failure",
    });

    const result = await runMetric(buildMetric());

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("passes only when the command exits zero and the pattern matches", async () => {
    runCommandMock.mockResolvedValueOnce({
      command: "fake-command",
      durationMs: 10,
      exitCode: 0,
      output: "test result: ok",
    });

    const result = await runMetric(buildMetric());

    expect(result.passed).toBe(true);
  });
});

describe("summarizeFailures", () => {
  it("prefers vitest failed test names over generic error lines", () => {
    const results = [
      {
        durationMs: 25,
        exitCode: 1,
        metric: buildMetric({ name: "ts_test_pass" }),
        output: [
          "stdout | some.test.ts > prints an expected failure log",
          "Type error: Something else",
          "",
          " FAIL  tools/hook-runtime/src/__tests__/actual-broken.test.ts > actual broken case",
          "AssertionError: expected true to be false",
        ].join("\n"),
        passed: false,
      },
    ];

    const [summary] = summarizeFailures(results);

    expect(summary?.outputTail).toContain("FAIL  tools/hook-runtime/src/__tests__/actual-broken.test.ts > actual broken case");
    expect(summary?.outputTail).not.toContain("Type error: Something else");
  });

  it("extracts vitest failure headers from ansi-colored terminal output", () => {
    const results = [
      {
        durationMs: 25,
        exitCode: 1,
        metric: buildMetric({ name: "ts_test_pass" }),
        output: [
          "stdout | src/core/acp/__tests__/session-write-buffer.test.ts > SessionWriteBuffer > error handling > continues working after a persist failure",
          "stderr | src/core/kanban/__tests__/workflow-orchestrator-singleton.test.ts > workflow orchestrator singleton prompt path > falls back to session/prompt when agent message fails",
          "\u001b[31mFAIL\u001b[39m  src/core/acp/__tests__/actual-broken.test.ts > actual broken case",
          "AssertionError: expected true to be false",
        ].join("\n"),
        passed: false,
      },
    ];

    const [summary] = summarizeFailures(results);

    expect(summary?.outputTail).toContain("FAIL  src/core/acp/__tests__/actual-broken.test.ts > actual broken case");
    expect(summary?.outputTail).not.toContain("continues working after a persist failure");
    expect(summary?.outputTail).not.toContain("falls back to session/prompt when agent message fails");
  });
});
