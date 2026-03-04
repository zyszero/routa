/**
 * RoutaMcpServer - port of routa-core RoutaMcpServer.kt
 *
 * Creates and configures an MCP Server with all Routa coordination tools.
 * Equivalent to the Kotlin RoutaMcpServer.create() factory.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RoutaMcpToolManager, ToolMode } from "./routa-mcp-tool-manager";
import { RoutaSystem, getRoutaSystem } from "../routa-system";
import { initRoutaOrchestrator } from "../orchestration/orchestrator-singleton";
import { getHttpSessionStore } from "../acp/http-session-store";
import { persistSessionToDb } from "../acp/session-db-persister";

export interface RoutaMcpServerResult {
  server: McpServer;
  system: RoutaSystem;
  toolManager: RoutaMcpToolManager;
}

export interface CreateMcpServerOptions {
  /** Workspace ID */
  workspaceId: string;
  /** Tool mode: "essential" (7 tools) or "full" (all tools). Default: "essential" */
  toolMode?: ToolMode;
  /** Optional existing RoutaSystem instance */
  system?: RoutaSystem;
  /**
   * ACP session ID to scope note/task creation to a specific session.
   * When set, notes created without an explicit sessionId will inherit this.
   */
  sessionId?: string;
}

/**
 * Create a configured MCP server with Routa coordination tools.
 * If an orchestrator is available, it will be wired in for process-spawning delegation.
 *
 * @param options.toolMode - "essential" for 7 core tools (weak models), "full" for all 34 tools
 */
export function createRoutaMcpServer(
  workspaceIdOrOptions: string | CreateMcpServerOptions,
  system?: RoutaSystem
): RoutaMcpServerResult {
  // Support both old signature (workspaceId, system?) and new (options)
  const opts: CreateMcpServerOptions =
    typeof workspaceIdOrOptions === "string"
      ? { workspaceId: workspaceIdOrOptions, system, toolMode: "essential" }
      : workspaceIdOrOptions;

  const routaSystem = opts.system ?? getRoutaSystem();
  const toolMode = opts.toolMode ?? "essential";

  const server = new McpServer({
    name: "routa-mcp",
    version: "0.1.0",
  });

  const toolManager = new RoutaMcpToolManager(routaSystem.tools, opts.workspaceId);
  toolManager.setToolMode(toolMode);

  // Scope note/task creation to this ACP session when provided
  if (opts.sessionId) {
    toolManager.setSessionId(opts.sessionId);
  }

  // Wire in orchestrator — auto-initialize if not yet created (e.g. after server restart).
  // initRoutaOrchestrator is idempotent: returns existing instance if already created.
  const orchestrator = initRoutaOrchestrator();

  // Ensure child sessions spawned by the orchestrator are always registered in the
  // HttpSessionStore (so they show in the sidebar). The ACP route also sets this
  // handler when creating new ROUTA sessions, but when the orchestrator is first
  // initialized via the MCP route (e.g. after a server restart), there is no ACP
  // request to set it — so we set a default here.
  const store = getHttpSessionStore();
  orchestrator.setSessionRegistrationHandler((childSession) => {
    store.upsertSession({
      sessionId: childSession.sessionId,
      name: childSession.name,
      cwd: childSession.cwd,
      workspaceId: childSession.workspaceId,
      routaAgentId: childSession.routaAgentId,
      provider: childSession.provider,
      role: childSession.role,
      parentSessionId: childSession.parentSessionId,
      createdAt: new Date().toISOString(),
    });
    persistSessionToDb({
      id: childSession.sessionId,
      name: childSession.name,
      cwd: childSession.cwd,
      workspaceId: childSession.workspaceId,
      routaAgentId: childSession.routaAgentId ?? "",
      provider: childSession.provider ?? "",
      role: childSession.role ?? "CRAFTER",
      parentSessionId: childSession.parentSessionId,
    }).catch((err: unknown) =>
      console.error(`[MCP Server] Failed to persist child session ${childSession.sessionId}:`, err)
    );
    console.log(
      `[MCP Server] Child session registered: ${childSession.sessionId} (parent: ${childSession.parentSessionId})`
    );
  });

  toolManager.setOrchestrator(orchestrator);

  // Wire in note tools and workspace tools
  toolManager.setNoteTools(routaSystem.noteTools);
  toolManager.setWorkspaceTools(routaSystem.workspaceTools);

  toolManager.registerTools(server);

  return { server, system: routaSystem, toolManager };
}
