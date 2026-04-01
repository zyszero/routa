"use client";

import type { ReactNode } from "react";

import { DesktopAppShell } from "./desktop-app-shell";
import { Settings } from "lucide-react";


interface SettingsRouteShellProps {
  title: string;
  description: string;
  children: ReactNode;
  workspaceId?: string | null;
  workspaceTitle?: string;
  badgeLabel?: string;
  icon?: ReactNode;
  summary?: Array<{ label: string; value: string }>;
  workspaceSwitcher?: ReactNode;
  contentClassName?: string;
}

export function SettingsRouteShell({
  title,
  description,
  children,
  workspaceId,
  workspaceTitle,
  badgeLabel,
  icon,
  summary = [],
  workspaceSwitcher,
  contentClassName,
}: SettingsRouteShellProps) {
  void badgeLabel;
  void summary;
  void description;

  return (
    <DesktopAppShell
      workspaceId={workspaceId}
      workspaceTitle={workspaceTitle}
      workspaceSwitcher={workspaceSwitcher ?? (
        <div className="flex items-center gap-1.5 rounded-xl border border-desktop-border bg-desktop-bg-secondary px-2.5 py-1.5 text-[11px] text-desktop-text-primary">
          <span>{icon ?? <Settings className="h-3 w-3 text-desktop-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} />}</span>
          <span>{title}</span>
        </div>
      )}
    >
      <main className="h-full overflow-y-auto bg-desktop-bg-primary text-desktop-text-primary">
        <div className={contentClassName ?? "flex min-h-full w-full flex-col px-8 py-8"}>
          {children}
        </div>
      </main>
    </DesktopAppShell>
  );
}
