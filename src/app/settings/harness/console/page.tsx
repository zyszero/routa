"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CodeViewer } from "@/client/components/codemirror/code-viewer";
import { RepoPicker, type RepoSelection } from "@/client/components/repo-picker";
import {
  HarnessExecutionPlanFlow,
  type TierValue,
} from "@/client/components/harness-execution-plan-flow";
import { HarnessAgentInstructionsPanel } from "@/client/components/harness-agent-instructions-panel";
import { HarnessDesignDecisionPanel } from "@/client/components/harness-design-decision-panel";
import { HarnessFitnessFilesDashboard } from "@/client/components/harness-fitness-files-dashboard";
import { HarnessGovernanceLoopGraph } from "@/client/components/harness-governance-loop-graph";
import { HarnessLifecycleView } from "@/client/components/harness-lifecycle-view";
import { HarnessGitHubActionsFlowPanel } from "@/client/components/harness-github-actions-flow-panel";
import { HarnessHookRuntimePanel } from "@/client/components/harness-hook-runtime-panel";
import { HarnessAgentHookPanel } from "@/client/components/harness-agent-hook-panel";
import { HarnessRepoSignalsPanel } from "@/client/components/harness-repo-signals-panel";
import { HarnessCodeownersPanel } from "@/client/components/harness-codeowners-panel";
import { HarnessReviewTriggersPanel } from "@/client/components/harness-review-triggers-panel";
import { HarnessReleaseTriggersPanel } from "@/client/components/harness-release-triggers-panel";
import { HarnessSpecSourcesPanel } from "@/client/components/harness-spec-sources-panel";
import { HarnessUnsupportedState, getHarnessUnsupportedRepoMessage } from "@/client/components/harness-support-state";
import { useHarnessSettingsData } from "@/client/hooks/use-harness-settings-data";
import { useCodebases, useWorkspaces } from "@/client/hooks/use-workspaces";
import { loadRepoSelection, saveRepoSelection } from "@/client/utils/repo-selection-storage";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type SectionId =
  | "overview"
  | "spec-sources"
  | "agent-instructions"
  | "design-decisions"
  | "repo-signals"
  | "hook-systems"
  | "review-triggers"
  | "release-triggers"
  | "codeowners"
  | "entrix-fitness"
  | "ci-cd";

