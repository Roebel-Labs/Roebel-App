# Mini App Manifest Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Builders host their mini app anywhere, put `/.well-known/roebel-miniapp.json` on it, and register it with one unauthenticated call. Röbel indexes the manifest into the existing registry, dashboard and review flow. A placeholder `/mini-apps` landing page and an agent recipe at `/mini-apps/publish.md` sit on top.

**Architecture:** Three new pure modules carry all the logic, so they are unit-testable with `tsx --test` and need no DB or network:
- `manifestFile.ts`: parse and validate the manifest file.
- `safeFetch.ts`: SSRF-safe fetch with injected `lookup` and `fetch`.
- `indexPlan.ts`: decides what a re-index should do.

`indexing.ts` is the thin, server-only executor that applies a plan to Supabase. The API routes (`validate`, `register`, cron) and the UI only call `indexOrigin()` and `validateOrigin()`. Live apps never change until an admin approves the pending version.

**Tech Stack:** Next.js 15 App Router (apps/web), Supabase (service-role client `createAdminClient`), `node:test` via `tsx --test`, Tailwind, `mcp-handler` + zod for the developer MCP.

**Spec:** `docs/superpowers/specs/2026-10-10-miniapp-manifest-indexing-design.md`

## Global Constraints

- Manifest location: `https://<host>/.well-known/roebel-miniapp.json`, where `<host>` = origin of `homeUrl`. One app per origin.
- `owner` is required and must be an EVM address (`/^0x[0-9a-fA-F]{40}$/`). Store it lowercased.
- `miniapp.homeUrl` must be on the **same origin** as the manifest URL.
- `miniapp.slug` is optional. If it is missing, derive it from `name` (kebab-case); collisions get `-2`…`-9`. Once assigned, the slug is fixed for that origin.
- Fetch safety: https only, default port only, block private/loopback/link-local/metadata IPs (v4+v6), ≤3 redirects (each re-checked, same origin only), 5 s timeout, 64 KB body cap, `content-type` must contain `json`.
- Rate limits: `register` 10/hour per IP and 1/minute per origin. `validate` 30/hour per IP.
- A live app's store fields are **never** changed by indexing; changes become a pending version that approval applies.
- If a fetch or validation fails on a known origin, set only `index_error` + `last_indexed_at`. Never change the status automatically.
- Origin claimed by a different owner → 409, code `conflict`, message mentions "Besitzer".
- Branding: "Röbel Mini Apps" (no Ortis yet). UI copy German, identifiers and comments English.
- Web styling: Tailwind utility classes. Primary `#00498B`.
- Test command (from repo root): `pnpm exec tsx --test apps/web/tests/<file>.test.ts`. Tests live in `apps/web/tests/`, use `node:test` + `node:assert/strict`, and import via `../src/...`.
- Pure modules must NOT import `server-only`, `@/…` aliases, or Supabase. They use relative imports so `tsx` can run them.
- Commits: conventional (`feat(web): …`), stage files by path, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, push after each commit.

## Review Focus

1. **Manifest at a redirecting host** (builder registers `example.com`, which 308s to `www.example.com`): a cross-origin redirect is refused, and the error must name the exact origin to register instead (`https://www.example.com`). Test in Task 2.
2. **Builder registers a deep link** (`https://app.example/some/page?x=1`): it must normalize to the origin's well-known URL, not 404. Test in Task 2.
3. **Re-register an unchanged manifest**: must not create a new version or flip a live app to pending. Test in Task 3.
4. **Manifest edited only in key order or whitespace**: must hash identically (canonical JSON), so no spurious pending version. Test in Task 1.
5. **Derived slug collides with a non-indexed app** (e.g. an AI-builder app already called `stadtstack`): must get `stadtstack-2`, not a 409. Test in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261010_mini_app_manifest_indexing.sql` (create) | New columns on `mini_apps` and `mini_app_versions`. |
| `apps/web/src/lib/miniapp/manifestFile.ts` (create, pure) | `parseManifestFile`, `canonicalHash`, `slugify`, `WELL_KNOWN_PATH`. |
| `apps/web/src/lib/miniapp/safeFetch.ts` (create, pure) | `isBlockedIp`, `wellKnownUrlFor`, `fetchManifestJson`. |
| `apps/web/src/lib/miniapp/indexPlan.ts` (create, pure) | `planIndex`, `pickSlug`. |
| `apps/web/src/lib/miniapp/indexing.ts` (create, server-only) | `validateOrigin`, `indexOrigin`, `reindexAll`. |
| `apps/web/src/lib/miniapp/types.ts` (modify) | Row fields + `source: "indexed"`. |
| `apps/web/src/lib/miniapp/data.ts` (modify) | `reviewApp` applies pending manifest for indexed apps; `setAppOwner`; `listApps` `needsReview` filter. |
| `apps/web/src/app/api/mini-apps/validate/route.ts` (create) | GET validate. |
| `apps/web/src/app/api/mini-apps/register/route.ts` (create) | POST register. |
| `apps/web/src/app/api/mini-apps/owner/route.ts` (create) | Admin owner reassignment. |
| `apps/web/src/app/api/cron/mini-apps-reindex/route.ts` (create) | Daily re-index. |
| `apps/web/vercel.json` (modify) | Cron entry. |
| `apps/web/src/app/api/[transport]/route.ts` (modify) | MCP tool `register_app_url`. |
| `apps/web/src/lib/miniapp/publishDoc.ts` (create, pure) | Builds the publish.md text. |
| `apps/web/src/app/mini-apps/publish.md/route.ts` (create) | Serves the markdown. |
| `apps/web/src/lib/miniapp/devdocs.ts` (modify) | llms.txt links to publish.md. |
| `apps/web/src/app/mini-apps/page.tsx` (create) | Placeholder landing page. |
| `apps/web/src/components/mini-apps/AddByUrlDialog.tsx` (create) | Dashboard "Per URL hinzufügen". |
| `apps/web/src/components/mini-apps/IndexedSourceCard.tsx` (create) | Manifest URL / last indexed / error / reload. |
| `apps/web/src/app/dashboard/mini-apps/page.tsx`, `[id]/page.tsx` (modify) | Wire the two components; remove Sommercamp welcome. |
| `apps/web/src/app/admin/dashboard/mini-apps/page.tsx`, `[id]/page.tsx` (modify) | Review tab includes pending updates; source card + diff + owner change. |
| `apps/web/src/components/sommercamp/RegistrationCard.tsx` (modify) | CTA → `/mini-apps`, no dashboard redirect. |
| `apps/web/src/app/developers/mini-apps/page.tsx` (modify) | Add "Eigenes Hosting + Manifest" path. |

---

### Task 1: Manifest file parsing + canonical hash (pure)

**Files:**
- Create: `apps/web/src/lib/miniapp/manifestFile.ts`
- Test: `apps/web/tests/miniapp-manifest-file.test.ts`

**Interfaces:**
- Consumes: `validateManifest(input: unknown): MiniAppManifest` from `../src/lib/miniapp/manifest` (throws `MiniAppError("invalid_params", msg)`).
- Produces:
  - `WELL_KNOWN_PATH = "/.well-known/roebel-miniapp.json"`
  - `interface ParsedManifestFile { owner: string /*lowercased*/; manifest: MiniAppManifest /*slug may be "" when not given*/; slugExplicit: boolean }`
  - `parseManifestFile(raw: unknown, origin: string): ParsedManifestFile` (throws `MiniAppError("invalid_params")`)
  - `canonicalHash(value: unknown): string` (sha256 hex of key-sorted JSON)
  - `slugify(name: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/miniapp-manifest-file.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseManifestFile,
  canonicalHash,
  slugify,
  WELL_KNOWN_PATH,
} from "../src/lib/miniapp/manifestFile";

const origin = "https://spiel.example.app";
const base = {
  owner: "0xAbCdEf0000000000000000000000000000000001",
  miniapp: {
    version: "1",
    name: "Stadtstack",
    homeUrl: "https://spiel.example.app/",
    category: "games",
  },
};

test("well-known path constant", () => {
  assert.equal(WELL_KNOWN_PATH, "/.well-known/roebel-miniapp.json");
});

test("parses a minimal manifest, lowercases owner, slug not explicit", () => {
  const p = parseManifestFile(base, origin);
  assert.equal(p.owner, "0xabcdef0000000000000000000000000000000001");
  assert.equal(p.manifest.name, "Stadtstack");
  assert.equal(p.manifest.category, "games");
  assert.equal(p.slugExplicit, false);
  assert.equal(p.manifest.slug, "");
});

