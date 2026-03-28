import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getHttpSessionStore,
  getSessionRoutingRecord,
  getRequiredRunnerUrl,
  isForwardedAcpRequest,
  proxyRequestToRunner,
  runnerUnavailableResponse,
  loadHistorySinceEventIdFromDb,
} = vi.hoisted(() => {
  const store = {
    attachSse: vi.fn(),
    pushConnected: vi.fn(),
    detachSse: vi.fn(),
    flushAgentBuffer: vi.fn(),
    getSession: vi.fn(),
  };

  return {
    getHttpSessionStore: vi.fn(() => store),
    getSessionRoutingRecord: vi.fn(),
    getRequiredRunnerUrl: vi.fn(),
    isForwardedAcpRequest: vi.fn(),
    proxyRequestToRunner: vi.fn(),
    runnerUnavailableResponse: vi.fn(),
    loadHistorySinceEventIdFromDb: vi.fn(),
  };
});

vi.mock("@/core/acp/http-session-store", () => ({
  getHttpSessionStore,
}));

vi.mock("@/core/acp/runner-routing", () => ({
  getSessionRoutingRecord,
  getRequiredRunnerUrl,
  isForwardedAcpRequest,
  proxyRequestToRunner,
  runnerUnavailableResponse,
}));

vi.mock("@/core/acp/session-db-persister", async () => {
  const actual = await vi.importActual<typeof import("@/core/acp/session-db-persister")>(
    "@/core/acp/session-db-persister",
  );
  return {
    ...actual,
    loadHistorySinceEventIdFromDb,
  };
});

import { GET, POST } from "../route";

async function readStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    result += decoder.decode(chunk.value, { stream: true });
    if (result.includes("data: ")) {
      break;
    }
  }

  reader.cancel().catch(() => {});
  return result;
}

describe("/api/acp GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isForwardedAcpRequest.mockReturnValue(false);
    getSessionRoutingRecord.mockResolvedValue(undefined);
    getRequiredRunnerUrl.mockReturnValue(null);
    runnerUnavailableResponse.mockReturnValue(new Response("runner unavailable", { status: 503 }));
    proxyRequestToRunner.mockResolvedValue(new Response("proxied", { status: 200 }));
    loadHistorySinceEventIdFromDb.mockResolvedValue([]);

    const store = getHttpSessionStore();
    store.attachSse.mockReset();
    store.pushConnected.mockReset();
    store.detachSse.mockReset();
    store.flushAgentBuffer.mockReset();
    store.getSession.mockReset();
    store.getSession.mockReturnValue({ cwd: "/tmp/session" });
  });

  it("replays events after lastEventId before attaching the live SSE stream", async () => {
    loadHistorySinceEventIdFromDb.mockResolvedValue([
      {
        sessionId: "session-1",
        eventId: "evt-2",
        update: { sessionUpdate: "agent_message", content: { type: "text", text: "replayed" } },
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/acp?sessionId=session-1&lastEventId=evt-1"),
    );
    const body = await readStream(response);

    expect(loadHistorySinceEventIdFromDb).toHaveBeenCalledWith("session-1", "evt-1", "/tmp/session");
    expect(body).toContain("id: evt-2");
    expect(body).toContain("\"sessionUpdate\":\"agent_message\"");
    expect(getHttpSessionStore().attachSse).toHaveBeenCalledWith(
      "session-1",
      expect.anything(),
      { skipPending: true },
    );
    expect(getHttpSessionStore().pushConnected).toHaveBeenCalledWith("session-1");
  });

  it("falls back to normal SSE attach when no replay tail exists", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/acp?sessionId=session-1"),
    );

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(getHttpSessionStore().attachSse).toHaveBeenCalledWith(
      "session-1",
      expect.anything(),
      { skipPending: false },
    );
  });

  it("rejects SSE attach when an embedded session is owned by another instance", async () => {
    getSessionRoutingRecord.mockResolvedValue({
      executionMode: "embedded",
      ownerInstanceId: "web-2",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/acp?sessionId=session-1"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("owned by instance web-2"),
      ownerInstanceId: "web-2",
    });
    expect(getHttpSessionStore().attachSse).not.toHaveBeenCalled();
  });
});

describe("/api/acp POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isForwardedAcpRequest.mockReturnValue(false);
    getRequiredRunnerUrl.mockReturnValue(null);
  });

  it("returns ACP capabilities for initialize before any process exists", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/acp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: 1 },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: false,
        },
        agentInfo: {
          name: "routa-acp",
          version: "0.1.0",
        },
      },
    });
  });

  it("rejects session/new when workspaceId is missing", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/acp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "session/new",
          params: {
            provider: "opencode",
            cwd: "/tmp/project",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      error: {
        code: -32602,
        message: "workspaceId is required",
      },
    });
  });

  it("rejects prompt methods when an embedded session is owned by another instance", async () => {
    getRequiredRunnerUrl.mockReturnValue("http://runner.internal");
    getSessionRoutingRecord.mockResolvedValue({
      executionMode: "embedded",
      ownerInstanceId: "web-2",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/acp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "session/prompt",
          params: {
            sessionId: "session-1",
            prompt: {
              role: "user",
              content: [{ type: "text", text: "hello" }],
            },
          },
        }),
      }),
    );

    expect(proxyRequestToRunner).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      error: {
        code: -32010,
        message: expect.stringContaining("owned by instance web-2"),
      },
    });
  });
});
