# Mini Apps 1 — Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Our own mini-app routes stop trusting a wallet address the caller merely claims, the developer MCP stops taking a wallet address as a password, and both hosts stop accepting bridge messages and signing requests they should not.

**Architecture:** The node (apps/web) issues a short-lived signed user token for one user and one mini app, after authenticating the user with the session the app already has (passkey API session, or a silent signed request on the old sign-in). The Expo and web hosts attach that token to every user-scoped mini-app route; the routes accept a bare wallet only while a switch is off. Wallet method classification and its tests move into the SDK's host half so both hosts share one default-deny rule.

**Tech Stack:** Next.js 15 route handlers, `jose` 6 (already a dependency of apps/web), node:test via tsx, Expo SDK 56 / react-native-webview 13.16, jest-expo, `@netizen-labs/miniapp-sdk` (workspace).

**Spec:** `docs/superpowers/specs/2026-11-17-miniapp-identity-wallet-design.md` (sections 5.1, 5.3 first bullet, 5.7 "SDK tests", 6, 8). Constraints also come from `docs/superpowers/specs/2026-11-17-sovereign-signup-design.md` section 6.

**Plan series:** 1 hardening (this) → 2 identity and credentials → 3 wallet → 4 audience, store and docs. Each ships alone. Plans 2 to 4 build on the token, the runtime-auth helper and the SDK test harness from this plan.

## Owner decisions assumed

These are spec section 8. The series is written against them. If the owner overrules one, stop and re-plan the named part.

1. **Mini apps do not get the wallet address unless they ask for it and the person agrees.** Applies to manifest version "2" only; version "1" apps keep today's behaviour until they upgrade. (Changes plan 2, tasks on consent and context.)
2. **Gasless mini-app transactions are paid from a budget per mini app that we grant at review.** (Changes plan 3, the sponsor tasks.)
3. **Requiring tokens on the existing routes breaks any external mini app that calls them from its own server with a bare wallet; one release of overlap.** (Changes Task 4 and the Owner gates of this plan.)

## Open questions for the owner

Tasks are written against the recommended default.

1. **How the overlap ends.** *Default: one env switch on the web deploy, `MINIAPP_REQUIRE_USER_TOKEN` (unset = bare wallets still accepted and logged; `1` = refused). You flip it after the Expo update with token support is out and the log of bare-wallet callers (Task 4) is empty or explained.*
2. **The builder routes are just as open and the spec does not list them.** `resolveDeveloper` (`apps/web/src/lib/miniapp/http.ts`) trusts an `x-wallet-address` header, and `POST /api/mini-apps/api-keys` uses it: anyone can mint an `nz_` key for any developer's wallet. Removing the bare wallet from the MCP (Task 5) therefore closes one door of two. *Default: out of scope here because it changes the dashboard login; recorded as a follow-up at the end of this plan. Say so if you want it pulled in.*
3. **The Expo app writes two tables directly with the anon key and a wallet it states itself:** `mini_app_events` and `mini_app_notification_optins` (`apps/expo/lib/miniapps.ts`, `lib/miniapp-notifications.ts`). Someone could opt another wallet in to an app's notifications. *Default: out of scope (the spec lists four routes); follow-up.*
4. **A passkey account without a cached API session.** The token needs an authenticated request. On the old sign-in that is a silent signature. On a passkey account it is the API session, which is created with one fingerprint per device per 30 days the first time any signed request happens. *Default: the first mini-app call that needs a token may trigger that one prompt; opening a mini app never does.*

## Global Constraints

- Live mini apps keep working through every task: `apps/mini-apps/roebel-data`, `apps/mini-apps/_template`, and externally hosted ones that are not in this repo. An app built against SDK 0.3.0 must behave exactly as before, except where a task says otherwise.
- The caller-supplied wallet is ignored whenever a token is present. A request that carries a token is decided by the token alone: a bad token is 401, never a fall-through to the wallet.
- Never return wallet addresses from public read APIs. Never show a wallet address in the UI.
- UI text German, code and comments English. Expo: `StyleSheet.create()` + `useTheme()`, no NativeWind. "Röbel Münzen" by name. No vendor names in the UI.
- pnpm only. No new runtime dependencies. One new devDependency is allowed: `tsx` in `packages/miniapp-sdk` (Task 1).
- Mini-app routes live in `apps/web`; their tests are node:test: `cd apps/web && npx tsx --test tests/<file>`. Files loaded by those tests must not import `server-only` or use the `@/` alias (use relative imports, as `src/lib/signed-request/message.ts` does).
- Expo tests: `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci`. Do not run a full `tsc` in `apps/expo` (it runs out of memory); verify with `npx eslint <touched files>` plus the tests.
- SDK tests: `cd packages/miniapp-sdk && npx tsx --test test/*.test.ts`.
- No Supabase schema change in this plan.
- Other agents work in this repo. Work in a git worktree on `feat/miniapp-1-hardening` (`git worktree add .worktrees/miniapp-1 -b feat/miniapp-1-hardening`, then `pnpm install --frozen-lockfile`). Stage files by explicit path, never `git add .` or `-A`. Every task ends with commit + `git push -u origin feat/miniapp-1-hardening`. Never merge to `main`, never publish to npm, never run EAS, never deploy, never change Vercel or Fly env.
- Commit convention: `feat(web): …`, `feat(expo): …`, `feat(sdk): …`, `test(sdk): …`, `docs: …`.

