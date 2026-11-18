// Manifest validation for the Netizen registry (spec §3.4). Pure — safe on both
// server and client. Returns a normalized manifest or throws MiniAppError
// (`invalid_params`). The API submit route and the AI-builder publish route both
// call `validateManifest` before persisting.
import type {
  CredentialRequest,
  MiniAppAudience,
  MiniAppCategory,
  MiniAppIdentityRequest,
  MiniAppManifest,
  MiniAppPermission,
} from "@netizen-labs/miniapp-sdk";
import { parseCredentialRef } from "@netizen-labs/miniapp-sdk/host";
import { validateContracts } from "./contracts";
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

/** Supported manifest versions. "1" = today's behaviour; "2" adds the `identity` section. */
export const MANIFEST_VERSIONS = ["1", "2"] as const;
export type ManifestVersion = (typeof MANIFEST_VERSIONS)[number];

const MAX_IDENTITY_CREDENTIALS = 12;
const MAX_REASON_LENGTH = 120;
const IDENTITY_KEYS = ["profile", "address", "credentials"];
const CREDENTIAL_KEYS = ["type", "reason"];

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function validateIdentity(input: unknown): MiniAppIdentityRequest {
  if (!isPlainObject(input)) fail("identity muss ein Objekt sein.");
  for (const key of Object.keys(input)) {
    if (!IDENTITY_KEYS.includes(key)) {
      fail(`identity.${key} ist unbekannt (erlaubt: ${IDENTITY_KEYS.join(", ")}).`);
    }
  }
  const flag = (key: "profile" | "address"): boolean => {
    const v = input[key];
    if (v === undefined) return false;
    if (typeof v !== "boolean") fail(`identity.${key} muss true oder false sein.`);
    return v;
  };
  const profile = flag("profile");
  const address = flag("address");

  const raw = input.credentials ?? [];
  if (!Array.isArray(raw)) fail("identity.credentials muss eine Liste sein.");
  if (raw.length > MAX_IDENTITY_CREDENTIALS) {
    fail(`identity.credentials: höchstens ${MAX_IDENTITY_CREDENTIALS} Nachweise erlaubt.`);
  }
  const seen = new Set<string>();
  const credentials: CredentialRequest[] = raw.map((entry, i) => {
    if (!isPlainObject(entry)) fail(`identity.credentials[${i}] muss ein Objekt mit type und reason sein.`);
    for (const key of Object.keys(entry)) {
      if (!CREDENTIAL_KEYS.includes(key)) {
        fail(`identity.credentials[${i}].${key} ist unbekannt (erlaubt: ${CREDENTIAL_KEYS.join(", ")}).`);
      }
    }
    const parsed = typeof entry.type === "string" ? parseCredentialRef(entry.type) : null;
    if (!parsed) {
      fail(
        `identity.credentials[${i}].type "${String(entry.type ?? "")}" ist unbekannt ` +
          '(erlaubt: citizen, attester, guest, "type:0x…" oder "org:<id>").',
      );
    }
    const type =
      parsed.kind === "builtin" ? parsed.name : parsed.kind === "type" ? `type:${parsed.typeId}` : `org:${parsed.org}`;
    if (seen.has(type)) fail(`identity.credentials: "${type}" ist doppelt.`);
    seen.add(type);
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    if (!reason || reason.length > MAX_REASON_LENGTH) {
      fail(`identity.credentials[${i}].reason muss 1–${MAX_REASON_LENGTH} Zeichen lang sein.`);
    }
    return { type, reason };
  });

  return { profile, address, credentials };
}

const AUDIENCE_KEYS = ["mode", "anyOf"] as const;
const AUDIENCE_MODES = ["required", "recommended"] as const;
const MAX_AUDIENCE_REFS = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A parsed credential reference back in its canonical (lowercased) string form. */
function canonicalRef(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const p = parseCredentialRef(s);
  if (!p) return null;
  if (p.kind === "builtin") return p.name;
  if (p.kind === "type") return `type:${p.typeId}`;
  return `org:${p.org}`;
}

function validateAudience(input: unknown): MiniAppAudience {
  if (!isPlainObject(input)) fail("audience muss ein Objekt mit mode und anyOf sein.");
  for (const key of Object.keys(input)) {
    if (!(AUDIENCE_KEYS as readonly string[]).includes(key)) {
      fail(`audience.${key} ist unbekannt (erlaubt: ${AUDIENCE_KEYS.join(", ")}).`);
    }
  }
  const mode = input.mode;
  if (typeof mode !== "string" || !(AUDIENCE_MODES as readonly string[]).includes(mode)) {
    fail(`audience.mode muss einer von: ${AUDIENCE_MODES.join(", ")} sein.`);
  }
  const raw = input.anyOf;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_AUDIENCE_REFS) {
    fail(`audience.anyOf muss eine Liste mit 1–${MAX_AUDIENCE_REFS} Nachweisen sein.`);
  }
  const anyOf: string[] = [];
  raw.forEach((entry, i) => {
    const ref = canonicalRef(entry);
    if (!ref) {
      fail(
        `audience.anyOf[${i}] "${String(entry)}" ist unbekannt ` +
          "(erlaubt: citizen, attester, guest, type:0x…, org:<Konto-ID>).",
      );
    }
    if (anyOf.includes(ref)) fail(`audience.anyOf: "${ref}" ist doppelt.`);
    anyOf.push(ref);
  });
  return { mode: mode as MiniAppAudience["mode"], anyOf };
}

function validateOrg(input: unknown): string {
  if (typeof input !== "string" || !UUID_RE.test(input.trim())) {
    fail("org muss die Konto-ID des Vereins sein (eine UUID, wie in /account/<id>).");
  }
  return input.trim().toLowerCase();
}

