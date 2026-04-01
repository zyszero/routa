"use client";

/**
 * Desktop Navigation Rail — Minimal vertical icon bar for Tauri app.
 *
 * A slim navigation rail that can be added to any page layout.
 * Provides consistent navigation across all desktop app pages.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/i18n";
import { Columns2, LayoutGrid, Settings } from "lucide-react";


interface DesktopNavRailProps {
  workspaceId: string;
}

export function DesktopNavRail({
  workspaceId,
}: DesktopNavRailProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
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
      href: `/workspace/${workspaceId}/kanban`,
      icon: (
        <Columns2 className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
      ),
    },
    {
      id: "overview",
      label: t.nav.overview,
      href: `/workspace/${workspaceId}/overview`,
      icon: (
        <LayoutGrid className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
      ),
    },
    {
      id: "team",
      label: t.nav.team,
      href: `/workspace/${workspaceId}/team`,
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

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside
      className="desktop-theme h-full w-12 shrink-0 flex flex-col border-r border-desktop-border bg-desktop-bg-secondary"
      data-testid="desktop-nav-rail"
    >
      <nav className="flex-1 flex flex-col items-center py-2 gap-0.5">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`
                relative w-10 h-10 flex items-center justify-center rounded-md transition-colors
              ${active
                  ? "bg-desktop-bg-active text-desktop-accent"
                  : "text-desktop-text-secondary hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
                }
              `}
              title={item.label}
            >
              {active && (
                <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-desktop-accent" />
              )}
              {item.icon}
            </Link>
          );
        })}
      </nav>
      <div className="mx-2 border-t border-desktop-border" />
      <div className="flex flex-col items-center py-2 gap-0.5">
        <Link
          href="/settings"
          className={`
            w-10 h-10 flex items-center justify-center rounded-md transition-colors
            ${pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/traces" || pathname.startsWith("/traces/")
              ? "bg-desktop-bg-active text-desktop-accent"
              : "text-desktop-text-secondary hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
            }
          `}
          title={t.nav.settings}
        >
          <Settings className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
        </Link>
      </div>
    </aside>
  );
}
