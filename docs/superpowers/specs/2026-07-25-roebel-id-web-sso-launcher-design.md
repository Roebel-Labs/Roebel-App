# Röbel ID — apps/web Seamless SSO Launcher (Design)

**Date:** 2026-07-25
**Status:** Design (brainstorming output) — awaiting user review before implementation planning
**Scope of THIS spec:** make `apps/web` a first-class participant in the wallet-identity SSO — a citizen/org already wallet-logged-in on `apps/web` can open an open-source office app (Nextcloud first) and land **authenticated with no manual second login**. Builds directly on the shipped keystone.

**Builds on:** [2026-07-24-roebel-id-sso-keystone-design.md](2026-07-24-roebel-id-sso-keystone-design.md) (Röbel ID = the OIDC IdP; Nextcloud = first client — both merged to `main` as `apps/roebel-id`).

---

## 1. Goal & scope

**Goal.** From `apps/web` (where the user is already logged in via thirdweb in-app wallet), one click on an office-app tile ("Dateien/Docs") takes the user into that app **already authenticated as their town identity** — no manual wallet-connect on the way.

**Approach (chosen in brainstorming): A — autoConnect + auto-sign.** The Röbel ID login page auto-connects the thirdweb wallet on load and auto-signs the SIWE, so the OIDC interaction completes without a click **whenever that origin has a warm thirdweb session**; otherwise it falls back to one lightweight thirdweb step. `apps/web` is *not* an OIDC client — it is only the launchpad; the office app remains the relying party. This keeps the change to a login-page tweak + a web UI + config.

**In scope.**
- Röbel ID login page: silent `autoConnect` + auto-sign + auto-submit, with the existing manual button as fallback.
- `apps/web`: a launcher UI (tiles → office apps) on the citizen surface and the org/admin dashboards, driven by config.
- Config: the office-app list + URLs.

**Out of scope (explicit).**
- `apps/web` becoming an OIDC client / logging in *via* Röbel ID (its existing thirdweb auth is untouched).
- The admin/management surface (OIDC clients + sessions in the web admin) — a separate slice.
- Fully-silent-on-first-visit (that is approach B pre-auth handoff or C same-origin proxy — see §7).
- Any new office-app integration beyond linking to already-deployed apps.

**Success criteria.** A citizen logged into `apps/web` clicks "Dateien öffnen" → is taken to Nextcloud → (silent when warm / one lightweight step first time per browser) → lands in Nextcloud as their town identity, with Files/Collabora available. No manual wallet-connect on the warm path.

---

## 2. The honest seamlessness reality (design-critical)

thirdweb's in-app-wallet session is stored **per-origin**. `apps/web` (`roebel.app`) and Röbel ID (`id.roebel.app`) are different origins, so `autoConnect` on the Röbel ID origin is silent **only once that origin already has a session**. Therefore:

- **First launch per browser →** one lightweight thirdweb step on the Röbel ID page (email "continue", possibly an OTP) — same identity, not a full wallet setup.
- **Every launch after →** fully silent via `autoConnect`.

This is the accepted trade-off of approach A. Approaches B (pre-auth handoff) and C (same-origin reverse proxy) remove even the first-time step and are documented as clean upgrades (§7) if the first-tap proves annoying in practice.

**Hard requirement:** `apps/web` and Röbel ID **must use the same thirdweb project** (`THIRDWEB_CLIENT_ID`) — the in-app wallet only auto-connects the same identity within one project. (Already on the keystone rollout list.)

---

## 3. Architecture

```
apps/web (user already wallet-logged-in)
   │  click "Dateien öffnen" (launcher tile)
   ▼
Nextcloud (OIDC client)  ──redirect──▶  Röbel ID /interaction/:uid
                                            │  on load: thirdweb autoConnect()
                                            │   ├─ warm session → silent connect → auto-sign SIWE → auto-submit
                                            │   └─ cold → render existing manual button (email continue → sign)
                                            ▼
                                        back to Nextcloud, authenticated
```

Two units, one config module. Nothing about the OIDC/token machinery changes — only the *interaction UX* (Part 1) and a new *launchpad* (Part 2).

---

## 4. Part 1 — Röbel ID login page: silent auto-auth

**File:** `apps/roebel-id/src/interaction/login-page.ts` (modify).

Current behavior: renders a page whose "Mit Röbel anmelden" button, on click, connects the wallet → fetches a nonce → signs the SIWE → POSTs to the login endpoint.

**Change (additive):** on page load, run an auto-path:
1. Attempt `wallet.autoConnect({ client })` (thirdweb in-app wallet, same project).
2. **If it connects** (warm session): show an "Anmeldung läuft…" state, fetch the nonce, sign the SIWE (ASCII statement — unchanged from the keystone), and auto-`POST` to the existing `/interaction/:uid/login` endpoint, then follow the redirect. No click.
3. **If autoConnect fails/times out** (cold origin): fall back to exactly today's manual button flow (email/social connect → sign). Unchanged.

