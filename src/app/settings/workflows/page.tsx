"use client";

import { SettingsRouteShell } from "@/client/components/settings-route-shell";
import { SettingsPageHeader } from "@/client/components/settings-page-header";
import { WorkflowPanel } from "@/client/components/workflow-panel";

export default function WorkflowSettingsPage() {
  return (
    <SettingsRouteShell
      title="Workflows"
      description="Compose and run recurring workflows that coordinate multiple actions, triggers, and agents."
      badgeLabel="Automation"
      icon={(
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 5.25h3.75V9H6V5.25zm8.25 0H18V9h-3.75V5.25zM6 15h3.75v3.75H6V15zm8.25 0H18v3.75h-3.75V15zM9.75 7.125h4.5m-2.25 1.5v5.25m2.25 0h-4.5" />
        </svg>
      )}
      summary={[
        { label: "Focus", value: "Reusable automation flows" },
        { label: "Output", value: "Tasks and graph execution" },
      ]}
    >
      <div className="space-y-6">
        <SettingsPageHeader
          title="Workflows"
          description="Compose and run recurring workflows that coordinate multiple actions, triggers, and agents."
          metadata={[
            { label: "Focus", value: "Reusable automation flows" },
            { label: "Output", value: "Tasks and graph execution" },
          ]}
        />

        <WorkflowPanel />
      </div>
    </SettingsRouteShell>
  );
}
