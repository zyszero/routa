"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Folder,
  RefreshCw,
  Search,
} from "lucide-react";

import { DesktopAppShell } from "@/client/components/desktop-app-shell";
import { RepoPicker, type RepoSelection } from "@/client/components/repo-picker";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { useAcp } from "@/client/hooks/use-acp";
import { useCodebases, useWorkspaces } from "@/client/hooks/use-workspaces";
import { desktopAwareFetch } from "@/client/utils/diagnostics";
import { saveRepoSelection } from "@/client/utils/repo-selection-storage";
import { useTranslation } from "@/i18n";

import type {
  AggregatedSelectionSession,
  FeatureDetail,
  FeatureSurfacePage,
  FileTreeNode,
  InspectorTab,
} from "./types";
import {
  buildSessionAnalysisSessionName,
  type FeatureExplorerUrlState,
  loadInitialRepoSelection,
  mergeSessionDiagnostics,
  readFeatureExplorerUrlState,
  replaceFeatureExplorerUrlState,
} from "./feature-explorer-client-helpers";
import { buildSelectableFileIdsByNode, buildTreeNodeStats, FileIcon, flattenFiles, formatShortDate, TreeNodeRow } from "./feature-explorer-file-tree";
import { FeatureApiRow, FeatureRouteRow, FeatureStructureSection, InlineStatPill, SimpleSourceFileRow } from "./feature-explorer-structure-sections";
import { FeatureExplorerDrawers, FeatureExplorerInspectorPane } from "./feature-explorer-secondary-ui";
import { buildSessionAnalysisPrompt } from "./session-analysis";
import {
  type ExplorerSection,
  type ExplorerSurfaceItem,
  type SurfaceNavigationView,
  type SurfaceTreeNode,
  SurfaceTreeRow,
  buildGroupedApiItems,
  buildApiLookupKey,
  buildSurfaceTree,
  dedupeFeatureIds,
  matchesQuery,
  parseApiDeclaration,
  splitApiRouteSegments,
  splitBrowserRouteSegments,
  splitPathSegments,
} from "./surface-navigation";
import { useFeatureExplorerData } from "./use-feature-explorer-data";

type CapabilityTreeGroup = {
  id: string;
  title: string;
  description: string;
  items: ExplorerSurfaceItem[];
};

function collectSurfaceItemsByFeature(items: ExplorerSurfaceItem[]): Map<string, ExplorerSurfaceItem[]> {
  const map = new Map<string, ExplorerSurfaceItem[]>();

  for (const item of items) {
    for (const featureId of item.featureIds) {
      const current = map.get(featureId) ?? [];
      current.push(item);
      map.set(featureId, current);
    }
  }

  return map;
}

