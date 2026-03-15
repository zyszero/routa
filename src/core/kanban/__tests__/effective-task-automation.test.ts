import { describe, expect, it } from "vitest";
import { resolveEffectiveTaskAutomation } from "../effective-task-automation";

describe("resolveEffectiveTaskAutomation", () => {
  it("falls back to the current lane automation when the card has no override", () => {
    const resolved = resolveEffectiveTaskAutomation(
      {
        columnId: "backlog",
      },
      [
        {
          id: "backlog",
          automation: {
            enabled: true,
            providerId: "claude",
            role: "ROUTA",
            specialistId: "backlog-refiner",
            specialistName: "Backlog Refiner",
          },
        },
      ],
    );

    expect(resolved.canRun).toBe(true);
    expect(resolved.source).toBe("lane");
    expect(resolved.providerId).toBe("claude");
    expect(resolved.role).toBe("ROUTA");
    expect(resolved.specialistId).toBe("backlog-refiner");
    expect(resolved.specialistName).toBe("Backlog Refiner");
  });

  it("prefers explicit card overrides over lane defaults", () => {
    const resolved = resolveEffectiveTaskAutomation(
      {
        columnId: "backlog",
        assignedProvider: "codex",
        assignedRole: "DEVELOPER",
        assignedSpecialistId: "implementor",
        assignedSpecialistName: "Implementor",
      },
      [
        {
          id: "backlog",
          automation: {
            enabled: true,
            providerId: "claude",
            role: "ROUTA",
            specialistId: "backlog-refiner",
            specialistName: "Backlog Refiner",
          },
        },
      ],
    );

    expect(resolved.canRun).toBe(true);
    expect(resolved.source).toBe("card");
    expect(resolved.providerId).toBe("codex");
    expect(resolved.role).toBe("DEVELOPER");
    expect(resolved.specialistId).toBe("implementor");
    expect(resolved.specialistName).toBe("Implementor");
  });

  it("returns no runnable automation when neither the card nor lane is configured", () => {
    const resolved = resolveEffectiveTaskAutomation(
      {
        columnId: "backlog",
      },
      [
        {
          id: "backlog",
          automation: {
            enabled: false,
            providerId: "claude",
          },
        },
      ],
    );

    expect(resolved.canRun).toBe(false);
    expect(resolved.source).toBe("none");
    expect(resolved.providerId).toBeUndefined();
    expect(resolved.role).toBeUndefined();
  });
});
