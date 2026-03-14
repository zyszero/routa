"use client";

/**
 * Routa JS - Home Page
 *
 * Task-first, operational layout:
 * - Input dominates the viewport — type immediately
 * - Agent selection is lightweight (dropdown in control bar)
 * - Context (Workspace / Repo) structured in input's bottom bar
 * - Skills shown as scannable grid cards
 * - Recent sessions as compact inline pills
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { HomeInput } from "@/client/components/home-input";
import { useWorkspaces } from "@/client/hooks/use-workspaces";
import { useAcp } from "@/client/hooks/use-acp";
import { useSkills } from "@/client/hooks/use-skills";
import { SettingsPanel } from "@/client/components/settings-panel";
import { NotificationProvider, NotificationBell } from "@/client/components/notification-center";

export default function HomePage() {
  const router = useRouter();
  const workspacesHook = useWorkspaces();
  const acp = useAcp();
  const skillsHook = useSkills();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"agents" | undefined>(undefined);
  const [showIntegrationsMenu, setShowIntegrationsMenu] = useState(false);
  const [showWorkspacesMenu, setShowWorkspacesMenu] = useState(false);
  const integrationsRef = useRef<HTMLDivElement>(null);
  const workspacesMenuRef = useRef<HTMLDivElement>(null);

  // Close integrations dropdown on outside click
  useEffect(() => {
    if (!showIntegrationsMenu) return;
    const handler = (e: MouseEvent) => {
      if (integrationsRef.current && !integrationsRef.current.contains(e.target as Node)) {
        setShowIntegrationsMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showIntegrationsMenu]);

  // Close workspaces menu on outside click
  useEffect(() => {
    if (!showWorkspacesMenu) return;
    const handler = (e: MouseEvent) => {
      if (workspacesMenuRef.current && !workspacesMenuRef.current.contains(e.target as Node)) {
        setShowWorkspacesMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showWorkspacesMenu]);

  // Auto-select first workspace on load
  useEffect(() => {
    if (!activeWorkspaceId && workspacesHook.workspaces.length > 0) {
      setActiveWorkspaceId(workspacesHook.workspaces[0].id);
    }
  }, [activeWorkspaceId, workspacesHook.workspaces, workspacesHook.workspaces.length]);

  // Auto-connect on mount
  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
    // We intentionally exclude 'acp' from deps to avoid re-connecting on every acp change
    // The acp object is stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acp.connected, acp.loading]);

  const handleWorkspaceSelect = useCallback((wsId: string) => {
    setActiveWorkspaceId(wsId);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const ws = await workspacesHook.createWorkspace(title);
    if (ws) handleWorkspaceSelect(ws.id);
  }, [workspacesHook, handleWorkspaceSelect]);

  const handleSessionClick = useCallback((sessionId: string) => {
    if (activeWorkspaceId) {
      router.push(`/workspace/${activeWorkspaceId}/sessions/${sessionId}`);
    } else {
      router.push(`/workspace/${sessionId}`);
    }
  }, [activeWorkspaceId, router]);

  const activeWorkspace = workspacesHook.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const workspaceCount = workspacesHook.workspaces.length;
  const activeWorkspaceHref = activeWorkspaceId ? `/workspace/${activeWorkspaceId}` : "/workspaces";
  const activeKanbanHref = activeWorkspaceId ? `/workspace/${activeWorkspaceId}/kanban` : "/workspaces";

  return (
    <NotificationProvider>
    <div className="h-screen flex flex-col bg-[#fafafa] dark:bg-[#0a0c12]">
      {/* ─── Minimal Header ─────────────────────────────────────────── */}
      <header className="h-11 shrink-0 flex items-center px-5 z-10 border-b border-gray-100 dark:border-[#151720]">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="Routa" width={22} height={22} className="rounded-md" />
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 tracking-tight">
            Routa
          </span>
        </div>

        <div className="flex-1" />

        <nav className="flex items-center gap-0.5">
          {/* Kanban link - quick access to current workspace board */}
          {activeWorkspaceId && (
            <Link
              href={`/workspace/${activeWorkspaceId}/kanban`}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
              title="Open Kanban Board"
            >
              Kanban
            </Link>
          )}

          {/* Integrations dropdown — merges MCP + A2A */}
          <div className="relative" ref={integrationsRef}>
            <button
              onClick={() => setShowIntegrationsMenu((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${showIntegrationsMenu ? "text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-[#151720]" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720]"}`}
            >
              Integrations
              <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showIntegrationsMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-[#12141c] border border-gray-100 dark:border-[#1c1f2e] rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                <Link
                  href="/mcp-tools"
                  onClick={() => setShowIntegrationsMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1d2c] transition-colors"
                >
                  <span className="w-4 h-4 rounded bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-[9px] font-bold text-blue-600 dark:text-blue-400">M</span>
                  MCP Tools
                </Link>
                <Link
                  href="/a2a"
                  onClick={() => setShowIntegrationsMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1d2c] transition-colors"
                >
                  <span className="w-4 h-4 rounded bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400">A</span>
                  A2A Protocol
                </Link>
              </div>
            )}
          </div>

          <Link
            href="/settings/webhooks"
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
          >
            Webhooks
          </Link>
          <Link
            href="/settings/schedules"
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
          >
            Schedules
          </Link>

          <NotificationBell />

          {/* Settings — with Agents accessible via initialTab */}
          <button
            onClick={() => { setSettingsInitialTab(undefined); setShowSettingsPanel(true); }}
            className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
            title="Settings"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Single combined status indicator */}
          <div className="ml-2 pl-3 border-l border-gray-200 dark:border-[#1f2233]">
            <ConnectionDot connected={acp.connected} />
          </div>
        </nav>
      </header>

      {/* ─── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {!workspacesHook.loading && workspacesHook.workspaces.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <OnboardingCard onCreateWorkspace={handleWorkspaceCreate} />
          </div>
        ) : (
          <div className="min-h-full px-4 py-5 sm:px-6 sm:py-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:gap-8">
              <section className="relative overflow-hidden rounded-[28px] border border-gray-200/70 bg-white/90 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] dark:border-[#1c1f2e] dark:bg-[#10131b]/95">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.12),_transparent_38%)]" />
                <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.25fr)_320px] lg:items-start lg:gap-8 lg:p-8">
                  <div className="min-w-0">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                        Task Console
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Home should launch work fast, not make you browse first.
                      </span>
                    </div>

                    <div className="max-w-3xl">
                      <h1 className="text-3xl font-semibold tracking-tight text-gray-950 dark:text-gray-50 sm:text-[2.65rem]">
                        Start from the task.
                        <span className="block text-gray-500 dark:text-gray-400">Keep workspace as context.</span>
                      </h1>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300 sm:text-[15px]">
                        Dispatch the next job here, keep the active workspace visible, and drop into Kanban only when you need the full board. The homepage should feel like a launchpad, not a directory.
                      </p>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <HeroStat
                        label="Workspaces"
                        value={workspaceCount.toString()}
                        detail={activeWorkspace ? `Current: ${activeWorkspace.title}` : "Pick a workspace to focus the board"}
                      />
                      <HeroStat
                        label="Installed Skills"
                        value={skillsHook.allSkills.length.toString()}
                        detail="Skills stay available directly inside the input composer"
                      />
                      <HeroStat
                        label="Runtime"
                        value={acp.connected ? "Ready" : "Offline"}
                        detail={acp.connected ? "ACP connection is healthy" : "Reconnect before launching sessions"}
                      />
                    </div>

                    <div className="mt-6 max-w-3xl">
                      <HomeInput
                        workspaceId={activeWorkspaceId ?? undefined}
                        onWorkspaceChange={(wsId) => {
                          setActiveWorkspaceId(wsId);
                          setRefreshKey((k) => k + 1);
                        }}
                        onSessionCreated={() => {
                          setRefreshKey((k) => k + 1);
                        }}
                        displaySkills={skillsHook.allSkills}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="rounded-[24px] border border-gray-200/80 bg-white/90 p-5 shadow-sm dark:border-[#222638] dark:bg-[#131722]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                            Current Focus
                          </div>
                          <div className="mt-2 text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                            {activeWorkspace?.title ?? "No workspace selected"}
                          </div>
                        </div>
                        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${activeWorkspace ? "bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]" : "bg-amber-400 shadow-[0_0_0_6px_rgba(251,191,36,0.18)]"}`} />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                        Use one workspace as the active lane for sessions, then jump sideways only when you need a broader operational view.
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2.5">
                        <Link
                          href={activeKanbanHref}
                          className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-white"
                        >
                          Open Kanban
                        </Link>
                        <Link
                          href={activeWorkspaceHref}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-[#2a3042] dark:text-gray-300 dark:hover:border-[#39415a] dark:hover:text-gray-100"
                        >
                          Workspace Hub
                        </Link>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-dashed border-gray-200/90 bg-white/70 p-5 dark:border-[#222638] dark:bg-[#11141d]/80">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                        Home Rules
                      </div>
                      <div className="mt-4 space-y-3">
                        <HomeRule
                          title="Launch here"
                          description="Keep the composer front and center for starting the next task immediately."
                        />
                        <HomeRule
                          title="Filter, don’t browse"
                          description="Treat workspace as a lens for the active board instead of the homepage destination."
                        />
                        <HomeRule
                          title="Dive deeper only when needed"
                          description="Use the workspace hub and full Kanban for detail work, not as the first stop."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px] lg:items-start">
                <HomeTodoPreview
                  workspaceId={activeWorkspaceId}
                  workspaceTitle={activeWorkspace?.title ?? null}
                  refreshKey={refreshKey}
                />
                <WorkspaceCards
                  workspaceId={activeWorkspaceId}
                  refreshKey={refreshKey}
                  onWorkspaceSelect={handleWorkspaceSelect}
                  onWorkspaceCreate={handleWorkspaceCreate}
                  onSessionClick={handleSessionClick}
                  showWorkspacesMenu={showWorkspacesMenu}
                  setShowWorkspacesMenu={setShowWorkspacesMenu}
                  workspacesMenuRef={workspacesMenuRef}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── Settings Panel ────────────────────────────────────────── */}
      <SettingsPanel
        open={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        providers={acp.providers}
        initialTab={settingsInitialTab}
      />
    </div>
    </NotificationProvider>
  );
}

