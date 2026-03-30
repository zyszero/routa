import type { AgentHookConfigSummary, AgentHooksResponse } from "@/client/hooks/use-harness-settings-data";

export type AgentHookEvent = "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop";
export type AgentHookType = "command" | "http" | "prompt";
export type AgentHookLifecycleGroup = "session" | "prompt" | "tool" | "completion";

export type AgentHookFlowNodeTone = "neutral" | "success" | "warning" | "danger" | "accent";
export type AgentHookFlowNodeKind = "event" | "hook" | "outcome";

export type AgentHookFlowNodeSpec = {
  id: string;
  kind: AgentHookFlowNodeKind;
  title: string;
  subtitle?: string;
  chips?: string[];
  tone: AgentHookFlowNodeTone;
  column: 0 | 1 | 2;
  row: number;
};

export type AgentHookFlowEdgeSpec = {
  id: string;
  source: string;
  target: string;
  tone: AgentHookFlowNodeTone;
};

export type AgentHookWorkbenchEntry = {
  event: AgentHookEvent;
  lifecycleGroup: AgentHookLifecycleGroup;
  lifecycleLabel: string;
  lifecycleDescription: string;
  canBlock: boolean;
  hint: string;
  hooks: AgentHookConfigSummary[];
  stats: {
    hookCount: number;
    blockingCount: number;
    typeDistribution: Record<AgentHookType, number>;
  };
};

type AgentHookEventCatalogEntry = {
  event: AgentHookEvent;
  lifecycleGroup: AgentHookLifecycleGroup;
  lifecycleLabel: string;
  lifecycleDescription: string;
  canBlock: boolean;
  hint: string;
};

export const AGENT_HOOK_EVENT_CATALOG: AgentHookEventCatalogEntry[] = [
  {
    event: "SessionStart",
    lifecycleGroup: "session",
    lifecycleLabel: "Session",
    lifecycleDescription: "Agent 会话启动时触发，适合注入初始上下文、确认权限或记录审计日志。",
    canBlock: false,
    hint: "常用于注入系统级 prompt 约束、初始化审计 trace、加载工作区上下文。",
  },
  {
    event: "UserPromptSubmit",
    lifecycleGroup: "prompt",
    lifecycleLabel: "Prompt",
    lifecycleDescription: "用户提交 prompt 后、Agent 执行前触发，可拦截或改写。",
    canBlock: true,
    hint: "适合 prompt 过滤、敏感内容拦截、自动附加上下文或改写 prompt。",
  },
  {
    event: "PreToolUse",
    lifecycleGroup: "tool",
    lifecycleLabel: "Tool",
    lifecycleDescription: "Agent 调用工具前触发，可按 matcher 阻断危险操作。",
    canBlock: true,
    hint: "适合拦截 Bash、Write 等高风险工具调用，或注入审批流程。",
  },
  {
    event: "PostToolUse",
    lifecycleGroup: "tool",
    lifecycleLabel: "Tool",
    lifecycleDescription: "工具调用完成后触发，适合日志记录和结果审计。",
    canBlock: false,
    hint: "适合工具调用日志、结果验证、异常告警。",
  },
  {
    event: "Stop",
    lifecycleGroup: "completion",
    lifecycleLabel: "Completion",
    lifecycleDescription: "Agent 结束执行时触发，可决定是否允许停止或强制继续。",
    canBlock: false,
    hint: "不同 provider 的 Stop 语义不同：Codex 的 block 表示继续工作，Claude/Qoder 则不同。",
  },
];

const LIFECYCLE_ORDER: AgentHookLifecycleGroup[] = ["session", "prompt", "tool", "completion"];
const _EVENT_ORDER: AgentHookEvent[] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];

function toLifecycleGroupLabel(group: AgentHookLifecycleGroup): string {
  switch (group) {
    case "session":
      return "Session";
    case "prompt":
      return "Prompt";
    case "tool":
      return "Tool";
    case "completion":
      return "Completion";
  }
}

function buildTypeDistribution(hooks: AgentHookConfigSummary[]): Record<AgentHookType, number> {
  const dist: Record<AgentHookType, number> = { command: 0, http: 0, prompt: 0 };
  for (const hook of hooks) {
    const hookType = hook.type as AgentHookType;
    if (hookType in dist) {
      dist[hookType]++;
    }
  }
  return dist;
}

export function buildAgentHookWorkbenchEntries(
  data: AgentHooksResponse | null | undefined,
): AgentHookWorkbenchEntry[] {
  const hooksByEvent = new Map<AgentHookEvent, AgentHookConfigSummary[]>();
  for (const hook of data?.hooks ?? []) {
    const event = hook.event as AgentHookEvent;
    const list = hooksByEvent.get(event) ?? [];
    list.push(hook);
    hooksByEvent.set(event, list);
  }

  return AGENT_HOOK_EVENT_CATALOG.map((catalogEntry) => {
    const hooks = hooksByEvent.get(catalogEntry.event) ?? [];
    return {
      event: catalogEntry.event,
      lifecycleGroup: catalogEntry.lifecycleGroup,
      lifecycleLabel: catalogEntry.lifecycleLabel,
      lifecycleDescription: catalogEntry.lifecycleDescription,
      canBlock: catalogEntry.canBlock,
      hint: catalogEntry.hint,
      hooks,
      stats: {
        hookCount: hooks.length,
        blockingCount: hooks.filter((hook) => hook.blocking).length,
        typeDistribution: buildTypeDistribution(hooks),
      },
    };
  });
}

export function groupAgentHookEntries(entries: AgentHookWorkbenchEntry[]) {
  return LIFECYCLE_ORDER
    .map((group) => ({
      group,
      label: toLifecycleGroupLabel(group),
      entries: entries.filter((entry) => entry.lifecycleGroup === group),
    }))
    .filter((group) => group.entries.length > 0);
}

