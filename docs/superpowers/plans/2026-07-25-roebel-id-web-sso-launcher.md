# apps/web Seamless SSO Launcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a citizen/org already wallet-logged-in on `apps/web` open an office app (Nextcloud) and land authenticated with no manual second login — via silent auto-auth on the Röbel ID login page plus a launcher UI in `apps/web`.

**Architecture:** Two units. (1) Röbel ID's login page (`apps/roebel-id`) gains an additive silent path: `autoConnect` on load → auto-sign the SIWE → auto-submit to the *same* existing endpoints (no server change). (2) `apps/web` gets a config-driven launcher that renders tiles linking to the office apps; the office app remains the OIDC relying party. `apps/web` is NOT an OIDC client and issues no tokens.

**Tech Stack:** `apps/roebel-id` (TypeScript, vitest — existing). `apps/web` (Next.js 15, React, Tailwind; **no React test runner** — pure logic is tested via Node's built-in runner: root `pnpm test:web` = `tsx --test apps/web/tests/*.test.ts`).

## Global Constraints

- **pnpm only.** Two packages touched: `apps/roebel-id` and `apps/web`.
- **Röbel ID login page:** the change is **additive** to the browser `<script>`; the SIWE `statement` MUST stay ASCII (`'Anmeldung bei Roebel ID'`); `apps/roebel-id/src/interaction/router.ts` is **unchanged** (the auto path posts the identical `{message,signature}` to `/interaction/:uid/login`).
- **apps/web conventions (follow existing):** per-feature config lives under `src/lib/<feature>/` (NOT a new `src/config/`); `NEXT_PUBLIC_*` read directly via `process.env` with a falsy-hide (`?? ''`); navy is the arbitrary Tailwind value `bg-[#00498B]` with hover `bg-[#143a72]`; match the existing `QuickAction` tile pattern in `apps/web/src/app/dashboard/page.tsx`.
- **apps/web has NO vitest/jest.** Do not add one. Test pure logic with `node:test` + `node:assert/strict` in `apps/web/tests/*.test.ts` (flat dir), run via `pnpm test:web` from repo root. React components have no unit-test path here — verify by typecheck/inspection.
- **apps/web typecheck/build is heavy (~8GB heap).** Prefer targeted verification; a full build per task is impractical in this environment — see each task's verify step.
- **Graceful pre-deploy:** the launcher renders nothing until an office-app URL is configured, so this merges safely before Nextcloud is live.
- **Operational (not code):** apps/web and Röbel ID must use the SAME thirdweb project for the warm-path to be silent (already on the keystone rollout list).

---

### Task 1: Röbel ID login page — silent auto-auth

**Files:**
- Modify: `apps/roebel-id/src/interaction/login-page.ts`
- Test: `apps/roebel-id/test/login-page.test.ts`

**Interfaces:**
- Consumes: nothing new (`renderLoginPage(uid, thirdwebClientId, chainId)` signature unchanged).
- Produces: same `renderLoginPage` export; the emitted page now attempts silent sign-in on load and falls back to the button.

- [ ] **Step 1: Write the failing test** `apps/roebel-id/test/login-page.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { renderLoginPage } from '../src/interaction/login-page.js'

describe('login page auto-auth', () => {
  const html = renderLoginPage('uid-123', 'tw-client', 100)

  it('keeps the SIWE statement ASCII-only', () => {
    // The signed statement must be ASCII (siwe@3 EIP-4361 ABNF).
    const m = html.match(/statement:\s*'([^']*)'/)
    expect(m).not.toBeNull()
    // eslint-disable-next-line no-control-regex
    expect(/^[\x00-\x7F]*$/.test(m![1])).toBe(true)
    expect(m![1]).toBe('Anmeldung bei Roebel ID')
  })

  it('attempts a silent autoConnect on load (seamless path)', () => {
    expect(html).toContain('autoConnect(')
  })

  it('still renders the manual fallback button', () => {
    expect(html).toContain('id="login"')
  })

  it('shares one sign-in routine for both paths (no duplicated fetch/login block)', () => {
    // exactly one POST to the login endpoint in the emitted script
    const occurrences = (html.match(/\/interaction\/\$\{uid\}\/login|\/interaction\/uid-123\/login/g) || []).length
    expect(occurrences).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm --filter @roebel/roebel-id test login-page`
Expected: FAIL (no `autoConnect(` in output; possibly duplicated login block).

- [ ] **Step 3: Modify `login-page.ts`** — refactor the browser script so connect+sign+post live in one `runLogin(account)`, add a 3s-timeout `autoConnect` auto-path, keep the button as fallback. Replace the existing `<script type="module">…</script>` block with:

```html
<script type="module">
  import { createThirdwebClient } from 'https://esm.sh/thirdweb@5'
  import { inAppWallet } from 'https://esm.sh/thirdweb@5/wallets'
  import { SiweMessage } from 'https://esm.sh/siwe@3'
  const client = createThirdwebClient({ clientId: '${thirdwebClientId}' })
  const status = document.getElementById('status')
  const btn = document.getElementById('login')
  const wallet = inAppWallet({ smartAccount: { chain: { id: ${chainId} }, sponsorGas: true } })

  async function runLogin(account) {
    status.textContent = 'Anmeldung läuft…'
    const nonce = await (await fetch('/interaction/${uid}/nonce')).text()
    const message = new SiweMessage({ domain: location.host, address: account.address, uri: location.origin,
      version: '1', chainId: ${chainId}, nonce, statement: '${SIWE_STATEMENT}',
      expirationTime: new Date(Date.now()+120000).toISOString() }).prepareMessage()
    const signature = await account.signMessage({ message })
    const res = await fetch('/interaction/${uid}/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, signature }) })
    if (res.redirected) location.href = res.url
    else { const j = await res.json(); location.href = j.redirectTo }
  }

  btn.onclick = async () => {
    try { status.textContent = 'Verbinde…'; const account = await wallet.connect({ client, strategy: 'iframe' }); await runLogin(account) }
    catch (e) { status.textContent = 'Anmeldung fehlgeschlagen: ' + e.message }
  }

  // Seamless path: if a wallet session is already warm on this origin, sign in with no click.
  ;(async () => {
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
      const account = await Promise.race([wallet.autoConnect({ client }), timeout])
      if (account) await runLogin(account)
    } catch { /* cold origin — the user taps the button */ }
  })()
</script>
```

(`SIWE_STATEMENT` const at the top of the file is unchanged.)

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm --filter @roebel/roebel-id test login-page`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full roebel-id suite — no regression**

Run: `pnpm --filter @roebel/roebel-id test`
Expected: PASS (prior 24 + new 4 = 28), pristine.

- [ ] **Step 6: Commit**

```bash
git add apps/roebel-id/src/interaction/login-page.ts apps/roebel-id/test/login-page.test.ts
git commit -m "feat(roebel-id): silent auto-auth on the login page (seamless SSO)"
```

---

### Task 2: apps/web office-apps config module

**Files:**
- Create: `apps/web/src/lib/sovereign-apps/office-apps.ts`
- Test: `apps/web/tests/office-apps.test.ts`

**Interfaces:**
- Produces: `interface OfficeApp { key: string; name: string; description: string; url: string }`; `buildOfficeApps(env: Record<string,string|undefined>): OfficeApp[]` (pure; hides apps with empty/absent URL); `getOfficeApps(): OfficeApp[]` (wraps `process.env`).

- [ ] **Step 1: Write the failing test** `apps/web/tests/office-apps.test.ts`

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOfficeApps } from '../src/lib/sovereign-apps/office-apps'

test('includes the Nextcloud tile when the URL is set', () => {
  const apps = buildOfficeApps({ NEXT_PUBLIC_NEXTCLOUD_URL: 'https://cloud.roebel.app' })
  assert.equal(apps.length, 1)
  assert.equal(apps[0].url, 'https://cloud.roebel.app')
  assert.equal(apps[0].key, 'nextcloud')
})

test('hides apps whose URL is unset or blank (graceful pre-deploy)', () => {
  assert.deepEqual(buildOfficeApps({}), [])
  assert.deepEqual(buildOfficeApps({ NEXT_PUBLIC_NEXTCLOUD_URL: '   ' }), [])
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm test:web` (from repo root)
Expected: FAIL (module not found).

- [ ] **Step 3: Create `apps/web/src/lib/sovereign-apps/office-apps.ts`**

```ts
export interface OfficeApp {
  key: string
  name: string
  description: string
  url: string
}

interface CatalogEntry {
  key: string
  name: string
  description: string
  urlEnv: string
}

// The office apps the launcher can surface. Add rows here as more apps come online.
const CATALOG: CatalogEntry[] = [
  {
    key: 'nextcloud',
    name: 'Dateien & Dokumente',
    description: 'Deine Dateien, Dokumente und Kalender',
    urlEnv: 'NEXT_PUBLIC_NEXTCLOUD_URL',
  },
]

// Pure: build the visible list from an env map. An app whose URL is unset/blank is hidden,
// so the launcher renders nothing until the app is actually deployed and configured.
export function buildOfficeApps(env: Record<string, string | undefined>): OfficeApp[] {
  return CATALOG
    .map((e) => ({ key: e.key, name: e.name, description: e.description, url: (env[e.urlEnv] ?? '').trim() }))
    .filter((a) => a.url.length > 0)
}

export function getOfficeApps(): OfficeApp[] {
  return buildOfficeApps({ NEXT_PUBLIC_NEXTCLOUD_URL: process.env.NEXT_PUBLIC_NEXTCLOUD_URL })
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `pnpm test:web`
Expected: PASS (the two new tests, plus any pre-existing `apps/web/tests/*` staying green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sovereign-apps/office-apps.ts apps/web/tests/office-apps.test.ts
git commit -m "feat(web): office-apps launcher config (graceful pre-deploy)"
```

---

### Task 3: apps/web SovereignAppsLauncher component

**Files:**
- Create: `apps/web/src/components/sovereign-apps/SovereignAppsLauncher.tsx`

**Interfaces:**
- Consumes: `getOfficeApps` from Task 2.
- Produces: `SovereignAppsLauncher({ title?, className? })` — renders a titled card of office-app tiles; returns `null` when no apps are configured.

- [ ] **Step 1: Create the component**

```tsx
import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { getOfficeApps } from '@/lib/sovereign-apps/office-apps'

export function SovereignAppsLauncher({
  title = 'Büro & Werkzeuge',
  className = '',
}: {
  title?: string
  className?: string
}) {
  const apps = getOfficeApps()
  if (apps.length === 0) return null

  return (
    <section className={`bg-card border border-border rounded-lg p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {apps.map((app) => (
          <Link
            key={app.key}
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:bg-accent transition-colors"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#00498B] text-white flex-shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{app.name}</p>
              <p className="text-xs text-muted-foreground">{app.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it type-checks** (no React test runner exists — this is the verification)

Run (heavy; use the heap flag): `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter web exec tsc --noEmit`
Expected: no NEW type errors referencing `SovereignAppsLauncher` / `office-apps` (the repo has ~431 pre-existing unrelated tsc errors — see [[reference_expo_fonts_loaded]]; confirm none of the errors are in the two new files). If the full typecheck OOMs/does not complete in this environment, instead confirm by inspection that: imports resolve (`@/lib/...`, `lucide-react`, `next/link` all already used elsewhere in the app), props/types match Task 2's `OfficeApp`, and report that full typecheck was not run.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/sovereign-apps/SovereignAppsLauncher.tsx
git commit -m "feat(web): SovereignAppsLauncher tile component"
```

---

### Task 4: Mount the launcher on citizen + dashboard surfaces

**Files:**
- Modify: `apps/web/src/app/app/page.tsx` (citizen home)
- Modify: `apps/web/src/app/dashboard/page.tsx` (org dashboard)
- Modify: `apps/web/src/app/admin/dashboard/page.tsx` (admin dashboard)

**Interfaces:**
- Consumes: `SovereignAppsLauncher` from Task 3. No new exports.

- [ ] **Step 1: Citizen home** — in `apps/web/src/app/app/page.tsx`, import the component and render it for logged-in users, above the feed. This page already uses `useActiveAccount()`; gate on wallet presence:

```tsx
import { SovereignAppsLauncher } from '@/components/sovereign-apps/SovereignAppsLauncher'
// ...inside the render, in the top-level `space-y-4` container, after the tabs/ContextBar and
// before the feed rows:
{account && <SovereignAppsLauncher />}
```

(`account` is the existing `useActiveAccount()` value on this page. `SovereignAppsLauncher` self-hides when no office app is configured, so this is safe pre-deploy.)

- [ ] **Step 2: Org dashboard** — in `apps/web/src/app/dashboard/page.tsx`, render the launcher near the existing "Quick actions" grid:

```tsx
import { SovereignAppsLauncher } from '@/components/sovereign-apps/SovereignAppsLauncher'
// ...render <SovereignAppsLauncher /> as a sibling block adjacent to the Quick actions grid.
```

- [ ] **Step 3: Admin dashboard** — in `apps/web/src/app/admin/dashboard/page.tsx`, render the launcher as a block in the page body:

```tsx
import { SovereignAppsLauncher } from '@/components/sovereign-apps/SovereignAppsLauncher'
// ...render <SovereignAppsLauncher /> as a section in the page body (this page uses shadcn Card
// elsewhere; the launcher is a self-contained card, so drop it in as its own block).
```

- [ ] **Step 4: Verify** (heavy typecheck or inspection, same caveat as Task 3 Step 2)

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter web exec tsc --noEmit`
Expected: no NEW type errors in the three modified pages. If typecheck can't complete here, confirm by inspection that the import path is correct and each insertion is inside valid JSX, and report that full typecheck was not run. Because the component self-hides with no configured URL, these placements are inert until `NEXT_PUBLIC_NEXTCLOUD_URL` is set.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/app/page.tsx apps/web/src/app/dashboard/page.tsx apps/web/src/app/admin/dashboard/page.tsx
git commit -m "feat(web): surface the SSO launcher on citizen + org + admin surfaces"
```

---

## Self-Review

**Spec coverage:**
- §4 Röbel ID silent auto-auth → Task 1.
- §5 apps/web launcher (config + component + placement) → Tasks 2, 3, 4.
- §6 config/env (`NEXT_PUBLIC_NEXTCLOUD_URL`, hide-if-absent) → Task 2 (`buildOfficeApps` filter) + tested.
- §7 graceful pre-deploy → Task 2 filter + Task 3 `return null` + Task 4 inert placement.
- §8 testing → Task 1 (vitest string-assertions + full-suite regression), Task 2 (`node:test`), Tasks 3–4 (typecheck/inspection — honestly noted, since apps/web has no React test runner).
- Out-of-scope items (B/C upgrades, admin/management surface, OIDC-client apps/web, Expo parity) → correctly untasked.

**Placeholder scan:** none — every step has concrete code or a concrete command. Task 3/4 verification honestly states the "typecheck or inspection" fallback because no React runner exists and the app typecheck is heavy; this is a real constraint, not a vague instruction.

**Type consistency:** `OfficeApp` shape identical across Task 2 (definition) and Task 3 (consumption: `app.key/name/description/url`). `getOfficeApps()`/`buildOfficeApps()` names consistent. `renderLoginPage` signature unchanged (Task 1).

**Known-risk note (not a plan gap):** the seamless (silent) path only fires when the Röbel ID origin has a warm thirdweb session; first visit per browser falls back to the button (spec §2). Verifying the *live* silent behavior needs a deployed Röbel ID + Nextcloud + same thirdweb project — a user-gated manual check, not automatable here.

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.
