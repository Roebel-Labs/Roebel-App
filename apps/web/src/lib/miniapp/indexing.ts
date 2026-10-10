// apps/web/src/lib/miniapp/indexing.ts
// Server-only executor for self-hosted manifest indexing (spec 2026-10-10 §5).
// All branching lives in indexPlan.ts; this file only does IO.
import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalHash, parseManifestFile, slugify, type ParsedManifestFile } from "./manifestFile";
import { fetchManifestJson, isBlockedIp, wellKnownUrlFor } from "./safeFetch";
import { pickSlug, planIndex, type IndexPlan } from "./indexPlan";
import { createVersion, getOrCreateDeveloper } from "./data";
import { MiniAppError, type MiniAppRow } from "./types";

function db() {
  return createAdminClient();
}

function storeFields(p: ParsedManifestFile) {
  const m = p.manifest;
  return {
    name: m.name,
    icon_url: m.iconUrl || null,
    home_url: m.homeUrl,
    description: m.description || null,
    category: m.category,
    tags: m.tags,
    screenshots: m.screenshots,
    permissions: m.permissions,
    primary_color: m.primaryColor,
  };
}

async function hostIsPublic(host: string): Promise<boolean> {
  const addrs = (await dnsLookup(host, { all: true })).map((a) => a.address);
  return addrs.length > 0 && !addrs.some(isBlockedIp);
}

/** Header-only check of homeUrl; every redirect hop is re-validated (https + public IP). */
async function embedWarnings(homeUrl: string): Promise<string[]> {
  try {
    const signal = AbortSignal.timeout(5000);
    let current = new URL(homeUrl);
    let res: Response | null = null;
    for (let hop = 0; hop <= 3; hop++) {
      if (current.protocol !== "https:" || !(await hostIsPublic(current.hostname))) {
        return [hop === 0 ? "homeUrl ist nicht öffentlich erreichbar." : "homeUrl leitet auf eine nicht öffentliche Adresse weiter."];
      }
      res = await fetch(current, { redirect: "manual", signal });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel();
        current = new URL(loc, current);
        res = null;
        continue;
      }
      break;
    }
    if (!res) return ["homeUrl leitet zu oft weiter."];
    await res.body?.cancel();
    const out: string[] = [];
    const xfo = (res.headers.get("x-frame-options") ?? "").toLowerCase();
    if (xfo === "deny" || xfo === "sameorigin") {
      out.push(`X-Frame-Options: ${xfo.toUpperCase()} — die App kann so nicht im Röbel-Host eingebettet werden. Entferne den Header oder erlaube das Einbetten (frame-ancestors *).`);
    }
    const fa = (res.headers.get("content-security-policy") ?? "").match(/frame-ancestors\s+([^;]+)/i)?.[1]?.trim();
    if (fa && fa !== "*" && !/roebel/.test(fa)) {
      out.push(`CSP frame-ancestors ist auf "${fa}" beschränkt — für den Röbel-Host muss frame-ancestors * (oder die Röbel-Domains) erlaubt sein.`);
    }
    if (!res.ok) out.push(`homeUrl antwortet mit ${res.status}.`);
    return out;
  } catch {
    return ["homeUrl war beim Prüfen nicht erreichbar."];
  }
}

export async function validateOrigin(input: string) {
  const { origin, url } = wellKnownUrlFor(input);
  const raw = await fetchManifestJson(url);
  const parsed = parseManifestFile(raw, origin);
  const warnings = await embedWarnings(parsed.manifest.homeUrl);
  return { origin, manifestUrl: url, parsed, warnings };
}

async function loadExisting(origin: string) {
  const supabase = db();
  const { data: app, error: appErr } = await supabase
    .from("mini_apps")
    .select("*, developers(wallet)")
    .eq("origin", origin)
    .maybeSingle();
  if (appErr) throw new MiniAppError("internal", appErr.message);
  if (!app) return null;
  const { data: latest, error: latestErr } = await supabase
    .from("mini_app_versions")
    .select("manifest_hash")
    .eq("mini_app_id", app.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) throw new MiniAppError("internal", latestErr.message);
  const wallet = (app.developers as { wallet: string } | null)?.wallet ?? null;
  return {
    row: app as MiniAppRow,
    existing: {
      id: app.id as string,
      slug: app.slug as string,
      status: app.status,
      ownerWallet: wallet ? wallet.toLowerCase() : null,
      latestHash: (latest?.manifest_hash as string | null) ?? null,
    },
  };
}

async function slugTaken(slug: string): Promise<boolean> {
  const { data } = await db().from("mini_apps").select("id").eq("slug", slug).maybeSingle();
  return !!data;
}

async function nextVersion(appId: string): Promise<string> {
  const { count } = await db()
    .from("mini_app_versions")
    .select("id", { count: "exact", head: true })
    .eq("mini_app_id", appId);
  return `1.0.${(count ?? 0) + 1}`;
}