test("explicit slug is kept and flagged", () => {
  const p = parseManifestFile({ ...base, miniapp: { ...base.miniapp, slug: "stadtstack-spiel" } }, origin);
  assert.equal(p.manifest.slug, "stadtstack-spiel");
  assert.equal(p.slugExplicit, true);
});

test("rejects missing or malformed owner", () => {
  assert.throws(() => parseManifestFile({ miniapp: base.miniapp }, origin), /owner/);
  assert.throws(() => parseManifestFile({ ...base, owner: "0x123" }, origin), /owner/);
});

test("rejects missing miniapp object", () => {
  assert.throws(() => parseManifestFile({ owner: base.owner }, origin), /miniapp/);
});

test("rejects homeUrl on another origin", () => {
  assert.throws(
    () => parseManifestFile({ ...base, miniapp: { ...base.miniapp, homeUrl: "https://evil.example/" } }, origin),
    /homeUrl/,
  );
});

test("rejects unsupported manifest version", () => {
  assert.throws(() => parseManifestFile({ ...base, miniapp: { ...base.miniapp, version: "9" } }, origin), /version/);
});

test("rejects non-object input", () => {
  assert.throws(() => parseManifestFile("nope", origin), /Manifest/);
});

test("canonicalHash ignores key order and whitespace", () => {
  const a = { b: 1, a: { y: [1, 2], x: "s" } };
  const b = JSON.parse(JSON.stringify({ a: { x: "s", y: [1, 2] }, b: 1 }, null, 4));
  assert.equal(canonicalHash(a), canonicalHash(b));
  assert.notEqual(canonicalHash(a), canonicalHash({ ...a, b: 2 }));
  assert.match(canonicalHash(a), /^[0-9a-f]{64}$/);
});

