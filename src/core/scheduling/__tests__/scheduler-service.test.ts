import { afterEach, describe, expect, it } from "vitest";

import { resolveSchedulerTickUrl } from "../scheduler-service";

const ENV_KEYS = [
  "PORT",
  "ROUTA_INTERNAL_API_ORIGIN",
  "ROUTA_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "VERCEL_URL",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

const ORIGINAL_ENV = ENV_KEYS.reduce(
  (acc, key) => {
    acc[key] = process.env[key];
    return acc;
  },
  {} as Record<EnvKey, string | undefined>,
);

function restoreOriginalEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function setEnv(overrides: Partial<Record<EnvKey, string>>): void {
  for (const key of ENV_KEYS) {
    if (key in overrides) {
      process.env[key] = overrides[key];
    } else {
      delete process.env[key];
    }
  }
}

describe("resolveSchedulerTickUrl", () => {
  afterEach(() => {
    restoreOriginalEnv();
  });

  it("falls back to local host when no origin is configured", () => {
    setEnv({ PORT: "3500" });

    expect(resolveSchedulerTickUrl()).toBe("http://127.0.0.1:3500/api/schedules/tick");
  });

  it("uses ROUTA_INTERNAL_API_ORIGIN when configured", () => {
    setEnv({
      ROUTA_INTERNAL_API_ORIGIN: "http://internal.example:3500/",
      ROUTA_BASE_URL: "http://base.example:3000/",
      NEXT_PUBLIC_APP_URL: "http://public.example",
      VERCEL_URL: "vercel.app",
      PORT: "3000",
    });

    expect(resolveSchedulerTickUrl()).toBe("http://internal.example:3500/api/schedules/tick");
  });

  it("falls back to ROUTA_BASE_URL after ROUTA_INTERNAL_API_ORIGIN", () => {
    setEnv({
      ROUTA_BASE_URL: "http://base.example:3100/",
      NEXT_PUBLIC_APP_URL: "http://public.example",
      PORT: "3000",
    });

    expect(resolveSchedulerTickUrl()).toBe("http://base.example:3100/api/schedules/tick");
  });

  it("falls back to NEXT_PUBLIC_APP_URL after ROUTA_INTERNAL_API_ORIGIN and ROUTA_BASE_URL", () => {
    setEnv({
      NEXT_PUBLIC_APP_URL: "http://public.example/",
      PORT: "3000",
    });

    expect(resolveSchedulerTickUrl()).toBe("http://public.example/api/schedules/tick");
  });

  it("falls back to VERCEL_URL after explicit app and base URLs", () => {
    setEnv({
      VERCEL_URL: "project.vercel.app",
      PORT: "3000",
    });

    expect(resolveSchedulerTickUrl()).toBe("https://project.vercel.app/api/schedules/tick");
  });
});
