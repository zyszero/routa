import { describe, expect, it } from "vitest";

import path from "node:path";
import { mkdtempSync, rmSync, writeFileSync as writeTempFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { runMarkdownLinksCheck } from "../check-markdown-links.js";

function writeFakeCurl(binDir: string): { restore: () => void } {
  const originalPath = process.env.PATH ?? "";
  const fakeCurl = path.join(binDir, "curl");
  const script = `#!/bin/sh
set -eu

url=""
for arg in "$@"; do
  case "$arg" in
    http*://*)
      url="$arg"
      ;;
  esac
done

if [ -z "$url" ]; then
  exit 1
fi

case "$url" in
  *good.example.com*)
    echo "200"
    ;;
  *redirect.example.com*)
    echo "301"
    ;;
  *warn.example.com*)
    echo "404"
    ;;
  *rate.example.com*)
    echo "429"
    ;;
  *timeout.example.com*)
    exit 7
    ;;
  *)
    echo "500"
    ;;
esac
`;
  writeTempFileSync(fakeCurl, `${script}\n`, { mode: 0o755 });
  process.env.PATH = `${binDir}:${originalPath}`;

  return {
    restore: () => {
      process.env.PATH = originalPath;
      rmSync(fakeCurl);
    },
  };
}

function withRepo<T>(files: Array<{ file: string; content: string }>, run: () => T): T {
  const originalCwd = process.cwd();
  const originalPath = process.env.PATH ?? "";
  const repoRoot = mkdtempSync(path.join(tmpdir(), "routa-md-links-"));
  const fakeBinDir = mkdtempSync(path.join(tmpdir(), "routa-md-links-bin-"));

  process.chdir(repoRoot);
  execSync("git init", { cwd: repoRoot, stdio: "ignore" });

  for (const file of files) {
    const absolutePath = path.join(repoRoot, file.file);
    writeTempFileSync(absolutePath, file.content);
    execSync(`git add "${file.file}"`, { cwd: repoRoot, stdio: "ignore" });
  }

  const { restore } = writeFakeCurl(fakeBinDir);

  try {
    return run();
  } finally {
    restore();
    process.chdir(originalCwd);
    process.env.PATH = originalPath;
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(fakeBinDir, { recursive: true, force: true });
  }
}

describe("runMarkdownLinksCheck", () => {
  it("passes when there are no markdown files", () => {
    const result = withRepo([], () => runMarkdownLinksCheck());

    expect(result).toBe(0);
  });

  it("passes when all external links are reachable", () => {
    const result = withRepo(
      [
        {
          file: "readme.md",
          content: "[r1](https://good.example.com)\n[r2](https://redirect.example.com)",
        },
      ],
      () => runMarkdownLinksCheck(),
    );

    expect(result).toBe(0);
  });

  it("warns on recoverable link checks without failing", () => {
    const result = withRepo(
      [
        {
          file: "guide.md",
          content: "[bad](https://warn.example.com)\n[timeout](https://timeout.example.com)",
        },
      ],
      () => runMarkdownLinksCheck(),
    );

    expect(result).toBe(0);
  });

  it("fails when an external link is broken", () => {
    const result = withRepo(
      [
        {
          file: "doc.md",
          content: "[bad](https://bad.example.com)",
        },
      ],
      () => runMarkdownLinksCheck(),
    );

    expect(result).toBe(1);
  });
});
