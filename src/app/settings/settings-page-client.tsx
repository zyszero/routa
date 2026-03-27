"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { SettingsPanel } from "@/client/components/settings-panel";
import type { SettingsTab } from "@/client/components/settings-panel-shared";

interface ProviderOption {
  id: string;
  name: string;
  status?: string;
}

export function SettingsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const requestedTab = searchParams.get("tab");
  const initialTab = isSettingsTab(requestedTab) ? requestedTab : undefined;

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await fetch("/api/providers");
        if (res.ok) {
          const data = await res.json();
          setProviders(data.providers ?? []);
        }
      } catch (error) {
        console.error("Failed to fetch providers:", error);
      }
    };

    void fetchProviders();
  }, []);

  const handleClose = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-[#0f1117]">
      <SettingsPanel
        key={initialTab ?? "providers"}
        open={true}
        onClose={handleClose}
        providers={providers}
        initialTab={initialTab}
      />
    </div>
  );
}

function isSettingsTab(value: string | null): value is SettingsTab {
  return value === "providers"
    || value === "roles"
    || value === "specialists"
    || value === "models"
    || value === "mcp"
    || value === "webhooks"
    || value === "schedules"
    || value === "workflows";
}
