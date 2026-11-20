# Mini Apps 2 — Identity and Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mini app can ask, with the person's consent, who they are and which credentials they hold, and can prove it on its own server with a standard signed token or with a signature of the account itself.

**Architecture:** Manifest version "2" gains an `identity` section. The Expo host shows one consent sheet per app; grants are stored on the node per app and account, and the node derives a per-app pseudonym. The user token from plan 1 grows the granted answers and is signed by the community's identity service (`apps/roebel-id`), whose public keys are already published. Credentials come from one adapter file that knows the built-ins (`citizen`, `attester`, `guest`) today and takes the credential register later. A new package `@netizen-labs/miniapp-verify` gives developers token verification, account-signature verification for every account type, and on-chain reads.

**Tech Stack:** Next.js 15 route handlers, `jose`, viem, Supabase Postgres (migration file), Express + panva oidc-provider (`apps/roebel-id`, vitest), Expo SDK 56 (StyleSheet + `useTheme()`), jest-expo, node:test via tsx, tsup.

**Spec:** `docs/superpowers/specs/2026-11-17-miniapp-identity-wallet-design.md` (sections 5.2, 5.3, 5.4, 6). Credentials come from `docs/superpowers/specs/2026-11-17-credential-register-design.md` (its section 8 is what this plan may rely on). Account types: `docs/superpowers/specs/2026-11-17-sovereign-signup-design.md` (section 6 applies).

**Plan series:** 1 hardening → 2 identity and credentials (this) → 3 wallet → 4 audience, store and docs. Requires plan 1 merged: `userToken.ts`, `runtimeAuth.ts`, `userTokenHandler.ts`, `MINIAPP_SCOPE`, `apps/expo/lib/miniapp-token.ts`, the SDK test harness. Owner decisions 1 to 3 at the top of plan 1 apply; decision 1 (no address without consent) is implemented here.

## Open questions for the owner

Tasks are written against the recommended default.

1. **Who holds the signing key.** The spec says the identity service's keys. *Default: `apps/roebel-id` gets one internal endpoint that signs a mini-app token with its existing key when the node asks with a shared secret; developers verify against the issuer's normal key URL. If the identity service cannot be reached, the node falls back to its own key from plan 1, so our own routes keep working (third-party servers reject those tokens until it is back). Alternative: the node keeps signing and the identity service only publishes the public key; simpler to run, but then the tokens are not signed by the identity service.*
2. **Runtime requests for more credentials.** The spec lets an app ask for more at runtime. *Default: only for types that are in its reviewed manifest; anything else is refused. Otherwise review can be bypassed.*
3. **What `guest` means before the register exists.** *Default: "holds no citizen credential". It switches to the register's Guest type when that ships.*
4. **Org types before the register exists.** A manifest may name them (the syntax is fixed below), but they are not shown in the consent sheet and always answer "no" until the register is plugged in. *Default as described.*

## Global Constraints

