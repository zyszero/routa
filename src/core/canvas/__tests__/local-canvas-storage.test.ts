/**
 * @vitest-environment node
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildFitnessCanvasFileName,
  getStoredFitnessCanvasPath,
  persistFitnessCanvasSource,
} from "../local-canvas-storage";

describe("local canvas storage", () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "routa-canvas-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("builds a deterministic fitness canvas file name", () => {
    expect(buildFitnessCanvasFileName("/Users/phodal/ai/routa-js", "routa-js")).toBe(
      "routa-js-fitness-overview.canvas.tsx",
    );
  });

  it("resolves the stored path under ~/.routa/projects/{slug}/canvases", () => {
    expect(getStoredFitnessCanvasPath("/Users/phodal/ai/routa-js", "routa-js")).toBe(
      path.join(
        tempHome,
        ".routa",
        "projects",
        "Users-phodal-ai-routa-js",
        "canvases",
        "routa-js-fitness-overview.canvas.tsx",
      ),
    );
  });

  it("persists the generated canvas source to the project-local canvases directory", async () => {
    const result = await persistFitnessCanvasSource({
      repoPath: "/Users/phodal/ai/routa-js",
      repoLabel: "routa-js",
      source: "export default function Canvas(){ return <div />; }",
    });

    await expect(fs.readFile(result.filePath, "utf-8")).resolves.toBe(
      "export default function Canvas(){ return <div />; }\n",
    );
  });
});