test("slugify", () => {
  assert.equal(slugify("Stadtstack Spiel!"), "stadtstack-spiel");
  assert.equal(slugify("Röbel Größe"), "roebel-groesse");
  assert.equal(slugify("  --A--  "), "a");
  assert.equal(slugify("x".repeat(80)).length, 60);
  assert.equal(slugify("!!!"), "app");
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec tsx --test apps/web/tests/miniapp-manifest-file.test.ts`
Expected: FAIL, cannot find module `manifestFile`.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm exec tsx --test apps/web/tests/miniapp-manifest-file.test.ts`
Expected: PASS (10 tests). If `./types` fails to load under tsx because of a non-type import chain, change the import to `import { MiniAppError } from "./types"` plus `import type { MiniAppManifest } from "@netizen-labs/miniapp-sdk"`. `types.ts` only has type imports from the SDK, so it should load.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/miniapp/manifestFile.ts apps/web/tests/miniapp-manifest-file.test.ts
git commit -m "feat(web): parse self-hosted mini-app manifest files"
git push
```

---

### Task 2: SSRF-safe manifest fetch (pure, injected deps)

**Files:**
- Create: `apps/web/src/lib/miniapp/safeFetch.ts`
- Test: `apps/web/tests/miniapp-safe-fetch.test.ts`

**Interfaces:**
- Consumes: `WELL_KNOWN_PATH` (Task 1), `MiniAppError`.
- Produces:
  - `isBlockedIp(ip: string): boolean`
  - `wellKnownUrlFor(input: string): { origin: string; url: string }` (throws `invalid_params`)
  - `type LookupFn = (host: string) => Promise<string[]>`
  - `type FetchFn = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string,string> }) => Promise<Response>`
  - `fetchManifestJson(url: string, deps?: { lookup?: LookupFn; fetch?: FetchFn; timeoutMs?: number }): Promise<unknown>` (throws `MiniAppError("invalid_params", <German message>)` on every failure)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/miniapp-safe-fetch.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlockedIp, wellKnownUrlFor, fetchManifestJson } from "../src/lib/miniapp/safeFetch";

const publicLookup = async () => ["76.76.21.21"];

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("blocks private, loopback, link-local, metadata, v6 local", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ["76.76.21.21", "8.8.8.8", "2606:4700::1111"]) {
    assert.equal(isBlockedIp(ip), false, ip);
  }
});

test("wellKnownUrlFor normalizes deep links and bare hosts", () => {
  assert.deepEqual(wellKnownUrlFor("https://app.example/some/page?x=1#y"), {
    origin: "https://app.example",
    url: "https://app.example/.well-known/roebel-miniapp.json",
  });
  assert.equal(wellKnownUrlFor("app.example").origin, "https://app.example");
});

test("wellKnownUrlFor rejects http, ports, credentials, IP literals", () => {
  for (const bad of ["http://app.example", "https://app.example:8443", "https://u:p@app.example", "https://127.0.0.1", "https://[::1]", "not a url"]) {
    assert.throws(() => wellKnownUrlFor(bad), undefined, bad);
  }
});

test("fetches and parses JSON", async () => {
  const body = { owner: "0x1", miniapp: {} };
  const got = await fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
    lookup: publicLookup,
    fetch: async () => jsonResponse(body),
  });
  assert.deepEqual(got, body);
});

test("refuses hosts resolving to private IPs", async () => {
  await assert.rejects(
    fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
      lookup: async () => ["10.1.2.3"],
      fetch: async () => jsonResponse({}),
    }),
    /nicht öffentlich/,
  );
});

test("follows same-origin redirect, refuses cross-origin with a hint", async () => {
  let calls = 0;
  const same = await fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
    lookup: publicLookup,
    fetch: async () =>
      ++calls === 1
        ? new Response(null, { status: 301, headers: { location: "/.well-known/roebel-miniapp.json?v=2" } })
        : jsonResponse({ ok: 1 }),
  });
  assert.deepEqual(same, { ok: 1 });

  await assert.rejects(
    fetchManifestJson("https://example.app/.well-known/roebel-miniapp.json", {
      lookup: publicLookup,
      fetch: async () =>
        new Response(null, { status: 308, headers: { location: "https://www.example.app/.well-known/roebel-miniapp.json" } }),
    }),
    /https:\/\/www\.example\.app/,
  );
});

test("too many redirects", async () => {
  await assert.rejects(
    fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
      lookup: publicLookup,
      fetch: async () => new Response(null, { status: 302, headers: { location: "/.well-known/roebel-miniapp.json" } }),
    }),
    /Weiterleitungen/,
  );
});

test("404, wrong content-type, oversize, invalid JSON, timeout", async () => {
  const url = "https://app.example/.well-known/roebel-miniapp.json";
  await assert.rejects(fetchManifestJson(url, { lookup: publicLookup, fetch: async () => new Response("x", { status: 404 }) }), /404/);
  await assert.rejects(
    fetchManifestJson(url, { lookup: publicLookup, fetch: async () => new Response("{}", { headers: { "content-type": "text/html" } }) }),
    /JSON/,
  );
  await assert.rejects(
    fetchManifestJson(url, { lookup: publicLookup, fetch: async () => jsonResponse({ big: "x".repeat(70_000) }) }),
    /64 KB/,
  );
  await assert.rejects(
    fetchManifestJson(url, { lookup: publicLookup, fetch: async () => new Response("{nope", { headers: { "content-type": "application/json" } }) }),
    /JSON/,
  );
  await assert.rejects(
    fetchManifestJson(url, {
      lookup: publicLookup,
      timeoutMs: 20,
      fetch: (_u, init) =>
        new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
    }),
    /nicht erreichbar|Zeit/,
  );
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec tsx --test apps/web/tests/miniapp-safe-fetch.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/miniapp/safeFetch.ts
// SSRF-safe fetch for builder-supplied manifest URLs (spec 2026-10-10 §4).
// Pure: DNS lookup and fetch are injectable for tests. Defaults use node:dns
// and global fetch. Known gap: DNS rebinding between our lookup and fetch's
// own resolution is not closed; acceptable for a 64 KB JSON read with no
// credentials attached.
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { WELL_KNOWN_PATH } from "./manifestFile";
import { MiniAppError } from "./types";

export type LookupFn = (host: string) => Promise<string[]>;
export type FetchFn = (
  url: string,
  init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;

const MAX_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;

function fail(message: string): never {
  throw new MiniAppError("invalid_params", message);
}

function v4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Blocked(ip);
  if (kind === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return v4Blocked(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("ff");
  }
  return true;
}

export function wellKnownUrlFor(input: string): { origin: string; url: string } {
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    fail("Ungültige URL.");
  }
  if (u.protocol !== "https:") fail("Nur https-URLs werden unterstützt.");
  if (u.port) fail("Eigene Ports werden nicht unterstützt — bitte Standard-https (443) nutzen.");
  if (u.username || u.password) fail("URL darf keine Zugangsdaten enthalten.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) fail("Bitte eine Domain statt einer IP-Adresse angeben.");
  return { origin: u.origin, url: `${u.origin}${WELL_KNOWN_PATH}` };
}

const defaultLookup: LookupFn = async (host) =>
  (await dnsLookup(host, { all: true })).map((r) => r.address);

export async function fetchManifestJson(
  url: string,
  deps: { lookup?: LookupFn; fetch?: FetchFn; timeoutMs?: number } = {},
): Promise<unknown> {
  const lookup = deps.lookup ?? defaultLookup;
  const doFetch: FetchFn = deps.fetch ?? ((u, init) => fetch(u, init));
  const origin = new URL(url).origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 5000);

  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      const host = new URL(current).hostname;
      let addrs: string[];
      try {
        addrs = await lookup(host);
      } catch {
        fail(`Domain ${host} wurde nicht gefunden.`);
      }
      if (addrs.length === 0 || addrs.some(isBlockedIp)) {
        fail(`${host} ist nicht öffentlich erreichbar.`);
      }

      let res: Response;
      try {
        res = await doFetch(current, {
          redirect: "manual",
          signal: controller.signal,
          headers: { accept: "application/json", "user-agent": "RoebelMiniAppIndexer/1.0" },
        });
      } catch {
        fail(`Manifest unter ${current} nicht erreichbar (Zeitüberschreitung oder Netzwerkfehler).`);
      }

      if (res.status >= 300 && res.status < 400) {
        if (hop >= MAX_REDIRECTS) fail("Zu viele Weiterleitungen beim Abruf des Manifests.");
        const next = new URL(res.headers.get("location") ?? "", current);
        if (next.origin !== origin) {
          fail(`Das Manifest leitet auf ${next.origin} weiter. Registriere bitte direkt ${next.origin}.`);
        }
        current = next.toString();
        continue;
      }
      if (!res.ok) fail(`Manifest nicht gefunden (${res.status}) unter ${current}.`);

      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("json")) fail(`Manifest muss JSON sein (content-type war "${type || "leer"}").`);

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) fail("Manifest ist größer als 64 KB.");
      try {
        return JSON.parse(new TextDecoder().decode(buf));
      } catch {
        fail("Manifest ist kein gültiges JSON.");
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm exec tsx --test apps/web/tests/miniapp-safe-fetch.test.ts`
Expected: PASS. The thrown `MiniAppError` must not be swallowed: the `fail()` inside `try { lookup }` sits in a `catch`, so it rethrows fine.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/miniapp/safeFetch.ts apps/web/tests/miniapp-safe-fetch.test.ts
git commit -m "feat(web): SSRF-safe fetch for mini-app manifests"
git push
```

---

### Task 3: Index planning (pure state machine)

**Files:**
- Create: `apps/web/src/lib/miniapp/indexPlan.ts`
- Test: `apps/web/tests/miniapp-index-plan.test.ts`

**Interfaces:**
- Consumes: `ParsedManifestFile` (Task 1), `MiniAppStatus`, `MiniAppError`.
- Produces:
  ```ts
  interface ExistingIndexedApp { id: string; slug: string; status: MiniAppStatus; ownerWallet: string | null; latestHash: string | null }
  type IndexPlan =
    | { kind: "create"; slug: string }
    | { kind: "touch" }                               // unchanged
    | { kind: "update-direct" }                       // not live → apply + pending
    | { kind: "stage-version"; markPendingUpdate: boolean } // live/rejected/suspended
  function planIndex(existing: ExistingIndexedApp | null, parsed: ParsedManifestFile, hash: string, slug?: string): IndexPlan
  function pickSlug(parsed: ParsedManifestFile, isTaken: (slug: string) => boolean): string
  ```
  `planIndex` throws `MiniAppError("conflict", …Besitzer…)` when the owner differs.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/miniapp-index-plan.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { planIndex, pickSlug, type ExistingIndexedApp } from "../src/lib/miniapp/indexPlan";
import type { ParsedManifestFile } from "../src/lib/miniapp/manifestFile";

const parsed = (over: Partial<ParsedManifestFile["manifest"]> = {}, slugExplicit = false): ParsedManifestFile => ({
  owner: "0xaa00000000000000000000000000000000000001",
  slugExplicit,
  manifest: {
    slug: slugExplicit ? "stadtstack" : "",
    name: "Stadtstack",
    iconUrl: "",
    homeUrl: "https://s.example/",
    description: "",
    category: "games",
    tags: [],
    screenshots: [],
    permissions: [],
    primaryColor: "#00498B",
    ...over,
  },
});

const existing = (over: Partial<ExistingIndexedApp> = {}): ExistingIndexedApp => ({
  id: "app-1",
  slug: "stadtstack",
  status: "live",
  ownerWallet: "0xaa00000000000000000000000000000000000001",
  latestHash: "h1",
  ...over,
});

test("new origin → create with the given slug", () => {
  assert.deepEqual(planIndex(null, parsed(), "h1", "stadtstack"), { kind: "create", slug: "stadtstack" });
});

test("unchanged hash → touch, regardless of status", () => {
  for (const status of ["live", "pending", "rejected", "suspended"] as const) {
    assert.deepEqual(planIndex(existing({ status }), parsed(), "h1"), { kind: "touch" });
  }
});

test("changed + not live → update-direct", () => {
  for (const status of ["pending", "approved", "draft"] as const) {
    assert.deepEqual(planIndex(existing({ status }), parsed(), "h2"), { kind: "update-direct" });
  }
});

test("changed + live → stage version, mark pending update", () => {
  assert.deepEqual(planIndex(existing({ status: "live" }), parsed(), "h2"), { kind: "stage-version", markPendingUpdate: true });
});

test("changed + rejected/suspended → stage version only", () => {
  for (const status of ["rejected", "suspended"] as const) {
    assert.deepEqual(planIndex(existing({ status }), parsed(), "h2"), { kind: "stage-version", markPendingUpdate: false });
  }
});

test("different owner → conflict", () => {
  assert.throws(
    () => planIndex(existing({ ownerWallet: "0xbb00000000000000000000000000000000000002" }), parsed(), "h2"),
    (e: Error & { code?: string }) => e.code === "conflict" && /Besitzer/.test(e.message),
  );
});

test("pickSlug: derived slug gets -2.. suffix on collision", () => {
  const taken = new Set(["stadtstack", "stadtstack-2"]);
  assert.equal(pickSlug(parsed(), (s) => taken.has(s)), "stadtstack-3");
});

test("pickSlug: explicit slug collision → conflict", () => {
  assert.throws(
    () => pickSlug(parsed({}, true), () => true),
    (e: Error & { code?: string }) => e.code === "conflict",
  );
});

test("pickSlug: gives up after -9", () => {
  assert.throws(() => pickSlug(parsed(), () => true), (e: Error & { code?: string }) => e.code === "conflict");
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec tsx --test apps/web/tests/miniapp-index-plan.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/miniapp/indexPlan.ts
// Pure decision logic for (re-)indexing a self-hosted manifest (spec §5).
// The executor in indexing.ts applies the plan; keeping the branching here
// makes every transition unit-testable.
import { slugify, type ParsedManifestFile } from "./manifestFile";
import { MiniAppError, type MiniAppStatus } from "./types";

export interface ExistingIndexedApp {
  id: string;
  slug: string;
  status: MiniAppStatus;
  ownerWallet: string | null;
  latestHash: string | null;
}

export type IndexPlan =
  | { kind: "create"; slug: string }
  | { kind: "touch" }
  | { kind: "update-direct" }
  | { kind: "stage-version"; markPendingUpdate: boolean };

export function pickSlug(parsed: ParsedManifestFile, isTaken: (slug: string) => boolean): string {
  if (parsed.slugExplicit) {
    if (isTaken(parsed.manifest.slug)) {
      throw new MiniAppError("conflict", `Der slug "${parsed.manifest.slug}" ist bereits vergeben.`);
    }
    return parsed.manifest.slug;
  }
  const base = slugify(parsed.manifest.name).slice(0, 57).replace(/-+$/, "");
  for (let n = 1; n <= 9; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new MiniAppError("conflict", `Kein freier slug für "${parsed.manifest.name}" — setze miniapp.slug selbst.`);
}

export function planIndex(
  existing: ExistingIndexedApp | null,
  parsed: ParsedManifestFile,
  hash: string,
  slug?: string,
): IndexPlan {
  if (!existing) {
    if (!slug) throw new MiniAppError("internal", "planIndex: slug required for new apps.");
    return { kind: "create", slug };
  }
  if (existing.ownerWallet && existing.ownerWallet !== parsed.owner) {
    throw new MiniAppError(
      "conflict",
      "Diese Domain ist bereits einem anderen Besitzer zugeordnet. Melde dich beim Röbel-Team, um den Besitzer zu ändern.",
    );
  }
  if (existing.latestHash === hash) return { kind: "touch" };
  if (existing.status === "live") return { kind: "stage-version", markPendingUpdate: true };
  if (existing.status === "rejected" || existing.status === "suspended") {
    return { kind: "stage-version", markPendingUpdate: false };
  }
  return { kind: "update-direct" };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm exec tsx --test apps/web/tests/miniapp-index-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/miniapp/indexPlan.ts apps/web/tests/miniapp-index-plan.test.ts
git commit -m "feat(web): pure re-index planning for self-hosted mini apps"
git push
```

