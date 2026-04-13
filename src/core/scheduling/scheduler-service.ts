/**
 * SchedulerService — in-process cron scheduler for the local Node.js backend.
 *
 * Uses node-cron to tick every minute and call the /api/schedules/tick endpoint.
 * Only active outside Vercel production.
 *
 * In production on Vercel, the tick is handled by Vercel Cron Jobs instead.
 */

import nodeCron from "node-cron";
import type { ScheduledTask } from "node-cron";

import { runWithSpan } from "../telemetry/tracing";

let schedulerTask: ScheduledTask | null = null;
let isStarted = false;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export function resolveSchedulerTickUrl(): string {
  const configuredOrigin = process.env.ROUTA_INTERNAL_API_ORIGIN
    ?? process.env.ROUTA_BASE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (configuredOrigin) {
    return `${stripTrailingSlash(configuredOrigin)}/api/schedules/tick`;
  }

  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}/api/schedules/tick`;
}

export function startSchedulerService(): void {
  if (isStarted) return;

  // Only start in-process scheduler outside Vercel production
  const isVercelProduction =
    process.env.VERCEL === "1" && process.env.NODE_ENV === "production";
  if (isVercelProduction) {
    console.log("[Scheduler] Skipping in-process scheduler (Vercel handles crons)");
    return;
  }

  console.log("[Scheduler] Starting in-process cron scheduler (every minute)");
  const tickUrl = resolveSchedulerTickUrl();

  schedulerTask = nodeCron.schedule("* * * * *", () => {
    void runWithSpan(
      "routa.scheduler.tick_cycle",
      {
        attributes: {
          "routa.scheduler.tick_url": tickUrl,
        },
      },
      async (span) => {
        const resp = await fetch(tickUrl, { method: "POST" });
        span.setAttribute("http.response.status_code", resp.status);

        if (!resp.ok) {
          const body = await resp.text();
          span.setAttribute("routa.scheduler.tick_failed", true);
          console.error("[Scheduler] Tick failed:", resp.status, body);
          return;
        }

        const data = (await resp.json()) as {
          fired?: number;
          scheduleIds?: string[];
        };
        const firedCount = Number(data.fired ?? 0);
        span.setAttribute("routa.schedules.fired_count", firedCount);

        if (firedCount > 0) {
          console.log(`[Scheduler] Tick fired ${firedCount} schedule(s): ${data.scheduleIds?.join(", ")}`);
        }
      },
    ).catch(() => {
      // Server may not be ready yet during cold start — silently ignore
    });
  });

  isStarted = true;
}

export function stopSchedulerService(): void {
  schedulerTask?.stop();
  schedulerTask = null;
  isStarted = false;
}