## Review Focus

1. **A token minted for mini app A is sent to a route for mini app B.** It must be refused (401), not treated as the user. Test in Task 4.
2. **A request carries a broken or expired token and a valid-looking wallet.** It must be 401 even while the switch is off. Test in Task 4.
3. **An ad or embedded page inside a mini app posts a bridge message** (a sub-frame, or the top frame after it navigated to another origin). The Expo host must drop it. Test in Task 8.
4. **A mini app in the web host calls a wallet method we have never heard of** (for example `wallet_grantPermissions`). It must not reach the reviewer's real wallet. Test in Task 1 and Task 6.
5. **The token cannot be fetched** (offline, node down, prompt declined). While the switch is off the mini app must work as today; the host must not loop on the fingerprint prompt. Test in Task 7.

---

### Task 1: SDK test harness and one wallet-method rule for both hosts

**Files:**
- Modify: `packages/miniapp-sdk/package.json` (script `"test": "tsx --test test/*.test.ts"`, devDependency `tsx`)
- Create: `packages/miniapp-sdk/src/host/wallet-methods.ts`
- Modify: `packages/miniapp-sdk/src/host/index.ts` (re-export)
- Create: `packages/miniapp-sdk/test/host-router.test.ts`, `test/wallet-methods.test.ts`, `test/mock.test.ts`, `test/bridge.test.ts`, `test/fake-window.ts`

**Interfaces:**
- Produces (`@netizen-labs/miniapp-sdk/host`):
  - `type WalletMethodClass = 'read' | 'sign' | 'unsupported'`
  - `classifyWalletMethod(method: string): WalletMethodClass`
  - `WALLET_READ_METHODS: readonly string[]` = `eth_chainId`, `net_version`, `eth_accounts`, `eth_requestAccounts`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`
  - `WALLET_SIGN_METHODS: readonly string[]` = `eth_sendTransaction`, `personal_sign`, `eth_sign`, `eth_signTypedData`, `eth_signTypedData_v3`, `eth_signTypedData_v4`
  - Plan 3 extends both lists; nothing else may decide what needs a confirmation.
- Produces (`test/fake-window.ts`): `installFakeWindow(opts?: { reactNative?: boolean }): { posted: string[]; deliver(msg: unknown): void; restore(): void }` — sets `globalThis.window` with `addEventListener`, `location.search = ''`, and either `ReactNativeWebView.postMessage` or a `parent` that records.

- [ ] **Step 1: Add the runner.** `pnpm --filter @netizen-labs/miniapp-sdk add -D tsx` and the `test` script. Commit nothing yet.

- [ ] **Step 2: Write the failing tests**

```ts
// test/wallet-methods.test.ts
test('every signing method needs a confirmation', () => {
  for (const m of ['eth_sendTransaction','personal_sign','eth_sign','eth_signTypedData','eth_signTypedData_v3','eth_signTypedData_v4'])
    assert.equal(classifyWalletMethod(m), 'sign');
});
test('unknown methods are unsupported, never read', () => {
  assert.equal(classifyWalletMethod('wallet_grantPermissions'), 'unsupported');
  assert.equal(classifyWalletMethod('eth_signTransaction'), 'unsupported');
  assert.equal(classifyWalletMethod(''), 'unsupported');
});
test('account and chain queries are reads', () => {
  assert.equal(classifyWalletMethod('eth_accounts'), 'read');
  assert.equal(classifyWalletMethod('eth_chainId'), 'read');
});

// test/host-router.test.ts — createHostBridge with a recording `post`
test('a method without its permission is answered unauthorized', …);        // grantedPermissions: [] + wallet.request → error.code 'unauthorized'
test('a missing handler is answered unsupported', …);                      // roebel.pay with no `pay` handler → 'unsupported'
test('grantedPermissions omitted allows all', …);
test('a handler that throws a BridgeError keeps its code', …);            // throw {code:'budget_exceeded',message:'x'} → same code
test('a handler that throws an Error becomes internal', …);
test('a message without the protocol tag is ignored', …);                  // post never called
test('analytics.track gets no reply', …);
test('sendEvent posts {netizen:1,event,data}', …);

// test/mock.test.ts
test('mock context has a demo citizen', …);                                // mockDispatch('context.get') → user.isCitizen === true
test('mock auth.getToken is null and signIn is unsupported', …);
test('mock data.userSet then userGet round-trips', …);