---

### Task 4: Migration + row types

**Files:**
- Create: `supabase/migrations/20261010_mini_app_manifest_indexing.sql`
- Modify: `apps/web/src/lib/miniapp/types.ts` (`MiniAppRow`, `MiniAppVersionRow`)

**Interfaces:**
- Produces (DB + TS):
  - `mini_apps.origin text unique`
  - `mini_apps.manifest_url text`
  - `mini_apps.last_indexed_at timestamptz`
  - `mini_apps.index_error text`
  - `mini_apps.pending_update boolean not null default false`
  - `mini_app_versions.manifest_hash text`
  - TS: `MiniAppRow.source` union gains `"indexed"`; the optional fields `origin?`, `manifest_url?`, `last_indexed_at?`, `index_error?`, `pending_update?`; `MiniAppVersionRow.manifest_hash?: string | null`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20261010_mini_app_manifest_indexing.sql
-- Self-hosted mini apps indexed from /.well-known/roebel-miniapp.json
-- (spec docs/superpowers/specs/2026-10-10-miniapp-manifest-indexing-design.md).
alter table public.mini_apps
  add column if not exists origin text,
  add column if not exists manifest_url text,
  add column if not exists last_indexed_at timestamptz,
  add column if not exists index_error text,
  add column if not exists pending_update boolean not null default false;

create unique index if not exists mini_apps_origin_key
  on public.mini_apps (origin) where origin is not null;

alter table public.mini_app_versions
  add column if not exists manifest_hash text;
```

- [ ] **Step 2: Apply via the Supabase MCP**

First call `mcp__supabase__get_project_url` and confirm it returns `https://wwbeqhkslxdxhktqzqti.supabase.co`. Then call `mcp__supabase__apply_migration` with name `mini_app_manifest_indexing` and the SQL above.
Verify: `select column_name from information_schema.columns where table_name='mini_apps' and column_name in ('origin','manifest_url','last_indexed_at','index_error','pending_update');` returns 5 rows.

- [ ] **Step 3: Update the TS row types**

In `MiniAppRow` (types.ts), replace the `source` line and add the fields:

```ts
  source: "external" | "ai_builder" | "first_party" | "indexed";
  /** Self-hosted (indexed) apps: https origin the manifest lives on. */
  origin?: string | null;
  manifest_url?: string | null;
  last_indexed_at?: string | null;
  /** Last fetch/validation failure; null when the last index succeeded. */
  index_error?: string | null;
  /** A live app has a newer pending version awaiting review. */
  pending_update?: boolean;
```

In `MiniAppVersionRow` add:

```ts
  /** Indexed apps: sha256 of the canonical miniapp JSON (skip unchanged). */
  manifest_hash?: string | null;
```

- [ ] **Step 4: Typecheck the touched module**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "lib/miniapp/(types|manifestFile|safeFetch|indexPlan)" ; echo done`
Expected: no lines before `done`. The repo has a large existing tsc baseline, so judge only these files.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261010_mini_app_manifest_indexing.sql apps/web/src/lib/miniapp/types.ts
git commit -m "feat(db): mini_apps origin/index columns for manifest indexing"
git push
```

---

### Task 5: Indexing executor + review/owner data changes

**Files:**
- Create: `apps/web/src/lib/miniapp/indexing.ts`
- Modify: `apps/web/src/lib/miniapp/data.ts` (`reviewApp`, add `setAppOwner`, `ListAppsFilter.needsReview`)
- Modify: `apps/web/src/lib/miniapp/index.ts` (export `indexing`)

**Interfaces:**
- Consumes: Tasks 1–4; `getOrCreateDeveloper`, `createVersion`, `getApp` from `data.ts`; `createAdminClient` from `@/lib/supabase/admin`.
- Produces:
  - `validateOrigin(input: string): Promise<{ origin: string; manifestUrl: string; parsed: ParsedManifestFile; warnings: string[] }>` (throws `MiniAppError`)
  - `indexOrigin(input: string, opts?: { expectedOwner?: string }): Promise<{ app: MiniAppRow; outcome: IndexPlan["kind"] }>`
  - `reindexAll(): Promise<{ total: number; ok: number; failed: number }>`
  - `setAppOwner(id: string, wallet: string): Promise<MiniAppRow>`
  - `ListAppsFilter.needsReview?: boolean` (status in pending/approved/draft OR pending_update)
- Embed-header warnings are copied from `app/api/mini-apps/import/inspect/route.ts` lines 59–75 into a small helper `embedWarnings(res: Response): string[]` in `indexing.ts`. They are checked with one safe GET of `homeUrl` through the same `isBlockedIp` lookup. A failure there produces a warning, never an error.

- [ ] **Step 1: Implement `indexing.ts`**

```ts
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

async function embedWarnings(homeUrl: string): Promise<string[]> {
  try {
    const host = new URL(homeUrl).hostname;
    const addrs = (await dnsLookup(host, { all: true })).map((a) => a.address);
    if (addrs.some(isBlockedIp)) return [];
    const res = await fetch(homeUrl, { redirect: "follow", signal: AbortSignal.timeout(5000) });
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
  const { data: app } = await supabase
    .from("mini_apps")
    .select("*, developers(wallet)")
    .eq("origin", origin)
    .maybeSingle();
  if (!app) return null;
  const { data: latest } = await supabase
    .from("mini_app_versions")
    .select("manifest_hash")
    .eq("mini_app_id", app.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    row: app as MiniAppRow & { developers: { wallet: string } | null },
    existing: {
      id: app.id as string,
      slug: app.slug as string,
      status: app.status,
      ownerWallet: (app.developers as { wallet: string } | null)?.wallet ?? null,
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
  const v = await createVersion(appId, {
    version: await nextVersion(appId),
    homeUrl: parsed.manifest.homeUrl,
    manifest: { ...parsed.manifest, slug },
  });
  await db().from("mini_app_versions").update({ manifest_hash: hash }).eq("id", v.id);
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
```

- [ ] **Step 2: Extend `reviewApp` to apply a pending manifest for indexed apps**

In `data.ts` → `reviewApp`, change the "Settle the latest pending version" block so it selects `id, manifest` and applies the manifest on approve when `app.source === "indexed"`. It must also clear `pending_update` on approve, reject and reset. Replace the existing block from `// Settle the latest pending version too.` to the end of the function with:

```ts
  // Settle the latest pending version too.
  const { data: pending } = await supabase
    .from("mini_app_versions")
    .select("id, manifest")
    .eq("mini_app_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending) {
    await supabase
      .from("mini_app_versions")
      .update({
        status: decision === "approve" ? "approved" : "rejected",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", (pending as { id: string }).id);
  }

  // Indexed apps: store fields only change on approval of a version (spec §5).
  const patch: Record<string, unknown> = { pending_update: false };
  if (decision === "approve" && app.source === "indexed" && pending?.manifest) {
    const m = validateManifest(pending.manifest);
    Object.assign(patch, {
      name: m.name,
      icon_url: m.iconUrl || null,
      home_url: m.homeUrl,
      description: m.description || null,
      category: m.category,
      tags: m.tags,
      screenshots: m.screenshots,
      permissions: m.permissions,
      primary_color: m.primaryColor,
    });
  }
  // A live app whose update was rejected stays live.
  if (decision === "reject" && app.status === "live" && app.pending_update) {
    patch.status = "live";
  }
  const { data: final, error: finErr } = await supabase
    .from("mini_apps")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (finErr) throw new MiniAppError("internal", finErr.message);
  return final as MiniAppRow;
```

Also add `pending_update: false` to the `reset` branch's early return path. Do it by updating it in the first `.update({...})` call when `decision === "reset"`: add `...(decision === "reset" ? { pending_update: false } : {})`. Make sure `validateManifest` is imported in `data.ts`; it is already used by `submitApp`.

**Note:** rejecting a *pending update* on a live app must not unlist the app. The first `update` in `reviewApp` sets `status: "rejected"`, and the final patch restores `live`. Use the `app` captured at the top of the function (pre-update) for the `app.status`/`app.pending_update` checks.

