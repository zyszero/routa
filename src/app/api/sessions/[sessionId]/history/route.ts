/**
 * Session History API Route - /api/sessions/[sessionId]/history
 *
 * Returns the message history for a session, used when switching sessions
 * in the UI to restore the chat transcript.
 *
 * Query params:
 * - consolidated=true: Returns consolidated history (agent_message_chunk merged into agent_message)
 *
 * Falls back to DB when in-memory history is empty (serverless cold start).
 */

import { NextRequest, NextResponse } from "next/server";
import { getHttpSessionStore, consolidateMessageHistory } from "@/core/acp/http-session-store";
import { loadHistoryFromDb, normalizeSessionHistory } from "@/core/acp/session-db-persister";

export const dynamic = "force-dynamic";

function mergeHistorySources<T>(inMemoryHistory: T[], dbHistory: T[]): T[] {
  if (inMemoryHistory.length === 0) return dbHistory;
  if (dbHistory.length === 0) return inMemoryHistory;
  if (dbHistory.length <= inMemoryHistory.length) return inMemoryHistory;

  const firstInMemory = JSON.stringify(inMemoryHistory[0]);
  const overlapIndex = dbHistory.findIndex((entry) => JSON.stringify(entry) === firstInMemory);

  if (overlapIndex === -1) {
    return dbHistory;
  }

  if (overlapIndex === 0) {
    return dbHistory;
  }

  return [...dbHistory.slice(0, overlapIndex), ...inMemoryHistory];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const consolidated = request.nextUrl.searchParams.get("consolidated") === "true";

  const store = getHttpSessionStore();
  const inMemoryHistory = store.getHistory(sessionId);
  const sessionRecord = store.getSession(sessionId);

  // Always check DB — it may contain older entries that were trimmed from memory
  const dbHistory = await loadHistoryFromDb(sessionId, sessionRecord?.cwd);

  let history: typeof inMemoryHistory;

  if (inMemoryHistory.length === 0 && dbHistory.length > 0) {
    // Cold start: populate in-memory store from DB
    for (const notification of dbHistory) {
      store.pushNotificationToHistory(sessionId, notification);
    }
    history = dbHistory;
  } else if (dbHistory.length > inMemoryHistory.length) {
    history = mergeHistorySources(inMemoryHistory, dbHistory);
  } else {
    history = inMemoryHistory;
  }

  const result = normalizeSessionHistory(consolidated ? consolidateMessageHistory(history) : history);

  return NextResponse.json(
    { history: result },
    { headers: { "Cache-Control": "no-store" } }
  );
}
