import { describe, expect, it, vi } from "vitest";

import { AcpProcess } from "../acp-process";

describe("AcpProcess codex permission handling", () => {
  function createProcess(onNotification = vi.fn()) {
    return new AcpProcess({
      command: "codex-acp",
      args: [],
      cwd: "/tmp",
      displayName: "Codex",
    }, onNotification);
  }

  it("auto-approves codex permission requests even without explicit session auto-approval", () => {
    const onNotification = vi.fn();
    const process = createProcess(onNotification);
    const writeMessage = vi.fn();

    process.setSessionContext({
      sessionId: "session-1",
      provider: "codex",
      role: "CRAFTER",
    });

    (process as any).writeMessage = writeMessage;
    (process as any).handleAgentRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "session/request_permission",
      params: {
        permissions: {
          file_system: {
            write: ["/tmp/outside"],
          },
        },
      },
    });

    expect(writeMessage).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      id: 7,
      result: {
        permissions: {
          file_system: {
            write: ["/tmp/outside"],
          },
        },
        scope: "turn",
        outcome: "approved",
      },
    });
    expect(onNotification).toHaveBeenCalledWith(expect.objectContaining({
      method: "session/update",
      params: expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: "tool_call_update",
          status: "completed",
          kind: "request-permissions",
        }),
      }),
    }));
  });

  it("keeps non-codex permission requests interactive unless auto-approval is enabled", () => {
    const onNotification = vi.fn();
    const process = new AcpProcess({
      command: "opencode",
      args: [],
      cwd: "/tmp",
      displayName: "OpenCode",
    }, onNotification);
    const writeMessage = vi.fn();

    process.setSessionContext({
      sessionId: "session-2",
      provider: "opencode",
      role: "CRAFTER",
    });

    (process as any).writeMessage = writeMessage;
    (process as any).handleAgentRequest({
      jsonrpc: "2.0",
      id: 8,
      method: "session/request_permission",
      params: {
        permissions: {
          file_system: {
            write: ["/tmp/outside"],
          },
        },
      },
    });

    expect(writeMessage).not.toHaveBeenCalled();
    expect(onNotification).toHaveBeenCalledWith(expect.objectContaining({
      method: "session/update",
      params: expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: "tool_call",
          status: "waiting",
          kind: "request-permissions",
        }),
      }),
    }));
  });
});