- [ ] **Step 3: Add `setAppOwner` and the `needsReview` filter**

```ts
// data.ts — after toggleFeatured
/** Admin: hand an app to another developer wallet (indexed-origin takeovers). */
export async function setAppOwner(id: string, wallet: string): Promise<MiniAppRow> {
  const dev = await getOrCreateDeveloper(wallet);
  const { data, error } = await db()
    .from("mini_apps")
    .update({ developer_id: dev.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new MiniAppError("internal", error.message);
  return data as MiniAppRow;
}
```

In `ListAppsFilter` (types.ts) add `needsReview?: boolean;`. In `listApps`, before `if (filter.status)` add:

```ts
  if (filter.needsReview) {
    q = q.or("status.in.(pending,approved,draft),pending_update.eq.true");
  }
```

In `apps/web/src/app/api/mini-apps/list/route.ts`, read `getParam(req, "needsReview") === "1"`. When the caller is an admin (`canSeeAll`), pass `needsReview: true` and no `status`. For non-admins, ignore it.

Note on ownership checks: after an owner reassignment (`setAppOwner`), `indexOrigin` compares the manifest owner with the *developer row's* wallet. A takeover therefore only sticks if the manifest also names the new owner, which is the intended behaviour.

- [ ] **Step 4: Export from the barrel**

In `apps/web/src/lib/miniapp/index.ts` do **not** re-export `indexing` (it is `server-only` and the barrel is imported by client components through types). Routes import `@/lib/miniapp/indexing` directly. Export `setAppOwner` (it is in `data.ts`, already re-exported via `export * from "./data"`).

- [ ] **Step 5: Typecheck the touched files**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "lib/miniapp/|api/mini-apps/list" ; echo done`
Expected: no new errors in these files.

- [ ] **Step 6: Re-run the pure tests**

Run: `pnpm exec tsx --test apps/web/tests/miniapp-manifest-file.test.ts apps/web/tests/miniapp-safe-fetch.test.ts apps/web/tests/miniapp-index-plan.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/miniapp/indexing.ts apps/web/src/lib/miniapp/data.ts apps/web/src/lib/miniapp/types.ts apps/web/src/app/api/mini-apps/list/route.ts
git commit -m "feat(web): index self-hosted mini-app manifests; approve applies staged updates"
git push
```

---

### Task 6: API routes, cron, MCP tool

**Files:**
- Create: `apps/web/src/app/api/mini-apps/validate/route.ts`
- Create: `apps/web/src/app/api/mini-apps/register/route.ts`
- Create: `apps/web/src/app/api/mini-apps/owner/route.ts`
- Create: `apps/web/src/app/api/cron/mini-apps-reindex/route.ts`
- Modify: `apps/web/vercel.json`
- Modify: `apps/web/src/app/api/[transport]/route.ts`

**Interfaces:**
- Consumes: `validateOrigin`, `indexOrigin`, `reindexAll` (Task 5); `setAppOwner`; `jsonError`, `getParam`, `requireAdmin` from `@/lib/miniapp/http`; `sharedLimiters`, `takeAll`, `HOUR_MS`, `MINUTE_MS` from `@/lib/rate-limit`.
- Produces HTTP:
  - `GET /api/mini-apps/validate?url=` → `200 { ok: true, origin, manifestUrl, manifest, owner, warnings }` | `4xx { ok: false, error, code }`
  - `POST /api/mini-apps/register` body `{ url, expectedOwner? }` → `201` on create, `200` otherwise: `{ app: { id, slug, status, pending_update }, outcome, dashboardUrl, statusUrl, previewUrl }`
  - `POST /api/mini-apps/owner` (admin) `{ id, wallet }` → `{ app }`
  - `GET /api/cron/mini-apps-reindex` (Bearer `CRON_SECRET`) → `{ total, ok, failed }`

- [ ] **Step 1: validate route**

```ts
// apps/web/src/app/api/mini-apps/validate/route.ts
// GET /api/mini-apps/validate?url=… — dry-run a self-hosted manifest. No auth.
import { NextResponse } from "next/server";
import { validateOrigin } from "@/lib/miniapp/indexing";
import { getParam, jsonError } from "@/lib/miniapp/http";
import { MiniAppError } from "@/lib/miniapp/types";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { HOUR_MS, takeAll } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiters = sharedLimiters([{ name: "miniapp-validate-ip", limit: 30, windowMs: HOUR_MS }]);

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function GET(req: Request) {
  try {
    if (!(await takeAll(limiters, clientIp(req)))) {
      throw new MiniAppError("rate_limited", "Zu viele Prüfungen — versuch es in einer Stunde wieder.");
    }
    const url = getParam(req, "url");
    if (!url) throw new MiniAppError("invalid_params", "Parameter url fehlt.");
    const r = await validateOrigin(url);
    return NextResponse.json({
      ok: true,
      origin: r.origin,
      manifestUrl: r.manifestUrl,
      owner: r.parsed.owner,
      manifest: r.parsed.manifest,
      warnings: r.warnings,
    });
  } catch (e) {
    const res = jsonError(e);
    const body = await res.json();
    return NextResponse.json({ ok: false, ...body }, { status: res.status });
  }
}
```

Check that `MiniAppError("rate_limited")` maps to 429 in `types.ts`'s status switch. If it doesn't, pass `429` explicitly as the third argument.

- [ ] **Step 2: register route**

```ts
// apps/web/src/app/api/mini-apps/register/route.ts
// POST /api/mini-apps/register { url, expectedOwner? } — index a self-hosted
// manifest (spec 2026-10-10 §4). No auth: the manifest's `owner` field on the
// builder's own domain is the ownership proof.
import { NextResponse } from "next/server";
import { indexOrigin } from "@/lib/miniapp/indexing";
import { jsonError } from "@/lib/miniapp/http";
import { MiniAppError } from "@/lib/miniapp/types";
import { wellKnownUrlFor } from "@/lib/miniapp/safeFetch";
import { DOCS_BASE_URL } from "@/lib/miniapp/devdocs";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { HOUR_MS, MINUTE_MS, takeAll } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ipLimiters = sharedLimiters([{ name: "miniapp-register-ip", limit: 10, windowMs: HOUR_MS }]);
const originLimiters = sharedLimiters([{ name: "miniapp-register-origin", limit: 1, windowMs: MINUTE_MS }]);

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: string; expectedOwner?: string };
    if (!body.url) throw new MiniAppError("invalid_params", "Feld url fehlt.");
    const { origin } = wellKnownUrlFor(body.url);
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    if (!(await takeAll(ipLimiters, ip)) || !(await takeAll(originLimiters, origin))) {
      throw new MiniAppError("rate_limited", "Zu viele Registrierungen — bitte kurz warten.", 429);
    }

    const { app, outcome } = await indexOrigin(body.url, { expectedOwner: body.expectedOwner });
    return NextResponse.json(
      {
        app: { id: app.id, slug: app.slug, status: app.status, pending_update: app.pending_update ?? false },
        outcome,
        dashboardUrl: `${DOCS_BASE_URL}/dashboard/mini-apps/${app.id}`,
        statusUrl: `${DOCS_BASE_URL}/api/mini-apps/${app.id}`,
        previewUrl: app.home_url,
      },
      { status: outcome === "create" ? 201 : 200 },
    );
  } catch (e) {
    return jsonError(e);
  }
}
```

Check that `GET /api/mini-apps/[id]` answers public callers for non-live apps with at least `status`. If it 404s for pending apps without a wallet, change `statusUrl` to `${DOCS_BASE_URL}/dashboard/mini-apps/${app.id}` and drop the separate field. Don't widen what that route exposes.

- [ ] **Step 3: owner route (admin)**

```ts
// apps/web/src/app/api/mini-apps/owner/route.ts
// POST /api/mini-apps/owner { id, wallet } — admin reassigns an app's owner.
import { NextResponse } from "next/server";
import { setAppOwner } from "@/lib/miniapp";
import { jsonError, requireAdmin } from "@/lib/miniapp/http";
import { MiniAppError } from "@/lib/miniapp/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string; wallet?: string };
    await requireAdmin(req);
    if (!body.id || !body.wallet) throw new MiniAppError("invalid_params", "id und wallet sind erforderlich.");
    return NextResponse.json({ app: await setAppOwner(body.id, body.wallet) });
  } catch (e) {
    return jsonError(e);
  }
}
```

Before writing it, open `apps/web/src/app/api/mini-apps/review/route.ts` and copy its exact `requireAdmin` call signature and usage (it may take `(req, body)` and return the reviewer). Match it.

- [ ] **Step 4: cron route + vercel.json**

```ts
// apps/web/src/app/api/cron/mini-apps-reindex/route.ts
// Daily re-index of every self-hosted mini-app manifest (spec §5).
import { NextRequest, NextResponse } from "next/server";
import { reindexAll } from "@/lib/miniapp/indexing";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await reindexAll());
}
```

Add to `apps/web/vercel.json` `crons`:

```json
    {
      "path": "/api/cron/mini-apps-reindex",
      "schedule": "0 5 * * *"
    }
