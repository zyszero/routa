import type { KanbanColumnAutomation } from "../models/kanban";

type TaskAutomationFields = {
  columnId?: string;
  assignedProvider?: string;
  assignedRole?: string;
  assignedSpecialistId?: string;
  assignedSpecialistName?: string;
};

type ColumnAutomationFields = {
  id: string;
  automation?: KanbanColumnAutomation;
};

export interface EffectiveTaskAutomation {
  canRun: boolean;
  source: "card" | "lane" | "none";
  laneAutomation?: KanbanColumnAutomation;
  providerId?: string;
  role?: string;
  specialistId?: string;
  specialistName?: string;
}

export function resolveEffectiveTaskAutomation(
  task: TaskAutomationFields,
  boardColumns: ColumnAutomationFields[] = [],
): EffectiveTaskAutomation {
  const currentColumnId = task.columnId ?? "backlog";
  const laneAutomation = boardColumns.find((column) => column.id === currentColumnId)?.automation;
  const enabledLaneAutomation = laneAutomation?.enabled ? laneAutomation : undefined;
  const hasCardOverride = Boolean(
    task.assignedProvider
      || task.assignedRole
      || task.assignedSpecialistId
      || task.assignedSpecialistName,
  );
  const canRun = hasCardOverride || Boolean(enabledLaneAutomation);

  return {
    canRun,
    source: hasCardOverride ? "card" : enabledLaneAutomation ? "lane" : "none",
    laneAutomation: enabledLaneAutomation,
    providerId: task.assignedProvider ?? enabledLaneAutomation?.providerId,
    role: task.assignedRole ?? enabledLaneAutomation?.role ?? (canRun ? "DEVELOPER" : undefined),
    specialistId: task.assignedSpecialistId ?? enabledLaneAutomation?.specialistId,
    specialistName: task.assignedSpecialistName ?? enabledLaneAutomation?.specialistName,
  };
}
