import { Suspense } from "react";

import { getCurrentRoutaRepoRoot } from "@/core/fitness/repo-root";

import { FluencySettingsPageClient } from "./fluency-settings-page-client";

export default function FluencySettingsPage() {
  const defaultRepoPath = getCurrentRoutaRepoRoot();

  return (
    <Suspense fallback={null}>
      <FluencySettingsPageClient defaultRepoPath={defaultRepoPath} />
    </Suspense>
  );
}