```

- [ ] **Step 5: MCP tool**

In `apps/web/src/app/api/[transport]/route.ts`, add an import `import { indexOrigin } from "@/lib/miniapp/indexing";`. Then add after the `submit_external_app` tool:

```ts
    server.tool(
      "register_app_url",
      "Register or re-index a SELF-HOSTED mini app: the app's origin must serve /.well-known/roebel-miniapp.json ({ owner, miniapp:{…} }). No API key needed. Recipe: " +
        `${DOCS_BASE_URL}/mini-apps/publish.md`,
      { url: z.string().min(1).describe("Any URL on the app's origin, e.g. https://my-app.vercel.app") },
      async ({ url }) => {
        const { app, outcome } = await indexOrigin(url);
        return json({
          outcome,
          app: appSummary(app),
          dashboardUrl: `${DOCS_BASE_URL}/dashboard/mini-apps/${app.id}`,
        });
      },
    );
```

Also extend the `get_started` text with one line after the "Hosted apps" line:
`Self-hosted (recommended for Vercel/Lovable/own server): serve /.well-known/roebel-miniapp.json, then register_app_url {url} — recipe ${DOCS_BASE_URL}/mini-apps/publish.md.`

- [ ] **Step 6: Smoke-test locally**

Run `pnpm dev:web`, then:
```bash
curl -s "http://localhost:3000/api/mini-apps/validate?url=https://example.com" | head -c 400; echo
curl -s -X POST localhost:3000/api/mini-apps/register -H 'content-type: application/json' -d '{"url":"https://example.com"}' | head -c 400; echo
curl -s -X POST localhost:3000/api/mini-apps/register -H 'content-type: application/json' -d '{"url":"http://127.0.0.1"}' | head -c 400; echo
```
Expected:
- `{"ok":false,…"Manifest nicht gefunden (404)…"}`
- `{"error":"Manifest nicht gefunden (404)…","code":"invalid_params"}`
- `"Nur https-URLs…"`

If the local env lacks the Supabase service key, the validate call still works (no DB) and register returns a 500 from the DB step. Note that and move on; the end-to-end check is Task 9.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/mini-apps/validate/route.ts apps/web/src/app/api/mini-apps/register/route.ts apps/web/src/app/api/mini-apps/owner/route.ts apps/web/src/app/api/cron/mini-apps-reindex/route.ts apps/web/vercel.json "apps/web/src/app/api/[transport]/route.ts"
git commit -m "feat(web): register/validate API, daily re-index cron, MCP register_app_url"
git push
```

---

### Task 7: Agent recipe `publish.md` + llms links

**Files:**
- Create: `apps/web/src/lib/miniapp/publishDoc.ts` (pure)
- Create: `apps/web/src/app/mini-apps/publish.md/route.ts`
- Modify: `apps/web/src/lib/miniapp/devdocs.ts` (`buildLlmsIndexTxt` + `buildLlmsFullTxt` link the recipe)
- Test: `apps/web/tests/miniapp-publish-doc.test.ts`

**Interfaces:**
- Produces: `buildPublishMd(base: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/miniapp-publish-doc.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublishMd } from "../src/lib/miniapp/publishDoc";

test("publish.md contains every step an agent needs", () => {
  const md = buildPublishMd("https://www.roebel.app");
  for (const needle of [
    "/.well-known/roebel-miniapp.json",
    "sdk.actions.ready()",
    "@netizen-labs/miniapp-sdk",
    "https://www.roebel.app/sdk/miniapp-sdk.mjs",
    "https://www.roebel.app/api/mini-apps/validate?url=",
    "https://www.roebel.app/api/mini-apps/register",
    '"owner"',
    "frame-ancestors",
    "public/.well-known/",
    "dashboardUrl",
  ]) {
    assert.ok(md.includes(needle), `missing: ${needle}`);
  }
  assert.ok(md.length < 8000, "keep the recipe short");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec tsx --test apps/web/tests/miniapp-publish-doc.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `publishDoc.ts`**

```ts
// apps/web/src/lib/miniapp/publishDoc.ts
// The one-page agent recipe served at /mini-apps/publish.md. A builder tells
// their agent: "Lies <base>/mini-apps/publish.md und veröffentliche diese App
// im Röbel Mini App Store." Keep it short and imperative.
export function buildPublishMd(base: string): string {
  return `# Publish a mini app to the Röbel Mini App Store

You are an AI agent helping a builder publish their web app as a Röbel mini app.
The app stays on the builder's own hosting. Röbel only indexes a manifest file.
Röbel is a small town in Germany; app UI copy must be **German**.

## 1. Add the SDK and signal readiness
The host shows a splash screen until the app calls \`sdk.actions.ready()\`.

npm (React/Vite/Next):
\`\`\`bash
npm install @netizen-labs/miniapp-sdk
\`\`\`
\`\`\`ts
import { sdk } from "@netizen-labs/miniapp-sdk";
// after the first screen has rendered:
sdk.actions.ready();
\`\`\`

Plain HTML:
\`\`\`html
<script type="module">
  import { sdk } from "${base}/sdk/miniapp-sdk.mjs";
  sdk.actions.ready();
</script>
\`\`\`
Full SDK reference: ${base}/mini-apps/llms-full.txt

## 2. Allow embedding
The app runs inside an iframe/WebView. Do not send \`X-Frame-Options: DENY|SAMEORIGIN\`,
and if you set a CSP, use \`frame-ancestors *\`.

## 3. Deploy
Any https host works (Vercel, Netlify, Lovable, own server). Use the production URL,
on the default port, with no login wall in front of the app.

## 4. Add the manifest
Serve this JSON at \`https://<your-app-domain>/.well-known/roebel-miniapp.json\`.
For Next.js, Vite and Lovable that means the file \`public/.well-known/roebel-miniapp.json\`.

\`\`\`json
{
  "owner": "0x…",
  "miniapp": {
    "version": "1",
    "name": "App-Name (max. 32 Zeichen)",
    "homeUrl": "https://<your-app-domain>/",
    "iconUrl": "https://<your-app-domain>/icon.png",
    "description": "Ein Satz auf Deutsch (max. 200 Zeichen).",
    "category": "games",
    "tags": ["stadt"],
    "screenshots": [],
    "permissions": [],
    "primaryColor": "#00498B"
  }
}
\`\`\`
- \`owner\`: the builder's Röbel wallet address. If you don't know it, **ask the builder**.
  They find it in the Röbel App under Profil, or on ${base}/dashboard/mini-apps after logging in.
- \`homeUrl\` must be on the same domain as the manifest.
- \`category\`: community, governance, finance, utility, games, education, news, culture, environment.
- \`permissions\` (only what you use): wallet, rewards, notifications, circles, share.
- \`iconUrl\`: square PNG, ideally 1024×1024.
- Optional \`slug\` (a–z, 0–9, "-"); otherwise one is derived from the name.

## 5. Validate, then register
\`\`\`bash
curl -s "${base}/api/mini-apps/validate?url=https://<your-app-domain>"
curl -s -X POST ${base}/api/mini-apps/register \\
  -H 'content-type: application/json' \\
  -d '{"url":"https://<your-app-domain>"}'
\`\`\`
Fix every error from \`validate\` before registering, and tell the builder about any warnings.
\`register\` returns \`dashboardUrl\`. Give that link to the builder. The app is
"In Prüfung" until the Röbel team approves it.

## Updating later
Change the manifest, deploy, and call \`register\` again (or wait for the daily re-index).
Changes to a live app go live after review; the current version stays visible until then.
MCP alternative: tool \`register_app_url\` on ${base}/api/mcp.
`;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm exec tsx --test apps/web/tests/miniapp-publish-doc.test.ts`
Expected: PASS.

- [ ] **Step 5: Route + llms links**

```ts
// apps/web/src/app/mini-apps/publish.md/route.ts
// GET /mini-apps/publish.md — the agent recipe for self-hosted mini apps.
import { buildPublishMd } from "@/lib/miniapp/publishDoc";
import { DOCS_BASE_URL } from "@/lib/miniapp/devdocs";

export const dynamic = "force-static";

export async function GET() {
  return new Response(buildPublishMd(DOCS_BASE_URL), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "access-control-allow-origin": "*",
    },
  });
}
```

In `devdocs.ts`, open `buildLlmsIndexTxt` and add a first entry under its links list in the same format it uses for the other entries:
`- [Publish a self-hosted app](${DOCS_BASE_URL}/mini-apps/publish.md): deploy anywhere, add /.well-known/roebel-miniapp.json, register with one call`
In the "ways to build" text of `buildLlmsFullTxt` (the block starting `A) **AI editor (KI-Baukasten)**`), add a new entry at the start:
`0) **Self-hosted + manifest (recommended for Claude Code / Codex / Lovable)** — ${DOCS_BASE_URL}/mini-apps/publish.md`

Verify the route folder name works: Next treats `publish.md` as a static segment, the same way `llms.txt/route.ts` already does in this folder.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/miniapp/publishDoc.ts apps/web/src/app/mini-apps/publish.md/route.ts apps/web/src/lib/miniapp/devdocs.ts apps/web/tests/miniapp-publish-doc.test.ts
git commit -m "feat(web): /mini-apps/publish.md agent recipe for self-hosted apps"
git push
```

