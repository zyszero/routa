import type { ArtifactType } from "../models/artifact";

type ColumnWithArtifacts = {
  id: string;
  name?: string;
  position?: number;
  automation?: {
    requiredArtifacts?: ArtifactType[];
  };
};

const DEFAULT_KANBAN_COLUMN_ORDER = ["backlog", "todo", "dev", "review", "blocked", "done"];

const ARTIFACT_LABELS: Record<string, string> = {
  screenshot: "Screenshot",
  test_results: "Test Results",
  code_diff: "Code Diff",
  logs: "Logs",
};

export function formatArtifactLabel(artifact: string): string {
  return ARTIFACT_LABELS[artifact] ?? artifact;
}

export function formatArtifactSummary(artifacts?: string[]): string {
  if (!artifacts || artifacts.length === 0) return "None";
  return artifacts.map((artifact) => formatArtifactLabel(artifact)).join(", ");
}

export function resolveKanbanTransitionArtifacts(
  columns: ColumnWithArtifacts[],
  currentColumnId?: string,
): {
  currentColumn?: ColumnWithArtifacts;
  nextColumn?: ColumnWithArtifacts;
  currentRequiredArtifacts: ArtifactType[];
  nextRequiredArtifacts: ArtifactType[];
} {
  const orderedColumns = columns
    .slice()
    .sort((left, right) => {
      const leftPosition = typeof left.position === "number"
        ? left.position
        : DEFAULT_KANBAN_COLUMN_ORDER.indexOf(left.id);
      const rightPosition = typeof right.position === "number"
        ? right.position
        : DEFAULT_KANBAN_COLUMN_ORDER.indexOf(right.id);
      return leftPosition - rightPosition;
    });

  const resolvedCurrentColumnId = currentColumnId ?? "backlog";
  const currentIndex = orderedColumns.findIndex((column) => column.id === resolvedCurrentColumnId);
  const currentColumn = currentIndex >= 0 ? orderedColumns[currentIndex] : undefined;
  const nextColumn = currentIndex >= 0 && currentIndex < orderedColumns.length - 1
    ? orderedColumns[currentIndex + 1]
    : undefined;

  return {
    currentColumn,
    nextColumn,
    currentRequiredArtifacts: (currentColumn?.automation?.requiredArtifacts ?? []) as ArtifactType[],
    nextRequiredArtifacts: (nextColumn?.automation?.requiredArtifacts ?? []) as ArtifactType[],
  };
}