interface SectionDef {
  id: SectionId;
  label: string;
  shortLabel: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { id: "overview", label: "Overview · Lifecycle", shortLabel: "Overview", icon: "◎" },
  { id: "spec-sources", label: "Spec Sources", shortLabel: "Specs", icon: "◇" },
  { id: "agent-instructions", label: "Agent Instructions", shortLabel: "Instructions", icon: "▤" },
  { id: "design-decisions", label: "Design Decisions", shortLabel: "ADR", icon: "△" },
  { id: "repo-signals", label: "Repository Signals", shortLabel: "Signals", icon: "◈" },
  { id: "hook-systems", label: "Hook Systems", shortLabel: "Hooks", icon: "⚡" },
  { id: "review-triggers", label: "Review Triggers", shortLabel: "Review", icon: "◐" },
  { id: "release-triggers", label: "Release Triggers", shortLabel: "Release", icon: "◑" },
  { id: "codeowners", label: "Codeowners", shortLabel: "Owners", icon: "◻" },
  { id: "entrix-fitness", label: "Entrix Fitness", shortLabel: "Fitness", icon: "◆" },
  { id: "ci-cd", label: "CI / CD", shortLabel: "CI/CD", icon: "⟳" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function extractMarkdownCodeBlocks(source: string) {
  const matches = [...source.matchAll(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g)];
  return matches.map((match, index) => ({
    id: `${match[1] || "text"}-${index}`,
    language: match[1] || "text",
    code: match[2]?.trim() ?? "",
  })).filter((block) => block.code.length > 0);
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

export default function HarnessConsolePage() {
  /* ── workspace & repo selection ────────────────────────────────── */
  const workspacesHook = useWorkspaces();
  const [selectedWorkspaceId, _setSelectedWorkspaceId] = useState("");
  const workspaceId = selectedWorkspaceId || workspacesHook.workspaces[0]?.id || "";
  const { codebases } = useCodebases(workspaceId);
  const [selectedCodebaseId, setSelectedCodebaseId] = useState("");
  const [selectedRepoOverrideState, setSelectedRepoOverrideState] = useState<{
    workspaceId: string;
    selection: RepoSelection | null;
  }>({ workspaceId: "", selection: null });
  const [selectedTier, setSelectedTier] = useState<TierValue>("normal");
  const [selectedSpecName, setSelectedSpecName] = useState("");

  const persistedRepoSelection = useMemo(
    () => loadRepoSelection("harness", workspaceId),
    [workspaceId],
  );
  const selectedRepoOverride = selectedRepoOverrideState.workspaceId === workspaceId
    ? selectedRepoOverrideState.selection
    : null;
  const effectiveRepoOverride = selectedRepoOverride ?? persistedRepoSelection;

  const activeWorkspaceTitle = useMemo(() => {
    return workspacesHook.workspaces.find((w) => w.id === workspaceId)?.title
      ?? workspacesHook.workspaces[0]?.title
      ?? undefined;
  }, [workspaceId, workspacesHook.workspaces]);

  const activeCodebase = useMemo(() => {
    const effectiveCodebaseId = codebases.some((c) => c.id === selectedCodebaseId)
      ? selectedCodebaseId
      : (codebases.find((c) => c.isDefault)?.id ?? codebases[0]?.id ?? "");
    return codebases.find((c) => c.id === effectiveCodebaseId) ?? null;
  }, [codebases, selectedCodebaseId]);

  const matchedSelectedCodebase = useMemo(() => {
    if (!effectiveRepoOverride) return activeCodebase;
    return codebases.find((c) => (
      c.repoPath === effectiveRepoOverride.path
      && (effectiveRepoOverride.branch ? (c.branch ?? "") === effectiveRepoOverride.branch : true)
    )) ?? codebases.find((c) => c.repoPath === effectiveRepoOverride.path) ?? null;
  }, [activeCodebase, codebases, effectiveRepoOverride]);

  const activeRepoSelection = useMemo(() => {
    if (effectiveRepoOverride) return effectiveRepoOverride;
    if (!activeCodebase) return null;
    return {
      name: activeCodebase.label ?? activeCodebase.repoPath.split("/").pop() ?? activeCodebase.repoPath,
      path: activeCodebase.repoPath,
      branch: activeCodebase.branch ?? "",
    } satisfies RepoSelection;
  }, [activeCodebase, effectiveRepoOverride]);

  const activeRepoPath = activeRepoSelection?.path;
  const activeRepoCodebaseId = matchedSelectedCodebase?.id;

  /* ── data hooks ────────────────────────────────────────────────── */
  const {
    specsState,
    planState,
    hooksState,
    agentHooksState,
    instructionsState,
    githubActionsState,
    specSourcesState,
    designDecisionsState,
    codeownersState,
    reloadInstructions,
  } = useHarnessSettingsData({
    workspaceId,
    codebaseId: activeRepoCodebaseId,
    repoPath: activeRepoPath,
    selectedTier,
  });

  const resolvedCodeownersState = useMemo(
    () => codeownersState ?? { loading: false, error: null, data: null },
    [codeownersState],
  );
  const specFiles = useMemo(() => specsState.data?.files ?? [], [specsState.data?.files]);

  const visibleSpec = useMemo(() => {
    if (specFiles.length === 0) return null;
    return specFiles.find((f) => f.name === selectedSpecName)
      ?? specFiles.find((f) => f.name.toLowerCase() === "readme.md")
      ?? specFiles.find((f) => f.kind === "dimension")
      ?? specFiles[0] ?? null;
  }, [selectedSpecName, specFiles]);

  const dimensionSpecs = specFiles.filter((f) => f.kind === "dimension");
  const primaryFiles = specFiles.filter((f) => f.kind === "rulebook" || f.kind === "manifest" || f.kind === "dimension");
  const auxiliaryFiles = specFiles.filter((f) => !primaryFiles.includes(f));
  const selectedRepoLabel = activeRepoSelection?.name ?? "None";
  const unsupportedRepoMessage = getHarnessUnsupportedRepoMessage(specsState.error, planState.error, designDecisionsState.error);
  const hasArchitectureOrAdrSignal = useMemo(
    () => (designDecisionsState.data?.sources.length ?? 0) > 0,
    [designDecisionsState.data],
  );
  const visibleSpecCodeBlocks = useMemo(
    () => (visibleSpec && visibleSpec.language === "markdown" ? extractMarkdownCodeBlocks(visibleSpec.source) : []),
    [visibleSpec],
  );
  const hookCount = useMemo(
    () => (hooksState.data?.hookFiles?.length ?? 0) + (agentHooksState.data?.hooks?.length ?? 0),
    [hooksState.data?.hookFiles?.length, agentHooksState.data?.hooks?.length],
  );
  const workflowCount = useMemo(
    () => githubActionsState.data?.flows?.length ?? 0,
    [githubActionsState.data?.flows?.length],
  );

  useEffect(() => {
    saveRepoSelection("harness", workspaceId, activeRepoSelection);
  }, [activeRepoSelection, workspaceId]);

  /* ── IDE layout state ──────────────────────────────────────────── */
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [openTabs, setOpenTabs] = useState<SectionId[]>(["overview"]);
  const [governanceView, setGovernanceView] = useState<"lifecycle" | "loop">("lifecycle");
  const [selectedGovernanceNodeId, setSelectedGovernanceNodeId] = useState<string | null>(null);
  const [bottomPanelTab, setBottomPanelTab] = useState<"context" | "plan" | "fitness">("context");
  const [showBottomPanel, setShowBottomPanel] = useState(false);

  const openSection = useCallback((id: SectionId) => {
    setOpenTabs((prev) => prev.includes(id) ? prev : [...prev, id]);
    setActiveSection(id);
  }, []);

  const closeTab = useCallback((id: SectionId) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t !== id);
      if (next.length === 0) return ["overview"];
      return next;
    });
    if (activeSection === id) {
      const remaining = openTabs.filter((t) => t !== id);
      setActiveSection(remaining.length > 0 ? remaining[remaining.length - 1] : "overview");
    }
  }, [activeSection, openTabs]);

  const handleGovernanceNodeClick = (nodeId: string) => {
    setSelectedGovernanceNodeId(nodeId);
    setShowBottomPanel(true);
    setBottomPanelTab("context");
  };

  /* ── section badges for sidebar ────────────────────────────────── */
  const sectionBadges = useMemo((): Map<SectionId, string | null> => {
    const m = new Map<SectionId, string | null>();
    m.set("spec-sources", specSourcesState.data ? `${specSourcesState.data.sources?.length ?? 0}` : null);
    m.set("agent-instructions", instructionsState.data ? "1" : null);
    m.set("design-decisions", designDecisionsState.data ? `${designDecisionsState.data.sources?.length ?? 0}` : null);
    m.set("hook-systems", hookCount > 0 ? `${hookCount}` : null);
    m.set("review-triggers", hooksState.data?.hookFiles ? `${hooksState.data.hookFiles.length}` : null);
    m.set("release-triggers", hooksState.data?.hookFiles ? `${hooksState.data.hookFiles.length}` : null);
    m.set("codeowners", resolvedCodeownersState.data ? "✓" : null);
    m.set("entrix-fitness", specFiles.length > 0 ? `${dimensionSpecs.length}d/${planState.data?.metricCount ?? 0}m` : null);
    m.set("ci-cd", workflowCount > 0 ? `${workflowCount}` : null);
    return m;
  }, [specSourcesState.data, instructionsState.data, designDecisionsState.data, hookCount, hooksState.data, resolvedCodeownersState.data, specFiles.length, dimensionSpecs.length, planState.data?.metricCount, workflowCount]);

  /* ── governance context panel (compact, for bottom panel) ──────── */
  const governanceContextPanel = useMemo(() => {
    if (selectedGovernanceNodeId === null) return null;
    const props = { repoLabel: selectedRepoLabel, unsupportedMessage: unsupportedRepoMessage };
    switch (selectedGovernanceNodeId) {
      case "thinking":
        return (<HarnessSpecSourcesPanel {...props} data={specSourcesState.data} loading={specSourcesState.loading} error={specSourcesState.error} variant="compact" />);
      case "coding":
        return (<HarnessDesignDecisionPanel {...props} data={designDecisionsState.data} loading={designDecisionsState.loading} error={designDecisionsState.error} variant="compact" />);
      case "build":
        return (<HarnessAgentInstructionsPanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...props} data={instructionsState.data} loading={instructionsState.loading} error={instructionsState.error} onAuditRerun={reloadInstructions} variant="compact" />);
      case "agent-hook":
        return (<HarnessAgentHookPanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...props} data={agentHooksState.data} loading={agentHooksState.loading} error={agentHooksState.error} variant="compact" embedded />);
      case "lint":
      case "precommit":
        return (<HarnessExecutionPlanFlow loading={planState.loading} error={planState.error} plan={planState.data} repoLabel={selectedRepoLabel} selectedTier={selectedTier} onTierChange={setSelectedTier} unsupportedMessage={unsupportedRepoMessage} variant="compact" />);
      case "test":
        return (<HarnessRepoSignalsPanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...props} mode="test" variant="compact" />);
      case "release":
        return (<HarnessGitHubActionsFlowPanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...props} data={githubActionsState.data} loading={githubActionsState.loading} error={githubActionsState.error} variant="compact" initialCategory="Release" />);
      case "review":
        return (
          <div className="space-y-3">
            <HarnessReviewTriggersPanel {...props} data={hooksState.data} loading={hooksState.loading} error={hooksState.error} variant="compact" />
            <HarnessReleaseTriggersPanel {...props} data={hooksState.data} loading={hooksState.loading} error={hooksState.error} variant="compact" />
            <HarnessCodeownersPanel {...props} data={resolvedCodeownersState.data} loading={resolvedCodeownersState.loading} error={resolvedCodeownersState.error} variant="compact" />
          </div>
        );
      case "commit":
      case "post-commit":
        return (<HarnessGitHubActionsFlowPanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...props} data={githubActionsState.data} loading={githubActionsState.loading} error={githubActionsState.error} variant="compact" />);
      default:
        return (<div className="p-3 text-[11px] text-slate-500">选择 Lifecycle 节点查看对应组件的上下文视图。</div>);
    }
  }, [selectedGovernanceNodeId, selectedRepoLabel, unsupportedRepoMessage, specSourcesState, designDecisionsState, instructionsState, agentHooksState, planState, hooksState, githubActionsState, resolvedCodeownersState, workspaceId, activeRepoCodebaseId, activeRepoPath, reloadInstructions, selectedTier]);

  /* ── render active section content ─────────────────────────────── */
  function renderSectionContent(sectionId: SectionId) {
    const sharedProps = { repoLabel: selectedRepoLabel, unsupportedMessage: unsupportedRepoMessage };

    switch (sectionId) {
      case "overview":
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-slate-200">
                  {governanceView === "lifecycle" ? "Lifecycle View" : "Governance Loop"}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {governanceView === "lifecycle" ? "从需求到交付的完整生命周期治理视图" : "治理拓扑与反馈网络视图"}
                </p>
              </div>
              <div className="inline-flex items-center rounded border border-slate-700 bg-[#1e2030] p-0.5">
                {(["lifecycle", "loop"] as const).map((view) => (
                  <button key={view} type="button" onClick={() => setGovernanceView(view)}
                    className={`rounded px-2.5 py-1 text-[10px] font-semibold transition-all ${
                      governanceView === view ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {view === "lifecycle" ? "Lifecycle" : "Loop"}
                  </button>
                ))}
              </div>
            </div>
            {governanceView === "lifecycle" ? (
              <HarnessLifecycleView
                selectedNodeId={selectedGovernanceNodeId}
                onSelectedNodeChange={handleGovernanceNodeClick}
                contextPanel={null}
                designDecisionNodeEnabled={hasArchitectureOrAdrSignal}
                dimensionCount={dimensionSpecs.length}
                metricCount={planState.data?.metricCount ?? 0}
                hardGateCount={planState.data?.hardGateCount ?? 0}
                hookCount={hookCount}
                workflowCount={workflowCount}
              />
            ) : (
              <HarnessGovernanceLoopGraph
                repoPath={activeRepoPath}
                selectedTier={selectedTier}
                specsError={specsState.error}
                dimensionCount={dimensionSpecs.length}
                planError={planState.error}
                metricCount={planState.data?.metricCount ?? 0}
                hardGateCount={planState.data?.hardGateCount ?? 0}
                unsupportedMessage={unsupportedRepoMessage}
                hooksData={hooksState.data}
                hooksError={hooksState.error}
                agentHooksData={agentHooksState.data}
                agentHooksError={agentHooksState.error}
                workflowData={githubActionsState.data}
                workflowError={githubActionsState.error}
                instructionsData={instructionsState.data}
                instructionsError={instructionsState.error}
                fitnessFiles={specFiles}
                designDecisionNodeEnabled={hasArchitectureOrAdrSignal}
                selectedNodeId={selectedGovernanceNodeId}
                onSelectedNodeChange={handleGovernanceNodeClick}
                contextPanel={null}
              />
            )}
          </div>
        );

      case "spec-sources":
        return (<HarnessSpecSourcesPanel {...sharedProps} data={specSourcesState.data} loading={specSourcesState.loading} error={specSourcesState.error} />);

      case "agent-instructions":
        return (<HarnessAgentInstructionsPanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...sharedProps} data={instructionsState.data} loading={instructionsState.loading} error={instructionsState.error} onAuditRerun={reloadInstructions} />);

      case "design-decisions":
        return (<HarnessDesignDecisionPanel {...sharedProps} data={designDecisionsState.data} loading={designDecisionsState.loading} error={designDecisionsState.error} />);

      case "repo-signals":
        return (<HarnessRepoSignalsPanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...sharedProps} mode="test" />);

      case "hook-systems":
        return (
          <div className="space-y-4">
            <HarnessHookRuntimePanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...sharedProps} data={hooksState.data} loading={hooksState.loading} error={hooksState.error} embedded />
            <HarnessAgentHookPanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...sharedProps} data={agentHooksState.data} loading={agentHooksState.loading} error={agentHooksState.error} embedded />
          </div>
        );

      case "review-triggers":
        return (<HarnessReviewTriggersPanel {...sharedProps} data={hooksState.data} loading={hooksState.loading} error={hooksState.error} />);

      case "release-triggers":
        return (<HarnessReleaseTriggersPanel {...sharedProps} data={hooksState.data} loading={hooksState.loading} error={hooksState.error} />);

      case "codeowners":
        return (<HarnessCodeownersPanel {...sharedProps} data={resolvedCodeownersState.data} loading={resolvedCodeownersState.loading} error={resolvedCodeownersState.error} />);

      case "entrix-fitness":
        return (
          <div className="space-y-4">
            <HarnessFitnessFilesDashboard specFiles={specFiles} selectedSpec={visibleSpec} loading={specsState.loading} error={specsState.error} unsupportedMessage={unsupportedRepoMessage} embedded />

            {/* Spec file list + source viewer */}
            <div className="rounded-lg border border-slate-700/60 bg-[#1e2030]/80">
              <div className="grid gap-0 xl:grid-cols-[260px_minmax(0,1fr)]">
                {/* Discovery list */}
                <div className="min-w-0 border-r border-slate-700/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Discovery</span>
                    <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-500">{specFiles.length}</span>
                  </div>
                  <div className="mt-2.5 space-y-1">
                    {specsState.loading && <div className="text-[10px] text-slate-600">Loading…</div>}
                    {unsupportedRepoMessage && <HarnessUnsupportedState className="text-[10px] text-amber-400" />}
                    {specsState.error && !unsupportedRepoMessage && <div className="text-[10px] text-red-400">{specsState.error}</div>}
                    {!specsState.loading && !specsState.error && !unsupportedRepoMessage && specFiles.length === 0 && (
                      <div className="text-[10px] text-slate-600">No fitness files found.</div>
                    )}
                    {!unsupportedRepoMessage && primaryFiles.map((file) => (
                      <button
                        key={file.name} type="button"
                        onClick={() => setSelectedSpecName(file.name)}
                        className={`w-full rounded px-2 py-1.5 text-left transition-colors ${
                          visibleSpec?.name === file.name
                            ? "bg-blue-600/15 text-slate-200 ring-1 ring-blue-500/40"
                            : "text-slate-400 hover:bg-slate-700/30 hover:text-slate-300"
                        }`}
                      >
                        <div className="text-[11px] font-medium">{file.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[9px] opacity-70">
                          <span>{file.kind === "dimension" ? (file.dimension ?? "dimension") : file.kind}</span>
                          <span className="font-mono">{file.language}</span>
                          {file.metricCount > 0 && <span className="ml-auto">{file.metricCount} metrics</span>}
                        </div>
                      </button>
                    ))}
                    {!unsupportedRepoMessage && auxiliaryFiles.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[9px] uppercase tracking-wider text-slate-600 hover:text-slate-400">
                          Auxiliary ({auxiliaryFiles.length})
                        </summary>
                        <div className="mt-1 space-y-1">
                          {auxiliaryFiles.map((file) => (
                            <button
                              key={file.name} type="button"
                              onClick={() => setSelectedSpecName(file.name)}
                              className={`w-full rounded px-2 py-1 text-left text-[10px] transition-colors ${
                                visibleSpec?.name === file.name
                                  ? "bg-blue-600/15 text-slate-200 ring-1 ring-blue-500/40"
                                  : "text-slate-500 hover:bg-slate-700/30 hover:text-slate-400"
                              }`}
                            >
                              {file.name}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>

                {/* Source viewer */}
                <div className="min-w-0 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Source</div>
                      <div className="mt-0.5 text-[12px] font-semibold text-slate-300">{visibleSpec?.name ?? "Select a file"}</div>
                    </div>
                    {visibleSpec?.kind === "dimension" && (
                      <div className="flex gap-1.5 text-[9px]">
                        <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-slate-500">w:{visibleSpec.weight ?? 0}</span>
                        <span className="rounded bg-emerald-900/30 px-1.5 py-0.5 text-emerald-400">pass:{visibleSpec.thresholdPass ?? 90}</span>
                        <span className="rounded bg-yellow-900/30 px-1.5 py-0.5 text-yellow-400">warn:{visibleSpec.thresholdWarn ?? 80}</span>
                      </div>
                    )}
                  </div>
                  {unsupportedRepoMessage ? (
                    <HarnessUnsupportedState />
                  ) : visibleSpec ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-500">
                        <span className="rounded bg-slate-700/50 px-1.5 py-0.5">{visibleSpec.kind}</span>
                        <span className="rounded bg-slate-700/50 px-1.5 py-0.5">{visibleSpec.language}</span>
                        <span className="font-mono text-slate-400">{visibleSpec.relativePath}</span>
                      </div>
                      {visibleSpec.kind === "dimension" && visibleSpec.frontmatterSource && (
                        <details className="rounded border border-slate-700/40 p-2">
                          <summary className="cursor-pointer text-[9px] uppercase tracking-wider text-slate-600">Frontmatter</summary>
                          <div className="mt-2">
                            <CodeViewer code={visibleSpec.frontmatterSource} filename={`${visibleSpec.name}.frontmatter.yaml`} language="yaml" maxHeight="200px" showHeader={false} wordWrap />
                          </div>
                        </details>
                      )}
                      {visibleSpec.language === "yaml" && (
                        <CodeViewer code={visibleSpec.source} filename={visibleSpec.name} language="yaml" maxHeight="320px" showHeader={false} wordWrap />
                      )}
                      {visibleSpec.language === "markdown" && visibleSpec.kind !== "dimension" && visibleSpecCodeBlocks.length > 0 && (
                        <div className="space-y-2">
                          {visibleSpecCodeBlocks.map((block) => (
                            <CodeViewer key={block.id} code={block.code} filename={`${visibleSpec.name}.${block.language || "txt"}`} maxHeight="200px" showHeader={false} wordWrap />
                          ))}
                        </div>
                      )}
                      {visibleSpec.kind === "dimension" && (
                        <div className="rounded border border-slate-700/40">
                          <div className="grid grid-cols-[minmax(0,1.5fr)_auto] gap-2 border-b border-slate-700/40 px-2.5 py-1.5 text-[9px] uppercase tracking-wider text-slate-600">
                            <div>Metric</div><div>Dispatch</div>
                          </div>
                          {visibleSpec.metrics.map((metric) => (
                            <div key={metric.name} className="grid grid-cols-[minmax(0,1.5fr)_auto] gap-2 border-t border-slate-800/40 px-2.5 py-2 first:border-t-0">
                              <div className="min-w-0">
                                <div className="text-[11px] font-medium text-slate-300">{metric.name}</div>
                                <div className="mt-0.5 break-all font-mono text-[9px] text-slate-500">{metric.command || "—"}</div>
                                {metric.description && <div className="mt-0.5 text-[9px] text-slate-600">{metric.description}</div>}
                              </div>
                              <div className="flex flex-wrap content-start justify-end gap-1 text-[9px]">
                                <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-slate-500">{metric.runner}</span>
                                <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-slate-500">{metric.tier}</span>
                                <span className={`rounded px-1.5 py-0.5 ${metric.hardGate ? "bg-red-900/30 text-red-400" : "bg-slate-700/50 text-slate-500"}`}>
                                  {metric.gate}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 text-[11px] text-slate-600">Select a fitness file to inspect.</div>
                  )}
                </div>
              </div>
            </div>

            <HarnessExecutionPlanFlow loading={planState.loading} error={planState.error} plan={planState.data} repoLabel={selectedRepoLabel} selectedTier={selectedTier} onTierChange={setSelectedTier} unsupportedMessage={unsupportedRepoMessage} embedded />
          </div>
        );

      case "ci-cd":
        return (<HarnessGitHubActionsFlowPanel workspaceId={workspaceId} codebaseId={activeRepoCodebaseId} repoPath={activeRepoPath} {...sharedProps} data={githubActionsState.data} loading={githubActionsState.loading} error={githubActionsState.error} />);

      default:
        return null;
    }
  }

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f1117]">

      {/* ── Title Bar ─────────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-700/60 bg-[#14161f] px-3">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[12px] font-semibold tracking-wide text-slate-400">Harness Console</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-500">
          <span>workspace: <span className="text-slate-400">{activeWorkspaceTitle ?? "—"}</span></span>
          <span>repo: <span className="text-blue-400">{selectedRepoLabel}</span></span>
          <div className="flex items-center gap-1.5">
            <RepoPicker
              value={activeRepoSelection}
              onChange={(selection) => {
                setSelectedRepoOverrideState({ workspaceId, selection });
                if (!selection) { setSelectedCodebaseId(""); return; }
                const matched = codebases.find((c) => c.repoPath === selection.path && (selection.branch ? (c.branch ?? "") === selection.branch : true))
                  ?? codebases.find((c) => c.repoPath === selection.path)
                  ?? codebases.find((c) => (c.label ?? c.repoPath.split("/").pop() ?? c.repoPath) === selection.name);
                setSelectedCodebaseId(matched?.id ?? "");
              }}
              pathDisplay="hidden"
              additionalRepos={codebases.map((c) => ({
                name: c.label ?? c.repoPath.split("/").pop() ?? c.repoPath,
                path: c.repoPath,
                branch: c.branch ?? "",
              }))}
            />
          </div>
        </div>
      </div>

      {/* ── Main body ─────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">

        {/* ── Activity Bar ────────────────────────────────────────── */}
        <div className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-slate-700/50 bg-[#14161f] py-2">
          {SECTIONS.slice(0, 6).map((sec) => (
            <button
              key={sec.id} type="button"
              onClick={() => openSection(sec.id)}
              title={sec.label}
              className={`flex h-9 w-9 items-center justify-center rounded text-[13px] transition-colors ${
                activeSection === sec.id
                  ? "bg-blue-600/20 text-blue-400 shadow-[inset_2px_0_0_0_#3b82f6]"
                  : "text-slate-600 hover:text-slate-400"
              }`}
            >
              {sec.icon}
            </button>
          ))}
          <div className="my-1 h-px w-5 bg-slate-700/40" />
          {SECTIONS.slice(6).map((sec) => (
            <button
              key={sec.id} type="button"
              onClick={() => openSection(sec.id)}
              title={sec.label}
              className={`flex h-9 w-9 items-center justify-center rounded text-[13px] transition-colors ${
                activeSection === sec.id
                  ? "bg-blue-600/20 text-blue-400 shadow-[inset_2px_0_0_0_#3b82f6]"
                  : "text-slate-600 hover:text-slate-400"
              }`}
            >
              {sec.icon}
            </button>
          ))}
        </div>

        {/* ── Side Bar ────────────────────────────────────────────── */}
        <div className="flex w-56 shrink-0 flex-col border-r border-slate-700/50 bg-[#181a26] overflow-y-auto desktop-scrollbar-thin">
          <div className="border-b border-slate-700/40 px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Harness</div>
            <div className="mt-0.5 text-[10px] text-slate-600">Section Explorer</div>
          </div>
          <div className="flex-1 px-1.5 py-1.5">
            {SECTIONS.map((sec) => {
              const badge = sectionBadges.get(sec.id) ?? null;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id} type="button"
                  onClick={() => openSection(sec.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                    isActive
                      ? "bg-blue-600/15 text-slate-200"
                      : "text-slate-500 hover:bg-slate-700/30 hover:text-slate-400"
                  }`}
                >
                  <span className="w-4 shrink-0 text-center text-[11px]">{sec.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px]">{sec.label}</span>
                  {badge && (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${
                      isActive ? "bg-blue-500/20 text-blue-300" : "bg-slate-700/50 text-slate-500"
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Summary stats */}
          <div className="border-t border-slate-700/40 px-3 py-2.5 text-[10px] text-slate-600">
            <div className="space-y-1">
              <div className="flex justify-between"><span>Dimensions</span><span className="text-slate-400">{specsState.loading ? "…" : dimensionSpecs.length}</span></div>
              <div className="flex justify-between"><span>Metrics</span><span className="text-slate-400">{planState.loading ? "…" : (planState.data?.metricCount ?? 0)}</span></div>
              <div className="flex justify-between"><span>Hard gates</span><span className="text-slate-400">{planState.loading ? "…" : (planState.data?.hardGateCount ?? 0)}</span></div>
              <div className="flex justify-between"><span>Hooks</span><span className="text-slate-400">{hookCount}</span></div>
              <div className="flex justify-between"><span>Workflows</span><span className="text-slate-400">{workflowCount}</span></div>
            </div>
          </div>
        </div>

        {/* ── Center: Tabs + Editor + Bottom Panel ────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">

          {/* ── Editor Tabs ───────────────────────────────────────── */}
          <div className="flex h-9 shrink-0 items-center border-b border-slate-700/50 bg-[#14161f] overflow-x-auto desktop-scrollbar-thin">
            {openTabs.map((tabId) => {
              const sec = SECTIONS.find((s) => s.id === tabId);
              if (!sec) return null;
              const isActive = activeSection === tabId;
              return (
                <div
                  key={tabId}
                  className={`group flex h-full shrink-0 items-center border-r border-slate-700/30 ${
                    isActive ? "bg-[#191b28]" : "bg-[#14161f] hover:bg-[#181a24]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSection(tabId)}
                    className={`px-3 text-[11px] font-medium ${
                      isActive
                        ? "text-slate-200 shadow-[inset_0_-1px_0_0_#3b82f6]"
                        : "text-slate-500 hover:text-slate-400"
                    }`}
                  >
                    {sec.shortLabel}
                  </button>
                  {tabId !== "overview" && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); closeTab(tabId); }}
                      className="mr-1 rounded p-0.5 text-[10px] text-slate-600 opacity-0 transition-opacity hover:bg-slate-700/50 hover:text-slate-400 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Editor Content ────────────────────────────────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#191b28] p-4 desktop-scrollbar">
            {renderSectionContent(activeSection)}
          </div>

          {/* ── Bottom Panel ──────────────────────────────────────── */}
          {showBottomPanel && (
            <div className="flex h-60 shrink-0 flex-col border-t border-slate-700/50 bg-[#14161f]">
              <div className="flex h-8 items-center justify-between border-b border-slate-700/40 px-3">
                <div className="flex items-center gap-0.5">
                  {(["context", "plan", "fitness"] as const).map((tab) => (
                    <button
                      key={tab} type="button"
                      onClick={() => setBottomPanelTab(tab)}
                      className={`px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                        bottomPanelTab === tab
                          ? "border-b border-blue-500 text-slate-200"
                          : "text-slate-600 hover:text-slate-400"
                      }`}
                    >
                      {tab === "context" ? "Context" : tab === "plan" ? "Execution Plan" : "Fitness"}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowBottomPanel(false)}
                  className="rounded p-1 text-[10px] text-slate-600 hover:bg-slate-700/40 hover:text-slate-400"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 desktop-scrollbar-thin">
                {bottomPanelTab === "context" && governanceContextPanel}
                {bottomPanelTab === "plan" && (
                  <HarnessExecutionPlanFlow loading={planState.loading} error={planState.error} plan={planState.data} repoLabel={selectedRepoLabel} selectedTier={selectedTier} onTierChange={setSelectedTier} unsupportedMessage={unsupportedRepoMessage} variant="compact" />
                )}
                {bottomPanelTab === "fitness" && (
                  <HarnessFitnessFilesDashboard specFiles={specFiles} selectedSpec={visibleSpec} loading={specsState.loading} error={specsState.error} unsupportedMessage={unsupportedRepoMessage} embedded />
                )}
              </div>
            </div>
          )}

          {/* ── Status Bar ────────────────────────────────────────── */}
          <div className="flex h-6 shrink-0 items-center justify-between border-t border-slate-700/50 bg-[#007acc] px-3 text-[10px] text-white/90">
            <div className="flex items-center gap-3">
              <span>{activeWorkspaceTitle ?? "—"}</span>
              <span className="opacity-50">·</span>
              <span>{selectedRepoLabel}</span>
              <span className="opacity-50">·</span>
              <span>{dimensionSpecs.length} dimensions</span>
              <span className="opacity-50">·</span>
              <span>{planState.data?.metricCount ?? 0} metrics</span>
            </div>
            <div className="flex items-center gap-3">
              {(planState.data?.hardGateCount ?? 0) > 0 && (
                <span className="text-yellow-200">{planState.data?.hardGateCount} hard gates</span>
              )}
              <span>{hookCount} hooks</span>
              <span>{workflowCount} workflows</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
