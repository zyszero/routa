"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { desktopAwareFetch } from "@/client/utils/diagnostics";
import type { RepoSlideSessionResult } from "@/core/reposlide/extract-reposlide-result";

interface RepoSlideSessionResponse {
  latestEventKind?: string;
  result?: RepoSlideSessionResult;
}

interface RepoSlideSessionPanelProps {
  workspaceId: string;
  sessionId: string;
  codebaseId?: string | null;
}

export function RepoSlideSessionPanel({
  workspaceId,
  sessionId,
  codebaseId,
}: RepoSlideSessionPanelProps) {
  const [result, setResult] = useState<RepoSlideSessionResult>({ status: "running" });
  const [latestEventKind, setLatestEventKind] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshTranscript = useCallback(async () => {
    try {
      const response = await desktopAwareFetch(`/api/sessions/${sessionId}/reposlide-result`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json() as RepoSlideSessionResponse;
      setResult(payload.result ?? { status: "running" });
      setLatestEventKind(payload.latestEventKind);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshTranscript();
    const timer = window.setInterval(() => {
      void refreshTranscript();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshTranscript]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const previewText = useMemo(() => result.summary ?? "", [result.summary]);

  const statusLabel = result.deckPath
    ? result.downloadUrl
      ? "Deck ready for download"
      : "Deck path detected"
    : result.latestAssistantMessage
      ? "Waiting for explicit PPTX path"
      : latestEventKind === "agent_message_chunk" || latestEventKind === "agent_message"
        ? "Agent is drafting slides"
        : "Session started";

  const handleCopyPath = useCallback(async () => {
    if (!result.deckPath) return;
    try {
      await navigator.clipboard.writeText(result.deckPath);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [result.deckPath]);

  return (
    <section className="border-b border-[var(--dt-border)] bg-[var(--dt-bg-secondary)]/70 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--dt-accent)]">
            RepoSlide Run
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--dt-text-primary)]">
            {statusLabel}
          </div>
          <div className="mt-1 text-xs text-[var(--dt-text-secondary)]">
            This session was launched from RepoSlide and is expected to generate a PPTX deck.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {codebaseId && (
            <Link
              href={`/workspace/${workspaceId}/codebases/${codebaseId}/reposlide`}
              className="rounded-md border border-[var(--dt-border)] px-2.5 py-1 text-xs text-[var(--dt-text-primary)] hover:bg-[var(--dt-bg-active)]"
            >
              Back to RepoSlide
            </Link>
          )}
          <button
            type="button"
            onClick={() => void refreshTranscript()}
            className="rounded-md border border-[var(--dt-border)] px-2.5 py-1 text-xs text-[var(--dt-text-primary)] hover:bg-[var(--dt-bg-active)]"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="mt-3 text-xs text-[var(--dt-text-secondary)]">
          Loading RepoSlide transcript…
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-300/40 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-950/20 dark:text-rose-300">
          Failed to load RepoSlide transcript: {error}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-bg-primary)] px-3 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--dt-accent)]">
              Latest Output
            </div>
            {previewText ? (
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--dt-text-primary)]">
                {previewText}
              </pre>
            ) : (
              <div className="mt-2 text-xs text-[var(--dt-text-secondary)]">
                No assistant summary yet. Keep the session running and refresh after the agent responds.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-bg-primary)] px-3 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--dt-accent)]">
              Detected Deck Path
            </div>
            {result.deckPath ? (
              <>
                <div className="mt-2 break-all rounded-lg border border-emerald-300/40 bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-200">
                  {result.deckPath}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyPath()}
                  className="mt-2 rounded-md border border-[var(--dt-border)] px-2.5 py-1 text-xs text-[var(--dt-text-primary)] hover:bg-[var(--dt-bg-active)]"
                >
                  {copied ? "Copied" : "Copy path"}
                </button>
                {result.downloadUrl ? (
                  <a
                    href={result.downloadUrl}
                    download
                    className="mt-2 ml-2 inline-flex rounded-md border border-[var(--dt-border)] px-2.5 py-1 text-xs text-[var(--dt-text-primary)] hover:bg-[var(--dt-bg-active)]"
                  >
                    Download PPTX
                  </a>
                ) : (
                  <div className="mt-2 text-xs text-[var(--dt-text-secondary)]">
                    Deck path was detected, but the file is not downloadable from this session context.
                  </div>
                )}
              </>
            ) : (
              <div className="mt-2 text-xs text-[var(--dt-text-secondary)]">
                No `.pptx` path detected in the assistant transcript yet.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
