// apps/web/src/lib/miniapp/manifestFile.ts
// Pure parser for the self-hosted manifest at /.well-known/roebel-miniapp.json
// (spec 2026-10-10 §3). Field names inside `miniapp` mirror Farcaster's
// farcaster.json so one data source can feed both files. No server-only deps:
// unit-tested with tsx.
import { createHash } from "node:crypto";
import { validateManifest } from "./manifest";
import { MiniAppError, type MiniAppManifest } from "./types";

export const WELL_KNOWN_PATH = "/.well-known/roebel-miniapp.json";
const SUPPORTED_VERSIONS = new Set(["1"]);
const OWNER_RE = /^0x[0-9a-fA-F]{40}$/;

export interface ParsedManifestFile {
  /** Lowercased EVM address of the owning builder. */
  owner: string;
  /** Validated manifest; `slug` is "" when the file did not set one. */
  manifest: MiniAppManifest;
  slugExplicit: boolean;
}

function fail(message: string): never {
  throw new MiniAppError("invalid_params", message);
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "app";
}

export function parseManifestFile(raw: unknown, origin: string): ParsedManifestFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("Manifest ist kein JSON-Objekt.");
  }
  const file = raw as Record<string, unknown>;

  const owner = String(file.owner ?? "").trim();
  if (!OWNER_RE.test(owner)) {
    fail('owner fehlt oder ist keine Wallet-Adresse (0x… mit 40 Hex-Zeichen).');
  }

  const app = file.miniapp;
  if (!app || typeof app !== "object" || Array.isArray(app)) {
    fail('Objekt "miniapp" fehlt.');
  }
  const m = app as Record<string, unknown>;

  const version = String(m.version ?? "1");
  if (!SUPPORTED_VERSIONS.has(version)) {
    fail(`miniapp.version "${version}" wird nicht unterstützt (erlaubt: 1).`);
  }

  let homeOrigin = "";
  try {
    homeOrigin = new URL(String(m.homeUrl ?? "")).origin;
  } catch {
    fail("miniapp.homeUrl muss eine gültige URL sein.");
  }
  if (homeOrigin !== origin) {
    fail(`miniapp.homeUrl muss auf ${origin} liegen (gefunden: ${homeOrigin}).`);
  }

  const explicit = typeof m.slug === "string" && m.slug.trim() !== "";
  // validateManifest requires a slug; validate with a placeholder when absent.
  const manifest = validateManifest({ ...m, slug: explicit ? m.slug : "placeholder" });
  if (!explicit) manifest.slug = "";

  return { owner: owner.toLowerCase(), manifest, slugExplicit: explicit };
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortKeys(value))).digest("hex");
}