// ─── Connection Dot (single indicator, replaces MCP+ACP dots) ────────

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5" title={connected ? "Connected" : "Disconnected"}>
      <span className={`w-1.5 h-1.5 rounded-full ring-2 transition-colors ${connected ? "bg-emerald-500 ring-emerald-500/20" : "bg-amber-400 ring-amber-400/20"}`} />
      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{connected ? "Connected" : "Offline"}</span>
    </div>
  );
}

function HeroStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white/75 px-4 py-3 dark:border-[#202434] dark:bg-[#121722]/80">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {detail}
      </div>
    </div>
  );
}

function HomeRule({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-gray-900 dark:bg-gray-100" />
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</div>
        <div className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</div>
      </div>
    </div>
  );
}

function HomeTodoPreview({
  workspaceId,
  workspaceTitle,
  refreshKey,
}: {
  workspaceId: string | null;
  workspaceTitle: string | null;
  refreshKey: number;
}) {
  const [tasks, setTasks] = useState<HomeTaskInfo[]>([]);

  useEffect(() => {
    if (!workspaceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTasks([]);
      return;
    }

    const controller = new AbortController();

    const fetchTasks = async () => {
      try {
        setTasks([]);
        const res = await fetch(`/api/tasks?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;
        const nextTasks = Array.isArray(data?.tasks) ? data.tasks as HomeTaskInfo[] : [];
        setTasks(
          nextTasks
            .filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status))
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
            .slice(0, 4),
        );
      } catch {
        if (controller.signal.aborted) return;
        setTasks([]);
      }
    };

    void fetchTasks();
    return () => controller.abort();
  }, [workspaceId, refreshKey]);

  if (!workspaceId) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-gray-200/70 bg-white/95 p-5 shadow-[0_18px_60px_-46px_rgba(15,23,42,0.42)] dark:border-[#1c1f2e] dark:bg-[#10131b]/95 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Active Board Slice
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {workspaceTitle ?? "Current workspace"}
          </div>
          <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            A fast read on the work already moving in your selected workspace.
          </div>
        </div>
        <Link
          href={`/workspace/${workspaceId}/kanban`}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          Open Kanban
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50/70 p-6 dark:border-[#24283a] dark:bg-[#0f1219]">
          <div className="max-w-md">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              No active tasks yet
            </div>
            <div className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              The selected workspace does not have open cards right now. Start a new task from the composer above, or open the full board to inspect completed work.
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={`/workspace/${workspaceId}/kanban`}
              className="group rounded-[22px] border border-gray-200/80 bg-[#fcfcfc] px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/60 hover:shadow-sm dark:border-[#1f2434] dark:bg-[#0f1219] dark:hover:border-blue-800/40 dark:hover:bg-blue-900/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800 transition-colors group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">{task.title}</div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                      {(task.columnId ?? "backlog").toUpperCase()}
                    </span>
                    <span>·</span>
                    <span>{task.assignedProvider ?? "unassigned"}</span>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] uppercase tracking-wide text-gray-600 dark:bg-[#1c2233] dark:text-gray-300">
                  {task.priority ?? "medium"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Onboarding Card ──────────────────────────────────────────────────

function OnboardingCard({ onCreateWorkspace }: { onCreateWorkspace: (title: string) => void }) {
  return (
    <div className="w-full max-w-sm text-center">
      <div className="w-12 h-12 rounded-xl bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-500/20">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
        Create a workspace
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Organize your sessions and projects in one place.
      </p>
      <button
        type="button"
        onClick={() => onCreateWorkspace("My Workspace")}
        className="px-6 py-2.5 text-sm font-medium text-white bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40"
      >
        Get Started
      </button>
    </div>
  );
}

// ─── WorkspaceCards — left panel ─────────────────────────────────────

interface SessionInfo {
  sessionId: string;
  name?: string;
  cwd: string;
  workspaceId: string;
  provider?: string;
  role?: string;
  createdAt: string;
}

interface WorkspaceCardSession {
  sessionId: string;
  displayName: string;
  createdAt: string;
}

interface HomeTaskInfo {
  id: string;
  title: string;
  status: string;
  priority?: string;
  columnId?: string;
  assignedProvider?: string;
  createdAt: string;
}

interface WorkspaceCardData {
  id: string;
  title: string;
  updatedAt: string;
  recentSessions: WorkspaceCardSession[] | [];
}

function WorkspaceCards({
  workspaceId,
  refreshKey,
  onWorkspaceSelect,
  onWorkspaceCreate,
  onSessionClick,
  showWorkspacesMenu,
  setShowWorkspacesMenu,
  workspacesMenuRef,
}: {
  workspaceId: string | null;
  refreshKey: number;
  onWorkspaceSelect: (id: string) => void;
  onWorkspaceCreate: (title: string) => void;
  onSessionClick: (id: string) => void;
  showWorkspacesMenu: boolean;
  setShowWorkspacesMenu: (v: boolean) => void;
  workspacesMenuRef: React.RefObject<HTMLDivElement | null>;
}) {
  const workspacesHook = useWorkspaces();
  const [cardData, setCardData] = useState<WorkspaceCardData[]>([]);

  const formatTime = (dateStr: string) => {
    // eslint-disable-next-line react-hooks/purity
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const getDisplayName = (s: SessionInfo) => {
    if (s.name) return s.name;
    if (s.provider && s.role) return `${s.provider} · ${s.role.toLowerCase()}`;
    if (s.provider) return s.provider;
    return `Session ${s.sessionId.slice(0, 6)}`;
  };

  useEffect(() => {
    const fetchAll = async () => {
      const workspaces = workspacesHook.workspaces;
      if (workspaces.length === 0) return;

      const cards: WorkspaceCardData[] = await Promise.all(
        workspaces.slice(0, 9).map(async (ws) => {
          try {
            const res = await fetch(
              `/api/sessions?workspaceId=${encodeURIComponent(ws.id)}&limit=3`,
              { cache: "no-store" }
            );
            const data = await res.json();
            const sessions: SessionInfo[] = Array.isArray(data?.sessions) ? data.sessions : [];
            const recentSessions: WorkspaceCardSession[] = sessions.slice(0, 3).map(s => ({
              sessionId: s.sessionId,
              displayName: getDisplayName(s),
              createdAt: s.createdAt,
            }));
            return {
              id: ws.id,
              title: ws.title,
              updatedAt: ws.updatedAt,
              recentSessions,
            };
          } catch {
            return { id: ws.id, title: ws.title, updatedAt: ws.updatedAt, recentSessions: [] };
          }
        })
      );

      // Sort by most recent session activity
      cards.sort((a, b) => {
        const aDate = a.recentSessions[0]?.createdAt ?? a.updatedAt;
        const bDate = b.recentSessions[0]?.createdAt ?? b.updatedAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

      setCardData(cards);
    };
    fetchAll();
  }, [workspacesHook.workspaces, refreshKey]);

  if (workspacesHook.loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-gray-200/70 bg-white/95 dark:border-[#1c1f2e] dark:bg-[#10131b]/95">
        <span className="text-sm text-gray-400 dark:text-gray-500">Loading…</span>
      </div>
    );
  }

  const sortedCards = [...cardData].sort((left, right) => {
    if (left.id === workspaceId) return -1;
    if (right.id === workspaceId) return 1;
    return 0;
  }).slice(0, 5);

  return (
    <section className="rounded-[28px] border border-gray-200/70 bg-white/95 p-5 shadow-[0_18px_60px_-46px_rgba(15,23,42,0.42)] dark:border-[#1c1f2e] dark:bg-[#10131b]/95 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
            Workspace Pulse
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Keep the workspace list short and scannable. The homepage should hint at where work lives without turning into a management index.
          </p>
        </div>
        <div className="relative" ref={workspacesMenuRef}>
          <button
            onClick={() => setShowWorkspacesMenu(!showWorkspacesMenu)}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-800 dark:border-[#2a3042] dark:text-gray-400 dark:hover:border-[#39415a] dark:hover:text-gray-200"
          >
            View all
            <svg className={`h-2.5 w-2.5 transition-transform ${showWorkspacesMenu ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showWorkspacesMenu && (
            <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1 shadow-lg dark:border-[#1c1f2e] dark:bg-[#12141c]">
              <Link
                href="/workspaces"
                onClick={() => setShowWorkspacesMenu(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#1a1d2c]"
              >
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                </svg>
                All Workspaces
              </Link>
              <Link
                href="/sessions"
                onClick={() => setShowWorkspacesMenu(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#1a1d2c]"
              >
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
                </svg>
                All Sessions
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {sortedCards.map((ws) => {
          const isActive = ws.id === workspaceId;
          return (
            <button
              key={ws.id}
              onClick={() => onWorkspaceSelect(ws.id)}
              className={`group text-left rounded-[22px] border px-4 py-4 transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                isActive
                  ? "border-amber-200 bg-amber-50/80 dark:border-amber-700/50 dark:bg-amber-900/10"
                  : "border-gray-200/80 bg-[#fcfcfc] dark:border-[#1c1f2e] dark:bg-[#0f1219] hover:border-amber-200 dark:hover:border-amber-700/40"
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full transition-colors ${isActive ? "bg-amber-500" : "bg-emerald-500 group-hover:bg-amber-400"}`} />
                    {isActive && (
                      <span className="inline-flex rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-700 dark:bg-amber-950/70 dark:text-amber-200">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-2 truncate text-sm font-medium leading-tight text-gray-800 dark:text-gray-200">
                    {ws.title}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                    {ws.recentSessions.length > 0 ? "Recent session activity" : "No recent sessions yet"}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/workspace/${ws.id}/kanban`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-full border border-transparent p-1 text-blue-400 opacity-0 transition-opacity hover:border-blue-100 hover:text-blue-600 group-hover:opacity-100 dark:text-blue-500 dark:hover:border-blue-900/30 dark:hover:text-blue-400"
                    title="Open Kanban board"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                  </Link>
                  <Link
                    href={`/workspace/${ws.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-full border border-transparent p-1 text-gray-400 opacity-0 transition-opacity hover:border-gray-200 hover:text-gray-600 group-hover:opacity-100 dark:hover:border-[#2a3042] dark:hover:text-gray-300"
                    title="Open workspace"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </Link>
                </div>
              </div>

              {ws.recentSessions.length > 0 ? (
                <div className="space-y-2">
                  {ws.recentSessions.slice(0, 2).map((session) => (
                    <div
                      key={session.sessionId}
                      className="flex cursor-pointer items-center gap-2 rounded-xl bg-white/70 px-3 py-2 dark:bg-[#131722]"
                      onClick={(e) => { e.stopPropagation(); onSessionClick(session.sessionId); }}
                    >
                      <svg className="h-3.5 w-3.5 shrink-0 text-blue-400 dark:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
                      </svg>
                      <span className="flex-1 truncate text-[11px] text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
                        {session.displayName}
                      </span>
                      <span className="shrink-0 text-[9px] font-mono text-gray-300 dark:text-gray-600">
                        {formatTime(session.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] italic text-gray-300 dark:text-gray-600">No sessions yet</span>
              )}
            </button>
          );
        })}

        <button
          onClick={() => onWorkspaceCreate("New Workspace")}
          className="group text-left rounded-[22px] border border-dashed border-gray-200 p-4 transition-all hover:border-amber-300 hover:bg-amber-50/50 dark:border-[#1c1f2e] dark:hover:border-amber-700/50 dark:hover:bg-amber-900/5"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 transition-colors group-hover:bg-amber-100 dark:bg-[#1a1d2c] dark:group-hover:bg-amber-900/30">
              <svg className="h-4 w-4 text-gray-400 transition-colors group-hover:text-amber-600 dark:text-gray-500 dark:group-hover:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-medium text-gray-700 transition-colors group-hover:text-amber-700 dark:text-gray-300 dark:group-hover:text-amber-300">
                New workspace
              </div>
              <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                Add another lane without leaving the homepage.
              </div>
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}
