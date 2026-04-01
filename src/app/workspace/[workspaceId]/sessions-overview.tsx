"use client";

import React, { useState, useEffect } from "react";
import { formatRelativeTime } from "./ui-components";
import type { SessionInfo } from "./types";
import { ChevronDown, ChevronRight, PieChart, RefreshCw, SquareArrowOutUpRight } from "lucide-react";


interface SessionsOverviewProps {
  sessions: SessionInfo[];
  workspaceId: string;
  onNavigate: (sessionId: string) => void;
  onRefresh: () => void;
}

export function SessionsOverview({ sessions, workspaceId, onNavigate, onRefresh }: SessionsOverviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [sessionTree, setSessionTree] = useState<Map<string, SessionInfo[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [renamingSession, setRenamingSession] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Build parent-child tree
  useEffect(() => {
    if (!expanded) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/sessions?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`, { cache: "no-store" })
      .then(res => res.json())
      .then(data => {
        const allSessions = Array.isArray(data?.sessions) ? data.sessions : [];
        const tree = new Map<string, SessionInfo[]>();

        allSessions.forEach((session: SessionInfo & { parentSessionId?: string }) => {
          const parentId = session.parentSessionId || "root";
          if (!tree.has(parentId)) {
            tree.set(parentId, []);
          }
          tree.get(parentId)!.push(session);
        });

        tree.set("all", allSessions);
        setSessionTree(tree);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expanded, workspaceId]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("Delete this session?")) return;
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      onRefresh();
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
    setContextMenu(null);
  };

  const handleRenameSession = (sessionId: string, currentName: string) => {
    setRenamingSession(sessionId);
    setRenameValue(currentName);
    setContextMenu(null);
  };

  const handleSaveRename = async (sessionId: string) => {
    if (!renameValue.trim()) return;
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      onRefresh();
    } catch (error) {
      console.error("Failed to rename session:", error);
    }
    setRenamingSession(null);
  };

  const displaySessions = expanded
    ? (sessionTree.size > 0 ? (sessionTree.get("all") || []) : sessions)
    : sessions.slice(0, 6);

  const renderSession = (session: SessionInfo, depth = 0) => {
    const children = sessionTree.get(session.sessionId) || [];
    const hasChildren = children.length > 0;
    const isRenaming = renamingSession === session.sessionId;

    return (
      <div key={session.sessionId} style={{ marginLeft: depth * 20 }}>
        <div
          className="group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#151720] transition-colors"
          onContextMenu={(e) => handleContextMenu(e, session.sessionId)}
        >
          {depth > 0 && (
            <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
          )}
          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
            depth > 0
              ? "bg-slate-100 dark:bg-slate-900/20"
              : "bg-blue-50 dark:bg-blue-900/20"
          }`}>
            <svg className={`w-3.5 h-3.5 ${
              depth > 0
                ? "text-slate-500 dark:text-slate-400"
                : "text-blue-500 dark:text-blue-400"
            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0" onClick={() => !isRenaming && onNavigate(session.sessionId)}>
            <div className="flex items-center gap-2">
              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename(session.sessionId);
                    if (e.key === "Escape") setRenamingSession(null);
                  }}
                  onBlur={() => handleSaveRename(session.sessionId)}
                  autoFocus
                  className="text-[13px] font-medium px-2 py-1 rounded border border-blue-500 dark:border-blue-400 bg-white dark:bg-[#0e1019] text-slate-700 dark:text-slate-300 outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="text-[13px] font-medium text-slate-700 dark:text-slate-300 truncate group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors cursor-pointer">
                  {session.name || session.provider || `Session ${session.sessionId.slice(0, 8)}`}
                </div>
              )}
              {hasChildren && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 font-mono">
                  {children.length}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
              {session.role && <span className="capitalize">{session.role.toLowerCase()}</span>}
              {session.role && session.provider && <span className="mx-1">·</span>}
              {session.provider && <span>{session.provider}</span>}
            </div>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono shrink-0">
            {formatRelativeTime(session.createdAt)}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
        </div>
        {expanded && hasChildren && children.map(child => renderSession(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-[#0e1019] border border-slate-200/60 dark:border-[#191c28] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-[#191c28] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
            Recent Sessions
          </h3>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#191c28] text-slate-500 dark:text-slate-400 font-mono">
            {sessions.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#191c28] transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#191c28] transition-colors"
          >
            {expanded ? "Show Less" : "Show All"}
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
          </button>
        </div>
      </div>
      <div className={`${expanded ? "max-h-[600px] overflow-y-auto" : ""}`}>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 dark:text-slate-500">
            <PieChart className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"/>
          </div>
        ) : displaySessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-slate-400 dark:text-slate-500">
            No sessions yet. Start one above.
          </div>
        ) : (
          <div className="py-2">
            {displaySessions.map(session => renderSession(session))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-[#1a1d2e] border border-slate-200 dark:border-[#2a2d3e] rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const session = sessions.find(s => s.sessionId === contextMenu.sessionId);
              if (session) {
                handleRenameSession(contextMenu.sessionId, session.name || session.provider || `Session ${session.sessionId.slice(0, 8)}`);
              }
            }}
            className="w-full px-3 py-2 text-left text-[12px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252838] transition-colors flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Rename
          </button>
          <button
            onClick={() => onNavigate(contextMenu.sessionId)}
            className="w-full px-3 py-2 text-left text-[12px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252838] transition-colors flex items-center gap-2"
          >
            <SquareArrowOutUpRight className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
            Open
          </button>
          <div className="h-px bg-slate-200 dark:bg-[#2a2d3e] my-1" />
          <button
            onClick={() => handleDeleteSession(contextMenu.sessionId)}
            className="w-full px-3 py-2 text-left text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
