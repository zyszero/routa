"use client";

/**
 * Desktop Sidebar Navigation — VS Code-style left navigation for Tauri app.
 *
 * Provides a compact icon-based navigation with:
 * - Primary navigation icons (Overview, Kanban, Traces)
 * - Secondary actions (Settings)
 * - Workspace indicator
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/i18n";
import { HarnessMark } from "./harness-mark";
import { ChevronLeft, CircleUser, Columns2, LayoutGrid, Settings } from "lucide-react";


interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  requiresWorkspace?: boolean;
}

interface SidebarTopAction {
  href: string;
  label: string;
  icon?: React.ReactNode;
}

interface DesktopSidebarProps {
  workspaceId?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  topAction?: SidebarTopAction;
}

export function DesktopSidebar({
  workspaceId,
  collapsed = false,
  onToggleCollapse,
  topAction,
}: DesktopSidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const normalizedWorkspaceId = workspaceId?.trim() || null;
  const fallbackWorkspaceId = normalizedWorkspaceId || "default";
  const workspaceBaseHref = `/workspace/${fallbackWorkspaceId}`;
  const settingsHarnessHref = normalizedWorkspaceId
    ? `/settings/harness?workspaceId=${encodeURIComponent(normalizedWorkspaceId)}`
    : "/settings/harness";
  const settingsFluencyHref = normalizedWorkspaceId
    ? `/settings/fluency?workspaceId=${encodeURIComponent(normalizedWorkspaceId)}`
    : "/settings/fluency";

  const primaryItems: NavItem[] = [
    {
      id: "home",
      label: t.nav.home,
      href: "/",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      ),
    },
    {
      id: "kanban",
      label: t.nav.kanban,
      href: workspaceBaseHref ? `${workspaceBaseHref}/kanban` : "/",
      requiresWorkspace: true,
      icon: (
        <Columns2 className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
      ),
    },
    {
      id: "overview",
      label: t.nav.overview,
      href: workspaceBaseHref ? `${workspaceBaseHref}/overview` : "/",
      requiresWorkspace: true,
      icon: (
        <LayoutGrid className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
      ),
    },
    {
      id: "team",
      label: t.nav.team,
      href: workspaceBaseHref ? `${workspaceBaseHref}/team` : "/",
      requiresWorkspace: true,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <circle cx="7.5" cy="8" r="2.25" />
          <circle cx="16.5" cy="8" r="2.25" />
          <circle cx="12" cy="16" r="2.25" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 8h5M8.75 9.9l2 3.55m4.5-3.55-2 3.55" />
        </svg>
      ),
    },
  ];

  const toolItems: NavItem[] = [
    {
      id: "mcp",
      label: t.nav.mcpServers,
      href: "/settings/mcp",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5M6.75 12h10.5M6.75 16.5h6.75M4.5 4.5h15A2.25 2.25 0 0121.75 6.75v10.5A2.25 2.25 0 0119.5 19.5h-15A2.25 2.25 0 012.25 17.25V6.75A2.25 2.25 0 014.5 4.5z" />
        </svg>
      ),
    },
    {
      id: "schedules",
      label: t.nav.schedules,
      href: "/settings/schedules",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3.75v3m10.5-3v3M4.5 8.25h15m-14.25 9h5.25m-5.25 0V6.75A2.25 2.25 0 016.75 4.5h10.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25z" />
        </svg>
      ),
    },
    {
      id: "harness",
      label: t.nav.harness,
      href: settingsHarnessHref,
      icon: <HarnessMark className="h-5 w-5" />,
    },
    {
      id: "fluency",
      label: t.nav.fluency,
      href: settingsFluencyHref,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1115 0m-7.5 0v5.25m0-5.25l3.25-3.25m-3.25 3.25L8.75 8.75" />
        </svg>
      ),
    },
    {
      id: "workflows",
      label: t.nav.workflows,
      href: "/settings/workflows",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 5.25h3.75V9H6V5.25zm8.25 0H18V9h-3.75V5.25zM6 15h3.75v3.75H6V15zm8.25 0H18v3.75h-3.75V15zM9.75 7.125h4.5m-2.25 1.5v5.25m2.25 0h-4.5" />
        </svg>
      ),
    },
    {
      id: "specialists",
      label: t.nav.specialists,
      href: "/settings/specialists",
      icon: (
        <CircleUser className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
      ),
    },
  ];

  const secondaryItems: NavItem[] = [
    {
      id: "config",
      label: t.nav.settings,
      href: "/settings",
      icon: (
        <Settings className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
      ),
    },
    {
      id: "debug",
      label: t.nav.debug,
      href: "/traces",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
        </svg>
      ),
    },
  ];

  const isActive = (href: string) => {
    const hrefPath = href.split("?")[0]?.split("#")[0] ?? href;
    if (hrefPath === "/") return pathname === "/";
    if (hrefPath === workspaceBaseHref) return pathname === hrefPath;
    return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);
    const className = `relative flex items-center rounded-xl transition-colors ${
      active
        ? "bg-desktop-bg-active text-desktop-accent"
        : "text-desktop-text-secondary hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
    } ${collapsed ? "h-10 w-10 justify-center" : "h-11 w-full gap-3 px-3 text-sm font-medium"}`;

    return (
      <Link
        key={item.id}
        href={item.href}
        className={className}
        title={item.label}
      >
        {active && <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-desktop-accent" />}
        {item.icon}
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={`h-full shrink-0 flex flex-col border-r border-desktop-border bg-desktop-bg-secondary transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-48"
      }`}
      data-testid="desktop-shell-sidebar"
    >
      <div className={`border-b border-desktop-border px-2 py-2 ${collapsed ? "flex justify-center" : ""}`}>
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`flex items-center rounded-xl text-desktop-text-secondary transition-colors hover:bg-desktop-bg-active hover:text-desktop-text-primary ${
            collapsed ? "h-10 w-10 justify-center" : "h-10 w-10 justify-center"
          }`}
          title={collapsed ? t.nav.openSidebar : t.nav.closeSidebar}
          aria-label={collapsed ? t.nav.openSidebar : t.nav.closeSidebar}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 6 12l7.5 7.5M18 4.5 10.5 12 18 19.5" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 4.5 18 12l-7.5 7.5M6 4.5 13.5 12 6 19.5" />
            )}
          </svg>
        </button>
      </div>

      <nav className={`flex-1 py-3 ${collapsed ? "flex flex-col items-center gap-1" : "px-2 space-y-1"}`}>
        {topAction ? (
          <>
            <Link
              href={topAction.href}
              className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-desktop-text-secondary transition-colors hover:bg-desktop-bg-active hover:text-desktop-text-primary"
              title={topAction.label}
              aria-label={topAction.label}
            >
              {topAction.icon ?? (
                <ChevronLeft className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
              )}
            </Link>
            {!collapsed && <div className="mx-1 mb-2 border-t border-desktop-border" />}
          </>
        ) : null}
        {primaryItems.map(renderNavItem)}
        {!collapsed && <div className="mx-1 my-2 border-t border-desktop-border" />}
        {toolItems.map(renderNavItem)}
      </nav>

      <div className={`${collapsed ? "mx-3" : "mx-2"} border-t border-desktop-border`} />

      <div className={`py-3 ${collapsed ? "flex flex-col items-center gap-1" : "px-2 space-y-1"}`}>
        {secondaryItems.map(renderNavItem)}
      </div>
    </aside>
  );
}