// test/bridge.test.ts — uses installFakeWindow
test('handshake settles host mode when hello is answered', …);            // deliver({netizen:1,id:<posted id>,result:{ok:true}}) → getMode() === 'host'
test('handshake falls back to mock after 2000 ms with no answer', …);     // node:test mock timers; HELLO_TIMEOUT_MS is 2000
test('a response for an unknown id is ignored', …);
test('events reach on() subscribers and unsubscribe stops them', …);
```

- [ ] **Step 3: Run to verify they fail.** `cd packages/miniapp-sdk && npx tsx --test test/*.test.ts` → FAIL: `classifyWalletMethod` not exported; the others fail only where the harness is missing.

- [ ] **Step 4: Implement `wallet-methods.ts`** with the two lists above and `classifyWalletMethod`, export from `src/host/index.ts`, and write `test/fake-window.ts`. Do not change `bridge.ts`, `mock.ts` or the router: these tests pin today's behaviour. If one of them fails against unchanged code, the test is wrong; fix the test and note the real behaviour in a comment.

- [ ] **Step 5: Run to verify they pass.** Same command → PASS. Also `pnpm --filter @netizen-labs/miniapp-sdk typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/miniapp-sdk/package.json packages/miniapp-sdk/src/host/wallet-methods.ts packages/miniapp-sdk/src/host/index.ts packages/miniapp-sdk/test pnpm-lock.yaml
git commit -m "test(sdk): test harness, host router tests, shared wallet method classification"
git push -u origin feat/miniapp-1-hardening
```

---

### Task 2: User token core

**Files:**
- Create: `apps/web/src/lib/miniapp/userToken.ts`
- Test: `apps/web/tests/miniapp-user-token.test.ts`

**Interfaces:**
- Produces:
  - `MINIAPP_TOKEN_TTL_SEC = 600`, `MINIAPP_TOKEN_TYP = "miniapp+jwt"`
  - `interface MiniAppTokenClaims { iss: string; aud: string; sub: string; app: string; iat: number; exp: number; jti: string; v: 1; addr?: string }` — `aud` is `miniapp:<slug>`, `app` is the `mini_apps.id` uuid, `sub` is the lowercased account address in this plan (plan 2 makes it a per-app pseudonym for version-2 manifests), `addr` is the lowercased account address when the app may know it (always, in this plan).
  - `audienceFor(slug: string): string` → `miniapp:${slug}`
  - `interface TokenIssuer { issuer: string; sign(claims: Omit<MiniAppTokenClaims, "iss">): Promise<string> }`
  - `type TokenKeyResolver = Parameters<typeof import("jose").jwtVerify>[1]` (a key or a key-lookup function)
  - `localTokenIssuer(p: { issuer: string; privateJwk: JsonWebKey & { kid?: string } }): Promise<TokenIssuer>` — ES256
  - `type VerifyTokenResult = { ok: true; claims: MiniAppTokenClaims } | { ok: false; code: "malformed" | "bad_signature" | "expired" | "wrong_audience" | "wrong_issuer" }`
  - `verifyUserToken(token: string, p: { keys: TokenKeyResolver; issuers: readonly string[]; audience: string; nowSec?: number }): Promise<VerifyTokenResult>` — accepts `ES256` and `RS256` only, requires header `typ === "miniapp+jwt"`, `v === 1`, and `app`/`sub` strings.
  - `tokenKeysFromEnv(env?: Record<string, string | undefined>): { issuer: TokenIssuer; keys: TokenKeyResolver; issuers: string[] } | null` — reads `MINIAPP_TOKEN_PRIVATE_JWK` (JSON, P-256 private JWK with `kid`) and `MINIAPP_TOKEN_ISSUER` (default `https://www.roebel.app`); `null` when the key is missing or malformed (logged once). Memoised.

- [ ] **Step 1: Write the failing test.** Generate a key in the test with `generateKeyPair("ES256", { extractable: true })` + `exportJWK`.

```ts
test("a signed token verifies and returns its claims", async () => {
  const t = await issuer.sign({ aud: "miniapp:demo", sub: W, addr: W, app: APP, iat: 1000, exp: 1600, jti: "j1", v: 1 });
  const r = await verifyUserToken(t, { keys, issuers: [ISS], audience: "miniapp:demo", nowSec: 1001 });
  assert.equal(r.ok, true); assert.equal(r.ok && r.claims.addr, W);
});
test("another app's audience is refused", …);            // audience "miniapp:other" → { ok:false, code:"wrong_audience" }
test("an expired token is refused", …);                  // nowSec 1601 → "expired"
test("a token signed by another key is refused", …);     // → "bad_signature"
test("a token from an unknown issuer is refused", …);    // → "wrong_issuer"
test("alg none and HS256 are refused", …);               // hand-built tokens → "malformed" or "bad_signature", never ok
test("a JWT without typ miniapp+jwt is refused", …);     // same key, typ "JWT" → not ok
test("garbage is malformed", …);                         // "abc", "", "a.b" → "malformed"
test("tokenKeysFromEnv is null without the key", …);
```

- [ ] **Step 2: Run to verify it fails.** `cd apps/web && npx tsx --test tests/miniapp-user-token.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `userToken.ts`** with jose `SignJWT` / `jwtVerify` / `importJWK`. No `server-only`, no `@/` imports. Map jose errors to the result codes by error class (`JWTExpired` → `expired`, `JWTClaimValidationFailed` with claim `aud` → `wrong_audience`, claim `iss` → `wrong_issuer`, `JWSSignatureVerificationFailed` → `bad_signature`, everything else → `malformed`).

- [ ] **Step 4: Run to verify it passes.** Same command → PASS.

- [ ] **Step 5: Commit** `git add apps/web/src/lib/miniapp/userToken.ts apps/web/tests/miniapp-user-token.test.ts` → `feat(web): mini-app user token core`, push.

---

### Task 3: Token route

**Files:**
- Modify: `apps/web/src/lib/signed-request/message.ts` (add `MINIAPP_SCOPE = "roebel-miniapp-v1"`, `type MiniAppAction = "user_token"`)
- Create: `apps/web/src/lib/miniapp/userTokenHandler.ts`
- Create: `apps/web/src/app/api/mini-apps/token/route.ts`
- Test: `apps/web/tests/miniapp-user-token-handler.test.ts`

**Interfaces:**
- Consumes: `verifySignedRequest` (`src/lib/signed-request/verify.ts`; it accepts a passkey API session **or** a fresh wallet signature and already handles every account type), Task 2.
- Produces:
  - Request: a signed request body `{ scope: "roebel-miniapp-v1", action: "user_token", wallet, timestampSec, payload: { app: string }, signature? }` plus the usual session headers. `payload.app` is the app's id or slug.
  - Response 200: `{ token: string, expiresAt: number }` (unix seconds).
  - `handleUserTokenRequest(body: unknown, headers: { get(n: string): string | null }, deps: UserTokenDeps): Promise<{ status: number; json: Record<string, unknown> }>`
  - `interface UserTokenDeps { verify: (body: unknown, headers: …) => Promise<VerifyOk<"user_token"> | VerifyFail>; getApp(ref: string): Promise<{ id: string; slug: string; status: string } | null>; issuer: TokenIssuer | null; take(wallet: string): Promise<boolean>; nowSec(): number; jti(): string }`
  - Errors: 503 `{ code: "token_unavailable" }` when `issuer` is null; 404 `not_found` for an unknown app; 403 `forbidden` for status `suspended`; 429 `rate_limited`; otherwise the `verifySignedRequest` failure unchanged.

- [ ] **Step 1: Write the failing test** with stub deps.

```ts
test("a verified request for a live app gets a token for that app and wallet", async () => {
  const r = await handleUserTokenRequest(body({ app: "demo" }), headers, deps());
  assert.equal(r.status, 200);
  const v = await verifyUserToken(r.json.token as string, { keys, issuers: [ISS], audience: "miniapp:demo", nowSec: NOW });
  assert.ok(v.ok && v.claims.addr === WALLET && v.claims.app === APP_ID && v.claims.exp === NOW + 600);
  assert.equal(r.json.expiresAt, NOW + 600);
});
test("the wallet comes from the verified request, not from the payload", …);  // payload.wallet = OTHER → claims.addr still WALLET
test("a failed signature check is passed through", …);                         // verify → {ok:false,status:401,code:"BAD_SIGNATURE"} → 401
test("an unknown app is 404, a suspended app is 403", …);
test("no signing key configured is 503 token_unavailable", …);
test("the per-wallet limit answers 429", …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL (module not found).

- [ ] **Step 3: Implement the handler and the route.** The route wires `verifySignedRequest(body, { scope: MINIAPP_SCOPE, actions: ["user_token"], headers })`, `getApp` from `@/lib/miniapp/data`, `tokenKeysFromEnv()`, and a limiter `sharedLimiters([{ name: "miniapp-token-wallet", limit: 30, windowMs: MINUTE_MS }])` (pattern: `src/lib/miniapp/registerLimits.ts`). `export const runtime = "nodejs"`.

- [ ] **Step 4: Run to verify it passes.** → PASS.

- [ ] **Step 5: Commit** the four files → `feat(web): POST /api/mini-apps/token`, push.

---

### Task 4: The four routes take the token; the overlap switch

**Files:**
- Create: `apps/web/src/lib/miniapp/runtimeAuth.ts`
- Modify: `apps/web/src/app/api/mini-apps/rewards/route.ts` (POST), `data/route.ts` (GET/POST/DELETE with `scope=user`), `notifications/route.ts` (runtime branch, lines ~133-170), `muenzen-balance/route.ts`
- Test: `apps/web/tests/miniapp-runtime-auth.test.ts`

**Interfaces:**
- Consumes: `verifyUserToken`, `audienceFor`, `tokenKeysFromEnv` (Task 2).
- Produces:
  - `type RuntimeUser = { wallet: string; via: "token" | "legacy" }`
  - `interface RuntimeAuthDeps { verify(token: string, audience: string): Promise<VerifyTokenResult>; requireToken: boolean; onLegacy?(info: { appId: string; route: string }): void }`
  - `resolveRuntimeUser(p: { authorization: string | null; app: { id: string; slug: string }; claimedWallet: string | null | undefined; route: "rewards" | "data" | "notifications" | "muenzen-balance" }, deps: RuntimeAuthDeps): Promise<RuntimeUser>` — throws `MiniAppError("unauthorized", …)` (401).
  - `runtimeAuthDeps(): RuntimeAuthDeps` — `requireToken = process.env.MINIAPP_REQUIRE_USER_TOKEN === "1"`; `onLegacy` writes `console.warn("[mini-apps] bare wallet call", …)` and one `ingestEvent` row with `event: "legacy_wallet_call"`, `sessionId: "server"`, `props: { route }`, no wallet.
  - `resolveTokenWallet(claims: MiniAppTokenClaims): Promise<string>` — returns `claims.addr` in this plan; plan 2 adds the pseudonym lookup. Routes call this, never `claims.addr` directly.
  - Transport: `Authorization: Bearer <token>`.
- Rules: token present and valid → `wallet` from the token, `claimedWallet` ignored. Token present and not valid → 401 regardless of the switch. No token: switch on → 401 with the German message `Nutzer-Token fehlt. Hole es mit sdk.auth.getToken() und sende es als Authorization: Bearer.`; switch off → `claimedWallet` if it is a 40-hex address (else 401), `via: "legacy"`, `onLegacy` called.

- [ ] **Step 1: Write the failing test**

```ts
test("a valid token wins over a different claimed wallet", async () => {
  const u = await resolveRuntimeUser({ authorization: `Bearer ${tok}`, app, claimedWallet: OTHER, route: "rewards" }, deps({ requireToken: false }));
  assert.deepEqual(u, { wallet: WALLET, via: "token" });
});
test("a token for another app is 401 even with the switch off", …);            // verify → wrong_audience
test("an expired token plus a valid wallet is 401 with the switch off", …);    // Review Focus 2
test("no token, switch off: the claimed wallet is used and logged", …);        // via "legacy", onLegacy called once with { appId, route }
test("no token, switch on: 401", …);
test("no token, switch off, malformed wallet: 401", …);
test("a non-Bearer Authorization header counts as no token", …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.

- [ ] **Step 3: Implement `runtimeAuth.ts`** (pure, relative imports), then use it in the four routes. Each route resolves the app first (it already does, or add `getApp`), then `resolveRuntimeUser`, then uses `user.wallet` everywhere the body/query wallet was used. `muenzen-balance` gains an `app` query parameter (id or slug; the Expo host already sends `miniAppId` and `slug`, accept `app`, `miniAppId`, `slug`); when no app can be resolved and the switch is off it behaves as today. `data` with `scope=app` and the dashboard branches (`broadcast`, GET) are untouched.

- [ ] **Step 4: Run to verify it passes**, then run every existing mini-app test: `cd apps/web && npx tsx --test tests/miniapp-*.test.ts` → all PASS. `npx eslint src/app/api/mini-apps src/lib/miniapp/runtimeAuth.ts` → no errors.

- [ ] **Step 5: Commit** the six files → `feat(web): mini-app runtime routes accept a user token, switch for requiring it`, push.

---

### Task 5: The developer MCP no longer accepts a wallet address

**Files:**
- Create: `apps/web/src/lib/miniapp/mcpAuth.ts`
- Modify: `apps/web/src/app/api/[transport]/route.ts:48-77` (`verifyToken`, the `requireDev` message)
- Test: `apps/web/tests/miniapp-mcp-auth.test.ts`

**Interfaces:**
- Produces: `resolveMcpDeveloper(bearer: string | undefined, deps: { verifyApiKey(key: string): Promise<DeveloperRow | null> }): Promise<DeveloperRow | null>` — only `nz_…` keys.

- [ ] **Step 1: Write the failing test**

```ts
test("an nz_ key resolves its developer", …);
test("a bare wallet address is refused and never looked up", async () => {
  let called = 0;
  const dev = await resolveMcpDeveloper("0x1111111111111111111111111111111111111111", { verifyApiKey: async () => { called++; return null; } });
  assert.equal(dev, null); assert.equal(called, 0);
});
test("undefined and empty are refused", …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement**, call it from `verifyToken`, delete the `getOrCreateDeveloper(bearerToken)` branch and its import if unused, and drop the sentence "Übergangsweise geht auch die Wallet-Adresse als Token" from the `requireDev` error. Search the repo for other copies of that sentence (`grep -rn "Wallet-Adresse als Token" apps packages`) and remove them.
- [ ] **Step 4: Run to verify it passes.** → PASS.
- [ ] **Step 5: Commit** → `fix(web): developer MCP requires an API key`, push.

---

### Task 6: Web host confirms every signing method and sends the token

**Files:**
- Modify: `apps/web/src/lib/miniapp-host/index.ts` (delete the local `SIGNING_METHODS`; `walletRequest`; `getMuenzenBalance`, `grantReward`, `dataUserGet`, `dataUserSet`; new option)
- Create: `apps/web/src/lib/miniapp-host/walletGate.ts`
- Modify: `apps/web/src/components/mini-apps/Playground.tsx` (pass `getUserToken`)
- Create: `apps/web/src/lib/miniapp/clientToken.ts`
- Test: `apps/web/tests/miniapp-web-host-gate.test.ts`

**Interfaces:**
- Consumes: `classifyWalletMethod` (Task 1), the token route (Task 3), `buildSignedMessage` + `MINIAPP_SCOPE`.
- Produces:
  - `gateWalletRequest(req: Eip1193RequestArgs, p: { confirm(req: Eip1193RequestArgs): Promise<boolean>; forward(req: Eip1193RequestArgs): Promise<unknown> }): Promise<unknown>` — `read` → `forward`; `sign` → `confirm` then `forward`, or throw `{ code: "user_rejected" }`; `unsupported` → throw `{ code: "unsupported" }` without calling `forward`.
  - `WebMiniAppHostOptions.getUserToken?: () => Promise<string | null>`; when it returns a token, user-scoped fetches add `Authorization: Bearer <token>`.
  - `fetchUserTokenWithAccount(account: { address: string; signMessage(a: { message: string }): Promise<string> }, app: string): Promise<string | null>` in `clientToken.ts` (client-safe, no `server-only`): builds the signed request, POSTs `/api/mini-apps/token`, returns `null` on any failure; caches until 60 s before `expiresAt`.

- [ ] **Step 1: Write the failing test**

```ts
test("eth_signTypedData_v3 asks for confirmation", async () => {
  let asked = 0, forwarded = 0;
  await gateWalletRequest({ method: "eth_signTypedData_v3", params: [] }, { confirm: async () => { asked++; return true; }, forward: async () => { forwarded++; return "0x"; } });
  assert.equal(asked, 1); assert.equal(forwarded, 1);
});
test("a declined confirmation never reaches the wallet", …);                 // rejects with code "user_rejected", forwarded === 0
test("an unknown method never reaches the wallet", …);                       // "wallet_grantPermissions" → code "unsupported", forwarded === 0, asked === 0
test("eth_accounts is forwarded without a confirmation", …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement** `walletGate.ts`, use it in `walletRequest`, add `getUserToken` and the header, wire the Playground with `fetchUserTokenWithAccount(account, app.id)` (the reviewer's connected account; `null` when none). The editor preview (`src/app/editor/lib/useMiniAppHost.ts`) passes no `getUserToken`: its mutating calls are already mocked through `overrides`.
- [ ] **Step 4: Run to verify it passes**; `npx eslint src/lib/miniapp-host src/components/mini-apps/Playground.tsx src/lib/miniapp/clientToken.ts` → no errors.
- [ ] **Step 5: Commit** → `fix(web): web mini-app host confirms every signing method, sends the user token`, push.

---

### Task 7: Expo host fetches the token, attaches it, answers `auth.getToken`

**Files:**
- Create: `apps/expo/lib/miniapp-token.ts`
- Modify: `apps/expo/lib/miniapp-api.ts` (every user-scoped call takes the token)
- Modify: `apps/expo/components/miniapp/MiniAppHost.tsx:437-540` (handlers)
- Test: `apps/expo/lib/__tests__/miniapp-token.test.ts`, `apps/expo/lib/__tests__/miniapp-api.test.ts`

**Interfaces:**
- Consumes: the token route; `signedOrSession` (`apps/expo/lib/passkey/api-session-runtime.ts`). Find an existing `kind: 'web'` caller with `grep -rn "signedOrSession" apps/expo --include=*.ts --include=*.tsx` and build the request the same way (message text, body, headers).
- Produces:
  - `MINIAPP_SCOPE = 'roebel-miniapp-v1'`
  - `type UserToken = { token: string; expiresAt: number }`
  - `requestMiniAppUserToken(account: SessionSigner, appRef: string): Promise<UserToken | null>` — never throws; `null` on any failure, including a declined prompt.
  - `createMiniAppTokenCache(deps: { request(appRef: string): Promise<UserToken | null>; nowSec?: () => number }): { get(appRef: string, wallet: string): Promise<string | null>; clear(): void }` — one token per `(appRef, wallet)`, reused until 60 s before `expiresAt`; concurrent `get`s share one request; after a `null` result it does not ask again for 60 s.
  - `MiniAppApiIdentity` gains `token?: string | null`; `apiGetMuenzenBalance`, `apiGrantReward`, `apiSendNotification`, `apiDataUserGet`, `apiDataUserSet` send `Authorization: Bearer <token>` when set and keep sending the wallet (older web deploys).
  - Host: handlers for rewards, notifications, user data and balance call `tokenCache.get(app.id, walletLc)` first. `authGetToken: async () => { const t = await tokenCache.get(...); return t ? { token: t } : null; }`.
- The dev preview (`app.id === 'dev-preview'`) never requests a token.

- [ ] **Step 1: Write the failing tests**

```ts
// miniapp-token.test.ts
it('reuses a token until 60 s before expiry', async () => { /* request called once for two gets at now=0; again at now=541 with expiresAt=600 */ });
it('shares one request between concurrent gets', …);
it('does not retry for 60 s after a failure, then retries', …);          // Review Focus 5
it('keeps tokens of two wallets apart', …);