async function addVersion(appId: string, parsed: ParsedManifestFile, slug: string, hash: string) {
  await createVersion(appId, {
    version: await nextVersion(appId),
    homeUrl: parsed.manifest.homeUrl,
    manifest: { ...parsed.manifest, slug },
    manifestHash: hash,
  });
}

/** Mark a known origin's last index as failed without touching anything else. */
async function recordFailure(origin: string, message: string) {
  await db()
    .from("mini_apps")
    .update({ index_error: message.slice(0, 500), last_indexed_at: new Date().toISOString() })
    .eq("origin", origin);
}

export async function indexOrigin(
  input: string,
  opts: { expectedOwner?: string } = {},
): Promise<{ app: MiniAppRow; outcome: IndexPlan["kind"] }> {
  const { origin, url } = wellKnownUrlFor(input);
  let parsed: ParsedManifestFile;
  try {
    parsed = parseManifestFile(await fetchManifestJson(url), origin);
  } catch (e) {
    await recordFailure(origin, e instanceof Error ? e.message : String(e));
    throw e;
  }
  if (opts.expectedOwner && opts.expectedOwner.toLowerCase() !== parsed.owner) {
    throw new MiniAppError(
      "unauthorized",
      `Das Manifest nennt ${parsed.owner} als owner — du bist mit einer anderen Wallet angemeldet.`,
      403,
    );
  }

  // manifest.slug is "" when not explicit, so a derived slug never changes the hash.
  const hash = canonicalHash({ owner: parsed.owner, miniapp: parsed.manifest });
  const found = await loadExisting(origin);
  const now = new Date().toISOString();
  const supabase = db();

  if (!found) {
    // pickSlug is synchronous: pre-check the exact candidates it will try.
    const derived = slugify(parsed.manifest.name).slice(0, 57).replace(/-+$/, "");
    const candidates = parsed.slugExplicit
      ? [parsed.manifest.slug]
      : Array.from({ length: 9 }, (_, i) => (i === 0 ? derived : `${derived}-${i + 1}`));
    const takenSet = new Set<string>();
    for (const c of candidates) if (await slugTaken(c)) takenSet.add(c);
    const slug = pickSlug(parsed, (s) => takenSet.has(s));
    planIndex(null, parsed, hash, slug);

    const dev = await getOrCreateDeveloper(parsed.owner);
    const { data: app, error } = await supabase
      .from("mini_apps")
      .insert({
        ...storeFields(parsed),
        developer_id: dev.id,
        slug,
        status: "pending",
        source: "indexed",
        reward_budget: 0,
        origin,
        manifest_url: url,
        last_indexed_at: now,
        index_error: null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new MiniAppError("conflict", "Diese Domain oder dieser slug ist schon registriert.");
      throw new MiniAppError("internal", error.message);
    }
    await addVersion(app.id, parsed, slug, hash);
    return { app: app as MiniAppRow, outcome: "create" };
  }

  // An indexed row without an owner must not be silently taken over.
  if (!found.existing.ownerWallet) {
    throw new MiniAppError(
      "conflict",
      "Diese Domain ist bereits einem anderen Besitzer zugeordnet. Melde dich beim Röbel-Team, um den Besitzer zu ändern.",
    );
  }
  const plan = planIndex(found.existing, parsed, hash);
  const base = { last_indexed_at: now, index_error: null, manifest_url: url };
  let patch: Record<string, unknown> = base;
  if (plan.kind === "update-direct") {
    patch = { ...base, ...storeFields(parsed), status: "pending", updated_at: now };
    await addVersion(found.existing.id, parsed, found.existing.slug, hash);
  } else if (plan.kind === "stage-version") {
    patch = plan.markPendingUpdate ? { ...base, pending_update: true } : base;
    await addVersion(found.existing.id, parsed, found.existing.slug, hash);
  }
  const { data: app, error } = await supabase
    .from("mini_apps")
    .update(patch)
    .eq("id", found.existing.id)
    .select("*")
    .single();
  if (error) throw new MiniAppError("internal", error.message);
  return { app: app as MiniAppRow, outcome: plan.kind };
}

export async function reindexAll(): Promise<{ total: number; ok: number; failed: number }> {
  const { data } = await db().from("mini_apps").select("origin").not("origin", "is", null);
  const origins = (data ?? []).map((r) => r.origin as string);
  let ok = 0;
  let failed = 0;
  for (const origin of origins) {
    try {
      await indexOrigin(origin);
      ok++;
    } catch (e) {
      failed++;
      // indexOrigin already recorded fetch/parse failures; record others too.
      await recordFailure(origin, e instanceof Error ? e.message : String(e));
    }
  }
  return { total: origins.length, ok, failed };
}
