import type { TaskAdaptiveHarnessTaskType } from "@/core/harness/task-adaptive";
import type { TaskContextSearchSpec } from "@/core/models/task";

type TaskAdaptiveSource = {
  title: string;
  columnId?: string;
  assignedRole?: string;
  triggerSessionId?: string;
  sessionIds?: string[];
  laneSessions?: Array<{ sessionId: string }>;
  contextSearchSpec?: TaskContextSearchSpec;
};

export interface KanbanTaskAdaptiveHarnessOptions {
  taskLabel?: string;
  locale?: string;
  query?: string;
  featureIds?: string[];
  filePaths?: string[];
  routeCandidates?: string[];
  apiCandidates?: string[];
  historySessionIds?: string[];
  moduleHints?: string[];
  symptomHints?: string[];
  taskType?: TaskAdaptiveHarnessTaskType;
  role?: string;
}

function uniqueNonEmptyStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function collectContextSearchFeatureIds(task: TaskAdaptiveSource | null | undefined): string[] | undefined {
  const featureIds = uniqueNonEmptyStrings(task?.contextSearchSpec?.featureCandidates ?? []);
  return featureIds.length > 0 ? featureIds : undefined;
}

function collectContextSearchFilePaths(task: TaskAdaptiveSource | null | undefined): string[] | undefined {
  const filePaths = uniqueNonEmptyStrings(task?.contextSearchSpec?.relatedFiles ?? []);
  return filePaths.length > 0 ? filePaths : undefined;
}

function collectContextSearchRoutes(task: TaskAdaptiveSource | null | undefined): string[] | undefined {
  const routeCandidates = uniqueNonEmptyStrings(task?.contextSearchSpec?.routeCandidates ?? []);
  return routeCandidates.length > 0 ? routeCandidates : undefined;
}

function collectContextSearchApis(task: TaskAdaptiveSource | null | undefined): string[] | undefined {
  const apiCandidates = uniqueNonEmptyStrings(task?.contextSearchSpec?.apiCandidates ?? []);
  return apiCandidates.length > 0 ? apiCandidates : undefined;
}

function collectContextSearchModules(task: TaskAdaptiveSource | null | undefined): string[] | undefined {
  const moduleHints = uniqueNonEmptyStrings(task?.contextSearchSpec?.moduleHints ?? []);
  return moduleHints.length > 0 ? moduleHints : undefined;
}

function collectContextSearchSymptoms(task: TaskAdaptiveSource | null | undefined): string[] | undefined {
  const symptomHints = uniqueNonEmptyStrings(task?.contextSearchSpec?.symptomHints ?? []);
  return symptomHints.length > 0 ? symptomHints : undefined;
}

function resolveContextSearchQuery(task: TaskAdaptiveSource | null | undefined): string | undefined {
  const query = task?.contextSearchSpec?.query?.trim();
  if (query) {
    return query;
  }

  const title = task?.title?.trim();
  return title ? title : undefined;
}

export function collectKanbanTaskHistorySessionIds(task: TaskAdaptiveSource | null | undefined): string[] | undefined {
  if (!task) {
    return undefined;
  }

  const historySessionIds = uniqueNonEmptyStrings([
    task.triggerSessionId,
    ...(task.sessionIds ?? []),
    ...((task.laneSessions ?? []).map((session) => session.sessionId)),
  ]);

  return historySessionIds.length > 0 ? historySessionIds : undefined;
}

export function resolveKanbanTaskAdaptiveTaskType(
  columnId: string | undefined,
): TaskAdaptiveHarnessTaskType {
  switch (columnId) {
    case "backlog":
    case "todo":
      return "planning";
    case "review":
      return "review";
    default:
      return "implementation";
  }
}

export function buildKanbanTaskAdaptiveHarnessOptions(
  promptLabel: string,
  options: {
    locale?: string;
    role?: string;
    taskType?: TaskAdaptiveHarnessTaskType;
    task?: TaskAdaptiveSource | null;
  },
): KanbanTaskAdaptiveHarnessOptions {
  return {
    taskLabel: options.task?.title ?? promptLabel.trim(),
    query: resolveContextSearchQuery(options.task),
    featureIds: collectContextSearchFeatureIds(options.task),
    filePaths: collectContextSearchFilePaths(options.task),
    routeCandidates: collectContextSearchRoutes(options.task),
    apiCandidates: collectContextSearchApis(options.task),
    historySessionIds: collectKanbanTaskHistorySessionIds(options.task),
    moduleHints: collectContextSearchModules(options.task),
    symptomHints: collectContextSearchSymptoms(options.task),
    taskType: options.taskType ?? resolveKanbanTaskAdaptiveTaskType(options.task?.columnId),
    locale: options.locale,
    role: options.role ?? options.task?.assignedRole,
  };
}
