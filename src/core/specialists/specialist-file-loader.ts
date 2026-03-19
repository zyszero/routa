/**
 * Specialist File Loader
 *
 * Loads specialist prompt content from Markdown files with YAML frontmatter.
 * Supports a loading priority hierarchy:
 *   1. User-defined specialists (~/.routa/specialists/) — highest priority
 *   2. Bundled specialists (resources/specialists/) — default
 *   3. Hardcoded fallback (specialist-prompts.ts) — lowest priority
 *
 * Directory layout rules during the staged migration:
 *   - Runtime Markdown prompts may live in nested taxonomy directories
 *     (for example `team/`, `review/`, `workflows/kanban/`)
 *   - Locale overlays are loaded only from `locales/<locale>/` or the legacy
 *     `<locale>/` directory and do not participate in the base scan
 *   - TypeScript currently reads Markdown prompt files only; YAML runtime
 *     convergence is handled separately on the Rust side
 *
 * File format:
 *   ---
 *   name: "Coordinator"
 *   description: "Plans work, breaks down tasks, coordinates sub-agents"
 *   modelTier: "smart"
 *   role: "ROUTA"
 *   roleReminder: "You NEVER edit files directly..."
 *   ---
 *
 *   ## Coordinator
 *   You plan, delegate, and verify...
 */

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import { AgentRole, ModelTier } from "../models/agent";
import type { SpecialistConfig } from "../orchestration/specialist-prompts";

export interface SpecialistFileMeta {
  name: string;
  description: string;
  modelTier?: string;
  model?: string;
  role?: string;
  roleReminder?: string;
  defaultProvider?: string;
  defaultAdapter?: string;
  execution?: {
    role?: string;
    provider?: string;
    adapter?: string;
    modelTier?: string;
    model?: string;
  };
}

export interface ParsedSpecialist {
  id: string;
  filePath: string;
  frontmatter: SpecialistFileMeta;
  behaviorPrompt: string;
  rawContent: string;
  source: "user" | "bundled" | "hardcoded";
  locale?: string;
}

const VALID_MODEL_TIERS = ["fast", "balanced", "smart"];
const SPECIALIST_ROOT_DIRNAME = "specialists";
const SPECIALIST_LOCALES_DIRNAME = "locales";
const DEFAULT_LOCALE = "en";

function isLocaleDirectoryName(name: string): boolean {
  return name === SPECIALIST_LOCALES_DIRNAME || /^[a-z]{2}(?:-[A-Z]{2})?$/.test(name);
}

function collectMarkdownFiles(dirPath: string, includeLocaleDirectories: boolean): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!includeLocaleDirectories && isLocaleDirectoryName(entry.name)) {
        continue;
      }
      files.push(...collectMarkdownFiles(entryPath, includeLocaleDirectories));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function uniqueExistingDirs(dirPaths: string[]): string[] {
  return Array.from(new Set(dirPaths)).filter((dirPath) => fs.existsSync(dirPath));
}

export function getBundledSpecialistsRootDir(): string {
  return path.join(process.cwd(), "resources", SPECIALIST_ROOT_DIRNAME);
}

export function getUserSpecialistsRootDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
  return path.join(home, ".routa", SPECIALIST_ROOT_DIRNAME);
}

export function getLocaleOverlayDirs(rootDir: string, locale: string): string[] {
  if (!locale || locale === DEFAULT_LOCALE) {
    return [];
  }

  return uniqueExistingDirs([
    path.join(rootDir, SPECIALIST_LOCALES_DIRNAME, locale),
    path.join(rootDir, locale),
  ]);
}

/**
 * Map a modelTier string to a ModelTier enum value.
 */
function resolveModelTier(tier?: string): ModelTier {
  switch (tier?.toLowerCase()) {
    case "fast":
      return ModelTier.FAST;
    case "balanced":
      return ModelTier.BALANCED;
    case "smart":
      return ModelTier.SMART;
    default:
      return ModelTier.SMART;
  }
}

/**
 * Map a role string to an AgentRole enum value.
 */
function resolveRole(role?: string): AgentRole | undefined {
  if (!role) return undefined;
  const upper = role.toUpperCase();
  if (Object.values(AgentRole).includes(upper as AgentRole)) {
    return upper as AgentRole;
  }
  return undefined;
}

/**
 * Derive a specialist ID from its filename.
 * e.g., "spec-writer.md" → "spec-writer", "routa.md" → "routa"
 */
export function filenameToSpecialistId(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

/**
 * Parse a single specialist Markdown file.
 */
export function parseSpecialistFile(
  filePath: string,
  source: "user" | "bundled",
  locale?: string,
): ParsedSpecialist | null {
  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(rawContent);

    const frontmatter = data as SpecialistFileMeta;
    if (!frontmatter.name) {
      console.warn(
        `[SpecialistLoader] Skipping ${filePath}: missing 'name' in frontmatter`
      );
      return null;
    }

    if (
      frontmatter.modelTier &&
      !VALID_MODEL_TIERS.includes(frontmatter.modelTier.toLowerCase())
    ) {
      console.warn(
        `[SpecialistLoader] Invalid modelTier "${frontmatter.modelTier}" in ${filePath}, defaulting to "smart"`
      );
      frontmatter.modelTier = "smart";
    }

    const id = filenameToSpecialistId(filePath);
    const behaviorPrompt = content.trim();

    return {
      id,
      filePath,
      frontmatter,
      behaviorPrompt,
      rawContent,
      source,
      locale,
    };
  } catch (err) {
    console.error(`[SpecialistLoader] Failed to parse ${filePath}:`, err);
    return null;
  }
}