- Manifest version "1" keeps today's behaviour and gets nothing new: same context, same wallet address, no consent sheet. Everything in this plan applies to version "2" only, except where a task says otherwise.
- A mini app never learns anything the person did not agree to share: no silent wallet address, no full credential list. A private credential is answered as "holds it" and nothing more; whether it is private is never sent to the mini app.
- No fingerprint for a token or for reading credentials: the host uses the session it already has.
- One issuer per community. The token is a JWT with header `typ: "miniapp+jwt"` and `aud: "miniapp:<slug>"`; it must never be acceptable as an OIDC id or access token and the identity service must never sign another audience on this path.
- Live mini apps keep working: `apps/mini-apps/roebel-data`, `apps/mini-apps/_template`, externally hosted apps on SDK 0.3.0.
- Never return wallet addresses from public read APIs. Never show a wallet address in the UI. UI German, code and comments English. Expo: `StyleSheet.create()` + `useTheme()`, no NativeWind. No vendor names in the UI. "Röbel Münzen" by name.
- Credential reference (used in manifests, tokens, the SDK and every table): built-ins `citizen`, `attester`, `guest`; one register type `type:<typeId>` (`0x` + 64 lowercase hex, the register's `typeIdOf(orgId, localId)`); any type of an org `org:<org account id>` (the org's uuid in the app, lowercase; the register derives its on-chain org id from it with `orgIdFromUuid`). A held credential is always a built-in or a `type:` reference and carries `org` (the org's account id) when it has one, so an `org:` pattern matches without a lookup. Only the two adapter files (`apps/web/src/lib/miniapp/credentialSource.ts` here, `apps/expo/lib/miniapp-credentials.ts` in plan 4) talk to the register.
- pnpm only. New dependencies allowed: `jose` moves from devDependencies to dependencies in `apps/roebel-id`; the new package `packages/miniapp-verify` depends on `jose` and has `viem` as a peer dependency.
- Supabase: schema changes are a migration file under `supabase/migrations/`; applying it is an owner gate (through the Supabase MCP), never an agent step. Code must not crash when the migration is not applied yet: reads of the new columns fall back to "version 1".
- Tests: web `cd apps/web && npx tsx --test tests/<file>` (files under test use relative imports and no `server-only`); SDK `cd packages/miniapp-sdk && npx tsx --test test/*.test.ts`; identity service `cd apps/roebel-id && npx vitest run <file>`; Expo `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci`. No full `tsc` in `apps/expo`; eslint on touched files plus tests.
- Work in a git worktree on `feat/miniapp-2-identity` (`git worktree add .worktrees/miniapp-2 -b feat/miniapp-2-identity`, `pnpm install --frozen-lockfile`). Stage by explicit path. Every task ends with commit + `git push -u origin feat/miniapp-2-identity`. Never merge to `main`, never publish to npm, never run EAS, never deploy, never change Vercel or Fly env.

## Review Focus

1. **A version-2 app that was granted nothing.** `getContext().user.id`, `auth.getToken()` and the user-data routes must all work with the pseudonym; none of them may contain the address. Tests in Tasks 7 and 11.
2. **The same person in two mini apps.** The pseudonyms must differ, and one must not be derivable from the other. Test in Task 6.
3. **A new manifest version adds one credential.** The person is asked for that one item only; what they declined before is not asked again. Test in Task 10.
4. **A grant is withdrawn while the app is open.** The next `credentials.list()` and the next token no longer contain it, and the app gets a change event. Tests in Tasks 7 and 12.
5. **A mini-app token presented where an OIDC token is expected, or a token for another slug.** Refused by `typ` and `aud`. Tests in Tasks 8 and 13.

---

### Task 1: SDK protocol — identity request, credentials, capability list

**Files:**
- Modify: `packages/miniapp-sdk/src/types.ts`
- Modify: `packages/miniapp-sdk/src/host/index.ts`
- Create: `packages/miniapp-sdk/src/host/consent.ts` (exported from `./host`)
- Create: `packages/miniapp-sdk/src/credential-ref.ts` (exported from both entry points)
- Test: `packages/miniapp-sdk/test/consent.test.ts`, `test/credential-ref.test.ts`, extend `test/host-router.test.ts`

**Interfaces:**
- Produces (types.ts; all additive, `NETIZEN_PROTOCOL` stays 1):
  - `BridgeMethod` += `'credentials.list' | 'credentials.has' | 'credentials.request'`
  - `NetizenEvent` += `'credentialsChanged'`
  - `interface CredentialRequest { type: string; reason: string }`
  - `interface MiniAppIdentityRequest { profile: boolean; address: boolean; credentials: CredentialRequest[] }`
  - `MiniAppManifest` += `version?: '1' | '2'; identity?: MiniAppIdentityRequest`
  - `interface Credential { type: string; kind: 'builtin' | 'role' | 'membership' | 'badge'; org?: string; name: string; imageUrl?: string; validUntil?: number | null; recognised: boolean }` (`org` = the org's account id)
  - `NetizenSDK.credentials: { list(): Promise<Credential[]>; has(type: string): Promise<boolean>; request(types: string[]): Promise<{ granted: string[] }>; onChange(cb: (list: Credential[]) => void): () => void }`
  - `NetizenSDK.auth.signIn(opts?: { nonce?: string }): Promise<{ token: string }>` (parameter added)
  - `NetizenSDK.supports(method: BridgeMethod): boolean`
  - **Extension point, not planned here:** `sdk.credentials.prove(type)` (a zero-knowledge membership proof) belongs to the register's later plan `credreg-6-zk`. Reserve it only: a comment `// reserved: 'credentials.prove' (credreg-6-zk)` next to the three new `BridgeMethod` entries and next to `NetizenSDK.credentials`. Do not add the method, a handler or a mock answer. See "Extension point: zero-knowledge proofs" at the end of this plan.
  - `NetizenMockConfig` += `credentials?: Credential[]; token?: string`
- Produces (credential-ref.ts): `BUILTIN_CREDENTIALS = ['citizen','attester','guest'] as const`; `isCredentialRef(s: unknown): s is string`; `parseCredentialRef(s: string): { kind: 'builtin'; name: 'citizen'|'attester'|'guest' } | { kind: 'type'; typeId: string } | { kind: 'org'; org: string } | null` (hex and uuid lowercased on output); `credentialMatches(pattern: string, held: { type: string; org?: string }): boolean` — a built-in or `type:` pattern matches the same `held.type`; an `org:` pattern matches when `held.org` is that org; nothing else matches.
- Produces (host/consent.ts): `type ConsentKey = 'profile' | 'address' | \`cred:${string}\``; `consentKeys(identity: MiniAppIdentityRequest | undefined): ConsentKey[]` (profile, address, then credentials in manifest order; only those requested); `pendingConsentKeys(identity, asked: readonly string[]): ConsentKey[]`.
- Produces (host/index.ts): `HostHandlers` += `credentialsList?(): Promise<Credential[]>`, `credentialsHas?(p: { type: string }): Promise<boolean>`, `credentialsRequest?(p: { types: string[] }): Promise<{ granted: string[] }>`; `authSignIn?(p: { nonce?: string })`. The default `bridge.hello` reply and any handler reply that is an object gain `methods: BridgeMethod[]`: every method whose handler exists, plus the handler-less ones the router answers itself. None of the three new methods needs a `MiniAppPermission`.

- [ ] **Step 1: Write the failing tests**

```ts
// credential-ref.test.ts
const T = 'type:0x' + '11'.repeat(32), ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301', OTHER = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
test('built-ins, types and orgs parse', () => {
  assert.deepEqual(parseCredentialRef('citizen'), { kind: 'builtin', name: 'citizen' });
  assert.deepEqual(parseCredentialRef(T), { kind: 'type', typeId: '0x' + '11'.repeat(32) });
  assert.deepEqual(parseCredentialRef('org:' + ORG.toUpperCase()), { kind: 'org', org: ORG });
});
test('everything else is not a ref', () => {
  for (const s of ['', 'Citizen', 'type:0x11', 'type:' + '11'.repeat(32), 'org:12', 'org:' + ORG + ':member', 'org:*', 'user:1']) assert.equal(isCredentialRef(s), false);
});
test('an org pattern matches the held types of that org only', () => {
  assert.equal(credentialMatches('org:' + ORG, { type: T, org: ORG }), true);
  assert.equal(credentialMatches('org:' + ORG, { type: T, org: OTHER }), false);
  assert.equal(credentialMatches('org:' + ORG, { type: 'citizen' }), false);
  assert.equal(credentialMatches(T, { type: T, org: ORG }), true);
  assert.equal(credentialMatches('citizen', { type: 'attester' }), false);
});

// consent.test.ts
const identity = { profile: true, address: false, credentials: [{ type: 'citizen', reason: 'x' }, { type: 'org:' + ORG, reason: 'y' }] };
test('keys follow the manifest order', () => assert.deepEqual(consentKeys(identity), ['profile', 'cred:citizen', 'cred:org:' + ORG]));
test('only what was never asked is pending', () => assert.deepEqual(pendingConsentKeys(identity, ['profile', 'cred:citizen']), ['cred:org:' + ORG]));
test('no identity section, nothing to ask', () => assert.deepEqual(consentKeys(undefined), []));

// host-router.test.ts (added)
test('hello lists the methods this host implements', …);       // handlers { getContext, credentialsList } → result.methods includes 'context.get','credentials.list', excludes 'roebel.pay'
test('credentials.has without a handler is unsupported', …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL (exports missing).
- [ ] **Step 3: Implement** the types, the two pure modules and the three router cases. Keep `types.ts` free of logic.
- [ ] **Step 4: Run to verify they pass**; `pnpm --filter @netizen-labs/miniapp-sdk typecheck` → exit 0. Then `cd apps/web && npx tsx --test tests/miniapp-*.test.ts` → still PASS (the types are shared).
- [ ] **Step 5: Commit** → `feat(sdk): identity request, credentials methods, host capability list`, push.

---

### Task 2: SDK client and mock

**Files:**
- Modify: `packages/miniapp-sdk/src/client.ts`, `src/bridge.ts` (keep the hello result), `src/mock.ts`
- Test: `packages/miniapp-sdk/test/client-credentials.test.ts`, extend `test/mock.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `ClientBridge.hostMethods(): readonly string[] | null` (null in mock mode or when the host sent no list); `sdk.supports(m)` → `true` in mock mode, `true` when the host sent no list (old host: let the call decide), else membership. `sdk.credentials.onChange(cb)` = subscription to `credentialsChanged` whose data is the new list.
- Mock: `credentials.list` → `__NETIZEN_MOCK__.credentials` or the default `[{ type: 'citizen', kind: 'builtin', name: 'Bürger:in', recognised: true }]`; `credentials.has` → some configured credential with `credentialMatches(type, held)`; `credentials.request` → `{ granted: types.filter(held) }`; `auth.getToken` → `{ token: cfg.token }` when set, else `null`; `auth.signIn` stays unsupported.

- [ ] **Step 1: Write the failing tests**

```ts
test('mock: has() is true for the default citizen and false for attester', …);
test('mock: an org pattern matches a configured credential of that org', …);  // credentials: [{ type: T, org: ORG, … }] → has('org:' + ORG) true, has('org:' + OTHER) false
test('mock: getToken returns the configured token', …);
test('supports() is true in mock mode', …);
test('supports() follows the host list', …);                               // host answers hello with methods ['context.get'] → supports('credentials.list') === false
test('supports() is true when an old host sends no list', …);
test('onChange delivers the new list and unsubscribes', …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.** Do not change `SDK_VERSION` here (plan 4 releases 0.4.0).
- [ ] **Step 4: Run to verify they pass.** → PASS, typecheck exit 0.
- [ ] **Step 5: Commit** → `feat(sdk): sdk.credentials, sdk.supports, mock support`, push.

---

### Task 3: Manifest version "2" with `identity`

**Files:**
- Modify: `apps/web/src/lib/miniapp/manifest.ts`, `apps/web/src/lib/miniapp/manifestFile.ts` (`SUPPORTED_VERSIONS`)
- Test: extend `apps/web/tests/miniapp-manifest-file.test.ts`, new `apps/web/tests/miniapp-manifest-identity.test.ts`

**Interfaces:**
- Consumes: `isCredentialRef` (Task 1).
- Produces: `validateManifest` returns `version: '1' | '2'` and, for version 2, `identity?: MiniAppIdentityRequest`. `MANIFEST_VERSIONS = ['1','2']`. `manifestStoreFields(m: MiniAppManifest): Record<string, unknown>` — the column patch (`name … primary_color`, plus `manifest_version`, `identity`) used by every write path (Task 4).
- Rules: `version` defaults to "1". Version 1 with an `identity` key → `invalid_params` "identity braucht miniapp.version \"2\"." Version 2: `identity` optional; `profile`/`address` default `false`, must be booleans; `credentials` at most 12 entries, each `{ type, reason }` with `isCredentialRef(type)`, `reason` trimmed 1 to 120 characters, no duplicate `type`. Unknown keys inside `identity` → error naming the key.

- [ ] **Step 1: Write the failing tests**

```ts
test("version 2 with identity is normalised", () => {
  const m = validateManifest({ ...base, version: "2", identity: { address: true, credentials: [{ type: "citizen", reason: " Nur Bürger:innen stimmen ab. " }] } });
  assert.deepEqual(m.identity, { profile: false, address: true, credentials: [{ type: "citizen", reason: "Nur Bürger:innen stimmen ab." }] });
  assert.equal(m.version, "2");
});
test("version 1 must not carry identity", () => assert.throws(() => validateManifest({ ...base, identity: { profile: true } }), /version "2"/));
test("a credential needs a reason of 1 to 120 characters", …);            // "" and 121 chars throw
test("an unknown credential type is refused", …);                           // types "org:12" and "mitglied" throw
test("duplicates and more than 12 credentials are refused", …);
test("an unknown key inside identity is refused by name", …);              // { email: true } → /email/
test("manifestStoreFields carries version and identity", …);               // identity null for version 1
test("the file parser accepts miniapp.version 2 and still refuses 3", …);  // parseManifestFile
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**, plus `npx tsx --test tests/miniapp-*.test.ts` → PASS.
- [ ] **Step 5: Commit** → `feat(web): mini-app manifest version 2 with an identity section`, push.

---

### Task 4: Schema and every manifest write path

**Files:**
- Create: `supabase/migrations/20261117ma_mini_app_identity.sql`
- Modify: `apps/web/src/lib/miniapp/types.ts` (`MiniAppRow`), `apps/web/src/lib/miniapp/indexing.ts` (`storeFields`), `apps/web/src/lib/miniapp/data.ts` (`reviewApp` patch ~L391-407, `updateAppManifest`, `submitApp`)
- Modify: `apps/expo/lib/miniapps.ts` (`MiniApp`, `MiniAppRow`, `SELECT_COLUMNS`, `mapRow`)
- Test: `apps/expo/lib/__tests__/miniapps-map.test.ts`

**Interfaces:**
- Produces (SQL):
  - `mini_apps`: `manifest_version text not null default '1'`, `identity jsonb`.
  - `mini_app_subjects (mini_app_id uuid references mini_apps(id) on delete cascade, wallet text not null, subject text not null unique, created_at timestamptz default now(), primary key (mini_app_id, wallet))`.
  - `mini_app_grants (mini_app_id uuid references mini_apps(id) on delete cascade, wallet text not null, profile boolean not null default false, address boolean not null default false, credentials text[] not null default '{}', asked text[] not null default '{}', updated_at timestamptz not null default now(), primary key (mini_app_id, wallet))`.
  - RLS enabled on both new tables with no policies (service role only). The existing anon read policy on `mini_apps` already covers the two new columns; check with the Supabase MCP `list_tables` that the policy is row-level, not a column list, and say so in the commit message.
- Produces (web): `MiniAppRow.manifest_version?: '1' | '2'`, `MiniAppRow.identity?: MiniAppIdentityRequest | null`. All three write paths use `manifestStoreFields` (Task 3), so a staged version of a live app changes `identity` only when it is approved.
- Produces (Expo): `MiniApp.manifestVersion: 1 | 2`, `MiniApp.identity: MiniAppIdentityRequest | null`; exported `mapMiniAppRow(row)` (rename of `mapRow`). If the select fails because the columns do not exist yet (PostgREST error code `42703`), retry once with the old column list.

- [ ] **Step 1: Write the failing test**

```ts
it('maps a version-2 row', () => {
  const a = mapMiniAppRow({ ...row, manifest_version: '2', identity: { profile: true, address: false, credentials: [] } });
  expect(a.manifestVersion).toBe(2); expect(a.identity?.profile).toBe(true);
});
it('treats a row without the new columns as version 1', () => {
  const a = mapMiniAppRow(row); expect(a.manifestVersion).toBe(1); expect(a.identity).toBeNull();
});
it('ignores a malformed identity value', …);                               // identity: "x" → null
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Write the migration and the code.** Do not apply the migration.
- [ ] **Step 4: Run to verify it passes**; web `npx tsx --test tests/miniapp-*.test.ts` → PASS; eslint on touched files.
- [ ] **Step 5: Commit** → `feat: mini-app identity columns, grants and subjects tables`, push.

---

### Task 5: The credential source (the one place the register plugs in, node side)

**Files:**
- Create: `apps/web/src/lib/miniapp/credentialSource.ts`
- Test: `apps/web/tests/miniapp-credential-source.test.ts`

**Interfaces:**
- Produces:
  - `interface CredentialAnswer { type: string; kind: 'builtin' | 'role' | 'membership' | 'badge'; org?: string; name: string; imageUrl?: string; validUntil: number | null; recognised: boolean; private: boolean }` — only credentials the account holds. `private` is true when the holding is not on chain (the register's `visibility: "private"`); it is used for the consent sheet only and never leaves the node towards a mini app.
  - `interface CredentialTypeInfo { type: string; kind: CredentialAnswer['kind']; org?: string; orgName?: string; name: string; imageUrl?: string; recognised: boolean }`
  - `interface CredentialSource { held(wallet: string, refs: readonly string[]): Promise<CredentialAnswer[]>; describe(ref: string): Promise<CredentialTypeInfo | null> }` — `held` answers only for the given refs; an `org:` ref expands to every held type of that org (each answered as its own `type:` reference with `org` set); a ref the source does not know contributes nothing; `describe` returns `null` for an unknown ref. Both reject on a chain or store failure (never "not held").
  - `builtinCredentialSource(chain: { isCitizen(a: string): Promise<boolean>; isAttester(a: string): Promise<boolean> }): CredentialSource` — names `Bürger:in`, `Bescheiniger:in`, `Gast`; `guest` is held when `isCitizen` is false; all three `recognised: true`, `private: false`, `validUntil: null`, `kind: 'builtin'`.
  - `getCredentialSource(): CredentialSource` — the built-in source over a viem public client on `GNOSIS_RPC_URL` reading `balanceOf` on CitizenNFTv2 and AttesterNFTv2 (addresses from `packages/blockchain/src/index.ts`, `CONTRACTS`). Task 14 changes only this function.
- The register's interfaces this file will use are named in Task 14. Until then, `type:` and `org:` refs are valid in manifests but are not shown in the consent sheet (`describe` → `null`) and are never held.

- [ ] **Step 1: Write the failing test**

```ts
const src = (c: boolean, a: boolean) => builtinCredentialSource({ isCitizen: async () => c, isAttester: async () => a });
test("a citizen holds citizen, not guest", async () => {
  assert.deepEqual((await src(true, false).held(W, ["citizen", "guest", "attester"])).map((x) => x.type), ["citizen"]);
});
test("a non-citizen holds guest", …);                                       // ["guest"]
test("only asked refs are answered", …);                                    // citizen+attester account, refs ["attester"] → ["attester"]
test("org and type refs contribute nothing before the register", …);   // refs ["org:" + ORG, T] → []
test("describe knows the three built-ins and nothing else", …);            // describe("citizen").name === "Bürger:in"; describe(T) === null
test("a chain read failure rejects (never answers 'not held')", …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify it passes.** → PASS.
- [ ] **Step 5: Commit** → `feat(web): credential source adapter with the built-in types`, push.

---

### Task 6: Pseudonym and grants

**Files:**
- Create: `apps/web/src/lib/miniapp/subject.ts`, `apps/web/src/lib/miniapp/grants.ts`, `apps/web/src/lib/miniapp/identityHandler.ts`
- Create: `apps/web/src/app/api/mini-apps/identity/route.ts`
- Modify: `apps/web/src/lib/signed-request/message.ts` (`MiniAppAction` += `"identity_get" | "identity_set"`)
- Test: `apps/web/tests/miniapp-subject.test.ts`, `apps/web/tests/miniapp-grants.test.ts`, `apps/web/tests/miniapp-identity-handler.test.ts`

**Interfaces:**
- Produces (subject.ts): `deriveSubject(secret: string, miniAppId: string, wallet: string): string` = `"nz_" + base64url(HMAC-SHA256(secret, miniAppId + ":" + wallet.toLowerCase())).slice(0, 27)`; `subjectSecretFromEnv(): string | null` (`MINIAPP_SUBJECT_SECRET`, at least 32 characters).
- Produces (grants.ts, pure):
  - `interface GrantRow { profile: boolean; address: boolean; credentials: string[]; asked: string[] }`, `EMPTY_GRANT`
  - `clampGrant(identity: MiniAppIdentityRequest | undefined, input: { profile?: unknown; address?: unknown; credentials?: unknown; asked?: unknown }): GrantRow` — a grant can never exceed the manifest: `profile`/`address` only if requested, `credentials` only refs listed in `identity.credentials`, `asked` only keys from `consentKeys(identity)`; a granted item is always also in `asked`.
  - `interface GrantStore { get(appId: string, wallet: string): Promise<GrantRow | null>; put(appId: string, wallet: string, g: GrantRow): Promise<void>; subject(appId: string, wallet: string): Promise<string>; walletOf(subject: string): Promise<string | null> }` — `subject` derives and upserts the `mini_app_subjects` row.
  - `supabaseGrantStore(db, secret): GrantStore`.
- Produces (route): signed request, scope `roebel-miniapp-v1`. `identity_get` payload `{ app }` → `IdentityState`; `identity_set` payload `{ app, grant }` → `IdentityState` after clamping and saving.
  - `interface IdentityState { subject: string; asked: string[]; granted: { profile: boolean; address: boolean; credentials: string[] }; credentials: Credential[]; types: Record<string, { name: string; orgName?: string; imageUrl?: string; private?: boolean } | null> }` — `credentials` = `held(wallet, granted.credentials)` mapped to the SDK's `Credential` (the `private` flag dropped); `types` = `describe` for every ref in the manifest, with `private: true` added when the account holds that type privately (shown in the consent sheet only). Whether a membership *can* be public (the org switch "Mitglieder dürfen öffentlich sichtbar sein") is the register's business: this reflects the holding as it is now, so a person switching between public and private needs no change on the mini-app side.
  - For a version-1 app: `{ subject: <lowercased address>, asked: [], granted: { profile: true, address: true, credentials: [] }, credentials: [], types: {} }` and `identity_set` is refused with `invalid_params`.
  - 503 `identity_unavailable` when `MINIAPP_SUBJECT_SECRET` is missing.

- [ ] **Step 1: Write the failing tests**

```ts
test("the pseudonym is stable per app and differs between apps", () => {
  const a = deriveSubject(S, APP_A, W), b = deriveSubject(S, APP_B, W);
  assert.equal(a, deriveSubject(S, APP_A, W.toUpperCase().replace("0X", "0x")));
  assert.notEqual(a, b); assert.match(a, /^nz_[A-Za-z0-9_-]{27}$/); assert.ok(!a.toLowerCase().includes(W.slice(2, 12)));
});
test("a grant cannot exceed the manifest", () => {
  const g = clampGrant({ profile: false, address: true, credentials: [{ type: "citizen", reason: "x" }] },
    { profile: true, address: true, credentials: ["citizen", "attester"], asked: ["profile", "address", "cred:citizen", "cred:attester"] });
  assert.deepEqual(g, { profile: false, address: true, credentials: ["citizen"], asked: ["address", "cred:citizen"] });
});
test("granted items are always recorded as asked", …);
test("garbage input clamps to the empty grant", …);
test("identity_get for a new user returns the pseudonym and an empty grant", …);
test("identity_set stores the clamped grant and returns the held credentials", …);   // grant citizen, source says held → credentials[0].type === "citizen", no `private` key on it
test("identity_get never contains the wallet for a version-2 app", …);                 // JSON.stringify(state) does not include W
test("a version-1 app answers with the address and refuses identity_set", …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement** (handler pure with injected `verify`, `getApp`, `GrantStore`, `CredentialSource`, like `userTokenHandler.ts`).
- [ ] **Step 4: Run to verify they pass.** → PASS.
- [ ] **Step 5: Commit** → `feat(web): per-app pseudonym, consent grants, identity route`, push.

---

### Task 7: The token carries the granted answers; routes resolve the pseudonym

**Files:**
- Modify: `apps/web/src/lib/miniapp/userToken.ts` (claims), `apps/web/src/lib/miniapp/userTokenHandler.ts`, `apps/web/src/lib/miniapp/runtimeAuth.ts` (`resolveTokenWallet`)
- Test: extend `apps/web/tests/miniapp-user-token-handler.test.ts`, `apps/web/tests/miniapp-runtime-auth.test.ts`

**Interfaces:**
- Consumes: `GrantStore`, `CredentialSource`, plan 1's token.
- Produces:
  - `MiniAppTokenClaims` += `name?: string; picture?: string; creds?: { type: string; org?: string; exp?: number; recognised?: true }[]`. For a version-2 app: `sub` = pseudonym; `addr` only when `granted.address`; `name`/`picture` only when `granted.profile` (from the `users` row: `display_name` then `username`, `profile_picture_url`); `creds` = held and granted credentials (always present, possibly empty). Token `exp` = `min(now + 600, earliest creds[].exp)`. Version-1 apps: exactly plan 1's claims.
  - `UserTokenDeps` += `grants: GrantStore | null; credentials: CredentialSource; profile(wallet: string): Promise<{ name?: string; picture?: string } | null>`; `getApp` returns `manifest_version` and `identity` too. A version-2 app without a subject secret → 503 `token_unavailable`.
  - `resolveTokenWallet(claims, deps: { walletOf(subject: string): Promise<string | null> }): Promise<string>` — `claims.addr` when present, else `walletOf(claims.sub)`; throws `MiniAppError("unauthorized")` when neither resolves. The four routes from plan 1 pass the store.

- [ ] **Step 1: Write the failing tests**

```ts
test("version 2, nothing granted: pseudonym only", async () => {
  const c = await claimsOf(await handle({ app: "v2" }, { grant: EMPTY_GRANT }));
  assert.equal(c.sub, SUBJECT); assert.equal(c.addr, undefined); assert.equal(c.name, undefined); assert.deepEqual(c.creds, []);
  assert.ok(!JSON.stringify(c).includes(WALLET));
});
test("version 2, address and citizen granted", …);              // c.addr === WALLET, c.creds === [{ type: "citizen", recognised: true }]
test("a credential that is granted but not held is absent", …);
test("a withdrawn credential is absent from the next token", …);                       // Review Focus 4
test("the token expires with the earliest credential", …);      // cred validUntil = NOW+120 → exp === NOW+120
test("version 1 claims are unchanged", …);                      // sub === addr === WALLET, no creds key
test("a private credential is not marked in the token", …);     // no "private" anywhere in the claims
test("resolveTokenWallet finds the wallet behind a pseudonym", …);
test("an unknown pseudonym is unauthorized", …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**; all `tests/miniapp-*.test.ts` → PASS.
- [ ] **Step 5: Commit** → `feat(web): user token carries granted profile and credentials`, push.

---

### Task 8: The identity service signs; the node verifies against its keys

**Files:**
- Create: `apps/roebel-id/src/miniapp/token-router.ts`
- Modify: `apps/roebel-id/src/config.ts` (`miniappIssuerSecret?: string` from `MINIAPP_ISSUER_SECRET`; boot error when set but shorter than 32 characters), `src/app.ts` + `src/wire.ts` (mount before `provider.callback()`), `package.json` (`jose` to dependencies)
- Test: `apps/roebel-id/test/miniapp-token.test.ts`
- Modify: `apps/web/src/lib/miniapp/userToken.ts` (`keystoneTokenIssuer`, `tokenKeysFromEnv`)
- Test: `apps/web/tests/miniapp-keystone-issuer.test.ts`

**Interfaces:**
- Produces (identity service): `POST /internal/miniapp-token`, header `Authorization: Bearer <MINIAPP_ISSUER_SECRET>`, JSON body `{ claims: { aud, sub, app, v, addr?, name?, picture?, creds? }, exp: number }`. Signs with the first key of `JWKS_JSON` (RS256 today; use the key's own `alg` and `kid`), header `typ: "miniapp+jwt"`, sets `iss` = `config.issuer`, `iat` = now, `jti` = random. Response `{ token, expiresAt }`. Refusals: route answers 404 when no secret is configured (the second instance at `id.ortis.app` is unaffected); 401 on a wrong secret (constant-time compare); 400 when `aud` does not match `^miniapp:[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$`, when `exp` is in the past or more than 900 s ahead, when `v !== 1`, or when the body is larger than 8 KB.
  - `createMiniAppTokenRouter(deps: { issuer: string; secret: string | undefined; jwks: { keys: object[] }; now?: () => number }): express.Router`
- Produces (web): `keystoneTokenIssuer(p: { url: string; secret: string; fetch?: typeof fetch; timeoutMs?: number }): TokenIssuer` (`issuer` = `url` without a trailing slash; 5 s timeout; throws on any non-200). `tokenKeysFromEnv` now returns: issuer = keystone when `MINIAPP_ISSUER_URL` and `MINIAPP_ISSUER_SECRET` are set, wrapped so that a throw falls back to the local issuer when `MINIAPP_TOKEN_PRIVATE_JWK` is set; `keys` = a resolver that takes the local public key for a matching `kid` and otherwise `createRemoteJWKSet(new URL(<jwks_uri>))`; `issuers` = both. Take `jwks_uri` from what `apps/roebel-id/test/discovery.test.ts` asserts for the discovery document (panva's default is `<issuer>/jwks`).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/roebel-id/test/miniapp-token.test.ts (vitest + supertest, a generated RS256 JWKS)
it('signs a mini-app token that verifies against the public JWKS', async () => {
  const r = await request(app).post('/internal/miniapp-token').set('Authorization', `Bearer ${SECRET}`)
    .send({ claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1 }, exp: NOW + 600 });
  expect(r.status).toBe(200);
  const { payload, protectedHeader } = await jwtVerify(r.body.token, publicKey, { issuer: ISSUER, audience: 'miniapp:demo' });
  expect(protectedHeader.typ).toBe('miniapp+jwt'); expect(payload.sub).toBe('nz_x');
});
it('refuses an audience that is not a mini app', …);            // aud = an OIDC client id → 400   (Review Focus 5)
it('refuses a wrong secret', …);                                // 401
it('answers 404 when no secret is configured', …);
it('refuses a lifetime over 900 s and an expiry in the past', …);
it('ignores iss, iat and jti sent by the caller', …);

// apps/web/tests/miniapp-keystone-issuer.test.ts
test("the keystone issuer posts the claims with the secret and returns the token", …);   // fake fetch records url, header, body
test("when the keystone fails the local key signs and the token still verifies", …);
test("without a local key a keystone failure rejects", …);
test("verification accepts both issuers and nothing else", …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement both sides.** In `apps/roebel-id`: `pnpm --filter @roebel/roebel-id add jose` (moves it out of devDependencies).
- [ ] **Step 4: Run to verify they pass**; `cd apps/roebel-id && npx vitest run` (whole suite) → PASS; web `tests/miniapp-*.test.ts` → PASS.
- [ ] **Step 5: Commit** → `feat(roebel-id): sign mini-app user tokens for the node` and `feat(web): issue mini-app tokens through the identity service`, push.

---

### Task 9: Review surface and reviewer preview

**Files:**
- Create: `apps/web/src/lib/miniapp/identityReview.ts`
- Modify: `apps/web/src/app/api/mini-apps/review/route.ts`, `apps/web/src/lib/miniapp/data.ts` (`reviewApp` takes the flag)
- Modify: `apps/web/src/app/admin/dashboard/mini-apps/[id]/page.tsx` (card "Identität & Nachweise"), `apps/web/src/components/mini-apps/Playground.tsx` (reviewer toggles)
- Test: `apps/web/tests/miniapp-identity-review.test.ts`

**Interfaces:**
- Produces: `identityReviewItems(live: MiniAppIdentityRequest | null | undefined, next: MiniAppIdentityRequest | null | undefined): { key: ConsentKey; label: string; reason?: string; isNew: boolean; sensitive: boolean }[]` (labels: `Name und Bild`, `Kontoadresse`, credential type name from `describe` or the raw ref with `(unbekannter Typ)`; `sensitive` for `address` and every credential); `needsIdentityReview(next): boolean` (true when `address` or any credential is requested).
- Route: approving an app whose manifest (the pending version for indexed apps, else the row) `needsIdentityReview` requires body `identityReviewed: true`, else 400 `invalid_params` "Bitte bestätige, dass die angefragten Daten zu dem passen, was die App tut."
- Admin card: one row per item (label, the developer's reason, a "neu" marker), and the checkbox `Die App fragt nur ab, was sie für ihre Funktion braucht.` that sets the flag.
- Playground: toggles `Bürger:in`, `Bescheiniger:in`, `Adresse freigeben`, `Name freigeben`, passed as `overrides` handlers (`credentialsList`, `credentialsHas`, `credentialsRequest`, `getContext`) so a reviewer can see the app with and without each grant. No server call.

- [ ] **Step 1: Write the failing test**

```ts
test("new items are marked against the live version", () => {
  const items = identityReviewItems({ profile: true, address: false, credentials: [] }, { profile: true, address: true, credentials: [{ type: "citizen", reason: "r" }] });
  assert.deepEqual(items.map((i) => [i.key, i.isNew]), [["profile", false], ["address", true], ["cred:citizen", true]]);
});
test("profile alone needs no explicit confirmation", () => assert.equal(needsIdentityReview({ profile: true, address: false, credentials: [] }), false));
test("address or any credential does", …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement** the pure module, the route rule, the card and the toggles.
- [ ] **Step 4: Run to verify it passes**; `npx eslint` on the touched files → no errors.
- [ ] **Step 5: Commit** → `feat(web): identity section in mini-app review, reviewer preview toggles`, push.

---

### Task 10: Expo — identity client and consent logic

**Files:**
- Create: `apps/expo/lib/miniapp-identity.ts`
- Test: `apps/expo/lib/__tests__/miniapp-identity.test.ts`

**Interfaces:**
- Consumes: the identity route (Task 6); `consentKeys`, `pendingConsentKeys` from `@netizen-labs/miniapp-sdk/host`; `signedOrSession` as in plan 1's `miniapp-token.ts`.
- Produces:
  - `type IdentityState` (same shape as Task 6)
  - `fetchIdentityState(account: SessionSigner, appRef: string): Promise<IdentityState | null>`, `saveIdentityGrant(account, appRef, grant: { profile: boolean; address: boolean; credentials: string[]; asked: string[] }): Promise<IdentityState | null>` — never throw.
  - `interface ConsentItem { key: ConsentKey; title: string; detail: string; privateNote: boolean; defaultOn: boolean }`
  - `buildConsentItems(app: Pick<MiniApp, 'identity'>, state: IdentityState, keys: ConsentKey[]): ConsentItem[]` — a credential whose `state.types[ref]` is `null` is left out.
  - `grantFromChoices(app, state: IdentityState, shown: ConsentKey[], on: Set<ConsentKey>): { profile; address; credentials; asked }` — keeps earlier grants, adds the switched-on items, records every shown key as asked.
  - `shapeUser(app: Pick<MiniApp, 'manifestVersion'>, state: IdentityState | null, user: { address: string; displayName?: string; avatarUrl?: string; isCitizen: boolean }): MiniAppContext['user']` — version 1: today's object. Version 2: `id` = address if granted, else `state.subject`; name and picture only with `profile`; `isCitizen` true only when `citizen` is in `state.credentials`. Version 2 with `state === null` → `null` (the app sees a signed-out user rather than a leak).
- Copy (exact): profile → `Name und Bild` / `Dein Anzeigename und dein Profilbild.`; address → `Deine Kontoadresse` / `Damit die App Transaktionen für dich vorbereiten kann. Ohne sie bekommt die App nur eine anonyme Kennung, die bei jeder Mini-App anders ist.`; credential → title = the type's name (with ` · <orgName>` when present), detail = the manifest's reason; private note `Diese Mitgliedschaft ist privat. Die App erfährt nur, dass du Mitglied bist.` All items default on.

- [ ] **Step 1: Write the failing tests**

```ts
it('asks only for what is new', () => {                                    // Review Focus 3
  const keys = pendingConsentKeys(app.identity, ['profile', 'cred:citizen']);
  expect(buildConsentItems(app, state, keys).map((i) => i.key)).toEqual(['cred:attester']);
});
it('leaves out a credential type the node does not know', …);
it('marks a privately held membership', …);                                // types[ref].private → privateNote true
it('keeps earlier grants and records declined items as asked', () => {
  const g = grantFromChoices(app, { ...state, granted: { profile: true, address: false, credentials: [] }, asked: ['profile'] }, ['address', 'cred:citizen'], new Set(['cred:citizen']));
  expect(g).toEqual({ profile: true, address: false, credentials: ['citizen'], asked: ['profile', 'address', 'cred:citizen'] });
});
it('version 2 without grants shows the pseudonym and no name', () => {     // Review Focus 1
  expect(shapeUser({ manifestVersion: 2 }, state, me)).toEqual({ id: 'nz_abc', isCitizen: false });
});
it('version 2 without an identity state is signed out', …);               // null
it('version 1 is unchanged', …);                                          // id === address, name, avatar, isCitizen
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**; eslint on the file.
- [ ] **Step 5: Commit** → `feat(expo): mini-app identity client and consent logic`, push.

---

### Task 11: Expo — consent sheet, host gating, withdrawal

**Files:**
- Create: `apps/expo/components/miniapp/MiniAppConsentSheet.tsx`
- Modify: `apps/expo/components/miniapp/MiniAppHost.tsx` (`buildContext` ~L349, wallet handlers ~L383-457, new state)
- Modify: `apps/expo/app/mini-app/[slug].tsx` (section "Zugriff")
- Test: `apps/expo/components/miniapp/__tests__/MiniAppConsentSheet.test.tsx`, `apps/expo/lib/__tests__/miniapp-identity-gate.test.ts`
- Create: `apps/expo/lib/miniapp-identity-gate.ts`

**Interfaces:**
- Consumes: Task 10.
- Produces:
  - `MiniAppConsentSheet` props `{ visible: boolean; appName: string; iconUrl: string | null; items: ConsentItem[]; busy?: boolean; onAllow(on: Set<ConsentKey>): void; onLater(): void }`. Title `{appName} möchte wissen`, one switch per item, primary button `Erlauben`, secondary `Nicht jetzt`, footer `Du kannst das jederzeit auf der Seite der Mini-App ändern.` Same visual pattern as `MiniAppNotificationSheet.tsx`.
  - `createIdentityGate(): { settled: Promise<void>; settle(): void }` and `walletAllowed(app: Pick<MiniApp, 'manifestVersion'>, state: IdentityState | null): boolean` (version 1: true; version 2: `state?.granted.address === true`).
- Host behaviour for a version-2 app: on open, `fetchIdentityState`; if `pendingConsentKeys` (after `buildConsentItems`) is non-empty, show the sheet over the splash. `context.get`, `wallet.getAccount`, `wallet.request`, `auth.*` and `credentials.*` wait for `gate.settled`; everything else is answered at once. `Erlauben` → `saveIdentityGrant(grantFromChoices(...))`; `Nicht jetzt` → save with an empty `on` set (so the items count as asked). Without `walletAllowed`: `wallet.getAccount` → `null`, `eth_accounts`/`eth_requestAccounts` → `[]`, signing methods → `{ code: 'unauthorized', message: 'Die Kontoadresse ist für diese Mini-App nicht freigegeben.' }`, and the `walletChanged` event carries `address: null`. If the state cannot be loaded (offline), no sheet is shown, the gate settles, and the app runs signed out (`shapeUser` → `null`).
  - The dev preview is version 1.
- Detail page: for a version-2 app the person has opened before, a section `Zugriff` listing every requested item with a switch (current grant) and a text button `Alles entziehen`; each change calls `saveIdentityGrant`. Shown below the existing `Berechtigungen` section.

- [ ] **Step 1: Write the failing tests**

```ts
// MiniAppConsentSheet.test.tsx (@testing-library/react-native, as other component tests in apps/expo)
it('shows each item with its reason and the private note', …);
it('Erlauben reports exactly the switched-on items', …);                   // switch one off → onAllow called with a Set lacking it
it('Nicht jetzt reports nothing granted', …);                              // onLater called, onAllow not

// miniapp-identity-gate.test.ts
it('version 2 without the address grant has no wallet', () => expect(walletAllowed({ manifestVersion: 2 }, { ...state, granted: { ...state.granted, address: false } })).toBe(false));
it('version 1 always has the wallet', …);
it('the gate resolves once and settle is idempotent', …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement** the sheet, the gate, the host wiring and the detail section.
- [ ] **Step 4: Run to verify they pass**; eslint on the touched files → no errors. Regression: `./node_modules/.bin/jest lib/__tests__/miniapp --watchAll=false --no-watchman --ci` → PASS.
- [ ] **Step 5: Commit** → `feat(expo): consent sheet for mini apps, identity gating, withdrawal on the detail page`, push.

---

### Task 12: Expo — `credentials.*`, change events, `auth.signIn`

**Files:**
- Modify: `apps/expo/components/miniapp/MiniAppHost.tsx` (handlers)
- Create: `apps/expo/lib/miniapp-signin.ts`
- Test: `apps/expo/lib/__tests__/miniapp-signin.test.ts`, extend `apps/expo/lib/__tests__/miniapp-identity.test.ts`

**Interfaces:**
- Consumes: Tasks 10 and 11; `credentialMatches` from the SDK; `WalletConfirmSheet`.
- Produces:
  - Handlers: `credentialsList` → `state.credentials`; `credentialsHas({ type })` → some held credential with `credentialMatches(type, held)`; `credentialsRequest({ types })` → refs not in the app's manifest are refused with `unauthorized`; the rest are shown in the consent sheet again (even if asked before), result `{ granted }` = the requested refs that are granted afterwards. Version-1 apps: `list` → `[]`, `has` → `false`, `request` → `unauthorized`.
  - `credentialsEqual(a: Credential[], b: Credential[]): boolean` (in `miniapp-identity.ts`; compares `type` and `validUntil`). The host re-fetches the identity state when the app returns to the foreground, every 60 s while open, and after every grant change; when the list differs it sends the `credentialsChanged` event with the new list and clears the token cache for this app.
  - `buildSignInMessage(p: { domain: string; uri: string; address: string; nonce: string; issuedAt: string; appName: string }): string` — EIP-4361 text, chain id 100, statement `Bei ${appName} anmelden`.
  - `encodeSignInToken(p: { address: string; message: string; signature: string }): string` = `"nzsi1." + base64url(JSON)`.
  - `authSignIn({ nonce })`: needs `walletAllowed`; `domain`/`uri` from the app's `homeUrl`; nonce = the given one if it matches `^[A-Za-z0-9]{8,64}$`, else 16 random bytes hex; shows `WalletConfirmSheet` (`kind: 'personal_sign'`, title `Anmelden`, one row `App` with the app name; no address shown); signs with `account.signMessage`; returns `{ token }`. The signature is whatever the account returns (a plain contract signature, an ERC-6492 wrapper, or the Safe-admin envelope for a migrated account); Task 13 verifies all of them.

- [ ] **Step 1: Write the failing tests**

```ts
it('builds an EIP-4361 message for Gnosis', () => {
  const m = buildSignInMessage({ domain: 'app.example', uri: 'https://app.example/', address: A, nonce: 'abcdef12', issuedAt: '2026-11-17T10:00:00.000Z', appName: 'Demo' });
  expect(m.startsWith(`app.example wants you to sign in with your Ethereum account:\n${A}\n\nBei Demo anmelden\n\n`)).toBe(true);
  expect(m).toContain('Chain ID: 100'); expect(m).toContain('Nonce: abcdef12'); expect(m).toContain('URI: https://app.example/');
});
it('the token round-trips', …);                                            // decode base64url after "nzsi1." → same three fields
it('credentialsEqual sees a new, a removed and a renewed credential', …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**; eslint on the touched files.
- [ ] **Step 5: Commit** → `feat(expo): sdk.credentials in the host, change events, auth.signIn`, push.

---

### Task 13: `@netizen-labs/miniapp-verify`

**Files:**
- Create: `packages/miniapp-verify/package.json`, `tsconfig.json`, `tsup.config.ts`, `README.md`, `LICENSE` (MIT, as `packages/miniapp-sdk`)
- Create: `packages/miniapp-verify/src/index.ts`, `src/token.ts`, `src/account-signature-core.ts`, `src/signature.ts`, `src/signin.ts`, `src/chain.ts`, `src/abis.ts`
- Test: `packages/miniapp-verify/test/token.test.ts`, `test/signature.test.ts`, `test/signin.test.ts`, `test/chain.test.ts`
- Test: `apps/web/tests/miniapp-verify-core-sync.test.ts`

**Interfaces:**
- Package: name `@netizen-labs/miniapp-verify`, version `0.1.0`, ESM + CJS via tsup (copy the `publishConfig` pattern of `packages/miniapp-sdk/package.json`), `dependencies: { jose }`, `peerDependencies: { viem: "^2.21.0" }`, script `"test": "tsx --test test/*.test.ts"`. No import from any other workspace package.
- Produces:
  - `verifyUserToken(token: string, opts: { issuer: string; slug: string; jwksUri?: string; clockToleranceSec?: number }): Promise<MiniAppUser>` — discovers `jwks_uri` from `<issuer>/.well-known/openid-configuration` unless given; requires `typ: "miniapp+jwt"`, `iss`, `aud === "miniapp:" + slug`, algorithms `RS256`/`ES256`. Throws `MiniAppVerifyError` with `code: "malformed" | "bad_signature" | "expired" | "wrong_audience" | "wrong_issuer"`.
  - `interface MiniAppUser { id: string; address?: string; name?: string; picture?: string; credentials: { type: string; org?: string; validUntil?: number; recognised: boolean }[]; has(pattern: string): boolean; expiresAt: number }` — `has` follows the SDK's `credentialMatches` rule (re-implemented, about ten lines: the package imports nothing from the workspace).
  - `verifyAccountSignature(input: { address: string; signature: string; message?: string; typedData?: unknown; hash?: string }, opts?: { rpcUrl?: string; client?: PublicClient }): Promise<boolean>` — default RPC `https://rpc.gnosischain.com`.
  - `verifySignIn(token: string, opts: { domain: string; nonce?: string; maxAgeSec?: number; rpcUrl?: string; client?: PublicClient }): Promise<{ address: string }>` — default `maxAgeSec` 300; checks the `nzsi1.` prefix, the message's domain, chain id 100, nonce when given, `Issued At` age, the address line equals `address`, then `verifyAccountSignature`.
  - `holdsCredential(type: "citizen" | "attester", account: string, opts?: { rpcUrl?: string; client?: PublicClient }): Promise<boolean>`; `ADDRESSES` (chain 100: `citizenNft`, `attesterNft`, `orgRegistry`, copied from `packages/blockchain/src/index.ts`), `ABIS` (`citizenNft`, `attesterNft`: the read functions `balanceOf`, `hasCitizenNFT`/its attester counterpart from `apps/web/src/lib/verification-contracts.ts`; `orgRegistry`: the read functions of `packages/org-registry/src/abi.ts`), `CHAIN_ID = 100`. `holdsCredential` covers register types in Task 14 (public holdings only: a private holding is by design not readable on chain; the README says only the user token can prove it).
- `src/account-signature-core.ts` is a byte-for-byte copy of `apps/web/src/lib/auth/account-signature-core.ts` (it has no imports by design). The sync test fails when the two files differ.

- [ ] **Step 1: Write the failing tests**

```ts
// token.test.ts — a local key pair and a jwksUri served by a tiny node:http server in the test
test("a valid token yields the user", async () => {
  const u = await verifyUserToken(tok({ sub: "nz_x", creds: [{ type: T, org: ORG }] }), { issuer: ISS, slug: "demo", jwksUri });
  assert.equal(u.id, "nz_x"); assert.equal(u.address, undefined); assert.equal(u.has("org:" + ORG), true); assert.equal(u.has("org:" + OTHER), false); assert.equal(u.has("citizen"), false);
});
test("a token for another slug is refused", …);                 // code "wrong_audience"   (Review Focus 5)
test("a JWT with typ JWT signed by the same key is refused", …); // an id-token look-alike
test("an expired token is refused", …);
test("an unknown issuer is refused", …);

// signature.test.ts — a fake client (verifyHash / readContract stubs)
test("a plain contract signature verifies through the client", …);
test("a Safe-admin envelope verifies when the Safe is an admin of the account", …);   // encodeSafeAdminSignature(SAFE, SIG); isAdmin → true; verifyHash called with address SAFE
test("the envelope is refused when the Safe is not an admin", …);
test("a malformed address or signature is false, not a throw", …);

// signin.test.ts
test("a fresh sign-in token for the right domain returns the address", …);
test("another domain, a stale Issued At, a wrong nonce and a wrong chain are refused", …);

// chain.test.ts
test("holdsCredential reads the citizen contract", …);          // fake client: readContract called with ADDRESSES.citizenNft; 1n → true, 0n → false

// apps/web/tests/miniapp-verify-core-sync.test.ts
test("the verify package ships the same signature rule as the server", () => {
  assert.equal(sha256(read("../src/lib/auth/account-signature-core.ts")), sha256(read("../../../packages/miniapp-verify/src/account-signature-core.ts")));
});
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement the package.** README: install, the three calls with a ten-line Express/Next example each, the claim list, the note that a pseudonymous `id` differs per mini app, and that the audience follows the app's slug.
- [ ] **Step 4: Run to verify they pass.** `cd packages/miniapp-verify && npx tsx --test test/*.test.ts` → PASS; `npx tsup` → builds `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`; web sync test → PASS.
- [ ] **Step 5: Commit** (every file by path, plus `pnpm-lock.yaml`) → `feat(verify): @netizen-labs/miniapp-verify 0.1.0`, push.

---

### Task 14: Plug in the credential register (only after it is merged)

Do this task only when `docs/superpowers/plans/2026-11-17-credreg-1-contract.md` Task 6 (package `@netizen-labs/credential-registry`: ABI and reader) and `docs/superpowers/plans/2026-11-17-credreg-2-backend.md` Tasks 3 and 8 (`apps/web/src/lib/credentials/`) are on `main`. Otherwise skip it; everything above works with the built-ins.

**Files:**
- Modify: `apps/web/src/lib/miniapp/credentialSource.ts` (`registerCredentialSource`, `getCredentialSource`)
- Modify: `packages/miniapp-verify/src/chain.ts`, `src/abis.ts`, `README.md`
- Test: extend `apps/web/tests/miniapp-credential-source.test.ts`, `packages/miniapp-verify/test/chain.test.ts`

**Interfaces:**
- Consumes (names as the register plans define them; re-check them in the merged code before writing):
  - `registryConfig(): { address; deployBlock; chainId: 100 } | null` (`apps/web/src/lib/credentials/config.ts`) — `null` = register off, keep the built-in source.
  - `holdings(d: Deps, c: Caller, p: { typeIds: Hex[] }): Promise<Result<{ typeId; held; visibility: "public" | "private" | null; validUntil: string | null }[]>>` (`apps/web/src/lib/credentials/holder.ts`) — the one answer for public and private holdings. Called in-process with a `Caller` built for the wallet the token or identity state is being made for (`{ ok: true, wallet, via: "passkey_session", action: "holdings", payload: {} }`); the identity and token routes already authenticated that wallet.
  - `typeDirectory(store): Promise<DirectoryEntry[]>` (`apps/web/src/lib/credentials/metadata.ts`; entries `{ typeId, kind, name, imageUrl, orgName, orgAccountId, recognised }`) — names types and maps an `org:` ref to its type ids. Cached in memory for 5 minutes.
  - `supabaseCredentialStore(admin)` (`apps/web/src/lib/credentials/store-supabase.ts`) for both calls.
  - `RESERVED_TYPE_IDS` (`@netizen-labs/credential-registry`) — `citizen` / `attester` / `guest` stay with `builtinCredentialSource`; a register entry with one of these type ids is skipped so nothing is answered twice.
  - For the verify package: the `holds(bytes32 typeId, address account)` fragment of `CREDENTIAL_REGISTRY_ABI` (copy only that fragment into `src/abis.ts`; the package must not depend on the private workspace package) and the address `CONTRACTS.credentialRegistry` from `packages/blockchain/src/index.ts` (empty string = not deployed; `holdsCredential` then throws `MiniAppVerifyError` with code `"unsupported"` for a `type:` ref).
- Produces:
  - `registerCredentialSource(deps: { builtin: CredentialSource; holdings(wallet: string, typeIds: Hex[]): Promise<{ typeId: Hex; held: boolean; visibility: 'public' | 'private' | null; validUntil: number | null }[]>; directory(): Promise<{ typeId: Hex; kind: 'role' | 'membership' | 'badge'; name: string; imageUrl: string | null; orgName: string | null; orgAccountId: string | null; recognised: boolean }[]> }): CredentialSource`
  - Mapping: `private = visibility === 'private'`; `validUntil` in unix seconds; `org = orgAccountId`; `type = 'type:' + typeId`.
  - Verify package: `holdsCredential(ref: 'citizen' | 'attester' | `type:0x${string}`, account, opts)`.
- Private holdings and the org switch: `holdings` returns `private` for an accepted, unclaimed entry, which includes every membership of an org whose switch "Mitglieder dürfen öffentlich sichtbar sein" is off (those cannot be claimed publicly). This source passes `private` through and must not read `accounts.credentials_private_only` or `isPrivateOnlyOrg` itself, so the switch has one owner. A mini app learns "holds it" either way; the consent sheet shows the private note either way.
- Not used here: `checkLeaf` and the reader's proof checks. The node trusts its own `holdings` answer; a mini app that must not trust the node uses the token's signature or, later, the zero-knowledge proof.

- [ ] **Step 1: Write the failing tests**

```ts
test("a public register holding is answered with its org", …);                  // holdings → [{ typeId: X, held: true, visibility: "public" }], directory orgAccountId ORG → [{ type: "type:" + X, org: ORG, private: false }]
test("a private holding is answered and marked private for the node only", …);  // visibility "private" → private: true
test("an org ref expands to the held types of that org", …);                     // directory has X and Y for ORG, holdings says only Y held → ["type:" + Y]
test("reserved type ids are left to the built-in source", …);                    // directory contains RESERVED_TYPE_IDS.citizen → answered once, kind "builtin"
test("a holdings failure rejects", …);
test("describe names a register type from the directory", …);
test("with the register off getCredentialSource is the built-in source", …);    // registryConfig() → null
// packages/miniapp-verify/test/chain.test.ts
test("holdsCredential reads holds(typeId, account) on the register", …);
test("holdsCredential refuses a type ref while the register address is empty", …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**; all `tests/miniapp-*.test.ts` and the verify package tests → PASS.
- [ ] **Step 5: Commit** → `feat(web): mini-app credentials from the credential register`, push.

---

## Extension point: zero-knowledge proofs (`credreg-6-zk`) — not planned here

The register's later plan adds zero-knowledge membership proofs. This plan leaves these seams and builds none of it:
- SDK: `sdk.credentials.prove(type)` and the bridge method `credentials.prove` are reserved by comment (Task 1). An older host will answer `unsupported`; `sdk.supports('credentials.prove')` will tell.
- Host: the `credentials.*` handlers sit together in `MiniAppHost.tsx` (Task 12); a fourth goes next to them, behind the same consent gate (a proof only for a type the person granted).
- Verify package: a `verifyCredentialProof` export belongs next to `verifyUserToken` (Task 13); 0.1.0 does not anticipate its shape.
- Token: no proof is ever put into the user token.

---

## Owner gates

1. Apply `supabase/migrations/20261117ma_mini_app_identity.sql` through the Supabase MCP (the project memory notes the MCP has pointed at the wrong project before: confirm the project ref `wwbeqhkslxdxhktqzqti` first).
2. Web env (preview, then production): `MINIAPP_SUBJECT_SECRET` (random, at least 32 characters; never change it, the pseudonyms depend on it), `MINIAPP_ISSUER_URL` (`https://id.roebel.app`), `MINIAPP_ISSUER_SECRET`.
3. Fly: `fly secrets set MINIAPP_ISSUER_SECRET=… -a <roebel-id app>` and deploy `apps/roebel-id`. Do not set it on the `id.ortis.app` instance.
4. Deploy web, then the Expo OTA. Device pass: a version-2 test app (one in the review queue is enough) shows the sheet once, a second open does not, withdrawing on the detail page takes effect on the next open.
5. Publish `@netizen-labs/miniapp-verify` to npm (plan 4 releases the SDK and the docs that point to it).

## Self-review (done while writing)

- Spec 5.2: manifest section (3, 4), consent sheet and re-ask (10, 11), withdrawal (11), private credentials (5, 6, 10), review (9). Spec 5.3: `getToken` (7, with plan 1's host code), identity-service keys (8), `signIn` (12, 13), the verify package with ABIs (13). Spec 5.4: `list`/`has`/`request`/`onChange` (1, 2, 12), `isCitizen` kept (10), mock (2). "Mini apps as issuers" needs no code; its recipe is written in plan 4's docs task.
- The register is reached only through `credentialSource.ts` (Task 5 built-ins; Task 14 the register's `holdings`, `typeDirectory`, `registryConfig`, `RESERVED_TYPE_IDS`, `holds`). The org switch "Mitglieder dürfen öffentlich sichtbar sein" is honoured by passing the register's `visibility` through and never re-deciding it. ZK: extension point only.
- Names checked across tasks: `IdentityState`, `GrantRow`, `clampGrant`, `ConsentKey`, `consentKeys`, `pendingConsentKeys`, `credentialMatches`, `shapeUser`, `walletAllowed`, `resolveTokenWallet`, `keystoneTokenIssuer`.
