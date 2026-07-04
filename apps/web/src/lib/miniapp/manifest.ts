// Manifest validation for the Netizen registry (spec §3.4). Pure — safe on both
// server and client. Returns a normalized manifest or throws MiniAppError
// (`invalid_params`). The API submit route and the AI-builder publish route both
// call `validateManifest` before persisting.
import type {
  MiniAppCategory,
  MiniAppManifest,
  MiniAppPermission,
} from "@netizen-labs/miniapp-sdk";
import { MiniAppError } from "./types";

export const CATEGORIES: MiniAppCategory[] = [
  "community",
  "governance",
  "finance",
  "utility",
  "games",
  "education",
  "news",
  "culture",
  "environment",
];

export const PERMISSIONS: MiniAppPermission[] = [
  "wallet",
  "rewards",
  "notifications",
  "circles",
  "share",
];

export const DEFAULT_PRIMARY_COLOR = "#00498B";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function fail(message: string): never {
  throw new MiniAppError("invalid_params", message);
}

function isHttpsUrl(v: unknown): v is string {
  if (typeof v !== "string" || !v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Validate + normalize a manifest. Throws MiniAppError('invalid_params') with a
 * German-friendly message on the first problem found.
 */
export function validateManifest(input: unknown): MiniAppManifest {
  if (!input || typeof input !== "object") fail("Manifest fehlt oder ist ungültig.");
  const m = input as Record<string, unknown>;

  const slug = String(m.slug ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    fail("slug muss URL-tauglich sein (2–60 Zeichen, klein, a–z 0–9 und '-').");
  }

  const name = String(m.name ?? "").trim();
  if (!name) fail("name ist erforderlich.");
  if (name.length > 32) fail("name darf höchstens 32 Zeichen haben.");

  if (!isHttpsUrl(m.homeUrl)) fail("homeUrl muss eine gültige http(s)-URL sein.");
  const homeUrl = String(m.homeUrl);

  const description = String(m.description ?? "").trim();
  if (description.length > 200) fail("description darf höchstens 200 Zeichen haben.");

  const category = String(m.category ?? "utility") as MiniAppCategory;
  if (!CATEGORIES.includes(category)) {
    fail(`category muss einer von: ${CATEGORIES.join(", ")} sein.`);
  }

  const rawTags = Array.isArray(m.tags) ? m.tags : [];
  if (rawTags.length > 5) fail("höchstens 5 tags erlaubt.");
  const tags = rawTags.map((t) => {
    const s = String(t).trim().toLowerCase();
    if (!s || s.length > 20) fail("tags müssen 1–20 Zeichen lang sein.");
    return s;
  });

  const rawShots = Array.isArray(m.screenshots) ? m.screenshots : [];
  if (rawShots.length > 6) fail("höchstens 6 Vorschaubilder erlaubt.");
  const screenshots = rawShots.map((s) => {
    if (!isHttpsUrl(s)) fail("screenshots müssen gültige URLs sein.");
    return String(s);
  });

  const rawPerms = Array.isArray(m.permissions) ? m.permissions : [];
  const permissions = rawPerms.map((p) => {
    const s = String(p) as MiniAppPermission;
    if (!PERMISSIONS.includes(s)) {
      fail(`Unbekannte Berechtigung "${s}". Erlaubt: ${PERMISSIONS.join(", ")}.`);
    }
    return s;
  });

  let primaryColor = DEFAULT_PRIMARY_COLOR;
  if (m.primaryColor != null && m.primaryColor !== "") {
    const c = String(m.primaryColor);
    if (!HEX_RE.test(c)) fail("primaryColor muss ein Hex-Wert wie #00498B sein.");
    primaryColor = c;
  }

  const iconUrl = m.iconUrl != null && m.iconUrl !== "" ? String(m.iconUrl) : "";
  if (iconUrl && !isHttpsUrl(iconUrl)) fail("iconUrl muss eine gültige URL sein.");

  return {
    slug,
    name,
    iconUrl,
    homeUrl,
    description,
    category,
    tags,
    screenshots,
    permissions,
    primaryColor,
  };
}
