/**
 * Managed publish for the AI Mini App Builder.
 *
 * Writes a validated file-plan into apps/mini-apps/<slug>/, registers a
 * `mini_apps` row (source='ai_builder', status='pending', reward_budget 0) via
 * the admin Supabase client so it enters the admin review queue, and returns
 * where it landed.
 *
 * Deploy: if a Vercel token is present we could deploy the written app; today no
 * token is wired, so `home_url` is set to a documented placeholder/preview URL
 * and `deploy` reports `stubbed` (see INTEGRATION NEEDS in the build report).
 *
 * Server-only. Guards slug uniqueness + path traversal.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { miniAppsDir } from "./template";
import { filePlanSchema, type MiniAppFilePlan } from "./filePlan";

export interface PublishResult {
  ok: boolean;
  slug: string;
  miniAppId?: string;
  homeUrl: string;
  writtenDir: string;
  filesWritten: number;
  deploy: "vercel" | "stubbed";
  /**
   * One-click Vercel Deploy Button URL (https://vercel.com/docs/deploy-button).
   * Clones the app's committed monorepo subdirectory so the developer can host it
   * on their own Vercel account, then register the resulting URL. See note on
   * `deployButtonUrl`.
   */
  deployButtonUrl?: string;
  status: "pending";
  error?: string;
}

/** Reserved slugs that must never be claimed by a generated app. */
const RESERVED_SLUGS = new Set(["_template", "roebel-data", "node_modules", "dist", "public"]);

/**
 * Where the app will be served once deployed. When a real deploy pipeline is
 * wired (Vercel), swap this for the deployment URL. Until then this is the
 * documented managed-hosting convention (mini.roebel.app/<slug>).
 */
export function homeUrlForSlug(slug: string): string {
  const base = process.env.MINI_APPS_BASE_URL || "https://mini.roebel.app";
  return `${base.replace(/\/$/, "")}/${slug}`;
}

/**
 * Vercel Deploy Button URL for a published app (https://vercel.com/docs/deploy-button).
 * It clones the app's subdirectory in the monorepo — so the generated app must be
 * committed to the repo first (true for the local-dev publish path; on Vercel's
 * read-only serverless FS the generated files don't persist, so the intended flow is
 * generate → commit the app under apps/mini-apps/<slug> → this button deploys it).
 * The developer deploys to their own Vercel account, then registers the live URL.
 */
export function deployButtonUrl(slug: string): string {
  const repo = process.env.MINI_APPS_REPO_URL || "https://github.com/Roebel-Labs/Roebel-App";
  const tree = `${repo.replace(/\/$/, "")}/tree/main/apps/mini-apps/${slug}`;
  const params = new URLSearchParams({
    "repository-url": tree,
    "project-name": `netizen-${slug}`,
    "repository-name": `netizen-${slug}`,
  });
  return `https://vercel.com/new/clone?${params.toString()}`;
}