/**
 * Load all specialist files from a directory.
 */
export function loadSpecialistsFromDirectory(
  dirPath: string,
  source: "user" | "bundled",
  locale?: string,
): ParsedSpecialist[] {
  const specialists: ParsedSpecialist[] = [];
  const files = collectMarkdownFiles(dirPath, locale !== undefined);

  for (const file of files) {
    const parsed = parseSpecialistFile(file, source, locale);
    if (parsed) {
      specialists.push(parsed);
    }
  }

  return specialists;
}

/**
 * Get the path to bundled specialists directory.
 * Resolves relative to the project root.
 */
export function getBundledSpecialistsDir(locale?: string): string {
  const rootDir = getBundledSpecialistsRootDir();
  return locale && locale !== DEFAULT_LOCALE
    ? path.join(rootDir, SPECIALIST_LOCALES_DIRNAME, locale)
    : rootDir;
}

/**
 * Get the path to user-defined specialists directory.
 */
export function getUserSpecialistsDir(locale?: string): string {
  const rootDir = getUserSpecialistsRootDir();
  return locale && locale !== DEFAULT_LOCALE
    ? path.join(rootDir, SPECIALIST_LOCALES_DIRNAME, locale)
    : rootDir;
}

/**
 * Load bundled specialists from resources/specialists/.
 */
export function loadBundledSpecialists(locale?: string): ParsedSpecialist[] {
  if (locale && locale !== DEFAULT_LOCALE) {
    return getLocaleOverlayDirs(getBundledSpecialistsRootDir(), locale).flatMap((dirPath) =>
      loadSpecialistsFromDirectory(dirPath, "bundled", locale)
    );
  }
  return loadSpecialistsFromDirectory(getBundledSpecialistsRootDir(), "bundled");
}

/**
 * Load user-defined specialists from ~/.routa/specialists/.
 */
export function loadUserSpecialists(locale?: string): ParsedSpecialist[] {
  if (locale && locale !== DEFAULT_LOCALE) {
    return getLocaleOverlayDirs(getUserSpecialistsRootDir(), locale).flatMap((dirPath) =>
      loadSpecialistsFromDirectory(dirPath, "user", locale)
    );
  }
  return loadSpecialistsFromDirectory(getUserSpecialistsRootDir(), "user");
}

/**
 * Convert a ParsedSpecialist to a SpecialistConfig.
 * The behaviorPrompt becomes the systemPrompt.
 */
export function toSpecialistConfig(parsed: ParsedSpecialist): SpecialistConfig {
  const execution = parsed.frontmatter.execution;
  const role = resolveRole(execution?.role ?? parsed.frontmatter.role);
  const resolvedModelTier = resolveModelTier(execution?.modelTier ?? parsed.frontmatter.modelTier);

  // Map specialist ID to a default role if not specified in frontmatter
  const idToRoleMap: Record<string, AgentRole> = {
    routa: AgentRole.ROUTA,
    "spec-writer": AgentRole.ROUTA,
    coordinator: AgentRole.ROUTA,
    crafter: AgentRole.CRAFTER,
    implementor: AgentRole.CRAFTER,
    gate: AgentRole.GATE,
    verifier: AgentRole.GATE,
    developer: AgentRole.DEVELOPER,
  };

  const resolvedRole = role ?? idToRoleMap[parsed.id.toLowerCase()] ?? AgentRole.CRAFTER;

  return {
    id: parsed.id,
    name: parsed.frontmatter.name,
    description: parsed.frontmatter.description ?? "",
    role: resolvedRole,
    defaultModelTier: resolvedModelTier,
    systemPrompt: parsed.behaviorPrompt,
    roleReminder: parsed.frontmatter.roleReminder ?? "",
    source: parsed.source,
    locale: parsed.locale,
    defaultProvider: execution?.provider ?? parsed.frontmatter.defaultProvider,
    defaultAdapter: execution?.adapter ?? parsed.frontmatter.defaultAdapter,
    model: execution?.model ?? parsed.frontmatter.model,
  };
}

/**
 * Load all specialists with proper priority merging.
 * User specialists override bundled ones with the same ID.
 * Returns a merged array of SpecialistConfig.
 */
export function loadAllSpecialists(locale?: string): SpecialistConfig[] {
  const bundled = loadBundledSpecialists();
  const localizedBundled = locale && locale !== "en" ? loadBundledSpecialists(locale) : [];
  const user = loadUserSpecialists();
  const localizedUser = locale && locale !== "en" ? loadUserSpecialists(locale) : [];

  // Start with bundled, then overlay user specialists by ID
  const configMap = new Map<string, SpecialistConfig>();

  for (const spec of bundled) {
    const config = toSpecialistConfig(spec);
    configMap.set(config.id, config);
  }

  for (const spec of localizedBundled) {
    const config = toSpecialistConfig(spec);
    configMap.set(config.id, config);
  }

  for (const spec of user) {
    const config = toSpecialistConfig(spec);
    configMap.set(config.id, config);
  }

  for (const spec of localizedUser) {
    const config = toSpecialistConfig(spec);
    configMap.set(config.id, config);
  }

  return Array.from(configMap.values());
}
