/**
 * The strict file-plan contract the AI builder's codegen model must emit.
 *
 * A generated mini app is described entirely by a `MiniAppFilePlan`: a set of
 * files (relative paths + contents) plus a validated `MiniAppManifest` and free
 * text `notes`. The publish route writes these files verbatim into
 * `apps/mini-apps/<slug>/`, so the schema is the single point where we validate
 * the model's output before it touches the filesystem.
 *
 * Kept dependency-free of the SDK package: agent A owns `@netizen-labs/miniapp-sdk`
 * and it may not be resolvable in this app's build yet, so we mirror the frozen
 * `MiniAppManifest` shape from the spec (§3.4) locally as a zod schema.
 */
import { z } from "zod";

// --- Manifest (mirrors @netizen-labs/miniapp-sdk MiniAppManifest, spec §3.4) --------

export const MINI_APP_CATEGORIES = [
  "community",
  "governance",
  "finance",
  "utility",
  "games",
  "education",
  "news",
  "culture",
  "environment",
] as const;

export const MINI_APP_PERMISSIONS = [
  "wallet",
  "rewards",
  "notifications",
  "circles",
  "share",
] as const;

export const manifestSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(48)
    // url-safe, lowercase, no path separators — enforced hard (also a path-traversal guard)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
      message: "slug must be lowercase, url-safe (a-z, 0-9, hyphen), no leading/trailing hyphen",
    }),
  name: z.string().min(1).max(32),
  iconUrl: z.string().min(1),
  homeUrl: z.string().min(1),
  description: z.string().min(1).max(200),
  category: z.enum(MINI_APP_CATEGORIES),
  tags: z.array(z.string().max(20)).max(5).default([]),
  screenshots: z.array(z.string()).max(3).optional(),
  permissions: z.array(z.enum(MINI_APP_PERMISSIONS)).default([]),
  primaryColor: z.string().optional(),
});

export type MiniAppManifest = z.infer<typeof manifestSchema>;

// --- File plan ----------------------------------------------------------------

/** One generated file. `path` is repo-relative to the app root (apps/mini-apps/<slug>/). */
export const generatedFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(200)
    // reject absolute paths and traversal; forward-slashes only
    .refine((p) => !p.startsWith("/") && !p.includes("..") && !p.includes("\\") && !p.includes("\0"), {
      message: "path must be a relative POSIX path with no '..' segments",
    }),
  content: z.string(),
});

export type GeneratedFile = z.infer<typeof generatedFileSchema>;

export const filePlanSchema = z.object({
  files: z.array(generatedFileSchema).min(1).max(40),
  manifest: manifestSchema,
  notes: z.string().default(""),
});

export type MiniAppFilePlan = z.infer<typeof filePlanSchema>;

/**
 * Loose schema used while STREAMING — every field optional so partial JSON
 * (as the model is mid-emit) still parses for live preview. Never persisted.
 */
export const partialFilePlanSchema = z
  .object({
    files: z
      .array(z.object({ path: z.string().optional(), content: z.string().optional() }))
      .optional(),
    manifest: manifestSchema.partial().optional(),
    notes: z.string().optional(),
  })
  .partial();

export type PartialMiniAppFilePlan = z.infer<typeof partialFilePlanSchema>;
