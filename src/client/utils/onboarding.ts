"use client";

import type {
  DefaultProviderSettings,
  ProviderConnectionsStorage,
} from "../components/settings-panel-shared";

export const ONBOARDING_COMPLETED_KEY = "routa.onboarding.completed";
export const ONBOARDING_MODE_KEY = "routa.onboarding.mode";

export type OnboardingMode = "ROUTA" | "CRAFTER";

export function parseOnboardingMode(value: string | null): OnboardingMode | null {
  return value === "ROUTA" || value === "CRAFTER" ? value : null;
}

export function hasSavedProviderConfiguration(
  defaults: DefaultProviderSettings,
  connections: ProviderConnectionsStorage,
  options?: {
    dockerOpencodeAuthJson?: string;
    customProviderCount?: number;
  },
): boolean {
  for (const config of Object.values(defaults)) {
    if (config?.provider || config?.model) {
      return true;
    }
  }

  for (const connection of Object.values(connections)) {
    if (connection?.baseUrl || connection?.apiKey || connection?.model) {
      return true;
    }
  }

  if (options?.dockerOpencodeAuthJson?.trim()) {
    return true;
  }

  if ((options?.customProviderCount ?? 0) > 0) {
    return true;
  }

  return false;
}

export function clearOnboardingState(storage: Storage): void {
  storage.removeItem(ONBOARDING_COMPLETED_KEY);
  storage.removeItem(ONBOARDING_MODE_KEY);
}
