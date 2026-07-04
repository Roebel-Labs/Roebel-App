/**
 * Manifest schemas for the AI Mini App Builder.
 *
 * `manifestDraftSchema` is what the manifest-drafting model emits and what the
 * builder UI lets the developer edit before publishing. It mirrors the frozen
 * `MiniAppManifest` (spec §3.4) minus the server-owned fields (homeUrl is
 * derived from the slug; the icon arrives as inline SVG and is stored as a
 * data URI). Kept dependency-free of the SDK package, like the old filePlan.
 */
import { z } from "zod";

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

export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  // url-safe, lowercase, no path separators — also guards the /mini/[slug] route
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: "slug must be lowercase, url-safe (a-z, 0-9, hyphen), no leading/trailing hyphen",
  });

export const manifestDraftSchema = z.object({
  name: z.string().min(1).max(32),
  slug: slugSchema,
  description: z.string().min(1).max(200),
  category: z.enum(MINI_APP_CATEGORIES),
  tags: z.array(z.string().max(20)).max(5).default([]),
  permissions: z.array(z.enum(MINI_APP_PERMISSIONS)).default([]),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#00498B"),
  /**
   * Simple square icon as inline SVG markup (viewBox 0 0 64 64). Converted to a
   * data URI at publish time. Optional — the store falls back to a letter tile.
   */
  iconSvg: z.string().max(4000).optional(),
});

export type ManifestDraft = z.infer<typeof manifestDraftSchema>;

/** Reject SVG icons that could smuggle script into the store UI. */
export function safeIconDataUri(iconSvg: string | undefined | null): string | null {
  if (!iconSvg) return null;
  const svg = iconSvg.trim();
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) return null;
  const lower = svg.toLowerCase();
  if (
    lower.includes("<script") ||
    lower.includes("javascript:") ||
    lower.includes("<foreignobject") ||
    /\son\w+\s*=/.test(lower) ||
    lower.includes("href")
  ) {
    return null;
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
