"use client";

import { useMemo } from "react";
import { HarnessSectionCard, HarnessSectionStateFrame } from "@/client/components/harness-section-card";
import { HarnessUnsupportedState } from "@/client/components/harness-support-state";
import type {
  ArchitectureQualityResponse,
  ArchitectureRuleResult,
  ArchitectureSuiteName,
  ArchitectureViolation,
} from "@/client/hooks/use-harness-settings-data";
import { useTranslation } from "@/i18n";

type HarnessArchitectureQualityPanelProps = {
  repoLabel: string;
  unsupportedMessage?: string | null;
  data?: ArchitectureQualityResponse | null;
  loading?: boolean;
  error?: string | null;
  embedded?: boolean;
  onRefresh?: () => void;
};

type FlattenedViolation = {
  suite: ArchitectureSuiteName;
  ruleId: string;
  ruleTitle: string;
  count: number;
  summary: string;
  kindLabel: string;
};

type ArchitectureCluster = {
  label: string;
  count: number;
  sample: string;
};

function formatSignedDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function deltaTone(value: number, mode: "risk" | "recovery" = "risk") {
  if (value === 0) {
    return "border-desktop-border bg-desktop-bg-primary text-desktop-text-secondary";
  }
  const positiveIsBad = mode === "risk";
  const isBad = positiveIsBad ? value > 0 : value < 0;
  return isBad
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatSuiteLabel(
  suite: ArchitectureSuiteName,
  labels: { suiteBoundaries: string; suiteCycles: string },
): string {
  return suite === "cycles" ? labels.suiteCycles : labels.suiteBoundaries;
}

function buildViolationSummary(violation: ArchitectureViolation): string {
  switch (violation.kind) {
    case "dependency":
      return `${violation.source} -> ${violation.target}`;
    case "cycle":
      return violation.path.join(" | ");
    case "empty-test":
      return violation.message;
    case "unknown":
    default:
      return violation.summary;
  }
}

function buildViolationKindLabel(
  violation: ArchitectureViolation,
  labels: {
    violationDependency: string;
    violationCycle: string;
    violationEmptyTest: string;
    violationUnknown: string;
  },
): string {
  switch (violation.kind) {
    case "dependency":
      return labels.violationDependency;
    case "cycle":
      return labels.violationCycle;
    case "empty-test":
      return labels.violationEmptyTest;
    case "unknown":
    default:
      return labels.violationUnknown;
  }
}

function buildViolationCount(violation: ArchitectureViolation): number {
  if (violation.kind === "dependency" || violation.kind === "cycle") {
    return violation.edgeCount;
  }
  return 1;
}

function normalizeModuleBucket(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] !== "src") {
    return normalized;
  }
  if (parts[1] === "app" && parts[2] === "api") {
    return parts.slice(0, Math.min(parts.length, 4)).join("/");
  }
  return parts.slice(0, Math.min(parts.length, 3)).join("/");
}