/** Absolute, traversal-safe path for a generated file inside the app dir. */
function safeJoin(appDir: string, relPath: string): string | null {
  // Normalize and reject anything that escapes appDir.
  const normalized = path.normalize(relPath);
  if (
    path.isAbsolute(normalized) ||
    normalized.startsWith("..") ||
    normalized.includes("\0") ||
    normalized.split(path.sep).includes("..")
  ) {
    return null;
  }
  const abs = path.resolve(appDir, normalized);
  const appDirResolved = path.resolve(appDir);
  if (abs !== appDirResolved && !abs.startsWith(appDirResolved + path.sep)) {
    return null;
  }
  return abs;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Validate + persist a generated mini app. Idempotency: if the slug directory
 * already exists on disk OR a mini_apps row already owns the slug, the publish
 * is rejected (409-style) to protect existing apps.
 */
export async function publishMiniApp(input: {
  plan: unknown;
  /** Optional developer row id to attribute the app to. */
  developerId?: string | null;
}): Promise<PublishResult> {
  // 1. Validate the plan strictly (defense in depth — the model output is untrusted).
  const parsed = filePlanSchema.safeParse(input.plan);
  if (!parsed.success) {
    return {
      ok: false,
      slug: "",
      homeUrl: "",
      writtenDir: "",
      filesWritten: 0,
      deploy: "stubbed",
      status: "pending",
      error: "invalid_plan: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  const plan: MiniAppFilePlan = parsed.data;
  const slug = plan.manifest.slug;

  if (RESERVED_SLUGS.has(slug)) {
    return failure(slug, "slug_reserved");
  }

  const baseDir = await miniAppsDir();
  const appDir = path.join(baseDir, slug);

  // 2. Guard: slug directory must not already exist (protects other apps / re-publish).
  if (await dirExists(appDir)) {
    return failure(slug, "slug_directory_exists");
  }

  // 3. Guard: slug must be free in the registry.
  const supabase = createAdminClient();
  const { data: existing, error: lookupErr } = await supabase
    .from("mini_apps")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupErr) {
    return failure(slug, "registry_lookup_failed: " + lookupErr.message);
  }
  if (existing) {
    return failure(slug, "slug_taken");
  }

  // 4. Pre-flight: verify every file path is traversal-safe BEFORE writing anything.
  const resolvedFiles: { abs: string; content: string }[] = [];
  for (const f of plan.files) {
    const abs = safeJoin(appDir, f.path);
    if (!abs) {
      return failure(slug, `unsafe_path: ${f.path}`);
    }
    resolvedFiles.push({ abs, content: f.content });
  }

  // 5. Write files (mkdir -p per file's dir).
  let filesWritten = 0;
  try {
    await fs.mkdir(appDir, { recursive: true });
    for (const { abs, content } of resolvedFiles) {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf8");
      filesWritten++;
    }
    // Persist the raw manifest alongside for the reviewer/registry (source of truth).
    await fs.writeFile(
      path.join(appDir, "netizen.manifest.generated.json"),
      JSON.stringify(plan.manifest, null, 2),
      "utf8",
    );
  } catch (e) {
    // Best-effort cleanup so a half-written dir doesn't block a retry.
    await fs.rm(appDir, { recursive: true, force: true }).catch(() => {});
    return failure(slug, "write_failed: " + (e instanceof Error ? e.message : String(e)));
  }

  // 6. Deploy (stubbed — no Vercel token wired). Set home_url to the managed URL.
  const homeUrl = homeUrlForSlug(slug);
  const deploy: "vercel" | "stubbed" = "stubbed";

  // 7. Register the app in review as source='ai_builder', status='pending', budget 0.
  const { data: row, error: insertErr } = await supabase
    .from("mini_apps")
    .insert({
      developer_id: input.developerId ?? null,
      slug,
      name: plan.manifest.name,
      icon_url: plan.manifest.iconUrl,
      home_url: homeUrl,
      description: plan.manifest.description,
      category: plan.manifest.category,
      tags: plan.manifest.tags ?? [],
      screenshots: plan.manifest.screenshots ?? [],
      permissions: plan.manifest.permissions ?? [],
      primary_color: plan.manifest.primaryColor ?? "#00498B",
      status: "pending",
      source: "ai_builder",
      reward_budget: 0,
    })
    .select("id")
    .single();

  if (insertErr) {
    // The files are written but the row failed — surface the error; do NOT delete
    // the files (a reviewer/coordinator can re-register), but report clearly.
    return {
      ok: false,
      slug,
      homeUrl,
      writtenDir: appDir,
      filesWritten,
      deploy,
      status: "pending",
      error: "registry_insert_failed: " + insertErr.message,
    };
  }

  return {
    ok: true,
    slug,
    miniAppId: row?.id,
    homeUrl,
    writtenDir: appDir,
    filesWritten,
    deploy,
    deployButtonUrl: deployButtonUrl(slug),
    status: "pending",
  };
}

function failure(slug: string, error: string): PublishResult {
  return {
    ok: false,
    slug,
    homeUrl: "",
    writtenDir: "",
    filesWritten: 0,
    deploy: "stubbed",
    status: "pending",
    error,
  };
}
