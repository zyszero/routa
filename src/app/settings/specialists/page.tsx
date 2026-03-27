"use client";

import { useState } from "react";

import { SettingsRouteShell } from "@/client/components/settings-route-shell";
import { SettingsPageHeader } from "@/client/components/settings-page-header";
import { SpecialistsTab } from "@/client/components/settings-panel-specialists-tab";
import { loadModelDefinitions } from "@/client/components/settings-panel-shared";

export default function SpecialistsSettingsPage() {
  const [modelDefs] = useState(() => loadModelDefinitions());

  return (
    <SettingsRouteShell
      title="Specialists"
      description="Create and manage custom specialists, prompts, and model bindings for focused execution roles."
      badgeLabel="Execution roles"
      icon={(
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 19.5a7.5 7.5 0 1115 0" />
        </svg>
      )}
      summary={[
        { label: "Purpose", value: "Focused execution personas" },
        { label: "Binding", value: "Prompt + model pairing" },
      ]}
    >
      <div className="space-y-4">
        <SettingsPageHeader
          title="Specialists"
          description="Create and manage custom specialists, prompts, and model bindings for focused execution roles."
          metadata={[
            { label: "Purpose", value: "Focused execution personas" },
            { label: "Binding", value: "Prompt + model pairing" },
          ]}
        />
        <div className="rounded-2xl border border-desktop-border bg-desktop-bg-secondary/70 shadow-sm">
          <SpecialistsTab modelDefs={modelDefs} />
        </div>
      </div>
    </SettingsRouteShell>
  );
}
