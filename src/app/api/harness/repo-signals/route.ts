import * as fs from "fs";
import { promises as fsp } from "fs";
import * as path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isContextError, parseContext, resolveRepoRoot } from "../hooks/shared";

type ScriptCategory = "build" | "dev" | "bundle" | "unit" | "e2e" | "quality" | "coverage";

type ScriptSignal = {
  name: string;
  command: string;
  category: ScriptCategory;
};

type FileSignal = {
  relativePath: string;
  exists: boolean;
};

type RepoSignalsResponse = {
  generatedAt: string;
  repoRoot: string;
  packageManager: string | null;
  lockfiles: string[];
  build: {
    scripts: ScriptSignal[];
    manifests: FileSignal[];
    configFiles: FileSignal[];
    outputDirs: FileSignal[];
    platformTargets: string[];
  };
  test: {
    scripts: ScriptSignal[];
    configFiles: FileSignal[];
    artifactDirs: FileSignal[];
    evidenceFiles: FileSignal[];
  };
  warnings: string[];
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeFileSignal(repoRoot: string, relativePath: string): FileSignal {
  const absolutePath = path.join(repoRoot, relativePath);
  return {
    relativePath,
    exists: fs.existsSync(absolutePath),
  };
}

function resolvePackageManager(packageJson: Record<string, unknown>, lockfiles: string[]): string | null {
  const raw = typeof packageJson.packageManager === "string" ? packageJson.packageManager : "";
  if (raw.trim()) {
    return raw;
  }
  if (lockfiles.includes("pnpm-lock.yaml")) return "pnpm";
  if (lockfiles.includes("package-lock.json")) return "npm";
  if (lockfiles.includes("yarn.lock")) return "yarn";
  return null;
}

function inferBuildCategory(name: string): ScriptCategory | null {
  if (name === "dev" || name.endsWith(":dev") || name.startsWith("start:")) return "dev";
  if (name.startsWith("build")) return name.includes("bundle") || name.includes("docker") || name.includes("static") ? "bundle" : "build";
  return null;
}

function inferTestCategory(name: string): ScriptCategory | null {
  if (name.includes("cov")) return "coverage";
  if (name.startsWith("test:e2e")) return "e2e";
  if (name === "test" || name === "test:run" || name === "test:ui" || name.startsWith("scripts:test")) return "unit";
  if (name.startsWith("test:") || name.startsWith("api:test")) return "quality";
  return null;
}

function collectScripts(
  scripts: Record<string, unknown>,
  inferCategory: (name: string) => ScriptCategory | null,
): ScriptSignal[] {
  return Object.entries(scripts)
    .map(([name, command]) => {
      const category = inferCategory(name);
      if (!category || typeof command !== "string") {
        return null;
      }
      return { name, command, category } satisfies ScriptSignal;
    })
    .filter((entry): entry is ScriptSignal => Boolean(entry));
}

function collectBuildTargets(buildScripts: ScriptSignal[], manifests: FileSignal[], configFiles: FileSignal[]): string[] {
  const targets = new Set<string>();
  if (buildScripts.some((script) => script.name === "build" || script.name === "dev")) {
    targets.add("Next.js web");
  }
  if (buildScripts.some((script) => script.name.includes("tauri") || script.name.includes("desktop"))) {
    targets.add("Tauri desktop");
  }
  if (buildScripts.some((script) => script.name.includes("docker")) || configFiles.some((file) => file.relativePath === "Dockerfile" && file.exists)) {
    targets.add("Docker image");
  }
  if (buildScripts.some((script) => script.name.includes("static"))) {
    targets.add("Static export");
  }
  if (manifests.some((file) => file.relativePath === "Cargo.toml" && file.exists)) {
    targets.add("Rust workspace");
  }
  return [...targets];
}

export async function GET(request: NextRequest) {
  try {
    const context = parseContext(request.nextUrl.searchParams);
    const repoRoot = await resolveRepoRoot(context);
    const warnings: string[] = [];
    const packageJsonPath = path.join(repoRoot, "package.json");
    let packageJson: Record<string, unknown> = {};

    if (fs.existsSync(packageJsonPath)) {
      try {
        packageJson = JSON.parse(await fsp.readFile(packageJsonPath, "utf-8")) as Record<string, unknown>;
      } catch (error) {
        warnings.push(`Failed to parse package.json: ${toMessage(error)}`);
      }
    } else {
      warnings.push("Missing package.json at repository root.");
    }

    const scripts = packageJson.scripts && typeof packageJson.scripts === "object"
      ? packageJson.scripts as Record<string, unknown>
      : {};

    const lockfileCandidates = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"];
    const lockfiles = lockfileCandidates.filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)));

    const buildScripts = collectScripts(scripts, inferBuildCategory);
    const testScripts = collectScripts(scripts, inferTestCategory);

    const buildManifests = [
      "package.json",
      "Cargo.toml",
      "apps/desktop/package.json",
      "apps/desktop/src-tauri/Cargo.toml",
    ].map((relativePath) => makeFileSignal(repoRoot, relativePath));

    const buildConfigFiles = [
      "next.config.ts",
      "Dockerfile",
      "docker-compose.yml",
      "vercel.json",
    ].map((relativePath) => makeFileSignal(repoRoot, relativePath));

    const testConfigFiles = [
      "vitest.config.ts",
      "vitest.setup.ts",
      "playwright.config.ts",
      "playwright.tauri.config.ts",
      "tests/api-contract/run.ts",
    ].map((relativePath) => makeFileSignal(repoRoot, relativePath));

    const testEvidenceFiles = [
      "docs/fitness/unit-test.md",
      "docs/fitness/rust-api-test.md",
      "docs/fitness/web-qa-e2e-matrix.md",
    ].map((relativePath) => makeFileSignal(repoRoot, relativePath));

    const buildOutputDirs = [
      "out",
      "dist",
      "target",
    ].map((relativePath) => makeFileSignal(repoRoot, relativePath));

    const testArtifactDirs = [
      "coverage",
      "test-results",
      "docs/fitness/reports",
    ].map((relativePath) => makeFileSignal(repoRoot, relativePath));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      repoRoot,
      packageManager: resolvePackageManager(packageJson, lockfiles),
      lockfiles,
      build: {
        scripts: buildScripts,
        manifests: buildManifests,
        configFiles: buildConfigFiles,
        outputDirs: buildOutputDirs,
        platformTargets: collectBuildTargets(buildScripts, buildManifests, buildConfigFiles),
      },
      test: {
        scripts: testScripts,
        configFiles: testConfigFiles,
        artifactDirs: testArtifactDirs,
        evidenceFiles: testEvidenceFiles,
      },
      warnings,
    } satisfies RepoSignalsResponse);
  } catch (error) {
    const message = toMessage(error);
    if (isContextError(message)) {
      return NextResponse.json(
        {
          error: "Harness repo signals 上下文无效",
          details: message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "读取 Harness repo signals 失败",
        details: message,
      },
      { status: 500 },
    );
  }
}