export function getDefaultAgentHookEntry(entries: AgentHookWorkbenchEntry[]) {
  return entries.find((entry) => entry.stats.hookCount > 0 && entry.canBlock)
    ?? entries.find((entry) => entry.stats.hookCount > 0)
    ?? entries[0]
    ?? null;
}

export function buildAgentHookFlow(entry: AgentHookWorkbenchEntry): {
  nodes: AgentHookFlowNodeSpec[];
  edges: AgentHookFlowEdgeSpec[];
} {
  const nodes: AgentHookFlowNodeSpec[] = [
    {
      id: `event:${entry.event}`,
      kind: "event",
      title: entry.event,
      subtitle: `${entry.lifecycleLabel} · ${entry.canBlock ? "Can block" : "Non-blocking"}`,
      chips: entry.hooks.length > 0
        ? [`${entry.stats.hookCount} hooks`, entry.canBlock ? `${entry.stats.blockingCount} blocking` : "signal only"]
        : ["no hooks configured"],
      tone: entry.hooks.length > 0 ? "accent" : "neutral",
      column: 0,
      row: 0,
    },
  ];

  const edges: AgentHookFlowEdgeSpec[] = [];

  if (entry.hooks.length === 0) {
    const outcomeId = `outcome:${entry.event}:passthrough`;
    nodes.push({
      id: outcomeId,
      kind: "outcome",
      title: "Passthrough",
      subtitle: "No hooks configured for this event",
      tone: "neutral",
      column: 2,
      row: 0,
    });
    edges.push({
      id: `edge:${entry.event}:passthrough`,
      source: `event:${entry.event}`,
      target: outcomeId,
      tone: "neutral",
    });
    return { nodes, edges };
  }

  entry.hooks.forEach((hook, index) => {
    const hookId = `hook:${entry.event}:${index}`;
    const typeBadge = hook.type;
    const blockingBadge = hook.blocking ? "blocking" : "async";
    const matcherChip = hook.matcher ? `matcher: ${hook.matcher}` : undefined;

    nodes.push({
      id: hookId,
      kind: "hook",
      title: hook.description || `${hook.type} hook`,
      subtitle: hook.type === "command" ? hook.command : hook.type === "http" ? hook.url : hook.prompt,
      chips: [typeBadge, blockingBadge, `${hook.timeout}s`, ...(matcherChip ? [matcherChip] : [])].filter(Boolean) as string[],
      tone: hook.blocking ? "warning" : "success",
      column: 1,
      row: index,
    });

    edges.push({
      id: `edge:${entry.event}:hook:${index}`,
      source: `event:${entry.event}`,
      target: hookId,
      tone: hook.blocking ? "warning" : "success",
    });
  });

  const hasBlockingHook = entry.hooks.some((hook) => hook.blocking);

  if (hasBlockingHook && entry.canBlock) {
    const allowId = `outcome:${entry.event}:allow`;
    const blockId = `outcome:${entry.event}:block`;
    nodes.push(
      {
        id: allowId,
        kind: "outcome",
        title: "Allow",
        subtitle: "Hook exits 0 — action proceeds",
        tone: "success",
        column: 2,
        row: 0,
      },
      {
        id: blockId,
        kind: "outcome",
        title: "Block",
        subtitle: "Hook exits non-zero — action denied",
        tone: "danger",
        column: 2,
        row: 1,
      },
    );
    entry.hooks.forEach((hook, index) => {
      if (hook.blocking) {
        edges.push(
          { id: `edge:hook:${index}:allow`, source: `hook:${entry.event}:${index}`, target: allowId, tone: "success" },
          { id: `edge:hook:${index}:block`, source: `hook:${entry.event}:${index}`, target: blockId, tone: "danger" },
        );
      } else {
        edges.push(
          { id: `edge:hook:${index}:signal`, source: `hook:${entry.event}:${index}`, target: allowId, tone: "success" },
        );
      }
    });
  } else {
    const signalId = `outcome:${entry.event}:signal`;
    nodes.push({
      id: signalId,
      kind: "outcome",
      title: "Signal",
      subtitle: "Non-blocking — hook output recorded",
      tone: "success",
      column: 2,
      row: 0,
    });
    entry.hooks.forEach((_hook, index) => {
      edges.push({
        id: `edge:hook:${index}:signal`,
        source: `hook:${entry.event}:${index}`,
        target: signalId,
        tone: "success",
      });
    });
  }

  return { nodes, edges };
}

export function buildAgentHookConfigSource(entry: AgentHookWorkbenchEntry): string {
  if (entry.hooks.length === 0) {
    return `# No hooks configured for ${entry.event}\n# Example:\n# hooks:\n#   - event: ${entry.event}\n#     type: command\n#     command: "echo hello"\n#     timeout: 10\n#     blocking: ${entry.canBlock}\n`;
  }

  const lines = ["hooks:"];
  for (const hook of entry.hooks) {
    lines.push(`  - event: ${hook.event}`);
    if (hook.matcher) {
      lines.push(`    matcher: "${hook.matcher}"`);
    }
    lines.push(`    type: ${hook.type}`);
    if (hook.type === "command" && hook.command) {
      lines.push(`    command: "${hook.command}"`);
    }
    if (hook.type === "http" && hook.url) {
      lines.push(`    url: "${hook.url}"`);
    }
    if (hook.type === "prompt" && hook.prompt) {
      lines.push(`    prompt: "${hook.prompt}"`);
    }
    lines.push(`    timeout: ${hook.timeout}`);
    lines.push(`    blocking: ${hook.blocking}`);
    if (hook.description) {
      lines.push(`    description: "${hook.description}"`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
