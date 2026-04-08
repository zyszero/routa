import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanTaskChangesTab } from "../kanban-task-changes-tab";

const desktopAwareFetch = vi.fn();

vi.mock("@/client/utils/diagnostics", () => ({
  desktopAwareFetch: (...args: unknown[]) => desktopAwareFetch(...args),
}));

describe("KanbanTaskChangesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders and triggers the PR specialist action for GitHub repositories", async () => {
    desktopAwareFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        changes: {
          codebaseId: "codebase-1",
          repoPath: "/repo",
          label: "platform",
          branch: "feature/pr",
          status: { clean: true, ahead: 1, behind: 0, modified: 0, untracked: 0 },
          files: [{ path: "src/app.tsx", status: "modified" }],
          commits: [],
          source: "repo",
          remoteUrl: "git@github.com:acme/platform.git",
        },
      }),
    });

    const onRunPullRequest = vi.fn().mockResolvedValue("session-pr-1");
    const onSelectSession = vi.fn();

    render(
      <KanbanTaskChangesTab
        task={{
          id: "task-1",
          title: "Publish PR",
          status: "COMPLETED",
          comments: [],
          labels: [],
          dependencies: [],
          codebaseIds: ["codebase-1"],
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        }}
        codebases={[{
          id: "codebase-1",
          workspaceId: "workspace-1",
          repoPath: "/repo",
          isDefault: true,
          sourceType: "github",
          sourceUrl: "https://github.com/acme/platform",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        }]}
        taskId="task-1"
        workspaceId="workspace-1"
        onRefresh={vi.fn()}
        onRunPullRequest={onRunPullRequest}
        onSelectSession={onSelectSession}
      />
    );

    expect(await screen.findByText(/PR specialist/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /open pr session/i }));

    await waitFor(() => {
      expect(onRunPullRequest).toHaveBeenCalledWith("task-1");
      expect(onSelectSession).toHaveBeenCalledWith("session-pr-1");
    });
  });
});
