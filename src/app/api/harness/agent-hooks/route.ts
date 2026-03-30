import { promises as fsp } from "fs";
import * as fs from "fs";
import yaml from "js-yaml";
import * as path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  parseContext,
  resolveRepoRoot,
  isContextError,
} from "../hooks/shared";

const KNOWN_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
]);

const BLOCKABLE_EVENTS = new Set([
  "PreToolUse",
  "UserPromptSubmit",
]);

const KNOWN_TYPES = new Set(["command", "http", "prompt"]);

type AgentHookConfigRaw = {
  event?: string;
  matcher?: string;
  type?: string;
  command?: string;
  url?: string;
  prompt?: string;
  timeout?: unknown;
  blocking?: unknown;
  description?: string;
};

type AgentHookConfigFile = {
  schema?: string;
  hooks?: AgentHookConfigRaw[];
};

type AgentHookConfigSummary = {
  event: string;
  matcher?: string;
  type: string;
  command?: string;
  url?: string;
  prompt?: string;
  timeout: number;
  blocking: boolean;
  description?: string;
};

type AgentHooksResponse = {
  generatedAt: string;
  repoRoot: string;
  configFile: {
    relativePath: string;
    source: string;
    schema?: string;
  } | null;
  hooks: AgentHookConfigSummary[];
  warnings: string[];
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeTimeout(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 10;
}

function normalizeBlocking(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
}

export async function GET(request: NextRequest) {
  const context = parseContext(request.nextUrl.searchParams);
  let repoRoot: string;
  try {
    repoRoot = await resolveRepoRoot(context);
  } catch (resolveError) {
    const message = toMessage(resolveError);
    const status = isContextError(message) ? 400 : 500;
    return NextResponse.json({ error: "resolve_failed", details: message }, { status });
  }

  const configPath = path.join(repoRoot, "docs", "fitness", "runtime", "agent-hooks.yaml");
  const warnings: string[] = [];

  if (!fs.existsSync(configPath)) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      repoRoot,
      configFile: null,
      hooks: [],
      warnings: ["Missing docs/fitness/runtime/agent-hooks.yaml — no agent hooks configured."],
    } satisfies AgentHooksResponse);
  }

  let rawSource: string;
  try {
    rawSource = await fsp.readFile(configPath, "utf-8");
  } catch (readError) {
    return NextResponse.json(
      { error: "read_failed", details: toMessage(readError) },
      { status: 500 },
    );
  }

  let parsed: AgentHookConfigFile;
  try {
    parsed = (yaml.load(rawSource) ?? {}) as AgentHookConfigFile;
  } catch (parseError) {
    return NextResponse.json(
      { error: "parse_failed", details: `Invalid YAML: ${toMessage(parseError)}` },
      { status: 500 },
    );
  }

  const rawHooks = Array.isArray(parsed.hooks) ? parsed.hooks : [];
  const hooks: AgentHookConfigSummary[] = [];

  for (const raw of rawHooks) {
    const event = typeof raw.event === "string" ? raw.event.trim() : "";
    if (!event) {
      warnings.push("Skipped hook entry with missing event field.");
      continue;
    }
    if (!KNOWN_EVENTS.has(event)) {
      warnings.push(`Unknown agent hook event: "${event}". Known events: ${[...KNOWN_EVENTS].join(", ")}.`);
      continue;
    }

    const hookType = typeof raw.type === "string" ? raw.type.trim() : "command";
    if (!KNOWN_TYPES.has(hookType)) {
      warnings.push(`Unknown hook type "${hookType}" for event "${event}". Known types: ${[...KNOWN_TYPES].join(", ")}.`);
      continue;
    }

    const blocking = normalizeBlocking(raw.blocking);
    if (blocking && !BLOCKABLE_EVENTS.has(event)) {
      warnings.push(`Event "${event}" does not support blocking. Setting blocking to false.`);
    }
    const effectiveBlocking = blocking && BLOCKABLE_EVENTS.has(event);

    hooks.push({
      event,
      matcher: typeof raw.matcher === "string" && raw.matcher.trim().length > 0 ? raw.matcher.trim() : undefined,
      type: hookType,
      command: typeof raw.command === "string" ? raw.command : undefined,
      url: typeof raw.url === "string" ? raw.url : undefined,
      prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
      timeout: normalizeTimeout(raw.timeout),
      blocking: effectiveBlocking,
      description: typeof raw.description === "string" ? raw.description : undefined,
    });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    repoRoot,
    configFile: {
      relativePath: "docs/fitness/runtime/agent-hooks.yaml",
      source: rawSource,
      schema: typeof parsed.schema === "string" ? parsed.schema : undefined,
    },
    hooks,
    warnings,
  } satisfies AgentHooksResponse);
}
