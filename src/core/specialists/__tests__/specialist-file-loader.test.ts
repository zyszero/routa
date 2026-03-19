import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  getLocaleOverlayDirs,
  loadSpecialistsFromDirectory,
  loadBundledSpecialists,
} from "../specialist-file-loader";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "specialist-loader-"));
  tempDirs.push(dir);
  return dir;
}

function writeSpecialist(filePath: string, name: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `---
name: "${name}"
description: "${name} description"
role: "DEVELOPER"
---

${name} body
`,
    "utf8"
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("specialist-file-loader", () => {
  it("loads markdown specialists recursively while skipping locale directories in the base scan", () => {
    const rootDir = createTempDir();
    writeSpecialist(path.join(rootDir, "core", "developer.md"), "Developer");
    writeSpecialist(path.join(rootDir, "team", "qa.md"), "QA");
    writeSpecialist(path.join(rootDir, "zh-CN", "developer.md"), "开发者");
    writeSpecialist(path.join(rootDir, "locales", "zh-CN", "qa.md"), "测试");

    const loaded = loadSpecialistsFromDirectory(rootDir, "bundled");

    expect(loaded.map((entry) => entry.id).sort()).toEqual(["developer", "qa"]);
    expect(loaded.every((entry) => entry.locale === undefined)).toBe(true);
  });

  it("loads locale overlays from both new and legacy directory layouts", () => {
    const rootDir = createTempDir();
    const newLocaleDir = path.join(rootDir, "locales", "zh-CN");
    const legacyLocaleDir = path.join(rootDir, "zh-CN");
    writeSpecialist(path.join(newLocaleDir, "core", "developer.md"), "开发者");
    writeSpecialist(path.join(legacyLocaleDir, "review", "gate.md"), "验证者");

    expect(getLocaleOverlayDirs(rootDir, "zh-CN").sort()).toEqual(
      [legacyLocaleDir, newLocaleDir].sort()
    );

    const loaded = getLocaleOverlayDirs(rootDir, "zh-CN").flatMap((dirPath) =>
      loadSpecialistsFromDirectory(dirPath, "bundled", "zh-CN")
    );

    expect(loaded.map((entry) => `${entry.id}:${entry.locale}`).sort()).toEqual([
      "developer:zh-CN",
      "gate:zh-CN",
    ]);
  });

  it("uses the new locale overlay path for bundled specialist directories", () => {
    const repoRoot = createTempDir();
    const previousCwd = process.cwd();

    try {
      process.chdir(repoRoot);
      writeSpecialist(
        path.join(repoRoot, "resources", "specialists", "locales", "zh-CN", "developer.md"),
        "开发者"
      );

      const loaded = loadBundledSpecialists("zh-CN");
      expect(loaded.map((entry) => entry.id)).toEqual(["developer"]);
      expect(loaded[0]?.locale).toBe("zh-CN");
    } finally {
      process.chdir(previousCwd);
    }
  });
});
