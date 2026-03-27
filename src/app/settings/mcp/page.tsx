"use client";

import { SettingsRouteShell } from "@/client/components/settings-route-shell";
import { SettingsPageHeader } from "@/client/components/settings-page-header";
import { McpServersTab } from "@/client/components/settings-panel-mcp-tab";

export default function McpSettingsPage() {
  return (
    <SettingsRouteShell
      title="MCP Servers"
      description="Manage Model Context Protocol servers, transports, and local integration points for your workspace."
      badgeLabel="Integration"
      icon={(
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5M6.75 12h10.5M6.75 16.5h6.75M4.5 4.5h15A2.25 2.25 0 0121.75 6.75v10.5A2.25 2.25 0 0119.5 19.5h-15A2.25 2.25 0 012.25 17.25V6.75A2.25 2.25 0 014.5 4.5z" />
        </svg>
      )}
      summary={[
        { label: "Transport", value: "stdio / http / sse" },
        { label: "Scope", value: "Workspace integrations" },
      ]}
    >
      <div className="space-y-4">
        <SettingsPageHeader
          title="MCP Servers"
          description="Manage Model Context Protocol servers, transports, and local integration points for your workspace."
          metadata={[
            { label: "Transport", value: "stdio / http / sse" },
            { label: "Scope", value: "Workspace integrations" },
          ]}
        />
        <div className="rounded-2xl border border-desktop-border bg-desktop-bg-secondary/70 shadow-sm">
          <McpServersTab />
        </div>
      </div>
    </SettingsRouteShell>
  );
}