function buildBoundaryLeakClusters(rules: ArchitectureRuleResult[]): ArchitectureCluster[] {
  const clusters = new Map<string, ArchitectureCluster>();

  for (const rule of rules) {
    for (const violation of rule.violations) {
      if (violation.kind !== "dependency") {
        continue;
      }
      const label = `${normalizeModuleBucket(violation.source)} -> ${normalizeModuleBucket(violation.target)}`;
      const current = clusters.get(label);
      if (current) {
        current.count += 1;
      } else {
        clusters.set(label, {
          label,
          count: 1,
          sample: `${violation.source} -> ${violation.target}`,
        });
      }
    }
  }

  return [...clusters.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildCycleHotspotClusters(rules: ArchitectureRuleResult[]): ArchitectureCluster[] {
  const clusters = new Map<string, ArchitectureCluster>();

  for (const rule of rules) {
    for (const violation of rule.violations) {
      if (violation.kind !== "cycle") {
        continue;
      }

      for (const edge of violation.path) {
        const [source, target] = edge.split(" -> ");
        for (const bucket of [normalizeModuleBucket(source ?? ""), normalizeModuleBucket(target ?? "")]) {
          if (!bucket) {
            continue;
          }
          const current = clusters.get(bucket);
          if (current) {
            current.count += 1;
          } else {
            clusters.set(bucket, {
              label: bucket,
              count: 1,
              sample: edge,
            });
          }
        }
      }
    }
  }

  return [...clusters.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function statusTone(status: "pass" | "fail" | "skipped") {
  if (status === "fail") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "skipped") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function summarizeRule(rule: ArchitectureRuleResult): string {
  const first = rule.violations[0];
  if (!first) {
    return "";
  }
  return buildViolationSummary(first);
}

export function HarnessArchitectureQualityPanel({
  repoLabel: _repoLabel,
  unsupportedMessage,
  data,
  loading = false,
  error = null,
  embedded = false,
  onRefresh,
}: HarnessArchitectureQualityPanelProps) {
  const { t } = useTranslation();
  const copy = t.settings.harness.architectureQuality;
  const actionLabel = data ? t.common.refresh : copy.runScanLabel;

  const failedRules = useMemo(
    () => (data?.reports ?? []).flatMap((report) => report.results.filter((result) => result.status === "fail")),
    [data?.reports],
  );
  const flattenedViolations = useMemo<FlattenedViolation[]>(
    () => failedRules.flatMap((rule) => rule.violations.slice(0, 8).map((violation) => ({
      suite: rule.suite,
      ruleId: rule.id,
      ruleTitle: rule.title,
      count: buildViolationCount(violation),
      summary: buildViolationSummary(violation),
      kindLabel: buildViolationKindLabel(violation, copy),
    }))),
    [copy, failedRules],
  );
  const boundaryLeakClusters = useMemo(
    () => buildBoundaryLeakClusters(failedRules.filter((rule) => rule.suite === "boundaries")),
    [failedRules],
  );
  const cycleHotspotClusters = useMemo(
    () => buildCycleHotspotClusters(failedRules.filter((rule) => rule.suite === "cycles")),
    [failedRules],
  );

  const statusLabel = data?.summaryStatus === "fail"
    ? copy.statusFail
    : data?.summaryStatus === "skipped"
      ? copy.statusSkipped
      : copy.statusPass;

  const content = (
    <>
      {loading ? (
        <HarnessSectionStateFrame tone="warning">{t.common.running}</HarnessSectionStateFrame>
      ) : null}

      {unsupportedMessage ? (
        <HarnessUnsupportedState className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-4 text-[11px] text-amber-800" />
      ) : null}

      {error && !unsupportedMessage ? (
        <HarnessSectionStateFrame tone="error">{error}</HarnessSectionStateFrame>
      ) : null}

      {!loading && !error && !unsupportedMessage && !data ? (
        <HarnessSectionStateFrame>
          <div className="space-y-3">
            <div>{copy.idleDescription}</div>
            {onRefresh ? (
              <button type="button" className="desktop-btn desktop-btn-secondary" onClick={onRefresh}>
                {copy.runScanLabel}
              </button>
            ) : null}
          </div>
        </HarnessSectionStateFrame>
      ) : null}

      {!loading && !error && !unsupportedMessage && data ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.statusLabel}</div>
              <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(data.summaryStatus)}`}>
                {statusLabel}
              </div>
            </div>
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.rulesLabel}</div>
              <div className="mt-2 text-[18px] font-semibold text-desktop-text-primary">{data.ruleCount}</div>
            </div>
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.failedRulesLabel}</div>
              <div className="mt-2 text-[18px] font-semibold text-desktop-text-primary">{data.failedRuleCount}</div>
            </div>
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.violationsLabel}</div>
              <div className="mt-2 text-[18px] font-semibold text-desktop-text-primary">{data.violationCount}</div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.compareTitle}</div>
              {data.comparison ? (
                <div className="mt-2 space-y-3">
                  <div className="text-[11px] text-desktop-text-secondary">
                    {copy.previousScanLabel}: {data.comparison.previousGeneratedAt}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className={`rounded-sm border px-3 py-2 ${deltaTone(data.comparison.failedRuleDelta)}`}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">{copy.failedRuleDeltaLabel}</div>
                      <div className="mt-2 text-[18px] font-semibold">{formatSignedDelta(data.comparison.failedRuleDelta)}</div>
                    </div>
                    <div className={`rounded-sm border px-3 py-2 ${deltaTone(data.comparison.violationDelta)}`}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">{copy.violationDeltaLabel}</div>
                      <div className="mt-2 text-[18px] font-semibold">{formatSignedDelta(data.comparison.violationDelta)}</div>
                    </div>
                    <div className={`rounded-sm border px-3 py-2 ${deltaTone(data.comparison.newFailingRules.length)}`}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">{copy.newFailuresTitle}</div>
                      <div className="mt-2 text-[18px] font-semibold">{data.comparison.newFailingRules.length}</div>
                    </div>
                    <div className={`rounded-sm border px-3 py-2 ${deltaTone(data.comparison.resolvedRules.length, "recovery")}`}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">{copy.resolvedRulesTitle}</div>
                      <div className="mt-2 text-[18px] font-semibold">{data.comparison.resolvedRules.length}</div>
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.newFailuresTitle}</div>
                      {data.comparison.newFailingRules.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {data.comparison.newFailingRules.slice(0, 4).map((rule) => (
                            <div key={`${rule.suite}:${rule.id}`} className="rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2">
                              <div className="text-[11px] font-semibold text-desktop-text-primary">{rule.title}</div>
                              <div className="mt-1 text-[10px] text-desktop-text-secondary">{formatSuiteLabel(rule.suite, copy)} · {formatSignedDelta(rule.violationDelta)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                          {copy.noNewFailures}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.resolvedRulesTitle}</div>
                      {data.comparison.resolvedRules.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {data.comparison.resolvedRules.slice(0, 4).map((rule) => (
                            <div key={`${rule.suite}:${rule.id}`} className="rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2">
                              <div className="text-[11px] font-semibold text-desktop-text-primary">{rule.title}</div>
                              <div className="mt-1 text-[10px] text-desktop-text-secondary">{formatSuiteLabel(rule.suite, copy)} · {formatSignedDelta(rule.violationDelta)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                          {copy.noResolvedRules}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                  {copy.noComparison}
                </div>
              )}
            </div>

            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.notesLabel}</div>
              <div className="mt-2 space-y-2 text-[11px] text-desktop-text-secondary">
                <div>{copy.sourceLabel}: {data.archUnitSource ?? t.common.unavailable}</div>
                <div>{copy.tsconfigLabel}: {data.tsconfigPath || t.common.unavailable}</div>
                <div>{copy.snapshotPathLabel}: {data.snapshotPath || t.common.unavailable}</div>
                {(data.notes ?? []).length > 0 ? (
                  <ul className="list-inside list-disc space-y-1">
                    {data.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.failedRulesTitle}</div>
                {data.archUnitSource ? (
                  <div className="truncate text-[10px] text-desktop-text-secondary">
                    {copy.sourceLabel}: {data.archUnitSource}
                  </div>
                ) : null}
              </div>
              {failedRules.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {failedRules.map((rule) => (
                    <div key={rule.id} className="rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-desktop-text-primary">{rule.title}</span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                          {formatSuiteLabel(rule.suite, copy)}
                        </span>
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
                          {rule.violationCount}
                        </span>
                      </div>
                      <div className="mt-1 break-all font-mono text-[10px] text-desktop-text-secondary">
                        {summarizeRule(rule)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                  {copy.noFailedRules}
                </div>
              )}
            </div>

          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.boundaryLeaksTitle}</div>
              {boundaryLeakClusters.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {boundaryLeakClusters.slice(0, 8).map((cluster) => (
                    <div key={cluster.label} className="rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-desktop-text-primary">{cluster.label}</span>
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
                          {cluster.count}
                        </span>
                      </div>
                      <div className="mt-1 break-all font-mono text-[10px] text-desktop-text-secondary">
                        {cluster.sample}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                  {copy.noBoundaryLeaks}
                </div>
              )}
            </div>

            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.cycleHotspotsTitle}</div>
              {cycleHotspotClusters.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {cycleHotspotClusters.slice(0, 8).map((cluster) => (
                    <div key={cluster.label} className="rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-desktop-text-primary">{cluster.label}</span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                          {cluster.count}
                        </span>
                      </div>
                      <div className="mt-1 break-all font-mono text-[10px] text-desktop-text-secondary">
                        {cluster.sample}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                  {copy.noCycleHotspots}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.topViolationsTitle}</div>
            {flattenedViolations.length > 0 ? (
              <div className="mt-2 overflow-x-auto overflow-y-auto rounded-sm border border-desktop-border desktop-scrollbar-thin">
                <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-desktop-border bg-desktop-bg-secondary/60">
                      <th className="px-3 py-2 font-semibold text-desktop-text-secondary">{copy.ruleColumn}</th>
                      <th className="px-3 py-2 font-semibold text-desktop-text-secondary">{copy.suiteColumn}</th>
                      <th className="px-3 py-2 font-semibold text-desktop-text-secondary">{copy.countColumn}</th>
                      <th className="px-3 py-2 font-semibold text-desktop-text-secondary">{copy.summaryColumn}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flattenedViolations.slice(0, 16).map((violation, index) => (
                      <tr key={`${violation.ruleId}-${violation.kindLabel}-${index}`} className="border-b border-desktop-border/70">
                        <td className="px-3 py-2 text-desktop-text-primary">
                          <div className="font-medium">{violation.ruleTitle}</div>
                          <div className="text-[10px] text-desktop-text-secondary">{violation.kindLabel}</div>
                        </td>
                        <td className="px-3 py-2 text-desktop-text-secondary">{formatSuiteLabel(violation.suite, copy)}</td>
                        <td className="px-3 py-2 text-desktop-text-secondary">{violation.count}</td>
                        <td className="px-3 py-2 break-all font-mono text-[10px] text-desktop-text-primary">{violation.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                {copy.noViolations}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <HarnessSectionCard
        title={copy.title}
        description={copy.description}
        actions={onRefresh ? (
          <button type="button" className="desktop-btn desktop-btn-secondary" onClick={onRefresh}>
            {actionLabel}
          </button>
        ) : null}
      >
        {content}
      </HarnessSectionCard>
    );
  }

  return (
    <HarnessSectionCard
      title={copy.title}
      description={copy.description}
      actions={onRefresh ? (
        <button type="button" className="desktop-btn desktop-btn-secondary" onClick={onRefresh}>
          {actionLabel}
        </button>
      ) : null}
    >
      {content}
    </HarnessSectionCard>
  );
}
