import { isAiAgent, isInteractive } from "./ai.js";
import { runCommand } from "./process.js";
import { promptYesNo } from "./prompt.js";

type ReviewTrigger = {
  action: string;
  name: string;
  reasons?: string[];
  severity: string;
};

type ReviewReport = {
  triggers?: ReviewTrigger[];
};

async function resolveReviewBase(): Promise<string> {
  const upstream = await runCommand("git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'", {
    stream: false,
  });
  return upstream.exitCode === 0 ? upstream.output.trim() : "HEAD~1";
}

function printReviewReport(report: ReviewReport): void {
  console.log("Human review required before push:");
  for (const trigger of report.triggers ?? []) {
    console.log(`- [${trigger.severity}] ${trigger.name}`);
    for (const reason of trigger.reasons ?? []) {
      console.log(`  - ${reason}`);
    }
  }
  console.log("");
}

export async function runReviewTriggerPhase(): Promise<void> {
  const reviewBase = await resolveReviewBase();

  console.log("[phase 3/3] review trigger");
  console.log(`[review] Base: ${reviewBase}`);
  console.log("");

  const review = await runCommand(
    `PYTHONPATH=tools/entrix python3 -m entrix.cli review-trigger --base "${reviewBase}" --json --fail-on-trigger`,
    { stream: false },
  );

  if (review.exitCode !== 0 && review.exitCode !== 3) {
    console.log("Unable to evaluate review triggers. Continuing without review gate.");
    console.log("");
    return;
  }

  if (review.exitCode === 0) {
    console.log("No review trigger matched.");
    console.log("");
    return;
  }

  const report = JSON.parse(review.output) as ReviewReport;
  printReviewReport(report);

  if (process.env.ROUTA_ALLOW_REVIEW_TRIGGER_PUSH === "1") {
    console.log("ROUTA_ALLOW_REVIEW_TRIGGER_PUSH=1 set, bypassing review gate.");
    console.log("");
    return;
  }

  if (isAiAgent()) {
    throw new Error(
      "Review-trigger matched. Human review is required before push. Rerun with ROUTA_ALLOW_REVIEW_TRIGGER_PUSH=1 after review if you intentionally want to bypass this gate.",
    );
  }

  if (!isInteractive()) {
    throw new Error(
      "Review-trigger matched in a non-interactive push. Complete human review first, then rerun with ROUTA_ALLOW_REVIEW_TRIGGER_PUSH=1 to confirm.",
    );
  }

  const confirmed = await promptYesNo(
    "These changes need human review. Confirm review is complete and continue push? [y/N]",
  );
  if (!confirmed) {
    throw new Error("Push aborted. Complete review, then push again.");
  }

  console.log("Human review acknowledged. Continuing push.");
  console.log("");
}
