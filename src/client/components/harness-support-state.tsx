"use client";

type MaybeMessage = string | null | undefined;

type HarnessUnsupportedStateProps = {
  repoLabel: string;
  className?: string;
};

const UNSUPPORTED_REPO_MARKERS = [
  "不是 Routa 仓库",
  "不存在或不是目录",
] as const;

export function getHarnessUnsupportedRepoMessage(...messages: MaybeMessage[]): string | null {
  const matched = messages.find((message) => (
    typeof message === "string"
    && UNSUPPORTED_REPO_MARKERS.some((marker) => message.includes(marker))
  ));

  if (!matched) {
    return null;
  }

  return "当前仓库未接入 Routa Harness 所需的仓库结构，当前页面仅支持带 .routa 元数据的仓库。";
}

export function HarnessUnsupportedState({
  repoLabel,
  className,
}: HarnessUnsupportedStateProps) {
  return (
    <div className={className ?? "mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-[11px] text-amber-800"}>
      <div className="font-medium text-amber-900">{repoLabel}</div>
      <div className="mt-1 leading-5">
        当前仓库未接入 Routa Harness 所需的仓库结构，无法渲染该视图。
      </div>
    </div>
  );
}