---

### Task 8: Landing page, dashboard + admin UI, Sommercamp removal

**Files:**
- Create: `apps/web/src/app/mini-apps/page.tsx`
- Create: `apps/web/src/components/mini-apps/AddByUrlDialog.tsx`
- Create: `apps/web/src/components/mini-apps/IndexedSourceCard.tsx`
- Modify: `apps/web/src/app/dashboard/mini-apps/page.tsx` (remove `SommercampWelcome` + its use at ~line 302 + unused imports `PartyPopper`, `X` if now unused; add the "Per URL hinzufügen" button that opens `AddByUrlDialog`)
- Modify: `apps/web/src/app/dashboard/mini-apps/[id]/page.tsx` (render `IndexedSourceCard` when `app.origin`)
- Modify: `apps/web/src/app/admin/dashboard/mini-apps/page.tsx` (tab `pending` query → `needsReview=1`; show "Update" badge when `app.pending_update`)
- Modify: `apps/web/src/app/admin/dashboard/mini-apps/[id]/page.tsx` (render `IndexedSourceCard` with `admin` prop; manifest diff of latest pending version vs live fields; owner change)
- Modify: `apps/web/src/components/sommercamp/RegistrationCard.tsx` (`StartGate`)
- Modify: `apps/web/src/app/developers/mini-apps/page.tsx` (add the self-hosted path)

**Interfaces:**
- Consumes: `POST /api/mini-apps/register`, `POST /api/mini-apps/owner`, `miniAppWrite` and `useMiniAppApi` from `components/mini-apps/client.ts`, `useWalletAddress`, the `Card`/`Button` UI primitives, `MiniAppRow` fields from Task 4.
- Produces:
  - `<AddByUrlDialog wallet={string|null} onRegistered={(appId: string) => void} />`
  - `<IndexedSourceCard app={MiniAppRow} wallet={string|null} onReindexed={() => void} admin?: boolean />`

- [ ] **Step 1: `IndexedSourceCard`**

```tsx
// apps/web/src/components/mini-apps/IndexedSourceCard.tsx
"use client";

// Source panel for self-hosted (indexed) apps: where the manifest lives, when
// it was last read, the last error, and a manual re-index.
import { useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MiniAppRow } from "@/lib/miniapp/types";
import { timeAgo } from "@/components/admin/muenzen/format";

export function IndexedSourceCard({
  app,
  wallet,
  onReindexed,
  admin = false,
}: {
  app: MiniAppRow;
  wallet: string | null;
  onReindexed: () => void;
  admin?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reindex() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mini-apps/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: app.origin, ...(admin || !wallet ? {} : { expectedOwner: wallet }) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Fehler ${res.status}`);
      setMsg(
        body.outcome === "touch"
          ? "Keine Änderungen am Manifest."
          : body.app.pending_update
            ? "Neue Version erkannt — geht nach der Prüfung live."
            : "Manifest übernommen.",
      );
      onReindexed();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Eigenes Hosting</p>
          <a href={app.manifest_url ?? "#"} target="_blank" rel="noreferrer" className="block truncate text-xs text-[#00498B] underline">
            {app.manifest_url}
          </a>
          <p className="mt-1 text-xs text-muted-foreground">
            Zuletzt gelesen: {app.last_indexed_at ? timeAgo(app.last_indexed_at) : "—"}
            {app.pending_update ? " · Update in Prüfung" : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={reindex} disabled={busy}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          Manifest neu laden
        </Button>
      </div>
      {app.index_error && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {app.index_error}
        </p>
      )}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </Card>
  );
}
```

Check that `timeAgo` accepts an ISO string. The `[id]` page already imports it from the same path.

- [ ] **Step 2: `AddByUrlDialog`**

```tsx
// apps/web/src/components/mini-apps/AddByUrlDialog.tsx
"use client";