export function FeatureExplorerPageClient({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const inferredGroupId = "inferred-surfaces";
  const router = useRouter();
  const { t, locale } = useTranslation();
  const workspacesHook = useWorkspaces();
  const { codebases } = useCodebases(workspaceId);

  const workspace = workspacesHook.workspaces.find((item) => item.id === workspaceId) ?? null;
  const analysisAcp = useAcp();
  const analysisAcpConnected = analysisAcp.connected;
  const analysisAcpLoading = analysisAcp.loading;
  const connectAnalysisAcp = analysisAcp.connect;
  const analysisProviders = analysisAcp.providers;
  const analysisSelectedProvider = analysisAcp.selectedProvider;
  const setAnalysisProvider = analysisAcp.setProvider;
  const selectAnalysisSession = analysisAcp.selectSession;
  const promptAnalysisSession = analysisAcp.promptSession;
  const workspaceRepos = useMemo(
    () =>
      codebases.map((codebase) => ({
        name: codebase.label ?? codebase.repoPath.split("/").pop() ?? codebase.repoPath,
        path: codebase.repoPath,
        branch: codebase.branch ?? "",
      })),
    [codebases],
  );
  const [repoSelectionOverrides, setRepoSelectionOverrides] = useState<Record<string, RepoSelection | null>>(() => {
    const initialSelection = loadInitialRepoSelection(workspaceId);
    return initialSelection ? { [workspaceId]: initialSelection } : {};
  });
  const [generateRefreshCounter, setGenerateRefreshCounter] = useState(0);
  const hasRepoSelectionOverride = Object.prototype.hasOwnProperty.call(repoSelectionOverrides, workspaceId);
  const manualRepoSelection = hasRepoSelectionOverride
    ? (repoSelectionOverrides[workspaceId] ?? null)
    : loadInitialRepoSelection(workspaceId);
  const fallbackRepoSelection = workspaceRepos[0] ?? null;
  const effectiveRepoSelection = manualRepoSelection ?? fallbackRepoSelection;
  const repoRefreshKey = `${effectiveRepoSelection?.path ?? ""}:${effectiveRepoSelection?.branch ?? ""}:${generateRefreshCounter}`;

  useEffect(() => {
    saveRepoSelection("featureExplorer", workspaceId, manualRepoSelection);
  }, [manualRepoSelection, workspaceId]);

  const {
    loading,
    error,
    capabilityGroups,
    features,
    surfaceIndex,
    featureDetail,
    featureDetailLoading,
    initialFeatureId,
    fetchFeatureDetail,
  } = useFeatureExplorerData({
    workspaceId,
    repoPath: effectiveRepoSelection?.path,
    refreshKey: repoRefreshKey,
  });

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("context");
  const [middleView, setMiddleView] = useState<"list" | "tree">("tree");
  const [surfaceNavigationView, setSurfaceNavigationView] = useState<SurfaceNavigationView>("capabilities");
  const [initialUrlState] = useState<FeatureExplorerUrlState>(() => readFeatureExplorerUrlState());
  const [featureId, setFeatureId] = useState<string>(initialUrlState.featureId);
  const [selectedSurfaceKey, setSelectedSurfaceKey] = useState<string>("");
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [surfaceSectionCollapsed, setSurfaceSectionCollapsed] = useState<Record<string, boolean>>({});
  const [surfaceTreeExpandedIds, setSurfaceTreeExpandedIds] = useState<Record<string, boolean>>({});
  const [structureSectionCollapsed, setStructureSectionCollapsed] = useState<Record<string, boolean>>({});
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>("");
  const [desiredFilePath, setDesiredFilePath] = useState<string>(initialUrlState.filePath);
  const [hasResolvedInitialUrlSelection, setHasResolvedInitialUrlSelection] = useState(
    initialUrlState.featureId === "",
  );
  const [isSessionAnalysisDrawerOpen, setIsSessionAnalysisDrawerOpen] = useState(false);
  const [isGenerateDrawerOpen, setIsGenerateDrawerOpen] = useState(false);
  const [isStartingSessionAnalysis, setIsStartingSessionAnalysis] = useState(false);
  const [sessionAnalysisError, setSessionAnalysisError] = useState<string | null>(null);
  const [analysisSessionId, setAnalysisSessionId] = useState<string | null>(null);
  const [analysisSessionName, setAnalysisSessionName] = useState("");
  const [analysisSessionProviderId, setAnalysisSessionProviderId] = useState("");
  const [isAnalysisSessionPaneOpen, setIsAnalysisSessionPaneOpen] = useState(false);

  // Derive effective feature ID: user-selected or auto-initialized from hook
  const effectiveFeatureId = featureId || initialFeatureId;
  const featureMetadata = useMemo(
    () => surfaceIndex.metadata?.features ?? [],
    [surfaceIndex.metadata],
  );
  const featureSummaryById = useMemo(
    () => new Map(features.map((feature) => [feature.id, feature])),
    [features],
  );
  const featureMetadataById = useMemo(
    () => new Map(featureMetadata.map((feature) => [feature.id, feature])),
    [featureMetadata],
  );
  const pageFeatureMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const metadataItem of featureMetadata) {
      for (const route of metadataItem.pages ?? []) {
        const current = map.get(route) ?? [];
        current.push(metadataItem.id);
        map.set(route, current);
      }
    }
    for (const page of surfaceIndex.pages) {
      if (!page.sourceFile) {
        continue;
      }
      for (const metadataItem of featureMetadata) {
        if (!(metadataItem.sourceFiles ?? []).includes(page.sourceFile)) {
          continue;
        }
        const current = map.get(page.route) ?? [];
        current.push(metadataItem.id);
        map.set(page.route, current);
      }
    }
    return map;
  }, [featureMetadata, surfaceIndex.pages]);
  const apiFeatureMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const metadataItem of featureMetadata) {
      for (const declaration of metadataItem.apis ?? []) {
        const parsedDeclaration = parseApiDeclaration(declaration);
        const lookupKey = buildApiLookupKey(parsedDeclaration.method, parsedDeclaration.path);
        const current = map.get(lookupKey) ?? [];
        current.push(metadataItem.id);
        map.set(lookupKey, current);
      }
    }

    for (const implementationApi of [...surfaceIndex.nextjsApis, ...surfaceIndex.rustApis]) {
      const lookupKey = buildApiLookupKey(implementationApi.method, implementationApi.path);
      for (const metadataItem of featureMetadata) {
        if (!(metadataItem.sourceFiles ?? []).some((sourceFile) => implementationApi.sourceFiles.includes(sourceFile))) {
          continue;
        }
        const current = map.get(lookupKey) ?? [];
        current.push(metadataItem.id);
        map.set(lookupKey, current);
      }
    }
    return map;
  }, [featureMetadata, surfaceIndex.nextjsApis, surfaceIndex.rustApis]);
  const browserViewFeatureIds = useMemo(() => {
    const ids = new Set<string>();
    for (const feature of features) {
      if (feature.pageCount > 0) {
        ids.add(feature.id);
      }
    }
    for (const metadataItem of featureMetadata) {
      if ((metadataItem.pages?.length ?? 0) > 0) {
        ids.add(metadataItem.id);
      }
    }
    for (const page of surfaceIndex.pages) {
      for (const featureId of dedupeFeatureIds(pageFeatureMap.get(page.route) ?? [])) {
        ids.add(featureId);
      }
    }
    return ids;
  }, [featureMetadata, features, pageFeatureMap, surfaceIndex.pages]);
  const nextjsApiFeatureIds = useMemo(() => {
    const ids = new Set<string>();
    for (const api of surfaceIndex.nextjsApis) {
      const lookupKey = buildApiLookupKey(api.method, api.path);
      for (const featureId of dedupeFeatureIds(apiFeatureMap.get(lookupKey) ?? [])) {
        ids.add(featureId);
      }
    }
    return ids;
  }, [apiFeatureMap, surfaceIndex.nextjsApis]);
  const rustApiFeatureIds = useMemo(() => {
    const ids = new Set<string>();
    for (const api of surfaceIndex.rustApis) {
      const lookupKey = buildApiLookupKey(api.method, api.path);
      for (const featureId of dedupeFeatureIds(apiFeatureMap.get(lookupKey) ?? [])) {
        ids.add(featureId);
      }
    }
    return ids;
  }, [apiFeatureMap, surfaceIndex.rustApis]);

  const featureItems = useMemo<ExplorerSurfaceItem[]>(
    () => features
      .filter((feature) => {
        if (!matchesQuery(query, [feature.name, feature.summary, feature.id])) {
          return false;
        }

        if (feature.id === effectiveFeatureId) {
          return true;
        }

        switch (surfaceNavigationView) {
          case "capabilities":
            return true;
          case "surfaces":
            return browserViewFeatureIds.has(feature.id);
          case "apis":
            return nextjsApiFeatureIds.has(feature.id) || rustApiFeatureIds.has(feature.id) || feature.apiCount > 0;
          case "paths":
            return true;
        }
      })
      .map((feature): ExplorerSurfaceItem => {
        const metadataItem = featureMetadataById.get(feature.id);
        const sourceFiles = metadataItem?.sourceFiles ?? [];
        return {
          key: `feature:${feature.id}`,
          kind: "feature",
          label: feature.name,
          secondary: capabilityGroups.find((group) => group.id === feature.group)?.name ?? feature.group,
          featureIds: [feature.id],
          sourceFiles,
          metrics: [
            {
              id: "pages",
              label: t.featureExplorer.pageSection,
              value: String(feature.pageCount),
              testId: `feature-metric-pages-${feature.id}`,
            },
            {
              id: "apis",
              label: "API",
              value: String(feature.apiCount),
              testId: `feature-metric-apis-${feature.id}`,
            },
            {
              id: "files",
              label: t.featureExplorer.filesLabel,
              value: String(feature.sourceFileCount),
              testId: `feature-metric-files-${feature.id}`,
            },
          ],
          selectable: true,
        };
      }),
    [
      browserViewFeatureIds,
      capabilityGroups,
      effectiveFeatureId,
      featureMetadataById,
      features,
      t.featureExplorer.pageSection,
      nextjsApiFeatureIds,
      query,
      rustApiFeatureIds,
      surfaceNavigationView,
      t.featureExplorer.filesLabel,
    ],
  );
  const curatedFeatureItems = useMemo(
    () => featureItems.filter((item) => {
      const feature = featureSummaryById.get(item.featureIds[0] ?? "");
      if (!feature) {
        return true;
      }
      return feature.group !== inferredGroupId && feature.status !== "inferred";
    }),
    [featureItems, featureSummaryById, inferredGroupId],
  );
  const inferredFeatureItems = useMemo(
    () => featureItems.filter((item) => {
      const feature = featureSummaryById.get(item.featureIds[0] ?? "");
      if (!feature) {
        return false;
      }
      return feature.group === inferredGroupId || feature.status === "inferred";
    }),
    [featureItems, featureSummaryById, inferredGroupId],
  );
  const pageItems = useMemo<ExplorerSurfaceItem[]>(
    () => surfaceIndex.pages
      .filter((page) => matchesQuery(query, [page.route, page.title, page.description, page.sourceFile]))
      .map((page: FeatureSurfacePage): ExplorerSurfaceItem => {
        const featureIds = dedupeFeatureIds(pageFeatureMap.get(page.route) ?? []);
        return {
          key: `page:${page.route}`,
          kind: "page",
          label: page.route,
          secondary: page.title || page.sourceFile,
          featureIds,
          sourceFiles: page.sourceFile ? [page.sourceFile] : [],
          selectable: true,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label)),
    [pageFeatureMap, query, surfaceIndex.pages],
  );
  const contractApiItems = useMemo<ExplorerSurfaceItem[]>(
    () => buildGroupedApiItems({
      kind: "contract-api",
      apis: surfaceIndex.contractApis,
      query,
      resolveFeatureIds: (method, path) => dedupeFeatureIds(apiFeatureMap.get(buildApiLookupKey(method, path)) ?? []),
    }),
    [apiFeatureMap, query, surfaceIndex.contractApis],
  );
  const nextjsApiItems = useMemo<ExplorerSurfaceItem[]>(
    () => buildGroupedApiItems({
      kind: "nextjs-api",
      apis: surfaceIndex.nextjsApis,
      query,
      resolveFeatureIds: (method, path) => dedupeFeatureIds(apiFeatureMap.get(buildApiLookupKey(method, path)) ?? []),
    }),
    [apiFeatureMap, query, surfaceIndex.nextjsApis],
  );
  const rustApiItems = useMemo<ExplorerSurfaceItem[]>(
    () => buildGroupedApiItems({
      kind: "rust-api",
      apis: surfaceIndex.rustApis,
      query,
      resolveFeatureIds: (method, path) => dedupeFeatureIds(apiFeatureMap.get(buildApiLookupKey(method, path)) ?? []),
    }),
    [apiFeatureMap, query, surfaceIndex.rustApis],
  );
  const apiBrowseItems = useMemo<ExplorerSurfaceItem[]>(
    () => buildGroupedApiItems({
      kind: "contract-api",
      apis: [
        ...surfaceIndex.contractApis,
        ...surfaceIndex.nextjsApis,
        ...surfaceIndex.rustApis,
      ],
      query,
      resolveFeatureIds: (method, path) => dedupeFeatureIds(apiFeatureMap.get(buildApiLookupKey(method, path)) ?? []),
    }),
    [apiFeatureMap, query, surfaceIndex.contractApis, surfaceIndex.nextjsApis, surfaceIndex.rustApis],
  );
  const explorerSections = useMemo<ExplorerSection[]>(
    () => [
      {
        id: "features",
        title: t.featureExplorer.featureSection,
        items: featureItems,
        metrics: [
          {
            id: "sessions",
            label: t.featureExplorer.sessionsLabel,
            value: String(
              featureItems.reduce(
                (sum, item) => sum + (featureSummaryById.get(item.featureIds[0] ?? "")?.sessionCount ?? 0),
                0,
              ),
            ),
            testId: "feature-section-metric-sessions",
          },
        ],
      },
      { id: "pages", title: t.featureExplorer.pageSection, items: pageItems },
      { id: "contract-apis", title: t.featureExplorer.contractApiSection, items: contractApiItems },
      { id: "nextjs-apis", title: t.featureExplorer.nextjsApiSection, items: nextjsApiItems },
      { id: "rust-apis", title: t.featureExplorer.rustApiSection, items: rustApiItems },
    ].filter((section) => section.items.length > 0),
    [
      contractApiItems,
      featureItems,
      featureSummaryById,
      nextjsApiItems,
      pageItems,
      rustApiItems,
      t.featureExplorer.contractApiSection,
      t.featureExplorer.featureSection,
      t.featureExplorer.nextjsApiSection,
      t.featureExplorer.pageSection,
      t.featureExplorer.rustApiSection,
      t.featureExplorer.sessionsLabel,
    ],
  );
  const featureSidebarGroups = useMemo<CapabilityTreeGroup[]>(() => {
    const itemsByGroup = new Map<string, ExplorerSurfaceItem[]>();

    for (const item of curatedFeatureItems) {
      const feature = featureSummaryById.get(item.featureIds[0] ?? "");
      const groupId = feature?.group || "__ungrouped__";
      const current = itemsByGroup.get(groupId) ?? [];
      current.push(item);
      itemsByGroup.set(groupId, current);
    }

    const groups = capabilityGroups
      .filter((group) => group.id !== inferredGroupId)
      .map((group) => ({
        id: group.id,
        title: group.name,
        description: group.description,
        items: itemsByGroup.get(group.id) ?? [],
      }))
      .filter((group) => group.items.length > 0);

    const groupedIds = new Set(groups.map((group) => group.id));
    for (const [groupId, items] of itemsByGroup.entries()) {
      if (groupedIds.has(groupId)) {
        continue;
      }
      groups.push({
        id: groupId,
        title: groupId === "__ungrouped__" ? t.featureExplorer.featureSection : groupId,
        description: "",
        items,
      });
    }

    if (inferredFeatureItems.length > 0) {
      const inferredGroup = capabilityGroups.find((group) => group.id === inferredGroupId);
      groups.push({
        id: inferredGroupId,
        title: inferredGroup?.name ?? t.featureExplorer.inferredFeaturesLabel,
        description: inferredGroup?.description ?? "",
        items: inferredFeatureItems,
      });
    }

    return groups;
  }, [
    capabilityGroups,
    curatedFeatureItems,
    featureSummaryById,
    inferredFeatureItems,
    inferredGroupId,
    t.featureExplorer.featureSection,
    t.featureExplorer.inferredFeaturesLabel,
  ]);
  const surfaceNavigationOptions = useMemo(
    () => [
      { id: "capabilities" as const, label: t.featureExplorer.sectionView },
      { id: "surfaces" as const, label: t.featureExplorer.browserUrlView },
      { id: "apis" as const, label: t.featureExplorer.apiView },
      { id: "paths" as const, label: t.featureExplorer.pathView },
    ],
    [
      t.featureExplorer.apiView,
      t.featureExplorer.browserUrlView,
      t.featureExplorer.pathView,
      t.featureExplorer.sectionView,
    ],
  );
  const surfaceTreeSection = useMemo(() => {
    if (surfaceNavigationView === "capabilities") {
      return null;
    }

    if (surfaceNavigationView === "surfaces") {
      return {
        id: "surfaces",
        title: t.featureExplorer.browserUrlView,
        nodes: buildSurfaceTree(
          pageItems.map((item) => ({
            nodeId: item.key,
            segments: splitBrowserRouteSegments(item.label),
            item,
          })),
        ),
      };
    }

    if (surfaceNavigationView === "apis") {
      return {
        id: "apis-tree",
        title: t.featureExplorer.apiView,
        nodes: buildSurfaceTree(
          apiBrowseItems.map((item) => ({
            nodeId: item.key,
            segments: splitApiRouteSegments(item.label),
            item,
          })),
        ),
      };
    }

    return {
      id: "path-tree",
      title: t.featureExplorer.pathView,
      nodes: buildSurfaceTree(
        [...pageItems, ...apiBrowseItems].flatMap((item) => {
          const sourcePaths = item.sourceFiles.length > 0 ? item.sourceFiles : [item.label];
          return sourcePaths.map((sourcePath) => ({
            nodeId: `${item.key}:${sourcePath}`,
            segments: [...splitPathSegments(sourcePath), item.label],
            item,
          }));
        }),
      ),
    };
  }, [
    apiBrowseItems,
    pageItems,
    surfaceNavigationView,
    t.featureExplorer.apiView,
    t.featureExplorer.browserUrlView,
    t.featureExplorer.pathView,
  ]);
  const capabilityTreeNodes = useMemo<SurfaceTreeNode[]>(() => {
    const pageItemsByFeature = collectSurfaceItemsByFeature(pageItems);
    const apiItemsByFeature = collectSurfaceItemsByFeature(apiBrowseItems);

    return featureSidebarGroups.map((group) => ({
      id: `capability:${group.id}`,
      label: group.title,
      children: group.items.map((featureItem) => {
        const featureId = featureItem.featureIds[0] ?? "";
        const metadataItem = featureMetadataById.get(featureId);
        const pageChildren = (pageItemsByFeature.get(featureId) ?? []).map((item) => ({
          id: `capability:${group.id}:${item.key}`,
          label: item.secondary || item.label,
          item,
          children: [],
          itemCount: 1,
        }));
        const mappedApiChildren = (apiItemsByFeature.get(featureId) ?? []).map((item) => ({
          id: `capability:${group.id}:${item.key}`,
          label: item.label,
          item,
          children: [],
          itemCount: 1,
        }));
        const fallbackApiChildren = mappedApiChildren.length === 0
          ? (metadataItem?.apis ?? []).map((declaration) => {
              const parsedDeclaration = parseApiDeclaration(declaration);
              const lookupKey = buildApiLookupKey(parsedDeclaration.method, parsedDeclaration.path);
              const sourceFiles = [
                ...surfaceIndex.nextjsApis
                  .filter((api) => buildApiLookupKey(api.method, api.path) === lookupKey)
                  .flatMap((api) => api.sourceFiles),
                ...surfaceIndex.rustApis
                  .filter((api) => buildApiLookupKey(api.method, api.path) === lookupKey)
                  .flatMap((api) => api.sourceFiles),
              ];
              const item: ExplorerSurfaceItem = {
                key: `feature-api:${featureId}:${lookupKey}`,
                kind: "contract-api",
                label: parsedDeclaration.path,
                secondary: parsedDeclaration.method,
                badges: [parsedDeclaration.method],
                featureIds: [featureId],
                sourceFiles: [...new Set(sourceFiles)],
                selectable: true,
              };

              return {
                id: `capability:${group.id}:${item.key}`,
                label: item.label,
                item,
                children: [],
                itemCount: 1,
              };
            })
          : [];
        const children = [...pageChildren, ...mappedApiChildren, ...fallbackApiChildren];

        return {
          id: `capability:${group.id}:${featureItem.key}`,
          label: featureItem.label,
          item: featureItem,
          children,
          itemCount: 1 + children.length,
        };
      }),
      itemCount: group.items.length,
    }));
  }, [apiBrowseItems, featureMetadataById, featureSidebarGroups, pageItems, surfaceIndex.nextjsApis, surfaceIndex.rustApis]);
  const explorerItemsByKey = useMemo(() => {
    const treeItems = surfaceTreeSection
      ? (function collect(nodes: SurfaceTreeNode[], acc: ExplorerSurfaceItem[] = []): ExplorerSurfaceItem[] {
          for (const node of nodes) {
            if (node.item) {
              acc.push(node.item);
            }
            if (node.children.length > 0) {
              collect(node.children, acc);
            }
          }
          return acc;
        }(surfaceTreeSection.nodes))
      : [];
    const capabilityItems = (function collect(nodes: SurfaceTreeNode[], acc: ExplorerSurfaceItem[] = []): ExplorerSurfaceItem[] {
      for (const node of nodes) {
        if (node.item) {
          acc.push(node.item);
        }
        if (node.children.length > 0) {
          collect(node.children, acc);
        }
      }
      return acc;
    }(capabilityTreeNodes));
    const entries = [...explorerSections.flatMap((section) => section.items), ...treeItems, ...capabilityItems]
      .map((item) => [item.key, item] as const);
    return new Map(entries);
  }, [capabilityTreeNodes, explorerSections, surfaceTreeSection]);
  const resolvedSurfaceKey = selectedSurfaceKey && explorerItemsByKey.has(selectedSurfaceKey)
    ? selectedSurfaceKey
    : (effectiveFeatureId ? `feature:${effectiveFeatureId}` : "");

  const selectedSurface = useMemo(() => {
    if (resolvedSurfaceKey) {
      return explorerItemsByKey.get(resolvedSurfaceKey) ?? null;
    }
    return null;
  }, [explorerItemsByKey, resolvedSurfaceKey]);
  const surfaceOnlySelection = Boolean(
    selectedSurface && selectedSurface.kind !== "feature" && selectedSurface.featureIds.length === 0,
  );
  const resolvedFeatureDetail = useMemo(
    () => (featureDetail?.id === effectiveFeatureId ? featureDetail : null),
    [effectiveFeatureId, featureDetail],
  );
  const activeFeatureMetadata = useMemo(
    () => featureMetadataById.get(effectiveFeatureId) ?? null,
    [effectiveFeatureId, featureMetadataById],
  );
  const featurePageDetails = useMemo(() => {
    if (resolvedFeatureDetail?.pageDetails?.length) {
      return resolvedFeatureDetail.pageDetails.filter(
        (page, index, pages) => pages.findIndex((candidate) => candidate.route === page.route) === index,
      );
    }

    const declaredPages = activeFeatureMetadata?.pages ?? [];
    return declaredPages
      .map((route) => {
        const matched = surfaceIndex.pages.find((page) => page.route === route);
        return matched ?? {
          name: route,
          route,
          description: "",
          sourceFile: "",
        };
      })
      .filter((page, index, pages) => pages.findIndex((candidate) => candidate.route === page.route) === index);
  }, [activeFeatureMetadata, resolvedFeatureDetail, surfaceIndex.pages]);
  const featureApiDetails = useMemo(() => {
    if (resolvedFeatureDetail?.apiDetails?.length) {
      return resolvedFeatureDetail.apiDetails.filter(
        (api, index, apis) => apis.findIndex(
          (candidate) => candidate.method === api.method && candidate.endpoint === api.endpoint,
        ) === index,
      );
    }

    const declaredApis = activeFeatureMetadata?.apis ?? [];
    return declaredApis
      .map((declaration) => {
        const parsed = parseApiDeclaration(declaration);
        const lookupKey = buildApiLookupKey(parsed.method, parsed.path);
        const contractApi = surfaceIndex.contractApis.find(
          (api) => buildApiLookupKey(api.method, api.path) === lookupKey,
        );
        const nextjsSourceFiles = surfaceIndex.nextjsApis
          .filter((api) => buildApiLookupKey(api.method, api.path) === lookupKey)
          .flatMap((api) => api.sourceFiles);
        const rustSourceFiles = surfaceIndex.rustApis
          .filter((api) => buildApiLookupKey(api.method, api.path) === lookupKey)
          .flatMap((api) => api.sourceFiles);

        return {
          group: contractApi?.domain ?? "",
          method: parsed.method,
          endpoint: parsed.path,
          description: contractApi?.summary ?? "",
          ...(nextjsSourceFiles.length > 0 ? { nextjsSourceFiles: [...new Set(nextjsSourceFiles)] } : {}),
          ...(rustSourceFiles.length > 0 ? { rustSourceFiles: [...new Set(rustSourceFiles)] } : {}),
        };
      })
      .filter((api, index, apis) => apis.findIndex(
        (candidate) => candidate.method === api.method && candidate.endpoint === api.endpoint,
      ) === index);
  }, [activeFeatureMetadata, resolvedFeatureDetail, surfaceIndex.contractApis, surfaceIndex.nextjsApis, surfaceIndex.rustApis]);
  const featureSourceFiles = useMemo(
    () => [...new Set(resolvedFeatureDetail?.sourceFiles ?? activeFeatureMetadata?.sourceFiles ?? [])],
    [activeFeatureMetadata, resolvedFeatureDetail],
  );
  const curatedFeatureCount = useMemo(
    () => features.filter((feature) => feature.group !== inferredGroupId && feature.status !== "inferred").length,
    [features, inferredGroupId],
  );
  const inferredFeatureCount = useMemo(
    () => features.filter((feature) => feature.group === inferredGroupId || feature.status === "inferred").length,
    [features, inferredGroupId],
  );
  const hasCuratedFeatureTaxonomy = curatedFeatureCount > 0;
  const hasInferredFeatureTaxonomy = inferredFeatureCount > 0;
  const repositoryStatusTone = hasCuratedFeatureTaxonomy
    ? "ready"
    : hasInferredFeatureTaxonomy
      ? "inferred"
      : "missing";
  const fileTree = useMemo(
    () => (surfaceOnlySelection ? [] : resolvedFeatureDetail?.fileTree ?? []),
    [resolvedFeatureDetail, surfaceOnlySelection],
  );
  const fileStats = useMemo(
    () => (surfaceOnlySelection ? {} : resolvedFeatureDetail?.fileStats ?? {}),
    [resolvedFeatureDetail, surfaceOnlySelection],
  );
  const flatMap = useMemo(() => flattenFiles(fileTree), [fileTree]);
  const selectedFilePaths = useMemo(
    () => [...new Set(
      selectedFileIds
        .map((fileId) => flatMap[fileId])
        .filter((node): node is FileTreeNode => Boolean(node && node.kind === "file"))
        .map((node) => node.path),
    )].sort((left, right) => left.localeCompare(right)),
    [flatMap, selectedFileIds],
  );
  const treeNodeStats = useMemo(() => buildTreeNodeStats(fileTree, fileStats), [fileTree, fileStats]);
  const selectableFileIdsByNode = useMemo(() => buildSelectableFileIdsByNode(fileTree), [fileTree]);

  // Flat file list sorted by sessions desc, then changes desc
  const sessionSortedFiles = useMemo(() => {
    const leafFiles = Object.values(flatMap).filter((n) => n.kind === "file");
    return leafFiles.sort((a, b) => {
      const sa = fileStats[a.path];
      const sb = fileStats[b.path];
      const sessionsA = sa?.sessions ?? 0;
      const sessionsB = sb?.sessions ?? 0;
      if (sessionsB !== sessionsA) return sessionsB - sessionsA;
      const changesA = sa?.changes ?? 0;
      const changesB = sb?.changes ?? 0;
      return changesB - changesA;
    });
  }, [flatMap, fileStats]);

  const activeFile = flatMap[activeFileId] ?? null;
  const selectedScopeSessions = useMemo<AggregatedSelectionSession[]>(() => {
    if (!resolvedFeatureDetail?.fileSignals || selectedFileIds.length === 0) {
      return [];
    }

    const aggregated = new Map<string, AggregatedSelectionSession>();

    for (const fileId of selectedFileIds) {
      const fileNode = flatMap[fileId];
      if (!fileNode || fileNode.kind !== "file") {
        continue;
      }

      const signal = resolvedFeatureDetail.fileSignals[fileNode.path];
      if (!signal) {
        continue;
      }

      for (const session of signal.sessions) {
        const sessionKey = `${session.provider}:${session.sessionId}`;
        const existing = aggregated.get(sessionKey);

        if (existing) {
          if (session.updatedAt > existing.updatedAt) {
            existing.updatedAt = session.updatedAt;
          }
          if (!existing.promptSnippet && session.promptSnippet) {
            existing.promptSnippet = session.promptSnippet;
          }
          if (!existing.resumeCommand && session.resumeCommand) {
            existing.resumeCommand = session.resumeCommand;
          }
          existing.diagnostics = mergeSessionDiagnostics(existing.diagnostics, session.diagnostics);
          for (const prompt of session.promptHistory ?? []) {
            if (!existing.promptHistory.includes(prompt)) {
              existing.promptHistory.push(prompt);
            }
          }
          for (const toolName of session.toolNames ?? []) {
            if (!existing.toolNames.includes(toolName)) {
              existing.toolNames.push(toolName);
            }
          }
          for (const changedFile of session.changedFiles ?? [fileNode.path]) {
            if (!existing.changedFiles.includes(changedFile)) {
              existing.changedFiles.push(changedFile);
            }
          }
          continue;
        }

        aggregated.set(sessionKey, {
          provider: session.provider,
          sessionId: session.sessionId,
          updatedAt: session.updatedAt,
          promptSnippet: session.promptSnippet,
          promptHistory: [...(session.promptHistory ?? [])],
          toolNames: [...(session.toolNames ?? [])],
          ...(session.resumeCommand ? { resumeCommand: session.resumeCommand } : {}),
          changedFiles: [...(session.changedFiles ?? [fileNode.path])],
          ...(session.diagnostics ? { diagnostics: mergeSessionDiagnostics(undefined, session.diagnostics) } : {}),
        });
      }
    }

    return [...aggregated.values()]
      .map((session) => ({
        ...session,
        toolNames: session.toolNames.sort((left, right) => left.localeCompare(right)),
        changedFiles: session.changedFiles.sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [flatMap, resolvedFeatureDetail, selectedFileIds]);
  const activeFeature = features.find((f) => f.id === effectiveFeatureId);
  const activeSurfaceKey = selectedSurface?.key ?? (effectiveFeatureId ? `feature:${effectiveFeatureId}` : "");
  const selectedSurfaceFeatureNames = useMemo(
    () => (selectedSurface?.featureIds ?? []).map(
      (id) => featureSummaryById.get(id)?.name ?? featureMetadataById.get(id)?.name ?? id,
    ),
    [featureMetadataById, featureSummaryById, selectedSurface],
  );
  const middleHeadingDetail = selectedSurface?.kind === "feature"
    ? activeFeature?.name ?? ""
    : selectedSurface
      ? `${selectedSurface.label}${selectedSurfaceFeatureNames[0] ? ` -> ${selectedSurfaceFeatureNames[0]}` : ""}`
      : "";
  const analysisSessionProviderName = useMemo(
    () => analysisProviders.find((provider) => provider.id === analysisSessionProviderId)?.name ?? analysisSessionProviderId,
    [analysisProviders, analysisSessionProviderId],
  );
  const featureExplorerLayoutClassName = "grid min-h-0 flex-1 xl:grid-cols-[320px_minmax(280px,1fr)_minmax(340px,420px)] 2xl:grid-cols-[380px_minmax(320px,1fr)_minmax(400px,500px)]";

  const handleWorkspaceSelect = (nextWorkspaceId: string) => {
    router.push(`/workspace/${encodeURIComponent(nextWorkspaceId)}/feature-explorer`);
  };

  const handleWorkspaceCreate = async (title: string) => {
    const created = await workspacesHook.createWorkspace(title);
    if (created?.id) {
      router.push(`/workspace/${encodeURIComponent(created.id)}/feature-explorer`);
    }
  };

  const handleRepoSelectionChange = (selection: RepoSelection | null) => {
    setRepoSelectionOverrides((prev) => ({ ...prev, [workspaceId]: selection }));
  };

  const applyFileAutoSelect = (detail: FeatureDetail, preferredFilePath = "") => {
    const flat = flattenFiles(detail.fileTree);
    const leafFiles = Object.values(flat).filter((node) => node.kind === "file");
    const nextFile = (preferredFilePath
      ? leafFiles.find((node) => node.path === preferredFilePath)
      : null) ?? leafFiles[0];

    if (nextFile) {
      setActiveFileId(nextFile.id);
      setSelectedFileIds([nextFile.id]);
      setDesiredFilePath(nextFile.path);
      const expanded: Record<string, boolean> = {};
      for (const node of Object.values(flat)) {
        if (node.kind === "folder") {
          expanded[node.id] = true;
        }
      }
      setExpandedIds(expanded);
      return;
    }

    setActiveFileId("");
    setSelectedFileIds([]);
    setDesiredFilePath("");
  };

  // Auto-select first file when initial detail loads from hook
  const [prevDetailId, setPrevDetailId] = useState<string>("");
  useEffect(() => {
    if (resolvedFeatureDetail && resolvedFeatureDetail.id !== prevDetailId) {
      setPrevDetailId(resolvedFeatureDetail.id);
      applyFileAutoSelect(
        resolvedFeatureDetail,
        resolvedFeatureDetail.id === effectiveFeatureId ? desiredFilePath : "",
      );
    }
  }, [desiredFilePath, effectiveFeatureId, prevDetailId, resolvedFeatureDetail]);

  useEffect(() => {
    if (hasResolvedInitialUrlSelection || !initialUrlState.featureId || loading || featureDetailLoading) {
      return;
    }

    if (resolvedFeatureDetail?.id === initialUrlState.featureId) {
      setHasResolvedInitialUrlSelection(true);
      return;
    }

    fetchFeatureDetail(initialUrlState.featureId).then((detail) => {
      if (detail) {
        applyFileAutoSelect(detail, initialUrlState.filePath);
      }
      setHasResolvedInitialUrlSelection(true);
    });
  }, [
    featureDetailLoading,
    fetchFeatureDetail,
    hasResolvedInitialUrlSelection,
    initialUrlState.featureId,
    initialUrlState.filePath,
    loading,
    resolvedFeatureDetail,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialUrlSelection) {
      return;
    }

    replaceFeatureExplorerUrlState({
      featureId: effectiveFeatureId,
      filePath: activeFile?.path ?? "",
    });
  }, [activeFile?.path, effectiveFeatureId, hasResolvedInitialUrlSelection]);

  const handleSelectFeature = (nextFeatureId: string) => {
    setFeatureId(nextFeatureId);
    setInspectorTab("context");
    setSelectedFileIds([]);
    setActiveFileId("");
    setDesiredFilePath("");
    setExpandedIds({});
    fetchFeatureDetail(nextFeatureId).then((detail) => {
      if (detail) applyFileAutoSelect(detail);
    });
  };
  const handleSelectSurface = (item: ExplorerSurfaceItem) => {
    setSelectedSurfaceKey(item.key);
    setInspectorTab("context");

    if (item.kind === "feature") {
      handleSelectFeature(item.featureIds[0] ?? "");
      return;
    }

    if (item.featureIds[0]) {
      handleSelectFeature(item.featureIds[0]);
      return;
    }

    setSelectedFileIds([]);
    setActiveFileId("");
    setExpandedIds({});
  };

  const handleToggleNode = (nodeId: string) => {
    setExpandedIds((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const handleToggleSurfaceSection = (sectionId: string) => {
    setSurfaceSectionCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const handleToggleSurfaceTreeNode = (nodeId: string) => {
    setSurfaceTreeExpandedIds((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const handleToggleStructureSection = (sectionId: string) => {
    setStructureSectionCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const handleSetActiveFile = (fileId: string) => {
    setActiveFileId(fileId);
    setDesiredFilePath(flatMap[fileId]?.path ?? "");
  };

  const handleToggleNodeSelection = (nodeId: string) => {
    const targetFileIds = selectableFileIdsByNode[nodeId] ?? [];
    if (targetFileIds.length === 0) {
      return;
    }

    const isRemoving = targetFileIds.every((fileId) => selectedFileIds.includes(fileId));
    const nextSelectedIds = isRemoving
      ? selectedFileIds.filter((fileId) => !targetFileIds.includes(fileId))
      : [...new Set([...selectedFileIds, ...targetFileIds])];

    setSelectedFileIds(nextSelectedIds);

    if (!isRemoving) {
      handleSetActiveFile(targetFileIds[0] ?? "");
      return;
    }

    if (activeFileId && targetFileIds.includes(activeFileId)) {
      const nextActiveFileId = nextSelectedIds[0] ?? "";
      if (nextActiveFileId) {
        handleSetActiveFile(nextActiveFileId);
      } else {
        setActiveFileId("");
        setDesiredFilePath("");
      }
    }
  };

  const handleClearSelection = () => {
    setSelectedFileIds([]);
    setActiveFileId("");
    setDesiredFilePath("");
  };

  const handleApiRequest = async (method: string, apiPath: string) => {
    try {
      const response = await desktopAwareFetch(apiPath, { method });
      return await response.text();
    } catch (err) {
      return err instanceof Error ? err.message : t.featureExplorer.requestFailed;
    }
  };

  useEffect(() => {
    if (!isSessionAnalysisDrawerOpen) {
      return;
    }

    if (selectedFilePaths.length === 0 || selectedScopeSessions.length === 0) {
      setIsSessionAnalysisDrawerOpen(false);
    }
  }, [isSessionAnalysisDrawerOpen, selectedFilePaths.length, selectedScopeSessions.length]);

  useEffect(() => {
    if ((!isSessionAnalysisDrawerOpen && !isAnalysisSessionPaneOpen) || analysisAcpConnected || analysisAcpLoading) {
      return;
    }

    void connectAnalysisAcp();
  }, [
    analysisAcpConnected,
    analysisAcpLoading,
    connectAnalysisAcp,
    isAnalysisSessionPaneOpen,
    isSessionAnalysisDrawerOpen,
  ]);

  const handleOpenSessionAnalysisDrawer = () => {
    setSessionAnalysisError(null);
    setIsSessionAnalysisDrawerOpen(true);
  };

  const handleStartSessionAnalysis = async (sessionsToAnalyze: AggregatedSelectionSession[] = selectedScopeSessions) => {
    if (!effectiveRepoSelection?.path || selectedFilePaths.length === 0 || sessionsToAnalyze.length === 0) {
      return;
    }

    setSessionAnalysisError(null);
    setIsStartingSessionAnalysis(true);

    try {
      const sessionName = buildSessionAnalysisSessionName(
        locale,
        surfaceOnlySelection ? null : resolvedFeatureDetail,
        selectedFilePaths,
      );
      const prompt = buildSessionAnalysisPrompt({
        locale,
        workspaceId,
        repoName: effectiveRepoSelection.name,
        repoPath: effectiveRepoSelection.path,
        branch: effectiveRepoSelection.branch,
        featureDetail: surfaceOnlySelection ? null : resolvedFeatureDetail,
        selectedFilePaths,
        sessions: sessionsToAnalyze,
      });

      const response = await desktopAwareFetch("/api/acp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `feature-explorer-analysis:${Date.now()}`,
          method: "session/new",
          params: {
            workspaceId,
            cwd: effectiveRepoSelection.path,
            branch: effectiveRepoSelection.branch || undefined,
            role: "ROUTA",
            specialistId: "file-session-analyst",
            specialistLocale: locale,
            name: sessionName,
            provider: analysisSelectedProvider,
          },
        }),
      });

      const payload = await response.json().catch(() => null) as {
        result?: { sessionId?: string };
        error?: { message?: string };
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error?.message || t.featureExplorer.sessionAnalysisFailed);
      }

      if (payload?.error?.message) {
        throw new Error(payload.error.message);
      }

      const sessionId = payload?.result?.sessionId;
      if (!sessionId) {
        throw new Error(t.featureExplorer.sessionAnalysisFailed);
      }

      await connectAnalysisAcp();
      selectAnalysisSession(sessionId);
      setAnalysisSessionId(sessionId);
      setAnalysisSessionName(sessionName);
      setAnalysisSessionProviderId(analysisSelectedProvider);
      setIsAnalysisSessionPaneOpen(true);
      setIsSessionAnalysisDrawerOpen(false);
      void promptAnalysisSession(sessionId, prompt);
    } catch (err) {
      setSessionAnalysisError(
        err instanceof Error && err.message
          ? err.message
          : t.featureExplorer.sessionAnalysisFailed,
      );
    } finally {
      setIsStartingSessionAnalysis(false);
    }
  };

  return (
    <DesktopAppShell
      workspaceId={workspaceId}
      workspaceTitle={workspace?.title ?? workspaceId}
      workspaceSwitcher={(
        <WorkspaceSwitcher
          workspaces={workspacesHook.workspaces}
          activeWorkspaceId={workspaceId}
          activeWorkspaceTitle={workspace?.title ?? workspaceId}
          onSelect={handleWorkspaceSelect}
          onCreate={handleWorkspaceCreate}
          loading={workspacesHook.loading}
          compact
          desktop
        />
      )}
    >
      <div className="flex h-full min-h-0 bg-desktop-bg-primary">
        <main className="flex min-w-0 flex-1">
          <section className={featureExplorerLayoutClassName}>
            <aside className="flex min-h-0 flex-col border-r border-desktop-border bg-desktop-bg-secondary/20">
              <div className="border-b border-desktop-border px-3 py-2">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-desktop-text-secondary">
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.featureExplorer.codebase}</span>
                </div>
                <RepoPicker
                  value={effectiveRepoSelection}
                  onChange={handleRepoSelectionChange}
                  additionalRepos={workspaceRepos}
                  pathDisplay="below-muted"
                />
                <button
                  type="button"
                  onClick={() => setIsGenerateDrawerOpen(true)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-sm border border-desktop-accent/50 bg-desktop-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-desktop-accent hover:bg-desktop-accent/20"
                  data-testid="generate-feature-tree-button"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t.featureExplorer.generateFeatureTree}
                </button>
              </div>
              <div className="border-b border-desktop-border px-3 py-2">
                <label className="flex items-center gap-2 rounded-sm border border-desktop-border bg-desktop-bg-primary px-2.5 py-1.5 text-xs text-desktop-text-secondary">
                  <Search className="h-3.5 w-3.5" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.featureExplorer.searchPlaceholder}
                    className="w-full bg-transparent text-xs text-desktop-text-primary outline-none placeholder:text-desktop-text-secondary"
                  />
                </label>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-desktop-text-secondary">
                  {t.featureExplorer.workViewLabel}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {surfaceNavigationOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSurfaceNavigationView(option.id)}
                      className={`rounded-sm border px-2 py-1 text-[10px] font-medium ${
                        surfaceNavigationView === option.id
                          ? "border-desktop-accent bg-desktop-bg-active text-desktop-text-primary"
                          : "border-desktop-border bg-desktop-bg-primary text-desktop-text-secondary hover:text-desktop-text-primary"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className={`mt-3 rounded-sm border px-2.5 py-2 ${
                  repositoryStatusTone === "ready"
                    ? "border-emerald-300/60 bg-emerald-50/70 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : repositoryStatusTone === "inferred"
                      ? "border-sky-300/60 bg-sky-50/70 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                      : "border-amber-300/60 bg-amber-50/70 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                      {t.featureExplorer.repositoryStatus}
                    </div>
                    <div className="text-[10px] font-semibold">
                      {repositoryStatusTone === "ready"
                        ? t.featureExplorer.repositoryReady
                        : repositoryStatusTone === "inferred"
                          ? t.featureExplorer.repositoryInferred
                        : t.featureExplorer.repositoryMissingTaxonomy}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] leading-5">
                    {repositoryStatusTone === "ready"
                      ? t.featureExplorer.repositoryReadyDescription
                      : repositoryStatusTone === "inferred"
                        ? t.featureExplorer.repositoryInferredDescription
                      : t.featureExplorer.repositoryMissingTaxonomyDescription}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    <span className="rounded-sm border border-current/20 bg-white/60 px-1.5 py-0.5 dark:bg-black/10">
                      {curatedFeatureCount} {t.featureExplorer.curatedFeaturesLabel}
                    </span>
                    <span className="rounded-sm border border-current/20 bg-white/60 px-1.5 py-0.5 dark:bg-black/10">
                      {inferredFeatureCount} {t.featureExplorer.inferredFeaturesLabel}
                    </span>
                    <span className="rounded-sm border border-current/20 bg-white/60 px-1.5 py-0.5 dark:bg-black/10">
                      {surfaceIndex.pages.length} {t.featureExplorer.pageSection}
                    </span>
                    <span className="rounded-sm border border-current/20 bg-white/60 px-1.5 py-0.5 dark:bg-black/10">
                      {surfaceIndex.contractApis.length} {t.featureExplorer.contractApiSection}
                    </span>
                  </div>
                  <div className="mt-2 text-[10px]">
                    {t.featureExplorer.lastGeneratedLabel}: {surfaceIndex.generatedAt ? formatShortDate(surfaceIndex.generatedAt) : "-"}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="px-3 py-4 text-xs text-desktop-text-secondary">Loading…</div>
                ) : error ? (
                  <div className="px-3 py-4 text-xs text-red-400">{error}</div>
                ) : surfaceNavigationView === "capabilities" ? (
                  featureSidebarGroups.length > 0 ? (
                    <div className="space-y-3 px-2 pb-3 pt-2">
                      {featureSidebarGroups.map((group) => {
                        const collapsed = surfaceSectionCollapsed[group.id] ?? (group.id === inferredGroupId);
                        return (
                          <div key={group.id}>
                            <button
                              type="button"
                              onClick={() => handleToggleSurfaceSection(group.id)}
                              className="mb-1 flex w-full items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-desktop-text-secondary hover:text-desktop-text-primary"
                            >
                              <span className="flex items-center gap-1.5">
                                {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                <span>{group.title}</span>
                              </span>
                              <span className="rounded-sm border border-desktop-border bg-desktop-bg-primary px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-current/80">
                                {group.items.length} {t.featureExplorer.itemsLabel}
                              </span>
                            </button>
                            {group.description ? (
                              <div className="mb-1 px-1 text-[11px] leading-5 text-desktop-text-secondary">
                                {group.description}
                              </div>
                            ) : null}
                            {!collapsed ? (
                              <div className="space-y-0.5">
                                {(capabilityTreeNodes.find((node) => node.id === `capability:${group.id}`)?.children ?? []).map((node) => (
                                  <SurfaceTreeRow
                                    key={node.id}
                                    node={node}
                                    depth={0}
                                    activeSurfaceKey={activeSurfaceKey}
                                    expandedIds={surfaceTreeExpandedIds}
                                    onSelectSurface={handleSelectSurface}
                                    onToggleNode={handleToggleSurfaceTreeNode}
                                    unmappedLabel={t.featureExplorer.unmappedLabel}
                                    defaultExpandedDepth={0}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-3 py-4">
                      <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary p-3">
                        <div className="text-[12px] font-semibold text-desktop-text-primary">
                          {t.featureExplorer.featureTaxonomyEmptyTitle}
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-desktop-text-secondary">
                          {t.featureExplorer.featureTaxonomyEmptyDescription}
                        </div>
                      </div>
                    </div>
                  )
                ) : !surfaceTreeSection ? (
                  <div className="px-3 py-4 text-xs text-desktop-text-secondary">
                    {t.featureExplorer.noFeatureMatches}
                  </div>
                ) : (
                  <div className="space-y-3 px-2 pb-3 pt-2">
                    <div>
                      <button
                        type="button"
                        onClick={() => handleToggleSurfaceSection(surfaceTreeSection.id)}
                        className="mb-1 flex w-full items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-desktop-text-secondary hover:text-desktop-text-primary"
                      >
                        <span className="flex items-center gap-1.5">
                          {(surfaceSectionCollapsed[surfaceTreeSection.id] ?? false)
                            ? <ChevronRight className="h-3.5 w-3.5" />
                            : <ChevronDown className="h-3.5 w-3.5" />}
                          <span>{surfaceTreeSection.title}</span>
                        </span>
                        <span>{surfaceTreeSection.nodes.reduce((sum, node) => sum + node.itemCount, 0)}</span>
                      </button>
                      {!(surfaceSectionCollapsed[surfaceTreeSection.id] ?? false) ? (
                        <div className="space-y-1">
                          {surfaceTreeSection.nodes.map((node) => (
                            <SurfaceTreeRow
                              key={node.id}
                              node={node}
                              depth={0}
                              activeSurfaceKey={activeSurfaceKey}
                              expandedIds={surfaceTreeExpandedIds}
                              onSelectSurface={handleSelectSurface}
                              onToggleNode={handleToggleSurfaceTreeNode}
                              unmappedLabel={t.featureExplorer.unmappedLabel}
                              defaultExpandedDepth={0}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </aside>

            <section className="flex min-h-0 flex-col border-r border-desktop-border bg-desktop-bg-primary">
              <div className="flex items-center justify-between border-b border-desktop-border px-3 py-2">
                <div>
                  <div className="text-xs font-semibold text-desktop-text-secondary">
                    {t.featureExplorer.featureStructureHeading}
                  </div>
                  {middleHeadingDetail ? (
                    <div className="mt-0.5 truncate text-[10px] text-desktop-text-secondary">
                      {middleHeadingDetail}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {featureDetailLoading ? (
                  <div className="px-3 py-4 text-xs text-desktop-text-secondary">Loading…</div>
                ) : !effectiveFeatureId ? (
                  <div className="px-3 py-4 text-xs text-desktop-text-secondary">
                    {t.featureExplorer.featureStructureEmpty}
                  </div>
                ) : (
                  <div className="space-y-3 px-3 py-3">
                    {activeFeature ? (
                      <section className="rounded-sm border border-desktop-border bg-desktop-bg-primary p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-semibold text-desktop-text-primary">
                              {activeFeature.name}
                            </div>
                            {activeFeature.summary ? (
                              <div className="mt-1 text-[11px] leading-5 text-desktop-text-secondary">
                                {activeFeature.summary}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <InlineStatPill label={t.featureExplorer.statusLabel} value={activeFeature.status || "-"} />
                            <InlineStatPill label={t.featureExplorer.pageSection} value={String(featurePageDetails.length)} />
                            <InlineStatPill label={t.featureExplorer.apiSurfacesLabel} value={String(featureApiDetails.length)} />
                            <InlineStatPill label={t.featureExplorer.sourceFilesLabel} value={String(featureSourceFiles.length)} />
                            <InlineStatPill label={t.featureExplorer.sessionsLabel} value={String(activeFeature.sessionCount)} />
                          </div>
                        </div>
                      </section>
                    ) : (
                      <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary p-3 text-[11px] text-desktop-text-secondary">
                        {t.featureExplorer.featureStructureUnavailable}
                      </div>
                    )}

                    <FeatureStructureSection
                      title={t.featureExplorer.frontendRoutesLabel}
                      count={featurePageDetails.length}
                      collapsed={structureSectionCollapsed.pages ?? false}
                      onToggle={() => handleToggleStructureSection("pages")}
                    >
                      {featurePageDetails.length > 0 ? (
                        <div className="space-y-1.5">
                          {featurePageDetails.map((page) => (
                            <FeatureRouteRow key={page.route} page={page} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-desktop-text-secondary">{t.featureExplorer.noPagesDeclared}</div>
                      )}
                    </FeatureStructureSection>

                    <FeatureStructureSection
                      title={t.featureExplorer.apiSurfacesLabel}
                      count={featureApiDetails.length}
                      collapsed={structureSectionCollapsed.apis ?? false}
                      onToggle={() => handleToggleStructureSection("apis")}
                    >
                      {featureApiDetails.length > 0 ? (
                        <div className="space-y-1.5">
                          {featureApiDetails.map((api) => (
                            <FeatureApiRow
                              key={`${api.method}:${api.endpoint}`}
                              api={api}
                              implementationLabel={t.featureExplorer.implementationLabel}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-desktop-text-secondary">{t.featureExplorer.noApisDeclared}</div>
                      )}
                    </FeatureStructureSection>

                    <FeatureStructureSection
                      title={t.featureExplorer.sourceFilesLabel}
                      count={featureSourceFiles.length}
                      collapsed={structureSectionCollapsed.files ?? false}
                      onToggle={() => handleToggleStructureSection("files")}
                      toolbar={featureSourceFiles.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setMiddleView("list")}
                            className={`rounded-sm px-1.5 py-0.5 text-[9px] font-medium ${middleView === "list" ? "bg-desktop-bg-active text-desktop-text-primary" : "text-desktop-text-secondary hover:text-desktop-text-primary"}`}
                          >
                            {t.featureExplorer.listView}
                          </button>
                          <button
                            onClick={() => setMiddleView("tree")}
                            className={`rounded-sm px-1.5 py-0.5 text-[9px] font-medium ${middleView === "tree" ? "bg-desktop-bg-active text-desktop-text-primary" : "text-desktop-text-secondary hover:text-desktop-text-primary"}`}
                          >
                            {t.featureExplorer.treeView}
                          </button>
                        </div>
                      ) : null}
                    >
                      {fileTree.length > 0 ? (
                        <div className="overflow-hidden rounded-sm border border-desktop-border">
                          <div className="grid grid-cols-[minmax(0,1fr)_56px_72px_96px] bg-desktop-bg-secondary/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-desktop-text-secondary">
                            <div>{t.featureExplorer.nameColumn}</div>
                            <div>{t.featureExplorer.changeColumn}</div>
                            <div>{t.featureExplorer.sessionsColumn}</div>
                            <div>{t.featureExplorer.updatedColumn}</div>
                          </div>
                          {middleView === "list" ? (
                            <div className="divide-y divide-desktop-border">
                              {sessionSortedFiles.map((node) => {
                                const stat = fileStats[node.path];
                                const isActive = activeFileId === node.id;
                                const isSelected = selectedFileIds.includes(node.id);
                                return (
                                  <div
                                    key={node.id}
                                    className={`grid grid-cols-[minmax(0,1fr)_56px_72px_96px] items-center px-3 py-1 text-xs transition-colors ${
                                      isActive ? "bg-desktop-bg-active" : "hover:bg-desktop-bg-secondary/40"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="checkbox"
                                        data-testid={`feature-tree-select-${node.id}`}
                                        checked={isSelected}
                                        onChange={() => handleToggleNodeSelection(node.id)}
                                        className="h-3.5 w-3.5 rounded border-black/15 bg-transparent dark:border-white/20"
                                      />
                                      <button onClick={() => handleSetActiveFile(node.id)} className="flex min-w-0 items-center gap-1.5 text-left">
                                        <FileIcon path={node.path} />
                                        <span className="break-all text-[12px] text-desktop-text-primary" title={node.path}>{node.path}</span>
                                      </button>
                                    </div>
                                    <div className="text-[11px] text-desktop-text-secondary">{stat?.changes ?? "-"}</div>
                                    <div className="text-[11px] text-desktop-text-secondary">{stat?.sessions ?? "-"}</div>
                                    <div className="text-[11px] text-desktop-text-secondary">{stat?.updatedAt ? formatShortDate(stat.updatedAt) : "-"}</div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="divide-y divide-desktop-border">
                              {fileTree.map((node) => (
                                <TreeNodeRow
                                  key={node.id}
                                  node={node}
                                  depth={0}
                                  expandedIds={expandedIds}
                                  activeFileId={activeFileId}
                                  selectedFileIds={selectedFileIds}
                                  treeNodeStats={treeNodeStats}
                                  selectableFileIdsByNode={selectableFileIdsByNode}
                                  onToggleNode={handleToggleNode}
                                  onToggleNodeSelection={handleToggleNodeSelection}
                                  onSetActiveFile={handleSetActiveFile}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ) : featureSourceFiles.length > 0 ? (
                        <div className="space-y-1.5">
                          {featureSourceFiles.map((sourceFile) => (
                            <SimpleSourceFileRow key={sourceFile} path={sourceFile} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-desktop-text-secondary">{t.featureExplorer.sourceFilesEmpty}</div>
                      )}
                    </FeatureStructureSection>
                  </div>
                )}
              </div>

              <div className="border-t border-desktop-border bg-desktop-bg-secondary/20 px-3 py-1.5">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="truncate text-[11px] text-desktop-text-secondary">
                    {selectedFileIds.length}f
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
                    <button
                      onClick={handleClearSelection}
                      className="shrink-0 whitespace-nowrap rounded-sm border border-desktop-border bg-desktop-bg-primary px-2 py-1 text-[11px] text-desktop-text-secondary hover:bg-desktop-bg-active hover:text-desktop-text-primary"
                    >
                      {t.featureExplorer.clearSelection}
                    </button>
                    <button
                      onClick={() => router.push(`/workspace/${encodeURIComponent(workspaceId)}/sessions`)}
                      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-desktop-accent bg-desktop-bg-active px-2 py-1 text-[11px] text-desktop-text-primary hover:bg-desktop-bg-primary"
                    >
                      {t.featureExplorer.continueAction}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <FeatureExplorerInspectorPane
              inspectorTab={inspectorTab}
              onSelectInspectorTab={setInspectorTab}
              featureDetail={surfaceOnlySelection ? null : resolvedFeatureDetail}
              selectedFileCount={selectedFileIds.length}
              selectedScopeSessions={selectedScopeSessions}
              selectedSurface={selectedSurface}
              selectedSurfaceFeatureNames={selectedSurfaceFeatureNames}
              onOpenSessionAnalysis={handleOpenSessionAnalysisDrawer}
              onRequestApi={handleApiRequest}
              t={t}
            />

          </section>
        </main>

        <FeatureExplorerDrawers
          workspaceId={workspaceId}
          repoPath={effectiveRepoSelection?.path}
          generateOpen={isGenerateDrawerOpen}
          onCloseGenerate={() => setIsGenerateDrawerOpen(false)}
          onGenerated={() => setGenerateRefreshCounter((c) => c + 1)}
          sessionAnalysisDrawerKey={`session-analysis:${isSessionAnalysisDrawerOpen ? "open" : "closed"}:${selectedFilePaths.join("|")}:${selectedScopeSessions.map((session) => `${session.provider}:${session.sessionId}`).join("|")}`}
          sessionAnalysisOpen={isSessionAnalysisDrawerOpen}
          selectedFilePaths={selectedFilePaths}
          selectedScopeSessions={selectedScopeSessions}
          providers={analysisProviders}
          selectedProvider={analysisSelectedProvider}
          onProviderChange={setAnalysisProvider}
          isStartingSessionAnalysis={isStartingSessionAnalysis}
          sessionAnalysisError={sessionAnalysisError}
          onCloseSessionAnalysis={() => setIsSessionAnalysisDrawerOpen(false)}
          onStartSessionAnalysis={handleStartSessionAnalysis}
          analysisSessionPaneOpen={isAnalysisSessionPaneOpen}
          analysisSessionId={analysisSessionId}
          analysisSessionName={analysisSessionName}
          analysisSessionProviderName={analysisSessionProviderName}
          analysisSessionProviderId={analysisSessionProviderId}
          fallbackSelectedProvider={analysisSelectedProvider}
          onCloseAnalysisSessionPane={() => {
            setIsAnalysisSessionPaneOpen(false);
            setAnalysisSessionId(null);
          }}
          acp={analysisAcp}
          onEnsureAnalysisSession={async () => analysisSessionId}
          onSelectAnalysisSession={async (sessionId) => {
            setAnalysisSessionId(sessionId);
            selectAnalysisSession(sessionId);
          }}
          repoSelection={effectiveRepoSelection}
          codebases={codebases}
          t={t}
        />
      </div>
    </DesktopAppShell>
  );
}
