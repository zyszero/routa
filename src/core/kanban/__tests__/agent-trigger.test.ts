import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTaskPrompt, resolveKanbanAutomationProvider } from "../agent-trigger";
import { createTask } from "../../models/task";

vi.mock("../../acp/claude-code-sdk-adapter", () => ({
  isClaudeCodeSdkConfigured: vi.fn(),
}));

import { isClaudeCodeSdkConfigured } from "../../acp/claude-code-sdk-adapter";

describe("buildTaskPrompt", () => {
  it("keeps backlog automation in planning mode", () => {
    const task = createTask({
      id: "task-1",
      title: "echo hello world",
      objective: "echo hello world",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "backlog",
    });

    const prompt = buildTaskPrompt(task);

    expect(prompt).toContain("Treat backlog as planning and refinement, not implementation");
    expect(prompt).toContain("move_card");
    expect(prompt).toContain("Do NOT create or sync GitHub issues during backlog planning.");
    expect(prompt).toContain("Do not use native tools such as Bash, Read, Write, Edit, Glob, or Grep in backlog planning");
    expect(prompt).toContain("decompose_tasks");
    expect(prompt).not.toContain("Complete the work assigned to this column stage");
  });

  it("keeps dev automation in implementation mode", () => {
    const task = createTask({
      id: "task-2",
      title: "Implement login form",
      objective: "Build the login screen",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "dev",
    });

    const prompt = buildTaskPrompt(task);

    expect(prompt).toContain("Complete the work assigned to this column stage");
    expect(prompt).toContain("move_card");
    expect(prompt).toContain("targetColumnId: \"review\"");
    expect(prompt).toContain("Do not call `report_to_parent`");
    expect(prompt).not.toContain("Tool: report_to_parent");
  });

  it("injects required artifact gates from the next transition into the prompt", () => {
    const task = createTask({
      id: "task-3",
      title: "Ship review-ready change",
      objective: "Implement and verify the change",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "dev",
    });

    const prompt = buildTaskPrompt(task, [
      { id: "dev", name: "Dev", position: 0 },
      {
        id: "review",
        name: "Review",
        position: 1,
        automation: {
          enabled: true,
          requiredArtifacts: ["screenshot", "test_results"],
        },
      },
      { id: "done", name: "Done", position: 2 },
    ]);

    expect(prompt).toContain("## Artifact Gates");
    expect(prompt).toContain("Moving this card to Review requires Screenshot, Test Results.");
    expect(prompt).toContain("Before you call `move_card`, make sure Screenshot, Test Results exist as artifacts");
    expect(prompt).toContain("Use `list_artifacts`");
    expect(prompt).toContain("provide_artifact");
    expect(prompt).toContain("capture_screenshot");
  });
});

describe("resolveKanbanAutomationProvider", () => {
  afterEach(() => {
    vi.mocked(isClaudeCodeSdkConfigured).mockReset();
  });

  it("falls back to the Claude SDK when automation targets claude and the SDK is configured", () => {
    vi.mocked(isClaudeCodeSdkConfigured).mockReturnValue(true);

    expect(resolveKanbanAutomationProvider("claude")).toBe("claude-code-sdk");
  });

  it("preserves the configured provider when no Claude SDK fallback is needed", () => {
    vi.mocked(isClaudeCodeSdkConfigured).mockReturnValue(false);

    expect(resolveKanbanAutomationProvider("claude")).toBe("claude");
    expect(resolveKanbanAutomationProvider("codex")).toBe("codex");
    expect(resolveKanbanAutomationProvider(undefined)).toBe("opencode");
  });
});
