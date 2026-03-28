import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../codemirror/code-viewer", () => ({
  CodeViewer: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import { HarnessGitHubActionsFlowPanel } from "../harness-github-actions-flow-panel";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

global.fetch = fetchMock as unknown as typeof fetch;

describe("HarnessGitHubActionsFlowPanel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        flows: [
          {
            id: "defense",
            name: "Defense",
            event: "pull_request",
            branch: "pull request refs",
            cadence: "On pull request",
            yaml: "name: Defense",
            jobs: [
              {
                id: "fitness-dimensions",
                name: "Fitness Dimensions",
                runner: "ubuntu-latest",
                status: "running",
                kind: "job",
                duration: "7 steps",
                summary: "7 steps in fitness-dimensions",
                needs: [],
              },
              {
                id: "review-context",
                name: "Review Context",
                runner: "ubuntu-latest",
                status: "ready",
                kind: "job",
                duration: "3 steps",
                summary: "3 steps in review-context",
                needs: ["fitness-dimensions"],
              },
            ],
          },
          {
            id: "release",
            name: "Routa Release",
            event: "workflow_dispatch",
            branch: "repository default",
            cadence: "Manual dispatch",
            yaml: "name: Routa Release",
            jobs: [
              {
                id: "resolve-version",
                name: "Resolve Version",
                runner: "ubuntu-latest",
                status: "running",
                kind: "job",
                duration: "2 steps",
                summary: "2 steps in resolve-version",
                needs: [],
              },
              {
                id: "publish",
                name: "Publish",
                runner: "ubuntu-latest",
                status: "ready",
                kind: "release",
                duration: "4 steps",
                summary: "4 steps in publish",
                needs: ["resolve-version"],
              },
            ],
          },
        ],
      }),
    });
  });

  it("loads mock flows and renders the default workflow canvas", async () => {
    render(
      <HarnessGitHubActionsFlowPanel
        workspaceId="workspace-1"
        codebaseId="codebase-1"
        repoPath="/tmp/repo"
        repoLabel="routa-js"
      />,
    );

    expect(screen.getByText("Loading GitHub Actions workflows...")).not.toBeNull();

    await waitFor(() => {
      expect(screen.getAllByText("Defense").length).toBeGreaterThan(0);
      expect(screen.getByText("Fitness Dimensions")).not.toBeNull();
    });
  });

  it("switches to another repository workflow and updates the graph", async () => {
    render(
      <HarnessGitHubActionsFlowPanel
        workspaceId="workspace-1"
        codebaseId="codebase-1"
        repoPath="/tmp/repo"
        repoLabel="routa-js"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Routa Release")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /Routa Release/i }));

    await waitFor(() => {
      expect(screen.getByText("Publish")).not.toBeNull();
      expect(screen.getAllByText("workflow_dispatch").length).toBeGreaterThan(0);
    });
  });
});