**Notes / constraints:**
- The server side (`router.ts`, nonce endpoint, verify, consent gate) is **unchanged** — the auto-path posts the same `{message, signature}` the manual path posts. No new endpoint, no new trust surface.
- Auto-signing on load is acceptable for a first-party IdP: the user *initiated* this by clicking the launcher, the page only exists for a legitimate pending `/interaction/:uid`, and the SIWE is signed by the user's own wallet for a login they started. This is standard SSO silent-auth behavior.
- Keep a short `autoConnect` timeout (e.g. 3s) so the cold path falls back promptly instead of hanging.
- The SIWE `statement` stays ASCII (`"Anmeldung bei Roebel ID"`) — the keystone's cross-task rule.

---

## 5. Part 2 — apps/web launcher

**Files (new):**
- `apps/web/src/config/office-apps.ts` — the app catalog: `OfficeApp = { key, name, description, icon, url }`, built from env (`NEXT_PUBLIC_NEXTCLOUD_URL`, etc.). Empty/absent URL → the app is hidden (so the launcher degrades cleanly before Nextcloud is deployed).
- `apps/web/src/components/sovereign-apps/SovereignAppsLauncher.tsx` — renders the configured office apps as tiles; each tile is a link to the app's URL (`target` per app; a deep-link to the app's OIDC login entry if needed). German labels; navy `#00498B` styling; matches the existing dashboard card patterns.

**Placement (reuse existing surfaces):**
- Citizen surface: a "Büro & Werkzeuge" section on `apps/web/src/app/app/` (the citizen home) — visible to logged-in users.
- Org/admin dashboards: a launcher card in `apps/web/src/app/dashboard/` and `apps/web/src/app/admin/dashboard/` shells (staff jump-off).

**Behavior:** clicking a tile navigates to the office-app URL. The office app performs its own OIDC redirect to Röbel ID; Part 1 makes that seamless. `apps/web` does not call Röbel ID directly and issues no tokens itself.

---

## 6. Config & requirements

- **Env (`apps/web`):** `NEXT_PUBLIC_NEXTCLOUD_URL` (+ any future office-app URLs). Absent → the tile is hidden.
- **Same thirdweb project** across `apps/web` and Röbel ID (`THIRDWEB_CLIENT_ID`) — required for warm-path silent auth.
- **Röbel ID deployed** and Nextcloud wired to it (keystone rollout) — the launcher only *links*; it doesn't provision anything.

---

## 7. Constraints & non-goals

- **Auth UX only.** No change to token issuance, claims, consent, or the adapter.
- **First-visit step remains** under approach A (see §2). B/C are the documented upgrades:
  - **B (pre-auth handoff):** `apps/web` signs a SIWE for Röbel ID and establishes the IdP session before redirecting — zero interaction even cross-origin; needs a new secure `establish-session` endpoint with CSRF/nonce binding.
  - **C (same-origin proxy):** serve Röbel ID under `roebel.app/id` so the thirdweb session is shared and `autoConnect` is reliably silent.
- **No admin/management surface** (separate slice).
- **Graceful pre-deploy:** with no office-app URL configured, the launcher renders nothing (no broken tiles) — so this can merge before Nextcloud is live.

---

## 8. Testing strategy

- **Röbel ID login page (Part 1):** since it is browser JS in a template string, add a unit test around any extracted pure helper (e.g. an `shouldAutoSubmit`/auto-path decision or the SIWE-message builder) rather than the DOM. Assert the ASCII statement is preserved and the auto-path posts the same payload shape as the manual path. Manual/E2E: with a warm session the interaction completes with no click; with a cold origin the manual button still works (the existing E2E flow must stay green).
- **apps/web launcher (Part 2):** component test — given a config with a Nextcloud URL, the tile renders and links to that URL; given no URL, nothing renders (graceful pre-deploy). Config module test — `office-apps.ts` filters out apps with absent URLs.
- **Regression:** the keystone's `apps/roebel-id` suite (24 tests) must stay green after the login-page change.

---

## 9. Open questions / future

- **First-tap friction measurement** — if approach A's first-visit step is common in practice, implement B or C.
- **Deep-link vs. app root** — whether tiles link to the office app's root (relying on its "login required" redirect) or directly to its OIDC login entry; confirm per app during implementation (Nextcloud `user_oidc` supports a direct login URL).
- **Expo parity** — a later slice could bring the same launcher to `apps/expo` (in-app browser / linking), out of scope here.
