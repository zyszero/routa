function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getToolEventName(update: Record<string, unknown>): string | undefined {
  return asNonEmptyString(update.tool)
    ?? asNonEmptyString(update.toolName)
    ?? asNonEmptyString(update.title)
    ?? asNonEmptyString(update.kind);
}

export function getToolEventLabel(update: Record<string, unknown>): string {
  return getToolEventName(update) ?? "tool";
}