// "Per URL hinzufügen": register a self-hosted app whose manifest names the
// logged-in wallet as owner.
import { useState } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AddByUrlDialog({
  wallet,
  onRegistered,
}: {
  wallet: string | null;
  onRegistered: (appId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mini-apps/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, expectedOwner: wallet }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Fehler ${res.status}`);
      setOpen(false);
      setUrl("");
      onRegistered(body.app.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!wallet}>
        <Link2 className="mr-1 h-3.5 w-3.5" />
        Per URL hinzufügen
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setOpen(false)}>
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-base font-semibold">App per URL hinzufügen</p>
          <p className="text-sm text-muted-foreground">
            Deine App muss unter <code>/.well-known/roebel-miniapp.json</code> ein Manifest mit deiner Wallet als{" "}
            <code>owner</code> haben.{" "}
            <Link href="/mini-apps/publish.md" target="_blank" className="text-[#00498B] underline">
              Anleitung
            </Link>
          </p>
          <input
            type="url"
            required
            placeholder="https://meine-app.vercel.app"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-md border border-[#B4B8C1] px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Prüfe …" : "Hinzufügen"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
```

If `Card` does not forward `onClick`, wrap its content in a `<div onClick={(e) => e.stopPropagation()}>` instead.

- [ ] **Step 3: Wire into the dashboard**

- `dashboard/mini-apps/page.tsx`:
  - Delete the `SommercampWelcome` function and its `<SommercampWelcome />` usage.
  - Remove imports that are now unused (`PartyPopper`, `X`, `useSearchParams`/`useRouter`, but only if nothing else uses them; check with grep).
  - Place `<AddByUrlDialog wallet={wallet} onRegistered={(id) => router.push(`/dashboard/mini-apps/${id}`)} />` next to the existing create/import action in the header area. Find it with `grep -n "/editor\|import" page.tsx`.
- `dashboard/mini-apps/[id]/page.tsx`: directly under the page header, render `{app?.origin && <IndexedSourceCard app={app} wallet={wallet} onReindexed={refresh} />}`. Also hide the "Pencil" manifest-edit button when `app.origin` is set (indexed apps are edited in their manifest file). Show the hint text `Bearbeite das Manifest auf deiner Domain und lade es neu.` in its place.

- [ ] **Step 4: Admin**

- `admin/dashboard/mini-apps/page.tsx`:
  - Change the pending tab to `{ key: "pending", label: "In Prüfung", query: "needsReview=1" }`.
  - Next to `<StatusBadge status={app.status} />` add `{app.pending_update && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Update</span>}`.
- `admin/dashboard/mini-apps/[id]/page.tsx`:
  - Render `<IndexedSourceCard app={app} wallet={null} onReindexed={refresh} admin />` when `app.origin`.
  - Add a "Änderungen" block when `app.pending_update`. Find the latest version with `status === "pending"` in the already-loaded `versions`, then list the fields where it differs from the live row. Diff these keys: name ↔ `name`, description ↔ `description`, iconUrl ↔ `icon_url`, homeUrl ↔ `home_url`, category ↔ `category`, tags ↔ `tags`, screenshots ↔ `screenshots`, permissions ↔ `permissions`, primaryColor ↔ `primary_color`. Render each as `label: alt → neu`, JSON-stringify arrays.
  - Add a "Besitzer ändern" input + button that POSTs `{ id, wallet }` to `/api/mini-apps/owner`. Use the admin write helper the page already uses for `review` (find it with `grep -n "review" page.tsx`) so the admin auth headers match.

- [ ] **Step 5: Sommercamp + developer docs**

In `RegistrationCard.tsx` replace the `StartGate` body:

```tsx
function StartGate() {
  return (
    <>
      <p className="text-base text-[#3D4E68]">
        Danke für deine Anmeldung! Alles rund um Mini-Apps findest du jetzt auf einer eigenen Seite.
      </p>
      <Link
        href="/mini-apps"
        className="mt-1 rounded-full bg-[#00498B] px-6 py-3 text-base font-bold text-white"
      >
        Zu den Röbel Mini Apps
      </Link>
    </>
  );
}
```

Update the comments above `StartGate` and at the top of the file so they no longer say it opens the KI-Baukasten. Grep the Sommercamp API route for a redirect to `/dashboard/mini-apps?welcome=sommercamp` and the confirmation email for the same link. If the link exists there, point it to `${DOCS_BASE_URL}/mini-apps` (email) or remove it (route).

In `developers/mini-apps/page.tsx` add a first card to the "ways to build" list, in the same markup as its siblings: title "Eigenes Hosting + Manifest", text "Deploy auf Vercel, Netlify oder Lovable, Manifest unter /.well-known/roebel-miniapp.json ablegen, mit einem Aufruf registrieren. Ideal für Claude Code und Codex.", link `/mini-apps/publish.md`.

- [ ] **Step 6: Landing page `/mini-apps`**

```tsx
// apps/web/src/app/mini-apps/page.tsx
// Placeholder landing for the Röbel Mini Apps platform (spec 2026-10-10 §6).
// Also the target of the bare roebel.site redirect in next.config.mjs.
import type { Metadata } from "next";
import Link from "next/link";
import { DOCS_BASE_URL } from "@/lib/miniapp/devdocs";

export const metadata: Metadata = {
  title: "Röbel Mini Apps",
  description: "Bau Apps für Röbel — mit KI, deinem eigenen Agenten oder deinem eigenen Hosting.",
};

const AGENT_PROMPT = `Lies ${DOCS_BASE_URL}/mini-apps/publish.md und veröffentliche diese App im Röbel Mini App Store.`;

const WAYS = [
  {
    title: "Mit KI bauen",
    text: "Beschreib deine Idee im KI-Baukasten. Wir hosten die App für dich.",
    href: "/editor",
    cta: "KI-Baukasten öffnen",
  },
  {
    title: "Mit deinem Agenten",
    text: "Claude Code, Codex oder Cursor? Gib deinem Agenten diesen Satz:",
    prompt: AGENT_PROMPT,
    href: "/mini-apps/publish.md",
    cta: "Anleitung ansehen",
  },
  {
    title: "Eigenes Hosting",
    text: "Deine App läuft schon auf Vercel, Netlify oder Lovable? Manifest ablegen und per URL hinzufügen.",
    href: "/dashboard/mini-apps",
    cta: "Zum Dashboard",
  },
];

export default function MiniAppsLanding() {
  return (
    <main className="min-h-screen bg-white px-4 py-16 text-[#111827]">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#00498B]">Röbel Mini Apps</p>
        <h1 className="mt-2 font-[family-name:var(--font-jakarta)] text-4xl font-bold leading-tight md:text-5xl">
          Bau eine App für Röbel.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[#6B7280]">
          Mini-Apps laufen direkt in der Röbel App, für alle in der Stadt. Bau sie, wie du willst. Nach
          einer kurzen Prüfung ist sie live.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {WAYS.map((w) => (
            <div key={w.title} className="flex flex-col rounded-lg border border-[#B4B8C1] p-5">
              <h2 className="text-lg font-semibold">{w.title}</h2>
              <p className="mt-2 flex-1 text-sm text-[#6B7280]">{w.text}</p>
              {w.prompt && (
                <code className="mt-3 block rounded-md bg-[#F3F4F6] p-3 text-xs leading-relaxed">{w.prompt}</code>
              )}
              <Link href={w.href} className="mt-4 text-sm font-semibold text-[#00498B] underline">
                {w.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/dashboard/mini-apps" className="rounded-full bg-[#00498B] px-6 py-3 text-sm font-bold text-white">
            Zum Dashboard
          </Link>
          <Link href="/developers/mini-apps" className="rounded-full border border-[#B4B8C1] px-6 py-3 text-sm font-semibold">
            Doku für Entwickler
          </Link>
        </div>
      </div>
    </main>
  );
}
```

Check the font variable name used for Plus Jakarta Sans in `apps/web/src/app/layout.tsx` (grep `Jakarta`) and use that one. If none is exposed as a CSS variable, drop the `font-[…]` class. Check dark mode: if the site's root layout applies a dark theme class, add the `dark:` equivalents (`dark:bg-[#18191B] dark:text-white dark:border-[#3A3B3E]`) the same way `developers/mini-apps/page.tsx` does.

- [ ] **Step 7: Verify in the browser**

Run `pnpm dev:web` and open:
- `/mini-apps` at 375 px and 1280 px width: no horizontal scroll.
- `/sommercamp` while registered: the CTA goes to `/mini-apps`.
- `/dashboard/mini-apps`: no welcome banner; the "Per URL hinzufügen" dialog opens and shows the server error for `https://example.com`.

Take one screenshot pass with headless Chrome (see memory `reference_headless_chrome_cdp_screenshots`), no more.

- [ ] **Step 8: Typecheck the touched files, then commit**

```bash
cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "mini-apps|sommercamp|IndexedSourceCard|AddByUrlDialog" ; cd ../..
git add apps/web/src/app/mini-apps/page.tsx apps/web/src/components/mini-apps/AddByUrlDialog.tsx apps/web/src/components/mini-apps/IndexedSourceCard.tsx apps/web/src/app/dashboard/mini-apps/page.tsx "apps/web/src/app/dashboard/mini-apps/[id]/page.tsx" apps/web/src/app/admin/dashboard/mini-apps/page.tsx "apps/web/src/app/admin/dashboard/mini-apps/[id]/page.tsx" apps/web/src/components/sommercamp/RegistrationCard.tsx apps/web/src/app/developers/mini-apps/page.tsx
git commit -m "feat(web): /mini-apps landing, add-by-URL + manifest source in dashboards, drop Sommercamp mini-app CTA"
git push
```

Add any Sommercamp route or email file you changed in Step 5 to the `git add`.

---

### Task 9: End-to-end check on production

**Files:** none in the repo (a throwaway sample in the scratchpad).

- [ ] **Step 1: Wait for the Vercel production deploy of `main` to be READY** (Vercel MCP `list_deployments` for the web project). Then confirm `curl -s https://www.roebel.app/mini-apps/publish.md | head -3` returns the recipe.

- [ ] **Step 2: Deploy a throwaway sample.** Create a static folder in the scratchpad containing:
  - `index.html` (German, with the CDN SDK import and `sdk.actions.ready()`)
  - `.well-known/roebel-miniapp.json` with `owner` = Max's dashboard wallet (ask Max if unknown), name "E2E Testapp", category utility
  - `vercel.json` setting `content-type: application/json` for `/.well-known/(.*)`

  Deploy it with `npx vercel --prod --yes` as a new throwaway project.

- [ ] **Step 3: Exercise the flow.** Call `validate` (expect `ok:true`), then `register` (expect 201 + `dashboardUrl`), then `register` again (expect `outcome:"touch"`).

- [ ] **Step 4: Check the update path.** Approve the app in admin. Edit the manifest `description`, redeploy, and register again. Expect `outcome:"stage-version"`, `pending_update:true`, the app still `live`, and the admin queue showing it with the "Update" badge and the diff. Approve: the description changes and `pending_update` is false.

- [ ] **Step 5: Clean up.**
  - Delete the sample Vercel project.
  - In Supabase (MCP, verify the project URL first), delete the test app's `mini_app_versions` and `mini_apps` rows by `origin`.
  - Report the evidence (curl outputs) to Max.

- [ ] **Step 6: Save a memory.** Write a project memory: self-hosted manifest indexing live, endpoints, `pending_update` semantics, the Stadtstack repo still blocked on access. Add its index line to `MEMORY.md`.

---

### Task 10 (blocked until repo access): Stadtstack game

Do not start this until `gh repo view GiraeffleAeffle/stadtstack-spiel` succeeds for Max's account.

- [ ] Clone it into the scratchpad. Inspect the framework and hosting.
- [ ] On a branch in **their** repo:
  - Add `@netizen-labs/miniapp-sdk` plus `sdk.actions.ready()` after the first render.
  - Add `public/.well-known/roebel-miniapp.json` (owner = the contributor's Röbel wallet, which you ask them for; category `games`).
  - Remove any `X-Frame-Options`/`frame-ancestors` restriction.
- [ ] Open a PR with a German/English description of the three changes and the link `https://www.roebel.app/mini-apps/publish.md`.
- [ ] After they deploy: `register`, then Max approves, then check in the Expo dev-preview host.
