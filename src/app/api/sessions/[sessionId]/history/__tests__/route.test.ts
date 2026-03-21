import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getHistory,
  getSession,
  pushNotificationToHistory,
  loadHistoryFromDb,
  normalizeSessionHistory,
  consolidateMessageHistory,
} = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getSession: vi.fn(),
  pushNotificationToHistory: vi.fn(),
  loadHistoryFromDb: vi.fn(),
  normalizeSessionHistory: vi.fn(<T>(history: T[]) => history),
  consolidateMessageHistory: vi.fn(<T>(history: T[]) => history),
}));

vi.mock("@/core/acp/http-session-store", () => ({
  getHttpSessionStore: () => ({
    getHistory,
    getSession,
    pushNotificationToHistory,
  }),
  consolidateMessageHistory,
}));

vi.mock("@/core/acp/session-db-persister", () => ({
  loadHistoryFromDb,
  normalizeSessionHistory,
}));

import { GET } from "../route";

describe("/api/sessions/[sessionId]/history GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockReturnValue({ cwd: "/tmp/project" });
  });

  it("prefers fuller DB history when in-memory history is trimmed and has no overlap", async () => {
    getHistory.mockReturnValue([
      { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { text: "chunk-1" } } },
      { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { text: "chunk-2" } } },
    ]);
    loadHistoryFromDb.mockResolvedValue([
      { sessionId: "s1", update: { sessionUpdate: "user_message", content: { text: "prompt" } } },
      { sessionId: "s1", update: { sessionUpdate: "tool_call_update", title: "delegate_task" } },
      { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { text: "chunk-1" } }, extra: true },
      { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { text: "chunk-2" } }, extra: true },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/sessions/s1/history"),
      { params: Promise.resolve({ sessionId: "s1" }) },
    );
    const data = await response.json();

    expect(data.history).toEqual([
      { sessionId: "s1", update: { sessionUpdate: "user_message", content: { text: "prompt" } } },
      { sessionId: "s1", update: { sessionUpdate: "tool_call_update", title: "delegate_task" } },
      { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { text: "chunk-1" } }, extra: true },
      { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { text: "chunk-2" } }, extra: true },
    ]);
  });

  it("prepends DB prefix when overlap with in-memory history is found", async () => {
    const inMemory = [
      { sessionId: "s1", update: { sessionUpdate: "tool_call_update", title: "delegate_task" } },
      { sessionId: "s1", update: { sessionUpdate: "agent_message", content: { text: "done" } } },
    ];
    getHistory.mockReturnValue(inMemory);
    loadHistoryFromDb.mockResolvedValue([
      { sessionId: "s1", update: { sessionUpdate: "user_message", content: { text: "prompt" } } },
      ...inMemory,
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/sessions/s1/history?consolidated=true"),
      { params: Promise.resolve({ sessionId: "s1" }) },
    );
    const data = await response.json();

    expect(consolidateMessageHistory).toHaveBeenCalledWith([
      { sessionId: "s1", update: { sessionUpdate: "user_message", content: { text: "prompt" } } },
      ...inMemory,
    ]);
    expect(data.history).toEqual([
      { sessionId: "s1", update: { sessionUpdate: "user_message", content: { text: "prompt" } } },
      ...inMemory,
    ]);
  });
});
