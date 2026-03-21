/**
 * A2A Outbound Client - Client for calling remote A2A agents
 *
 * This client enables Kanban and other Routa components to create tasks
 * on remote A2A agents by:
 * 1. Fetching the Agent Card from a URL
 * 2. Sending SendMessage requests via JSON-RPC
 * 3. Polling GetTask until completion
 *
 * Follows A2A protocol spec v0.3 for JSON-RPC communication.
 */

import { v4 as uuidv4 } from "uuid";
import type { AgentCard } from "@a2a-js/sdk";
import type {
  A2ATask,
  A2AMessage,
  A2APart,
} from "./a2a-task-bridge";
import type {
  A2AOutboundClientOptions,
  GetTaskParams,
  GetTaskResult,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  SendMessageParams,
  SendMessageResult,
} from "./types";
import {
  A2AInvalidCardError,
  A2ANetworkError,
  A2ATimeoutError,
  fetchAgentCard,
  getRpcEndpoint,
} from "./a2a-agent-card";

/**
 * Default client options
 */
const DEFAULT_OPTIONS: Required<A2AOutboundClientOptions> = {
  timeout: 30000, // 30 seconds
  pollInterval: 1000, // 1 second
  maxWaitTime: 300000, // 5 minutes
  maxRetries: 3,
  retryDelay: 1000,
};

/**
 * Terminal states for A2A tasks
 */
const TERMINAL_STATES = new Set(["completed", "failed", "canceled", "rejected", "auth-required"]);

/**
 * A2A Outbound Client for calling remote A2A agents
 */
export class A2AOutboundClient {
  private options: Required<A2AOutboundClientOptions>;

  constructor(options?: A2AOutboundClientOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Fetch an Agent Card from a URL
   *
   * @param url - The URL to fetch the Agent Card from
   * @returns The validated Agent Card
   * @throws {A2AInvalidCardError} If the card is invalid
   * @throws {A2ANetworkError} If the network request fails
   */
  async fetchAgentCard(url: string): Promise<AgentCard> {
    return fetchAgentCard(url, this.options);
  }

  /**
   * Send a message to a remote A2A agent
   *
   * @param agentCardUrl - The URL of the Agent Card (or RPC endpoint)
   * @param message - The message content
   * @param metadata - Optional metadata to attach to the request
   * @returns The created A2A task
   * @throws {A2AInvalidCardError} If the agent card is invalid
   * @throws {A2ANetworkError} If the network request fails
   */
  async sendMessage(
    agentCardUrl: string,
    message: string | { text?: string; data?: unknown; mediaType?: string },
    metadata?: Record<string, unknown>
  ): Promise<A2ATask> {
    // Normalize message to parts array
    const parts: A2APart[] = typeof message === "string"
      ? [{ text: message }]
      : [message];

    // If the URL ends with .json, it's likely the card URL
    // Otherwise, assume it's the RPC endpoint
    let rpcEndpoint = agentCardUrl;
    if (agentCardUrl.endsWith(".json") || agentCardUrl.endsWith("/agent-card")) {
      const card = await this.fetchAgentCard(agentCardUrl);
      rpcEndpoint = getRpcEndpoint(card);
    }

    // Build SendMessage request
    const params: SendMessageParams = {
      message: {
        messageId: uuidv4(),
        role: "user",
        parts,
      },
      metadata,
    };

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: uuidv4(),
      method: "SendMessage",
      params,
    };

    const response = await this.sendJsonRpcRequest(rpcEndpoint, request);
    const result = response.result as SendMessageResult;

    // Normalize the task to A2ATask format
    return this.normalizeTask(result.task);
  }

  /**
   * Get the current status of a remote task
   *
   * @param agentCardUrl - The URL of the Agent Card or RPC endpoint
   * @param taskId - The ID of the task to get
   * @returns The current task state
   * @throws {A2ANetworkError} If the network request fails
   */
  async getTask(agentCardUrl: string, taskId: string): Promise<A2ATask> {
    // If the URL ends with .json, it's likely the card URL
    let rpcEndpoint = agentCardUrl;
    if (agentCardUrl.endsWith(".json") || agentCardUrl.endsWith("/agent-card")) {
      const card = await this.fetchAgentCard(agentCardUrl);
      rpcEndpoint = getRpcEndpoint(card);
    }

    const params: GetTaskParams = { id: taskId };
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: uuidv4(),
      method: "GetTask",
      params,
    };

    const response = await this.sendJsonRpcRequest(rpcEndpoint, request);
    const result = response.result as GetTaskResult;

