"use client";

import { GitBranch, FileCode, Activity, Zap } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { CodebaseData } from "@/client/hooks/use-workspaces";
import type { AcpProviderInfo } from "@/client/acp-client";
import type { KanbanBoardInfo } from "../types";

interface KanbanStatusBarProps {
  /** 当前默认仓库 */
  defaultCodebase: CodebaseData | null;
  /** 所有仓库列表 */
  codebases: CodebaseData[];
  /** 文件变更统计 */
  fileChangesSummary: {
    changedFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
  /** 当前看板 */
  board: KanbanBoardInfo | null;
  /** 看板队列状态 */
  boardQueue?: KanbanBoardInfo["queue"];
  /** 当前选中的 Provider */
  selectedProvider?: AcpProviderInfo;
  /** 点击仓库时的回调 */
  onRepoClick?: () => void;
  /** 点击文件变更时的回调 */
  onFileChangesClick?: () => void;
  /** 点击 Git Log 时的回调 */
  onGitLogClick?: () => void;
  /** 点击 Provider 时的回调 */
  onProviderClick?: () => void;
  /** 文件变更面板是否打开 */
  fileChangesOpen?: boolean;
  /** Git Log 面板是否打开 */
  gitLogOpen?: boolean;
}

export function KanbanStatusBar({
  defaultCodebase,
  codebases,
  fileChangesSummary,
  board,
  boardQueue,
  selectedProvider,
  onRepoClick,
  onFileChangesClick,
  onGitLogClick,
  onProviderClick,
  fileChangesOpen = false,
  gitLogOpen = false,
}: KanbanStatusBarProps) {
  const { t } = useTranslation();

  return (
    <div
      className="h-6 shrink-0 flex items-center justify-between border-t border-desktop-border bg-desktop-bg-tertiary text-[11px] select-none"
      data-testid="kanban-status-bar"
    >
      {/* 左侧：仓库和状态信息 */}
      <div className="flex items-center divide-x divide-desktop-border/50">
        {/* 仓库信息 */}
        {defaultCodebase ? (
          <button
            onClick={onRepoClick}
            className="flex items-center gap-1.5 px-2.5 h-6 text-desktop-text-primary hover:bg-desktop-bg-active transition-colors"
            title={`${defaultCodebase.repoPath}${defaultCodebase.branch ? ` @ ${defaultCodebase.branch}` : ""}`}
          >
            <GitBranch className="w-3 h-3" />
            <span className="max-w-[180px] truncate font-medium">
              {defaultCodebase.label ?? defaultCodebase.repoPath.split("/").pop() ?? defaultCodebase.repoPath}
            </span>
            {defaultCodebase.branch && (
              <span className="text-desktop-text-secondary">@ {defaultCodebase.branch}</span>
            )}
            {codebases.length > 1 && (
              <span className="text-desktop-text-secondary">+{codebases.length - 1}</span>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 h-6 text-desktop-text-secondary">
            <GitBranch className="w-3 h-3" />
            <span>{t.kanbanBoard.noReposLinked}</span>
          </div>
        )}

        {/* 文件变更 */}
        {defaultCodebase && (
          <button
            onClick={onFileChangesClick}
            className={`flex items-center gap-1.5 px-2.5 h-6 transition-colors ${
              fileChangesOpen
                ? "bg-desktop-bg-active text-desktop-accent"
                : "text-desktop-text-primary hover:bg-desktop-bg-active"
            }`}
            title={`${fileChangesSummary.changedFiles} file${fileChangesSummary.changedFiles === 1 ? "" : "s"} changed`}
          >
            <FileCode className="w-3 h-3" />
            <span>{fileChangesSummary.changedFiles > 0 ? fileChangesSummary.changedFiles : "0"}</span>
            {fileChangesSummary.changedFiles > 0 && (
              <>
                <span className="text-emerald-500">+{fileChangesSummary.totalAdditions}</span>
                <span className="text-rose-500">-{fileChangesSummary.totalDeletions}</span>
              </>
            )}
          </button>
        )}

        {/* Git Log */}
        {defaultCodebase && (
          <button
            onClick={onGitLogClick}
            className={`flex items-center gap-1.5 px-2.5 h-6 transition-colors ${
              gitLogOpen
                ? "bg-desktop-bg-active text-desktop-accent"
                : "text-desktop-text-primary hover:bg-desktop-bg-active"
            }`}
            title={t.gitLog.title}
          >
            <Activity className="w-3 h-3" />
            <span>{t.gitLog.title}</span>
          </button>
        )}
      </div>

      {/* 右侧：运行状态和 Provider */}
      <div className="flex items-center divide-x divide-desktop-border/50">
        {/* 运行状态 */}
        {board && (
          <div className="flex items-center gap-2 px-2.5 h-6 text-desktop-text-secondary">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {t.kanban.runningLabel} {boardQueue?.runningCount ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {t.kanban.queuedLabel} {boardQueue?.queuedCount ?? 0}
            </span>
          </div>
        )}

        {/* Provider */}
        {selectedProvider && (
          <button
            onClick={onProviderClick}
            className="flex items-center gap-1.5 px-2.5 h-6 text-desktop-text-primary hover:bg-desktop-bg-active transition-colors"
            title={selectedProvider.description}
          >
            <Zap className="w-3 h-3" />
            <span className="max-w-[120px] truncate">{selectedProvider.name}</span>
          </button>
        )}
      </div>
    </div>
  );
}
