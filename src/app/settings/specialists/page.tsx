"use client";

import { useState } from "react";

import { SettingsRouteShell } from "@/client/components/settings-route-shell";
import { SettingsPageHeader } from "@/client/components/settings-page-header";
import { SpecialistsTab } from "@/client/components/settings-panel-specialists-tab";
import { loadModelDefinitions } from "@/client/components/settings-panel-shared";
import { CircleUser } from "lucide-react";


export default function SpecialistsSettingsPage() {
  const [modelDefs] = useState(() => loadModelDefinitions());

  return (
    <SettingsRouteShell
      title="Specialists"
      description="Create and manage custom specialists, prompts, and model bindings for focused execution roles."
      badgeLabel="Execution roles"
      icon={(
        <CircleUser className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}/>
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
