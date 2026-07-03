/**
 * Loads the canonical mini-app template + design system from the monorepo at
 * request time, so the codegen prompt and the publish scaffold always reflect
 * the real files on disk (agent A owns and evolves them).
 *
 * Server-only (uses node:fs). Never import from a client component.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

/** Walk up from cwd to the monorepo root (the dir that contains `apps/`). */
async function findRepoRoot(): Promise<string> {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    try {
      const apps = await fs.stat(path.join(dir, "apps"));
      const pkgs = await fs.stat(path.join(dir, "packages"));
      if (apps.isDirectory() && pkgs.isDirectory()) return dir;
    } catch {
      /* keep walking up */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: cwd is usually apps/web when Next runs; go up two.
  return path.resolve(process.cwd(), "..", "..");
}

export interface TemplateContext {
  /** Verbatim contents of packages/miniapp-sdk/DESIGN.md (embedded in the prompt). */
  designMd: string;
  /** Verbatim contents of the SDK's frozen types.ts (the surface generated apps target). */
  sdkTypes: string;
  /** Key template files the model should mirror (config, layout, styling, fonts). */
  templateFiles: Record<string, string>;
  repoRoot: string;
}

let cached: TemplateContext | null = null;

const TEMPLATE_FILES_TO_LOAD = [
  "package.json",
  "next.config.ts",
  "tsconfig.json",
  "netizen.manifest.ts",
  "app/layout.tsx",
  "app/globals.css",
  "app/fonts.ts",
  "postcss.config.mjs",
];

async function readOrEmpty(p: string): Promise<string> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

/**
 * Load (and cache) the design system + SDK surface + template files.
 * Cached in-process; the underlying files are effectively frozen during a deploy.
 */
export async function loadTemplateContext(): Promise<TemplateContext> {
  if (cached) return cached;

  const repoRoot = await findRepoRoot();
  const sdkDir = path.join(repoRoot, "packages", "miniapp-sdk");
  const templateDir = path.join(repoRoot, "apps", "mini-apps", "_template");

  const [designMd, sdkTypes] = await Promise.all([
    readOrEmpty(path.join(sdkDir, "DESIGN.md")),
    readOrEmpty(path.join(sdkDir, "src", "types.ts")),
  ]);

  const templateFiles: Record<string, string> = {};
  await Promise.all(
    TEMPLATE_FILES_TO_LOAD.map(async (rel) => {
      const content = await readOrEmpty(path.join(templateDir, rel));
      if (content) templateFiles[rel] = content;
    }),
  );

  cached = { designMd, sdkTypes, templateFiles, repoRoot };
  return cached;
}

/** Absolute path to the mini-apps directory (where generated apps are written). */
export async function miniAppsDir(): Promise<string> {
  const repoRoot = await findRepoRoot();
  return path.join(repoRoot, "apps", "mini-apps");
}