// miniapp-api.test.ts — global.fetch mocked
it('sends Authorization when a token is given and still sends the wallet', async () => {
  await apiGrantReward({ miniAppId: 'a', slug: 's', wallet: W, token: 'tok' }, { amount: 1, reason: 'Test', idempotencyKey: 'k' });
  const [, init] = (fetch as jest.Mock).mock.calls[0];
  expect(init.headers.Authorization).toBe('Bearer tok');
  expect(JSON.parse(init.body).wallet).toBe(W);
});
it('sends no Authorization header without a token', …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement** the three files. The cache lives in a `useRef` in `MiniAppHost`, cleared when the account changes.
- [ ] **Step 4: Run to verify they pass**; `npx eslint lib/miniapp-token.ts lib/miniapp-api.ts components/miniapp/MiniAppHost.tsx` → no errors.
- [ ] **Step 5: Commit** → `feat(expo): mini-app host attaches a user token, auth.getToken returns it`, push.

---

### Task 8: Expo host accepts bridge messages only from the mini app's own origin and top frame

**Files:**
- Create: `apps/expo/lib/miniapp-bridge-guard.ts`
- Modify: `apps/expo/components/miniapp/MiniAppHost.tsx` (`onMessage` ~L569, the `<WebView>` props ~L634)
- Test: `apps/expo/lib/__tests__/miniapp-bridge-guard.test.ts`

**Interfaces:**
- Produces:
  - `bridgeGuardScript(nonce: string): string` — JavaScript for `injectedJavaScriptBeforeContentLoaded` (top frame only: leave `injectedJavaScriptBeforeContentLoadedForMainFrameOnly` at its default `true`).
  - `createBridgeGuard(p: { nonce: string; allowedOrigins(): string[] }): { accept(e: { data: string; url?: string }): string | null; envelopeSeen(): boolean }` — returns the inner message to hand to `bridge.handleMessage`, or `null` to drop.
- Why two checks: `nativeEvent.url` is the top frame's URL, so it catches a top frame that navigated away but not a sub-frame. A sub-frame gets its own `window.ReactNativeWebView` on Android. The script therefore wraps the top frame's `postMessage` so that every top-frame message carries a per-open nonce that a cross-origin sub-frame cannot read.
- The script (this algorithm is the decision; keep it byte-for-byte equivalent):

```js
(function(){var n=NONCE,native=window.ReactNativeWebView,w=null;
function wrap(t){return{postMessage:function(d){t.postMessage(JSON.stringify({nzf:n,d:String(d)}))}}}
function hello(){if(native){w=wrap(native);native.postMessage(JSON.stringify({nzf:n,hello:1}))}}
try{Object.defineProperty(window,'ReactNativeWebView',{configurable:true,
get:function(){return w},set:function(v){native=v;hello()}})}catch(e){}
hello()})();true;
```

- `accept` rules, in order: (1) `url` missing or its origin not in `allowedOrigins()` → `null`; (2) `data` parses to `{ nzf: nonce, hello: 1 }` → mark seen, `null`; (3) `{ nzf: nonce, d: string }` → mark seen, return `d`; (4) `{ nzf: <other> }` → `null`; (5) anything else: return `data` only while `envelopeSeen()` is false, else `null`.
- Rule 5 is the fallback for a platform where the wrapper cannot install: the host then still works on the origin check alone. `MiniAppHost` tracks `bridge_envelope_missing` once per open if the first accepted message arrives unwrapped, so we see it in `mini_app_events`.
- `allowedOrigins()` = the origin of `sourceUrl` (primary or fallback). The nonce is 16 random bytes hex, new per WebView mount (keyed like the WebView: `openCount`).

- [ ] **Step 1: Write the failing test**

```ts
const g = () => createBridgeGuard({ nonce: 'abc', allowedOrigins: () => ['https://app.example'] });
it('passes a wrapped message from the app origin', () => {
  expect(g().accept({ url: 'https://app.example/x', data: JSON.stringify({ nzf: 'abc', d: '{"netizen":1}' }) })).toBe('{"netizen":1}');
});
it('drops a message whose page is on another origin', …);                 // url https://evil.example → null
it('drops a message without a url', …);
it('drops an unwrapped message once the envelope was seen', () => {      // Review Focus 3: the sub-frame case
  const guard = g();
  guard.accept({ url: 'https://app.example/', data: JSON.stringify({ nzf: 'abc', hello: 1 }) });
  expect(guard.accept({ url: 'https://app.example/', data: '{"netizen":1,"id":"1","method":"wallet.request"}' })).toBeNull();
});
it('drops an envelope with a wrong nonce', …);
it('accepts unwrapped messages only before any envelope was seen', …);
it('the script contains the nonce as a JSON string and ends with true;', …);
it('the script wraps postMessage', () => {                                // run it with `new Function` against a fake window
  const sent: string[] = []; const win: any = { ReactNativeWebView: { postMessage: (s: string) => sent.push(s) } };
  new Function('window', bridgeGuardScript('abc'))(win);
  win.ReactNativeWebView.postMessage('hi');
  expect(JSON.parse(sent[0])).toEqual({ nzf: 'abc', hello: 1 });
  expect(JSON.parse(sent[1])).toEqual({ nzf: 'abc', d: 'hi' });
});
it('the script still wraps when the native object is assigned later', …); // win without ReactNativeWebView, assign after, then post
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement** the guard and wire it: `onMessage` calls `guard.accept({ data: e.nativeEvent.data, url: e.nativeEvent.url })`; early messages (before the bridge exists) are queued **after** the guard. Add `injectedJavaScriptBeforeContentLoaded={bridgeGuardScript(nonce)}`. Leave `originWhitelist`, `onShouldStartLoadWithRequest` and the reply path (`post`) as they are.
- [ ] **Step 4: Run to verify it passes**; eslint on the two files → no errors.
- [ ] **Step 5: Commit** → `fix(expo): mini-app bridge only accepts the app's own origin and top frame`, push.

---

### Task 9: The developer preview says what it simulates

**Files:**
- Create: `apps/expo/lib/miniapp-permissions.ts` (move `PERMISSION_LABELS` out of `app/mini-app/[slug].tsx:48-54`)
- Modify: `apps/expo/lib/miniapps.ts` (`MiniApp.preview?: boolean`), `app/settings/dev-mini-app.tsx` (`devApp` sets `preview: true`; hint text), `app/mini-app/[slug].tsx` (import the labels), `components/miniapp/MiniAppHost.tsx` (banner under the header when `app.preview`)
- Test: `apps/expo/lib/__tests__/miniapp-permissions.test.ts`

**Interfaces:**
- Produces: `PERMISSION_LABELS: Record<MiniAppPermission, string>` (unchanged strings), `previewBannerText(permissions: MiniAppPermission[]): string`.
- Copy: banner `Vorschau · simuliert: Wallet & Signaturen, Röbel-Münzen-Belohnungen, …` (labels joined with `, `; `Vorschau · keine Berechtigungen simuliert` for an empty list). Hint on the settings screen: `Die Seite läuft im echten Mini-App-Host. Alle Berechtigungen sind simuliert, damit du testen kannst. Im Store bekommt deine App nur, was im Manifest steht und geprüft wurde. Belohnungen und Nutzerdaten funktionieren erst, wenn die App gelistet ist.`

- [ ] **Step 1: Write the failing test**

```ts
it('lists the simulated permissions by their German label', () => {
  expect(previewBannerText(['wallet', 'share'])).toBe('Vorschau · simuliert: Wallet & Signaturen, Teilen');
});
it('says so when nothing is simulated', () => { expect(previewBannerText([])).toBe('Vorschau · keine Berechtigungen simuliert'); });
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.** The banner is one `Text` row in the dark chrome (`CHROME_BG`, text `#FFFFFF` at 0.7 opacity, `fontFamily.medium`, 12 px), between the header and the WebView sheet.
- [ ] **Step 4: Run to verify it passes**; eslint on the touched files → no errors.
- [ ] **Step 5: Commit** → `feat(expo): developer preview shows which permissions it simulates`, push.

---

### Task 10: Tell developers and their agents

**Files:**
- Modify: `apps/web/src/lib/miniapp/devdocs.ts` (the SDK section and the MCP section), `apps/web/src/lib/miniapp/publishDoc.ts`
- Test: `apps/web/tests/miniapp-publish-doc.test.ts` (extend), new `apps/web/tests/miniapp-devdocs.test.ts`

**Interfaces:**
- Produces: a section headed `## User token` in `getDocsSection("sdk")` and in `buildPublishMd`, with exactly these facts: `sdk.auth.getToken()` returns `{ token }` or `null`; the token is valid for 10 minutes and for this app only; a server that calls `/api/mini-apps/rewards`, `/api/mini-apps/data` (user scope), `/api/mini-apps/notifications` or `/api/mini-apps/muenzen-balance` must send it as `Authorization: Bearer <token>`; a wallet address alone will stop working; verifying the token on your own server arrives with SDK 0.4.0. The MCP section states that only `nz_` API keys are accepted.

- [ ] **Step 1: Write the failing test**

```ts
test("docs explain the user token and the deprecation", () => {
  const sdk = getDocsSection("sdk");
  assert.match(sdk, /## User token/); assert.match(sdk, /Authorization: Bearer/); assert.match(sdk, /sdk\.auth\.getToken\(\)/);
  assert.doesNotMatch(getDocsSection("all"), /Wallet-Adresse als Token/);
});
test("publish.md mentions the user token", () => { assert.match(buildPublishMd("https://x"), /## User token/); });
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Write the two doc sections** (English, like the rest of both files).
- [ ] **Step 4: Run to verify it passes.** → PASS.
- [ ] **Step 5: Commit** → `docs(web): user token and API-key-only MCP in the developer docs`, push.

---

## Owner gates

Not agent steps. In this order:

1. Generate the token signing key (P-256 private JWK with a `kid`, for example with `jose`'s `generateKeyPair('ES256')` + `exportJWK`) and set `MINIAPP_TOKEN_PRIVATE_JWK` on the web deploy, preview and production. Without it the token route answers 503 and everything behaves as today.
2. Merge and deploy web. Routes now accept tokens; bare wallets still work.
3. Ship the Expo update (OTA). Device check on iOS and Android: open `roebel-data` and one externally hosted app; the splash disappears, a reward and a user-data write work, `mini_app_events` shows no `bridge_envelope_missing` for those opens. If it does show on one platform, report it: the sub-frame protection is then not active there.
4. Tell external developers (the PSV boxing app) that their server must forward `sdk.auth.getToken()`.
5. Watch `mini_app_events` for `legacy_wallet_call`. One release later, when it is quiet or explained, set `MINIAPP_REQUIRE_USER_TOKEN=1`.

Note on gate 5 (added after the final review):

- Balance calls without an app (`/api/mini-apps/muenzen-balance?wallet=…` with no `app`/`miniAppId`/`slug`, which is how external SDK 0.3.0 servers call it) cannot write a `mini_app_events` row. They appear only in the server logs, as `[mini-apps] bare wallet call` with `appId: null`. Check the web deploy's logs as well as the table.
- Legacy calls record the calling host as `props.host` (`expo` or `web`, from the `x-roebel-host` header). Passkey accounts without an API session make wallet-only reads by design (reads never prompt), so `legacy_wallet_call` rows with `props.host = expo` will keep coming and the log will not go fully quiet. Before setting `MINIAPP_REQUIRE_USER_TOKEN=1`, those reads need a token path that does not prompt (plan 2), or the switch must wait.

## Follow-ups this plan does not do

- Builder routes and `POST /api/mini-apps/api-keys` trusting `x-wallet-address` (Open question 2).
- Direct anon writes to `mini_app_events` and `mini_app_notification_optins` (Open question 3).

## Self-review (done while writing)

- Spec 5.1 bullets → tasks: tokens on runtime routes (2, 3, 4, 7), MCP (5), origin and top frame (8), web host confirm (1, 6), preview label (9), overlap switch (4 + Owner gates). Spec 5.7 "SDK tests are added" → Task 1. Spec 5.3 first bullet (`auth.getToken` works in the Expo host) → Task 7 in its minimal form; signing by the identity service's keys is plan 2.
- Every Review Focus line names the task that tests it.
- Names used across tasks: `verifyUserToken`, `audienceFor`, `TokenIssuer`, `resolveRuntimeUser`, `resolveTokenWallet`, `MINIAPP_SCOPE`, `classifyWalletMethod`, `createMiniAppTokenCache` are spelled the same wherever they appear.
