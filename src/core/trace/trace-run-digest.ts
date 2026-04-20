/**
 * Trace Run Digest — Single-run trace state digest for specialist prompt injection.
 *
 * Reads trace records from the current (parent) session and produces a structured
 * digest that gives delegated specialists (GATE, CRAFTER) immediate awareness of
 * what has already happened in this run: files touched, tools used, errors hit, etc.
 *
 * This avoids the "cold start" problem where a specialist has no context about
 * prior work in the same coordination run.
 *
 * @see https://github.com/phodal/routa/issues/344
 */

import type { TraceRecord } from "./types";
import type { AgentRole } from "../models/agent";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FileDigestEntry {
  /** Relative file path */
  path: string;
  /** Operations performed (read, write, create, delete) */
  operations: string[];
}

export interface ToolCallDigestEntry {
  /** Tool name */
  name: string;
  /** Number of times called */
  count: number;
  /** Number of failures */
  failures: number;
}

export interface TraceRunDigest {
  /** Parent session ID this digest was built from */
  sessionId: string;
  /** Total number of trace events in the session */
  totalEvents: number;
  /** Files touched during the session, with operations */
  filesTouched: FileDigestEntry[];
  /** Tool usage summary */
  toolCalls: ToolCallDigestEntry[];
  /** Number of errors/failures observed */
  errorCount: number;
  /** Brief error summaries (max 5) */
  errorSummaries: string[];
  /** Key decisions or thoughts from the agent (max 3) */
  keyThoughts: string[];
  /** Timestamp of the first and last event */
  timeRange: { start: string; end: string } | null;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build a TraceRunDigest from a set of trace records (typically from the parent session).
 */
export function buildTraceRunDigest(
  sessionId: string,
  records: TraceRecord[],
): TraceRunDigest {
  const fileMap = new Map<string, Set<string>>();
  const toolMap = new Map<string, { count: number; failures: number }>();
  const errors: string[] = [];
  const thoughts: string[] = [];

  for (const record of records) {
    // Collect file operations
    if (record.files) {
      for (const file of record.files) {
        const ops = fileMap.get(file.path) ?? new Set<string>();
        if (file.operation) {
          ops.add(file.operation);
        }
        fileMap.set(file.path, ops);
      }
    }

    // Collect tool call stats
    if (record.tool && (record.eventType === "tool_call" || record.eventType === "tool_result")) {
      const existing = toolMap.get(record.tool.name) ?? { count: 0, failures: 0 };
      if (record.eventType === "tool_call") {
        existing.count++;
      }
      if (record.tool.status === "failed" || record.tool.status === "error") {
        existing.failures++;
        // Capture error summary
        if (errors.length < 5) {
          const output = record.tool.output;
          const summary = typeof output === "string"
            ? output.slice(0, 200)
            : typeof output === "object" && output !== null && "error" in output
              ? String((output as { error: unknown }).error).slice(0, 200)
              : `${record.tool.name} failed`;
          errors.push(summary);
        }
      }
      toolMap.set(record.tool.name, existing);
    }

    // Collect agent thoughts (key decisions)
    if (record.eventType === "agent_thought" && record.conversation?.contentPreview) {
      if (thoughts.length < 3) {
        thoughts.push(record.conversation.contentPreview.slice(0, 300));
      }
    }
  }

  // Build file digest entries
  const filesTouched: FileDigestEntry[] = Array.from(fileMap.entries())
    .map(([filePath, ops]) => ({
      path: filePath,
      operations: Array.from(ops),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  // Build tool call digest entries
  const toolCalls: ToolCallDigestEntry[] = Array.from(toolMap.entries())
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      failures: stats.failures,
    }))
    .sort((a, b) => b.count - a.count);

  // Time range
  const timestamps = records.map((r) => r.timestamp).filter(Boolean).sort();
  const timeRange = timestamps.length >= 2
    ? { start: timestamps[0], end: timestamps[timestamps.length - 1] }
    : timestamps.length === 1
      ? { start: timestamps[0], end: timestamps[0] }
      : null;

  const errorCount = toolCalls.reduce((sum, t) => sum + t.failures, 0);

  return {
    sessionId,
    totalEvents: records.length,
    filesTouched,
    toolCalls,
    errorCount,
    errorSummaries: errors,
    keyThoughts: thoughts,
    timeRange,
  };
}

// ─── Formatter ───────────────────────────────────────────────────────────────

const MAX_FILES_GATE = 30;
const MAX_FILES_CRAFTER = 15;
const MAX_TOOLS_DISPLAY = 10;

/**
 * Format a TraceRunDigest into a role-specific markdown section
 * suitable for injection into the delegation prompt's additionalContext.
 */
export function formatDigestForRole(
  digest: TraceRunDigest,
  role: AgentRole,
): string {
  if (digest.totalEvents === 0) {
    return "";
  }

  const sections: string[] = [];
  sections.push("## Prior Run Context (Trace Digest)");
  sections.push("");

  // For GATE: full verification evidence — all files, all errors, key thoughts
  // For CRAFTER: lightweight risk hints — modified files, error flags
  const isGate = role === "GATE";
  const maxFiles = isGate ? MAX_FILES_GATE : MAX_FILES_CRAFTER;

  // Files section
  if (digest.filesTouched.length > 0) {
    const fileLabel = isGate ? "Files Modified/Read" : "Files Changed";
    sections.push(`### ${fileLabel}`);

    const displayFiles = isGate
      ? digest.filesTouched
      : digest.filesTouched.filter((f) => f.operations.some((op) => op !== "read"));

    const limited = displayFiles.slice(0, maxFiles);
    for (const file of limited) {
      const opsStr = file.operations.length > 0 ? ` (${file.operations.join(", ")})` : "";
      sections.push(`- \`${file.path}\`${opsStr}`);
    }
    if (displayFiles.length > maxFiles) {
      sections.push(`- ... and ${displayFiles.length - maxFiles} more files`);
    }
    sections.push("");
  }

  // Tool usage section (GATE gets full detail, CRAFTER gets summary)
  if (digest.toolCalls.length > 0 && isGate) {
    sections.push("### Tool Usage");
    const limited = digest.toolCalls.slice(0, MAX_TOOLS_DISPLAY);
    for (const tool of limited) {
      const failStr = tool.failures > 0 ? ` (${tool.failures} failed)` : "";
      sections.push(`- ${tool.name}: ${tool.count} calls${failStr}`);
    }
    if (digest.toolCalls.length > MAX_TOOLS_DISPLAY) {
      sections.push(`- ... and ${digest.toolCalls.length - MAX_TOOLS_DISPLAY} more tools`);
    }
    sections.push("");
  }

  // Errors section
  if (digest.errorCount > 0) {
    sections.push(`### ${isGate ? "Errors Encountered" : "Error Flags"}`);
    sections.push(`Total failures: ${digest.errorCount}`);
    if (isGate && digest.errorSummaries.length > 0) {
      sections.push("");
      for (const err of digest.errorSummaries) {
        sections.push(`- ${err}`);
      }
    }
    sections.push("");
  }

  // Key thoughts (GATE only — helps verifier understand agent reasoning)
  if (isGate && digest.keyThoughts.length > 0) {
    sections.push("### Key Agent Reasoning");
    for (const thought of digest.keyThoughts) {
      sections.push(`> ${thought}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}
