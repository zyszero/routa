import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

type SubmoduleCheckResult = {
  found: boolean;
  failures: number;
};

function runCommand(args: string[]): { code: number; output: string } {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    code: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function normalizeUrl(rawUrl: string): string {
  const match = /^git@github\.com:(.+)$/.exec(rawUrl);
  if (match) {
    return `https://github.com/${match[1]}`;
  }
  return rawUrl;
}

function parseSubmodulePathEntries(raw: string): Array<{ key: string; path: string }> {
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((entry) => {
      const [key, ...rest] = entry.split(" ");
      const submodulePath = rest.join(" ").trim();
      return { key, path: submodulePath };
    })
    .filter((item) => Boolean(item.key && item.path));
}

async function checkSubmoduleRefs(): Promise<SubmoduleCheckResult> {
  const gitmodulesPath = path.join(process.cwd(), ".gitmodules");
  if (!existsSync(gitmodulesPath)) {
    console.log("[submodule] No .gitmodules file found, skipping submodule ref check.");
    return { found: false, failures: 0 };
  }

  const listCommand = runCommand(["-c", `core.worktree=${process.cwd()}`, "config", "-f", gitmodulesPath, "--get-regexp", "^submodule\\..*\\.path$"]);

  if (listCommand.code !== 0 || !listCommand.output.trim()) {
    console.log("[submodule] No configured submodules found in .gitmodules, skipping submodule ref check.");
    return { found: false, failures: 0 };
  }

  const entries = parseSubmodulePathEntries(listCommand.output);

  if (entries.length === 0) {
    console.log("[submodule] No configured submodules found in .gitmodules, skipping submodule ref check.");
    return { found: false, failures: 0 };
  }

  console.log("[submodule] Verifying pinned submodule refs...");

  const tempRoot = mkdtempSync(path.join(tmpdir(), "routa-submodule-"));
  let failures = 0;

  try {
    for (const entry of entries) {
      const key = entry.key;
      const submodulePath = entry.path;
      const name = key.replace(/^submodule\./, "").replace(/\.path$/, "");

      const urlResult = runCommand(["-c", `core.worktree=${process.cwd()}`, "config", "-f", gitmodulesPath, "--get", `submodule.${name}.url`]);
      if (urlResult.code !== 0 || !urlResult.output.trim()) {
        console.log(`[submodule] WARN ${submodulePath} is missing a configured URL; skipping.`);
        continue;
      }

      const shaResult = runCommand(["ls-tree", "HEAD", submodulePath]);
      if (shaResult.code !== 0 || !shaResult.output.trim()) {
        console.log(`[submodule] WARN ${submodulePath} is not present in HEAD; skipping.`);
        continue;
      }

      const shaMatch = shaResult.output.split(/\s+/);
      const sha = shaMatch[2]?.trim();
      if (!sha) {
        console.log(`[submodule] WARN ${submodulePath} has no git link in HEAD; skipping.`);
        continue;
      }

      const remoteUrl = normalizeUrl(urlResult.output.trim());
      console.log(`[submodule] Checking ${submodulePath} @ ${sha}`);

      const probeDir = path.join(tempRoot, name);
      runCommand(["init", "--bare", probeDir]);

      const fetchResult = runCommand(["-C", probeDir, "fetch", "--depth=1", remoteUrl, sha]);
      if (fetchResult.code === 0) {
        console.log(`[submodule] OK ${submodulePath} commit is available on ${remoteUrl}`);
        continue;
      }

      console.log(`[submodule] FAIL ${submodulePath} points to missing remote commit ${sha}`);
      console.log(`[submodule]      Remote: ${remoteUrl}`);
      console.log("[submodule]      Push the submodule commit first or update the gitlink to a reachable commit.");
      failures += 1;
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.log("[submodule] Submodule ref check failed.");
    return { found: true, failures };
  }

  console.log("[submodule] All submodule refs are reachable.");
  return { found: true, failures: 0 };
}

export async function runSubmoduleRefsCheck(): Promise<boolean> {
  const result = await checkSubmoduleRefs();
  return result.found ? result.failures === 0 : true;
}
