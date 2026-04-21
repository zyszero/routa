import { describe, expect, it } from "vitest";
import { buildKanbanTaskAdaptiveHarnessOptions } from "../task-adaptive";

describe("buildKanbanTaskAdaptiveHarnessOptions", () => {
  it("forwards task context search spec into task-adaptive harness hints", () => {
    const options = buildKanbanTaskAdaptiveHarnessOptions("Fallback prompt", {
      locale: "en",
      role: "CRAFTER",
      task: {
        title: "Investigate JIT Context",
        columnId: "backlog",
        triggerSessionId: "session-1",
        contextSearchSpec: {
          query: "kanban jit context card detail",
          featureCandidates: ["kanban-workflow", "session-recovery"],
          relatedFiles: [
            "src/app/workspace/[workspaceId]/kanban/kanban-card-detail.tsx",
            "src/app/workspace/[workspaceId]/kanban/kanban-detail-panels.tsx",
          ],
          routeCandidates: ["/workspace/:workspaceId/kanban"],
          apiCandidates: ["POST /api/tasks"],
          moduleHints: ["kanban-card-detail"],
          symptomHints: ["operation not permitted"],
        },
      },
    });

    expect(options).toMatchObject({
      taskLabel: "Investigate JIT Context",
      query: "kanban jit context card detail",
      taskType: "planning",
      locale: "en",
      role: "CRAFTER",
      historySessionIds: ["session-1"],
      featureIds: ["kanban-workflow", "session-recovery"],
      filePaths: [
        "src/app/workspace/[workspaceId]/kanban/kanban-card-detail.tsx",
        "src/app/workspace/[workspaceId]/kanban/kanban-detail-panels.tsx",
      ],
      routeCandidates: ["/workspace/:workspaceId/kanban"],
      apiCandidates: ["POST /api/tasks"],
      moduleHints: ["kanban-card-detail"],
      symptomHints: ["operation not permitted"],
    });
  });

  it("falls back to the task title when no explicit context query exists", () => {
    const options = buildKanbanTaskAdaptiveHarnessOptions("Fallback prompt", {
      task: {
        title: "Fix Kanban card detail JIT context",
        columnId: "todo",
      },
    });

    expect(options).toMatchObject({
      taskLabel: "Fix Kanban card detail JIT context",
      query: "Fix Kanban card detail JIT context",
      taskType: "planning",
    });
  });
});
