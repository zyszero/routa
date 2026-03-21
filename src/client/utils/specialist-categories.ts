"use client";

export type SpecialistCategory = "all" | "kanban" | "team" | "custom";

export interface SpecialistCategoryOption {
  id: SpecialistCategory;
  label: string;
}

export const SPECIALIST_CATEGORY_OPTIONS: SpecialistCategoryOption[] = [
  { id: "kanban", label: "Kanban" },
  { id: "team", label: "Team" },
  { id: "custom", label: "Custom" },
  { id: "all", label: "All" },
];

export function getSpecialistCategory(id: string | undefined): Exclude<SpecialistCategory, "all"> {
  if (!id) return "custom";
  if (id.startsWith("kanban-")) return "kanban";
  if (id.startsWith("team-")) return "team";
  return "custom";
}

export function filterSpecialistsByCategory<T extends { id: string }>(
  specialists: T[],
  category: SpecialistCategory,
): T[] {
  if (category === "all") return specialists;
  return specialists.filter((specialist) => getSpecialistCategory(specialist.id) === category);
}