    return this.normalizeTask(result.task);
  }

  /**
   * Wait for a task to complete by polling GetTask
   *
   * @param agentCardUrl - The URL of the Agent Card or RPC endpoint
   * @param taskId - The ID of the task to wait for
   * @returns The completed task
   * @throws {A2ATimeoutError} If the max wait time is exceeded
   * @throws {A2ANetworkError} If a network request fails
   */
  async waitForCompletion(agentCardUrl: string, taskId: string): Promise<A2ATask> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.options.maxWaitTime) {
      const task = await this.getTask(agentCardUrl, taskId);

      if (TERMINAL_STATES.has(task.status.state)) {
        return task;
      }

      // Wait before polling again
      await sleep(this.options.pollInterval);
    }

    const elapsed = Date.now() - startTime;
    throw new A2ATimeoutError(
      `Task ${taskId} did not complete within ${elapsed}ms`,
      elapsed
    );
  }

  /**
   * Send a message and wait for completion in one call
   *
   * @param agentCardUrl - The URL of the Agent Card or RPC endpoint
   * @param message - The message content
   * @param metadata - Optional metadata to attach to the request
   * @returns The completed task
   * @throws {A2AInvalidCardError} If the agent card is invalid
   * @throws {A2ATimeoutError} If the max wait time is exceeded
   * @throws {A2ANetworkError} If a network request fails
   */
  async sendMessageAndWait(
    agentCardUrl: string,
    message: string | { text?: string; data?: unknown; mediaType?: string },
    metadata?: Record<string, unknown>
  ): Promise<A2ATask> {
    const task = await this.sendMessage(agentCardUrl, message, metadata);
    return this.waitForCompletion(agentCardUrl, task.id);
  }

  /**
   * Send a JSON-RPC request with retry logic
   */
  private async sendJsonRpcRequest(
    endpoint: string,
    request: JsonRpcRequest
  ): Promise<JsonRpcSuccessResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.options.timeout),
        });

        if (!response.ok) {
          throw new A2ANetworkError(
            `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const jsonRpcResponse = (await response.json()) as JsonRpcSuccessResponse;

        // Check for JSON-RPC error
        if (jsonRpcResponse.error) {
          throw new A2ANetworkError(
            `JSON-RPC error ${jsonRpcResponse.error.code}: ${jsonRpcResponse.error.message}`,
            new Error(jsonRpcResponse.error.message)
          );
        }

        return jsonRpcResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if it's an invalid card error
        if (lastError instanceof A2AInvalidCardError) {
          throw lastError;
        }

        // Wait before retrying (except on the last attempt)
        if (attempt < this.options.maxRetries - 1) {
          await sleep(this.options.retryDelay);
        }
      }
    }

    throw new A2ANetworkError(
      `Failed to send JSON-RPC request after ${this.options.maxRetries} attempts: ${lastError?.message}`,
      lastError
    );
  }

  /**
   * Normalize a task from the remote format to local A2ATask format
   */
  private normalizeTask(remoteTask: GetTaskResult["task"]): A2ATask {
    // Normalize history messages
    const history: A2AMessage[] = remoteTask.history.map((msg) => ({
      messageId: msg.messageId,
      role: msg.role as "user" | "agent",
      parts: msg.parts.map((p) => ({
        text: p.text,
        data: p.data,
        mediaType: p.mediaType,
      })),
      contextId: msg.contextId,
      taskId: msg.taskId,
    }));

    // Normalize artifacts
    const artifacts = remoteTask.artifacts?.map((art) => ({
      artifactId: art.artifactId,
      name: art.name,
      description: art.description,
      parts: art.parts.map((p) => ({
        text: p.text,
        data: p.data,
        mediaType: p.mediaType,
      })),
    }));

    // Build the normalized task
    return {
      id: remoteTask.id,
      contextId: remoteTask.contextId,
      status: {
        state: remoteTask.status.state as A2ATask["status"]["state"],
        timestamp: remoteTask.status.timestamp,
        message: remoteTask.status.message
          ? {
              messageId: remoteTask.status.message.messageId,
              role: remoteTask.status.message.role as "user" | "agent",
              parts: remoteTask.status.message.parts.map((p) => ({
                text: p.text,
                data: p.data,
                mediaType: p.mediaType,
              })),
            }
          : undefined,
      },
      history,
      artifacts,
      metadata: remoteTask.metadata,
    };
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a singleton A2A outbound client instance
 */
const GLOBAL_KEY = "__a2a_outbound_client__";

export function getA2AOutboundClient(options?: A2AOutboundClientOptions): A2AOutboundClient {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new A2AOutboundClient(options);
  }
  return g[GLOBAL_KEY] as A2AOutboundClient;
}