/**
 * Validate + normalize a manifest. Throws MiniAppError('invalid_params') with a
 * German-friendly message on the first problem found.
 */
export function validateManifest(input: unknown): MiniAppManifest {
  if (!input || typeof input !== "object") fail("Manifest fehlt oder ist ungültig.");
  const m = input as Record<string, unknown>;

  const version = String(m.version ?? "1");
  if (!(MANIFEST_VERSIONS as readonly string[]).includes(version)) {
    fail(`miniapp.version "${version}" wird nicht unterstützt (erlaubt: ${MANIFEST_VERSIONS.join(", ")}).`);
  }
  const hasIdentity = m.identity !== undefined && m.identity !== null;
  if (version === "1" && hasIdentity) fail('identity braucht miniapp.version "2".');
  const identity = version === "2" && hasIdentity ? validateIdentity(m.identity) : undefined;
  const hasContracts = m.contracts !== undefined && m.contracts !== null;
  if (version === "1" && hasContracts) fail('contracts braucht miniapp.version "2".');
  const contracts = version === "2" && hasContracts ? validateContracts(m.contracts) : undefined;
  const hasAudience = m.audience !== undefined && m.audience !== null;
  if (version === "1" && hasAudience) fail('audience braucht miniapp.version "2".');
  const audience = version === "2" && hasAudience ? validateAudience(m.audience) : undefined;
  const hasOrg = m.org !== undefined && m.org !== null;
  if (version === "1" && hasOrg) fail('org braucht miniapp.version "2".');
  const org = version === "2" && hasOrg ? validateOrg(m.org) : undefined;

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
    // Version 1 output stays byte-identical to before (no version/identity keys): the
    // indexer hashes it, and a new key would flag every live app for re-review.
    ...(version === "2"
      ? {
          version: "2" as const,
          ...(identity ? { identity } : {}),
          ...(contracts ? { contracts } : {}),
          ...(audience ? { audience } : {}),
          ...(org ? { org } : {}),
        }
      : {}),
  };
}

/**
 * The `mini_apps` column patch for a validated manifest — used by every write path.
 * `manifest_version` and `identity` are the version-2 columns (identity null for version 1);
 * `contracts` is always a list (empty for version 1 or no declaration); `audience` and
 * `org_account_id` are null unless a version-2 manifest declares them. The org binding
 * status is not part of this patch (see orgBinding.ts).
 */
export function manifestStoreFields(m: MiniAppManifest): Record<string, unknown> {
  const version: ManifestVersion = m.version === "2" ? "2" : "1";
  return {
    name: m.name,
    icon_url: m.iconUrl || null,
    home_url: m.homeUrl,
    description: m.description || null,
    category: m.category,
    tags: m.tags,
    screenshots: m.screenshots ?? [],
    permissions: m.permissions,
    primary_color: m.primaryColor ?? DEFAULT_PRIMARY_COLOR,
    manifest_version: version,
    identity: version === "2" ? (m.identity ?? null) : null,
    contracts: version === "2" ? (m.contracts ?? []) : [],
    audience: version === "2" ? (m.audience ?? null) : null,
    org_account_id: version === "2" ? (m.org ?? null) : null,
  };
}

const IDENTITY_COLUMNS = ["manifest_version", "identity"] as const;
/** Added by 20261117mb_mini_app_contracts_gas.sql (after the identity migration). */
const CONTRACTS_COLUMNS = ["contracts"] as const;
/** Added by 20261117mc_mini_app_audience_org.sql (after the contracts migration). */
const AUDIENCE_COLUMNS = ["audience", "org_account_id"] as const;
const NEW_COLUMNS = [...IDENTITY_COLUMNS, ...CONTRACTS_COLUMNS, ...AUDIENCE_COLUMNS] as const;

/**
 * True when a mini_apps write failed only because the identity migration
 * (20261117ma_mini_app_identity.sql) is not applied yet: PostgREST reports an unknown
 * column as PGRST204 (schema cache) or Postgres 42703.
 */
export function isMissingIdentityColumnError(
  err: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!err || (err.code !== "PGRST204" && err.code !== "42703")) return false;
  const msg = err.message ?? "";
  return IDENTITY_COLUMNS.some((c) => msg.includes(c));
}

/**
 * Which new columns to drop after a failed write: none unless the error is an unknown
 * column (PGRST204 / 42703) naming one of them. The migrations apply in order (identity →
 * contracts → audience/org), so a missing identity column means none is applied (drop all);
 * a missing `contracts` column drops just that one (a following retry finds the audience
 * columns if they are missing too); a missing `audience` / `org_account_id` column only those.
 */
export function missingNewColumns(
  err: { code?: string | null; message?: string | null } | null | undefined,
): string[] {
  if (!err || (err.code !== "PGRST204" && err.code !== "42703")) return [];
  const msg = err.message ?? "";
  if (IDENTITY_COLUMNS.some((c) => msg.includes(c))) return [...NEW_COLUMNS];
  if (CONTRACTS_COLUMNS.some((c) => msg.includes(c))) return [...CONTRACTS_COLUMNS];
  if (AUDIENCE_COLUMNS.some((c) => msg.includes(c))) return [...AUDIENCE_COLUMNS];
  return [];
}

/** The same patch without the given columns. */
export function withoutColumns<T extends Record<string, unknown>>(patch: T, columns: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch };
  for (const c of columns) delete out[c];
  return out;
}

/** The same patch without the new columns (identity + contracts + audience/org), for the pre-migration retry. */
export function withoutIdentityColumns<T extends Record<string, unknown>>(patch: T): Record<string, unknown> {
  return withoutColumns(patch, NEW_COLUMNS);
}
