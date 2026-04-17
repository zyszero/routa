import fs from "node:fs/promises";
import path from "node:path";

import { getCanvasesDir } from "@/core/storage/folder-slug";

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "canvas";
}

function deriveRepoSegment(repoPath: string, repoLabel?: string): string {
  const candidate = repoLabel?.trim() || path.basename(repoPath);
  return sanitizeSegment(candidate);
}

export function buildFitnessCanvasFileName(repoPath: string, repoLabel?: string): string {
  return `${deriveRepoSegment(repoPath, repoLabel)}-fitness-overview.canvas.tsx`;
}

export function getStoredFitnessCanvasPath(repoPath: string, repoLabel?: string): string {
  return path.join(getCanvasesDir(repoPath), buildFitnessCanvasFileName(repoPath, repoLabel));
}

export async function persistFitnessCanvasSource(input: {
  repoPath: string;
  repoLabel?: string;
  source: string;
}): Promise<{ filePath: string; fileName: string }> {
  const filePath = getStoredFitnessCanvasPath(input.repoPath, input.repoLabel);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${input.source.trim()}\n`, "utf-8");
  return {
    filePath,
    fileName: path.basename(filePath),
  };
}
