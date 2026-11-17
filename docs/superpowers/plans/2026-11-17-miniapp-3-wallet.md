# Mini Apps 3 — Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mini app can use the person's wallet properly on every account type: read the chain through the host, get honest errors, send several calls with one confirmation, send gasless transactions to the contracts it declared, and take a Röbel Münzen payment.

**Architecture:** The Expo host answers the standard read methods itself against the community's RPC with limits. A version-2 manifest declares `contracts`; after review the passkey sponsor route accepts exactly those calls for that mini app in a new mode, charged to a gas budget per mini app and a daily allowance per person that are separate from the citizens' everyday budget. The confirm sheet is built from decoded calls and the declared labels. Accounts on the old sign-in keep their current path.

**Tech Stack:** Expo SDK 56 (StyleSheet + `useTheme()`), thirdweb v5 account interface, viem 2.53 (Expo) / 2.47 (web), Next.js 15 route handlers, Supabase Postgres (migration file + one RPC), node:test via tsx, jest-expo.

**Spec:** `docs/superpowers/specs/2026-11-17-miniapp-identity-wallet-design.md` (section 5.5, the events line of 5.5, section 6). Background on what the sponsor accepts and why mini-app transactions are refused today: `docs/PASSKEY_SIGNIN_NOTES.md` §2 and §3, and the header comment of `apps/web/src/lib/passkey/sponsor-policy.ts`. Read those before Tasks 3, 4 and 8.

**Plan series:** 1 hardening → 2 identity and credentials → 3 wallet (this) → 4 audience, store and docs. Requires plans 1 and 2 merged: `classifyWalletMethod` and its lists, manifest version "2" and `manifestStoreFields`, `MiniApp.manifestVersion`, `walletAllowed`, `IdentityState`. Owner decision 2 at the top of plan 1 (a gas budget per mini app, granted at review) is implemented here.

## Open questions for the owner

Tasks are written against the recommended default.

1. **Guests and gasless mini-app calls.** The spec says every account type; it does not say whether a guest (no citizen credential) on an independent account is sponsored. *Default: yes, under the same per-app budget and per-person allowance. The exposure is bounded by the budget you grant each app. Alternative: citizens only (one line in Task 3).*
2. **Budget numbers.** *Defaults: per person 0.003 xDAI per UTC day across all mini apps (`MINIAPP_GAS_PER_PERSON_DAILY_WEI`), all mini apps together 0.05 xDAI per day (`MINIAPP_GAS_GLOBAL_DAILY_WEI`), a new app 0 until you grant a budget at review. The budget counts the reserved maximum of each operation, like the existing sponsor budget, so it drains faster than real gas use.*
3. **`roebel.pay` recipients.** *Default: only an account that exists in the app (a person or an org); an unknown address is refused. A mini app that pays out to arbitrary addresses is out of scope.*
4. **System contracts.** *Default: a manifest may not declare Röbel's own contracts (Circles Hub, the identity NFTs, MACI, OrgRegistry, the account infrastructure). Röbel Münzen payments go through `roebel.pay`.*

## Global Constraints

- Gnosis only (chain id 100). Asking for another chain returns the standard "unsupported chain" error (EIP-1193 code 4902) instead of pretending to switch.
- A mini app can never drain the gas budget or move funds without a clear confirmation. Sponsored mini-app calls: only declared contract + function pairs of a reviewed version-2 manifest, value 0, never the account itself, never mixed with other calls in one operation.
- The citizens' everyday sponsor budget must not be reachable from a mini app: mini-app reservations use their own counters.
- Accounts on the old sign-in keep their current behaviour (their transactions are not checked against the declaration; the sheet warns).
- Manifest version "1" apps keep today's behaviour, with three exceptions that apply to every app: proxied reads become available, a chain switch away from Gnosis returns an error, and the confirm sheet shows names instead of addresses.
- The confirm sheet names the mini app, the contract by its declared label (never a raw address alone) and what is being signed, and warns on anything not declared. Never show a wallet address; resolve to a display name.
- Live mini apps keep working: `apps/mini-apps/roebel-data` (it sends sequential `eth_sendTransaction` calls), `_template`, external apps on SDK 0.3.0.
- UI German, code and comments English. Expo: `StyleSheet.create()` + `useTheme()`, no NativeWind. "Röbel Münzen" by name. No vendor names in the UI.
- pnpm only, no new dependencies. No new native modules (ships by OTA).
- Supabase: migration file only; applying is an owner gate. Functions created in the migration must revoke execute from `anon` and `authenticated` explicitly (this project's default privileges grant it otherwise).
- React Native `fetch` never times out by itself: every RPC call uses an `AbortController`.
- Tests: web `cd apps/web && npx tsx --test <path>` (policy tests live in `src/lib/passkey/__tests__/`, mini-app tests in `tests/`); SDK `cd packages/miniapp-sdk && npx tsx --test test/*.test.ts`; Expo `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci`. No full `tsc` in `apps/expo`; eslint on touched files plus tests.
- Work in a git worktree on `feat/miniapp-3-wallet` (`git worktree add .worktrees/miniapp-3 -b feat/miniapp-3-wallet`, `pnpm install --frozen-lockfile`). Stage by explicit path. Every task ends with commit + `git push -u origin feat/miniapp-3-wallet`. Never merge to `main`, never publish, never run EAS, never deploy, never change env.

## Review Focus

1. **A declared contract address that is the person's own account, their old account, or a piece of the account infrastructure.** A sponsored call there could change owners or guardians. It must be refused at manifest validation and again in the sponsor policy. Tests in Tasks 2 and 3.
2. **One declared call and one undeclared call in the same batch**, or a declared call next to an everyday action. The whole operation is refused. Test in Task 3.
3. **A mini app that uses up its gas budget.** Its users get a clear message; citizens can still vote and collect Röbel Münzen in the same second. Test in Task 4.
4. **`eth_getLogs` over the whole chain, or thousands of reads in a loop.** The host answers with an error; it must not hang the app or the RPC. Tests in Task 5.
5. **A batch of ten calls on the confirm sheet.** Every call is listed; an undeclared one in the middle still raises the warning. Test in Task 7.

---

### Task 1: SDK — wallet protocol additions

**Files:**
- Modify: `packages/miniapp-sdk/src/types.ts`, `src/host/wallet-methods.ts`, `src/provider.ts`, `src/mock.ts`, `src/client.ts` (`actions.ready` passes the new option through)
- Create: `packages/miniapp-sdk/src/host/declared-calls.ts` (exported from `./host`)
- Test: extend `packages/miniapp-sdk/test/wallet-methods.test.ts`, new `test/provider.test.ts`, `test/declared-calls.test.ts`, extend `test/mock.test.ts`

**Interfaces:**
- Produces:
  - `WALLET_READ_METHODS` += `eth_call`, `eth_getBalance`, `eth_getLogs`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_blockNumber`, `eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_getCode`, `eth_getTransactionCount`, `eth_getBlockByNumber`, `wallet_getCapabilities`, `wallet_getCallsStatus`. `WALLET_SIGN_METHODS` += `wallet_sendCalls`.
  - `BridgeError.rpcCode?: number` (additive).
  - `interface DeclaredContract { address: string; label: string; functions: string[] }`; `MiniAppManifest.contracts?: DeclaredContract[]`.
  - `declared-calls.ts` (one rule for the node, the Expo host and the web host; the SDK has no dependencies, so the selector function is injected): `interface CallRule { address: string; label: string; selectors: Record<string, string> }` (lowercased address; selector → signature); `callRules(contracts: DeclaredContract[], toSelector: (signature: string) => string): CallRule[]`; `findDeclaredCall(rules: CallRule[], to: string | undefined, data: string | undefined): { label: string; signature: string; name: string } | null` — `null` for a missing `to`, data shorter than 4 bytes, an unknown address or an unknown selector; `name` is the signature up to the first `(`.
  - `actions.ready(opts?: { disableNativeGestures?: boolean; handlesBack?: boolean })`.
  - `MiniAppContext.host.theme?: 'light' | 'dark'`.
  - Event payloads (documented types): `back` → `undefined`; `visibilityChanged` → `{ visible: boolean }`; `themeChanged` → `{ theme: 'light' | 'dark' }`.
  - Provider: a rejected `request` now throws an `Error` with numeric `code` and `data: { bridgeCode: BridgeErrorCode }`. Mapping: `user_rejected` 4001, `unauthorized` 4100, `unsupported` → `rpcCode` when the host sent one, else 4200, `invalid_params` -32602, `rate_limited` -32005, everything else -32603. Exported `toProviderError(e: BridgeError): Error & { code: number; data: { bridgeCode: string } }`.
  - Mock: `wallet_getCapabilities` → `{ "0x64": { atomic: { status: "supported" } } }`; `wallet_switchEthereumChain` to `0x64` → `null`, to anything else → reject `{ code: 'unsupported', rpcCode: 4902 }`; the read methods reject with the existing "braucht den Röbel-Host" message.

- [ ] **Step 1: Write the failing tests**

```ts
test('the proxied reads are reads, wallet_sendCalls is a signing method', () => {
  for (const m of ['eth_call','eth_getBalance','eth_getLogs','eth_getTransactionReceipt','eth_blockNumber','eth_estimateGas','wallet_getCapabilities','wallet_getCallsStatus'])
    assert.equal(classifyWalletMethod(m), 'read');
  assert.equal(classifyWalletMethod('wallet_sendCalls'), 'sign');
  assert.equal(classifyWalletMethod('eth_sendRawTransaction'), 'unsupported');
});
test('a user rejection becomes EIP-1193 code 4001 and keeps the bridge code', () => {
  const e = toProviderError({ code: 'user_rejected', message: 'x' });
  assert.equal(e.code, 4001); assert.equal(e.data.bridgeCode, 'user_rejected'); assert.ok(e instanceof Error);
});
test('an unsupported chain keeps the host code 4902', () => assert.equal(toProviderError({ code: 'unsupported', message: 'x', rpcCode: 4902 }).code, 4902));
test('unsupported without a host code is 4200', …);
test('provider.request rejects with the mapped error', …);       // fake bridge whose request rejects {code:'unauthorized'} → caught e.code === 4100
test('findDeclaredCall matches address and selector, case-insensitively, and nothing else', () => {
  const rules = callRules([{ address: '0xAbC0000000000000000000000000000000000001', label: 'Trainingsbuch', functions: ['checkIn(uint256)'] }], () => '0x12345678');
  assert.deepEqual(findDeclaredCall(rules, '0xabc0000000000000000000000000000000000001', '0x12345678ff'), { label: 'Trainingsbuch', signature: 'checkIn(uint256)', name: 'checkIn' });
  assert.equal(findDeclaredCall(rules, '0xabc0000000000000000000000000000000000001', '0x87654321'), null);
  assert.equal(findDeclaredCall(rules, '0x0000000000000000000000000000000000000002', '0x12345678'), null);
  assert.equal(findDeclaredCall(rules, undefined, '0x12345678'), null);
  assert.equal(findDeclaredCall(rules, '0xabc0000000000000000000000000000000000001', '0x'), null);
});
test('mock: switching to another chain is refused with 4902, to 0x64 succeeds', …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.** Then `grep -rn "user_rejected\|\.code ===" apps/mini-apps` and update any first-party code that compares a provider error's `code` to a string (use `e.data?.bridgeCode ?? e.code`). Errors of the non-provider SDK methods (`sdk.roebel.*`, `sdk.auth.*`, …) are unchanged.
- [ ] **Step 4: Run to verify they pass**; SDK typecheck exit 0; `cd apps/web && npx tsx --test tests/miniapp-*.test.ts` → PASS.
- [ ] **Step 5: Commit** → `feat(sdk): read methods, wallet_sendCalls, EIP-1193 error codes, contracts in the manifest`, push.

---

### Task 2: Manifest `contracts` and the schema

**Files:**
- Create: `apps/web/src/lib/miniapp/contracts.ts`
- Modify: `apps/web/src/lib/miniapp/manifest.ts` (`validateManifest`, `manifestStoreFields`), `apps/web/src/lib/miniapp/types.ts` (`MiniAppRow`)
- Create: `supabase/migrations/20261117b_mini_app_contracts_gas.sql`
- Modify: `apps/expo/lib/miniapps.ts` (`MiniApp.contracts: DeclaredContract[]`, select + map, same missing-column fallback as plan 2 Task 4)
- Test: `apps/web/tests/miniapp-manifest-contracts.test.ts`, extend `apps/expo/lib/__tests__/miniapps-map.test.ts`

**Interfaces:**
- Produces (contracts.ts, pure, viem only):
  - `MAX_CONTRACTS = 8`, `MAX_FUNCTIONS = 16`
  - `FORBIDDEN_CONTRACTS: readonly Hex[]` — every address in `EVERYDAY_CONTRACTS` and `ORG_SAFE` (`../passkey/everyday-allowlist`), every address in `ADDRESSES` (`../passkey/sponsor-policy`), `CITIZEN_NFT`, and the zero address. Imported, not copied.
  - `validateContracts(input: unknown): DeclaredContract[]` — throws `MiniAppError("invalid_params")`. Rules: array, at most 8; `address` 40-hex (stored lowercased), not forbidden, no duplicates; `label` trimmed 1 to 40 characters; `functions` 1 to 16 canonical signatures (`name(type,…)`, validated with viem `toFunctionSelector`; a signature that does not parse is refused by name), no duplicates.
  - `rulesFor(contracts: DeclaredContract[]): CallRule[]` = `callRules(contracts, toFunctionSelector)` (Task 1's shared rule with viem's selector function). The node never re-implements the matching.
- `validateManifest`: `contracts` only with version "2" (version 1 with the key → error `contracts braucht miniapp.version "2".`); result `contracts?: DeclaredContract[]`; `manifestStoreFields` adds `contracts` (empty array when absent).
- SQL: `mini_apps` += `contracts jsonb not null default '[]'`, `gas_budget_wei numeric(78,0) not null default 0`, `gas_spent_wei numeric(78,0) not null default 0`. Table `mini_app_gas_daily (day date not null, key text not null, spent_wei numeric(78,0) not null default 0, primary key (day, key))`, RLS on, no policies. Function `mini_app_gas_reserve(p_mini_app_id uuid, p_person text, p_cost_wei numeric, p_person_cap_wei numeric, p_global_cap_wei numeric) returns text` — security definer, one transaction, row locks: returns `'app_budget'` when `gas_spent_wei + cost > gas_budget_wei`, `'person_budget'` when today's `person:<p_person>` row plus cost exceeds the cap, `'global_budget'` likewise for the `global` row, else adds the cost to all three and returns `'ok'`. Model it on `supabase/migrations/20260927_passkey_sponsor_budget.sql`. `revoke execute … from public, anon, authenticated; grant execute … to service_role;`. The anon select on `mini_apps` must not expose `gas_budget_wei`/`gas_spent_wei` if the existing policy setup allows column limits; if it does not, leave it and note it in the commit (the values are not secret).

- [ ] **Step 1: Write the failing tests**

```ts
test("a declaration is normalised and its selectors derived", () => {
  const c = validateContracts([{ address: "0xAbC0000000000000000000000000000000000001", label: " Trainingsbuch ", functions: ["checkIn(uint256)"] }]);
  assert.deepEqual(c, [{ address: "0xabc0000000000000000000000000000000000001", label: "Trainingsbuch", functions: ["checkIn(uint256)"] }]);
  assert.equal(Object.values(rulesFor(c)[0].selectors)[0], "checkIn(uint256)");
});
test("Röbel's own contracts cannot be declared", () => {                    // Review Focus 1
  for (const a of FORBIDDEN_CONTRACTS) assert.throws(() => validateContracts([{ address: a, label: "x", functions: ["f()"] }]));
});
test("the Circles Hub and the recovery module are on the forbidden list", …);   // two literal addresses from PASSKEY_SIGNIN_NOTES §3
test("a malformed signature is refused by name", …);                         // "transfer(address, uint)" or "foo" → /foo/
test("more than 8 contracts, more than 16 functions, duplicates are refused", …);
test("version 1 must not carry contracts", …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement** and write the migration (do not apply it).
- [ ] **Step 4: Run to verify they pass**; `tests/miniapp-*.test.ts` → PASS; Expo map test → PASS.
- [ ] **Step 5: Commit** → `feat: mini-app contracts declaration, gas budget schema`, push.

---

### Task 3: Sponsor policy mode "miniapp"

**Files:**
- Modify: `apps/web/src/lib/passkey/sponsor-policy.ts` (header comment: add mode F; `SponsorContext`, `SponsorMode`, `PolicyResult`, `ScanState`, `checkAllowedCall`, `checkLegacyInnerCall`, `evaluateSponsorPolicy`, `parseSponsorRequest`)
- Test: `apps/web/src/lib/passkey/__tests__/miniapp-policy.test.ts`

**Interfaces:**
- Consumes: `CallRule`, `findDeclaredCall` (Task 1), `rulesFor`, `FORBIDDEN_CONTRACTS` (Task 2); the test helpers `fake-chain.ts` and `policy-helpers.ts` (`op`, `outer`, `viaMultiSend`, `execLegacy`, `KEY`, `SAFE`, `LEGACY`, `NOW`).
- Produces:
  - `SponsorContext.miniApp?: { id: string; rules: CallRule[] }`
  - `SponsorMode` += `"miniapp"`; a passing result in this mode is `{ ok: true, mode: "miniapp", budgetKey, miniAppId: string }`.
  - `parseSponsorRequest` returns `miniApp?: string` (a uuid; anything else → throws, i.e. 400).
- Rules of the mode (it applies whenever `ctx.miniApp` is set, and only then):
  1. Every call of the operation must be a declared call (`findDeclaredCall` on the mini app's rules): direct calls when the identity is the sender Safe; calls nested in `legacy.execute` / `legacy.executeBatch` when the request names `legacy`. Value 0 everywhere.
  2. One call that is not declared refuses the whole operation, including calls any other mode would accept (everyday, guardian management, recovery, handover, detach, deploy-only). No mixing.
  3. A declared target that equals the sender, the request's `legacy`, or any address in `FORBIDDEN_CONTRACTS` is refused even if the manifest somehow carries it.
  4. The sender must pass the existing genuine-passkey-Safe check (`checkSender`). With `legacy`: `legacy` must be a thirdweb account proxy and `isAdmin(legacy, sender)` must hold, as in the everyday legacy path. No citizen requirement (Open question 1; to restrict, require `isCitizen(identity)` here).
  5. Budget key = the identity (legacy, else sender), as in the other modes.
  6. A deploy operation (factory set) is allowed in this mode under the existing factory check.
- An operation without `ctx.miniApp` is evaluated exactly as today (the existing policy tests must pass unchanged).

- [ ] **Step 1: Write the failing test**

```ts
const RULES = rulesFor([{ address: TARGET, label: "Trainingsbuch", functions: ["checkIn(uint256)"] }]);
const MINI: SponsorContext = { ...KEY, nowSeconds: NOW, miniApp: { id: APP_ID, rules: RULES } };
const checkIn = encodeFunctionData({ abi: parseAbi(["function checkIn(uint256)"]), functionName: "checkIn", args: [1n] });

test("a declared call from a passkey Safe is sponsored in miniapp mode", async () => {
  const r = await evaluateSponsorPolicy(op(outer(TARGET, checkIn)), MINI, fakeChain());
  assert.deepEqual(r, { ok: true, mode: "miniapp", budgetKey: SAFE, miniAppId: APP_ID });
});
test("a declared call through the legacy account is sponsored, budget key = legacy", …);      // { ...MINI, legacy: LEGACY }, outer(LEGACY, execLegacy(TARGET, 0n, checkIn))
test("a guest Safe is sponsored too", …);                                                      // world without CitizenNFT for SAFE
test("an undeclared function on a declared contract is refused", …);
test("an undeclared contract is refused", …);
test("value above 0 is refused", …);
test("a declared and an undeclared call in one batch refuse the whole op", …);                 // Review Focus 2: viaMultiSend([declared, other])
test("a declared call next to an everyday call is refused", …);                                // viaMultiSend([declared, Hub.personalMint])
test("an everyday call alone is refused when the request names a mini app", …);
test("a rule that targets the sender itself is refused", …);                                   // Review Focus 1: rules with address SAFE
test("a rule that targets the legacy account or the recovery module is refused", …);
test("a sender that is not a genuine passkey Safe is refused", …);
test("a chain read failure throws ChainReadError", …);                                         // brokenChain()
test("parseSponsorRequest accepts a uuid miniApp and refuses anything else", …);
```

- [ ] **Step 2: Run to verify it fails.** `cd apps/web && npx tsx --test src/lib/passkey/__tests__/miniapp-policy.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Keep the mode's call classification in one function (`checkMiniAppCall(to, value, data, st)`) that `checkAllowedCall` and `checkLegacyInnerCall` enter first when `st.miniApp` is set, and return from before any other branch runs.
- [ ] **Step 4: Run to verify it passes**, then the whole policy suite: `npx tsx --test src/lib/passkey/__tests__/*.test.ts` (skip `sponsor-policy.live.test.ts` if it needs network, as its header says) → PASS, no existing test changed.
- [ ] **Step 5: Commit** → `feat(web): sponsor policy mode for declared mini-app calls`, push.

---

### Task 4: Gas budget per mini app, sponsor route wiring, granting at review

**Files:**
- Create: `apps/web/src/lib/passkey/miniapp-gas-budget.ts`
- Modify: `apps/web/src/lib/passkey/sponsor-handler.ts` (deps, the mini-app branch), `apps/web/src/app/api/passkey/sponsor/route.ts` (wire the deps)
- Create: `apps/web/src/app/api/mini-apps/gas-budget/route.ts` (admin PATCH, modelled on `reward-budget/route.ts`); `setGasBudget` in `apps/web/src/lib/miniapp/data.ts`
- Modify: `apps/web/src/app/admin/dashboard/mini-apps/[id]/page.tsx` (card "Gas-Budget": declared contracts with labels and functions, budget input in xDAI, spent so far)
- Test: `apps/web/src/lib/passkey/__tests__/miniapp-gas-budget.test.ts`, extend `apps/web/src/lib/passkey/__tests__/sponsor-route.test.ts`

**Interfaces:**
- Produces:
  - `type GasVerdict = "ok" | "app_budget" | "person_budget" | "global_budget"`
  - `interface MiniAppGasBudget { reserve(miniAppId: string, person: string, costWei: bigint): Promise<GasVerdict> }` — throws when the store is unreachable.
  - `InMemoryMiniAppGasBudget(opts: { appBudgetWei(id: string): bigint; perPersonDailyWei?: bigint; globalDailyWei?: bigint; now?: () => number })`, `SupabaseMiniAppGasBudget(db, caps)` (calls `mini_app_gas_reserve`), `DEFAULT_MINIAPP_PER_PERSON_DAILY_WEI = 3n * 10n ** 15n`, `DEFAULT_MINIAPP_GLOBAL_DAILY_WEI = 5n * 10n ** 16n`, `miniAppGasBudgetFromEnv(env, makeClient)` (env `MINIAPP_GAS_PER_PERSON_DAILY_WEI`, `MINIAPP_GAS_GLOBAL_DAILY_WEI`; Supabase store when `PASSKEY_SPONSOR_BUDGET_STORE=supabase`).
  - `handleSponsorRequest` deps += `miniApps?: { rules(id: string): Promise<CallRule[] | null>; budget: MiniAppGasBudget }`. `rules` returns the rules of a **live** app with `manifest_version = '2'` and at least one declared contract, else `null`.
  - Route behaviour when the body has `miniApp`: `deps.miniApps` missing or `rules` null → 403 `{ error: "not_sponsorable", reason: "mini app has no approved contracts" }`; policy as Task 3; on pass, **only** `miniApps.budget.reserve(id, budgetKey, prefund)` is charged (`deps.budget` is not touched); a verdict other than `ok` → 429 `{ error: "budget_exhausted", scope: "app" | "person" | "global" }`.
  - `PATCH /api/mini-apps/gas-budget` body `{ id, budgetXdai: string }` → stores wei; admin only.

- [ ] **Step 1: Write the failing tests**

```ts
test("reserves against the app, the person and the day", async () => {
  const b = new InMemoryMiniAppGasBudget({ appBudgetWei: () => 10n, perPersonDailyWei: 6n, globalDailyWei: 100n });
  assert.equal(await b.reserve(APP, P1, 5n), "ok");
  assert.equal(await b.reserve(APP, P1, 2n), "person_budget");
  assert.equal(await b.reserve(APP, P2, 5n), "ok");
  assert.equal(await b.reserve(APP, P3, 1n), "app_budget");
});
test("a refused reservation counts nothing", …);
test("the person allowance resets on the next UTC day, the app budget does not", …);
test("an app without a budget is refused at once", …);                       // appBudgetWei → 0n → "app_budget"

// sponsor-route.test.ts (added)
test("a mini-app op charges the mini-app budget and leaves the citizens' budget untouched", …);   // Review Focus 3: spy budget.reserve not called
test("an exhausted mini-app budget answers 429 with scope app; an everyday op in the same run still gets a voucher", …);
test("a mini app without approved contracts is 403", …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**; whole `src/lib/passkey/__tests__` suite → PASS; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(web): gas budget per mini app, granted at review`, push.

---

### Task 5: Expo — reads through the host

**Files:**
- Create: `apps/expo/lib/miniapp-rpc.ts`
- Modify: `apps/expo/constants/gnosis.ts` (export `GNOSIS_READ_RPC`), `apps/expo/lib/miniapp-wallet.ts` (`handleReadOnly` delegates), `apps/expo/components/miniapp/MiniAppHost.tsx` (one proxy per open)
- Test: `apps/expo/lib/__tests__/miniapp-rpc.test.ts`

**Interfaces:**
- Produces:
  - `RPC_LIMITS = { timeoutMs: 10_000, maxRequestBytes: 65_536, maxResponseBytes: 1_048_576, logsMaxBlockRange: 10_000, logsMaxAddresses: 5, logsMaxResults: 1_000, perMinute: 300, burst: 30 }`
  - `PROXIED_METHODS: readonly string[]` = the twelve `eth_*` read methods added in Task 1.
  - `createRpcProxy(deps: { rpcUrl: string; fetch?: typeof fetch; now?: () => number }): { request(method: string, params: unknown[], ctx: { account?: string }): Promise<unknown> }`
- Rules: unknown method → `{ code: 'unsupported' }`. `eth_getLogs`: the filter needs `address` (one or up to 5) unless it uses `blockHash`; `fromBlock` and `toBlock` must both be given (hex or `latest`; `earliest` and missing are refused); the range, with `latest` resolved through a block number cached for 5 s, is at most 10,000 blocks; more than 1,000 results → `{ code: 'rate_limited', message: 'Zu viele Ergebnisse. Grenze den Blockbereich ein.' }`. `eth_getBlockByNumber`: second parameter forced to `false`. `eth_call` / `eth_estimateGas`: when the call object has no `from` and `ctx.account` is set, `from` = the account; never add it otherwise. Rate: token bucket, 30 burst, refilled at 5 per second (300 per minute) → `rate_limited`. Oversized request or response → `invalid_params` / `internal`. Timeout → `{ code: 'timeout' }`. An RPC error object → `{ code: 'internal', message: <rpc message>, rpcCode: <rpc code> }`. One JSON-RPC call per request, no batching.
- `ctx.account` is passed only when `walletAllowed` (plan 2); a version-2 app without the address grant reads the chain without revealing who asks.

- [ ] **Step 1: Write the failing test** (fake `fetch` recording the JSON-RPC body)

```ts
it('forwards eth_call and returns the result', …);
it('adds the account as from only when one is given', …);
it('refuses eth_getLogs without an address', async () => {
  await expect(p.request('eth_getLogs', [{ fromBlock: '0x1', toBlock: '0x2' }], {})).rejects.toMatchObject({ code: 'invalid_params' });
});
it('refuses eth_getLogs over more than 10000 blocks', …);                   // Review Focus 4: fromBlock 0x0, toBlock latest (block number 20000)
it('refuses eth_getLogs with earliest or without bounds', …);
it('refuses more than 1000 logs', …);
it('forces eth_getBlockByNumber to return hashes only', …);                // body params[1] === false
it('answers rate_limited after the burst and recovers with time', …);      // 30 ok, 31st rejects; advance now by 1000 ms → 5 more ok
it('times out after 10 s', …);                                              // fetch that never resolves + fake timers → code 'timeout'
it('refuses a method that is not proxied', …);                              // eth_sendRawTransaction → 'unsupported'
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement** and wire: `handleReadOnly` keeps answering `eth_chainId`, `net_version`, `eth_accounts`, `eth_requestAccounts` itself and sends `PROXIED_METHODS` to the proxy.
- [ ] **Step 4: Run to verify it passes**; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(expo): mini apps read the chain through the host`, push.

---

### Task 6: Expo — honest chain handling

**Files:**
- Modify: `apps/expo/lib/miniapp-wallet.ts` (`handleReadOnly`, `executeSigning`)
- Test: `apps/expo/lib/__tests__/miniapp-wallet-chain.test.ts`

**Interfaces:**
- Produces: `unsupportedChain(): BridgeErrorLike & { rpcCode: 4902 }` with message `Diese Mini-App läuft nur auf der Gnosis Chain.`; `assertHostChain(chainId: unknown): void` (accepts `undefined`, `100`, `'0x64'`, `'100'`; everything else throws `unsupportedChain()`).
- Rules: `wallet_switchEthereumChain([{ chainId }])` → `null` for Gnosis, else the error. `wallet_addEthereumChain` → the same rule on its `chainId`. `eth_sendTransaction` with a `chainId` field and `wallet_sendCalls` (Task 8) call `assertHostChain`.

- [ ] **Step 1: Write the failing test**

```ts
it('switching to Gnosis succeeds', async () => expect(await handleReadOnly('wallet_switchEthereumChain', [{ chainId: '0x64' }], undefined, proxy)).toBeNull());
it('switching to Base is refused with 4902', async () => {
  await expect(handleReadOnly('wallet_switchEthereumChain', [{ chainId: '0x2105' }], undefined, proxy)).rejects.toMatchObject({ code: 'unsupported', rpcCode: 4902 });
});
it('adding another chain is refused with 4902', …);
it('assertHostChain accepts 100 in its three spellings and nothing else', …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL (today a switch returns `null` for any chain).
- [ ] **Step 3: Implement.** `handleReadOnly` gains `params` and the proxy as arguments; update its one caller.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** → `fix(expo): mini-app chain switch away from Gnosis returns the standard error`, push.

---

### Task 7: Expo — what the confirm sheet says

**Files:**
- Create: `apps/expo/lib/miniapp-confirm.ts`
- Modify: `apps/expo/components/miniapp/WalletConfirmSheet.tsx` (`WalletConfirmRequest.warning?: string`, `.cta?: string`; a warning box above the buttons), `apps/expo/lib/miniapp-wallet.ts` (`buildConfirmRequest` delegates; delete `shortAddress` use in rows)
- Test: `apps/expo/lib/__tests__/miniapp-confirm.test.ts`

**Interfaces:**
- Consumes: `MiniApp.contracts` (Task 2); `callRules`, `findDeclaredCall` from `@netizen-labs/miniapp-sdk/host` (Task 1) with viem's `toFunctionSelector` (viem is a dependency of `apps/expo`).
- Produces:
  - `interface CallView { contract: string; action: string; amount?: string; declared: boolean }`
  - `KNOWN_CONTRACT_LABELS: Record<string, string>` (lowercased address → label): Circles Hub → `Röbel Münzen`, CitizenNFTv2 → `Bürgerregister`, AttesterNFTv2 → `Bescheiniger-Register`, MACI → `Abstimmung`, OrgRegistry → `Vereinsregister`.
  - `describeCall(app: Pick<MiniApp, 'contracts'>, call: { to?: string; data?: string; value?: string }, names: (address: string) => string | null): CallView` — declared: `contract` = declared label, `action` = the function name of the declared signature; known system contract: its label, action `Vertrags-Aufruf`, `declared: false`; a plain transfer (no data): `contract` = `names(to)` or `Unbekanntes Konto`, action `Überweisung`; anything else: `Unbekannter Vertrag`, `Unbekannte Funktion`. `amount` = formatted xDAI when value > 0.
  - `buildTransactionConfirm(app, calls, names): WalletConfirmRequest` — title `Transaktion bestätigen` (one call) or `${n} Aktionen bestätigen`; per call the rows `Vertrag`, `Aktion`, and `Betrag` when present (for several calls the labels are prefixed `1. `, `2. `, …); `warning` = `Diese Aktion hat die Mini-App nicht angemeldet. Bestätige nur, wenn du ihr vertraust.` when any call is not declared (for a version-1 app, which cannot declare, the text is `Prüfe genau, was du bestätigst.`); `cta` = `Bezahlen` when any amount is present, else `Bestätigen`.
  - Typed data: rows `Inhalt` (primary type) and `Für` (the domain name; when `verifyingContract` is declared or known, its label); message signing: the decoded text. No address in any row.
- `names` is supplied by the host: look for the existing "display name by wallet" lookup with `grep -rn "wallet_address" apps/expo/lib/supabase-users.ts apps/expo/lib/user-cache.ts` and use the cached variant; it returns `null` for unknown addresses.

- [ ] **Step 1: Write the failing test**

```ts
it('names a declared call by its label and function', () => {
  expect(describeCall(app, { to: TARGET, data: CHECK_IN }, () => null)).toEqual({ contract: 'Trainingsbuch', action: 'checkIn', declared: true });
});
it('an undeclared contract is unknown and never shows its address', () => {
  const v = describeCall(app, { to: OTHER, data: '0xdeadbeef' }, () => null);
  expect(v).toEqual({ contract: 'Unbekannter Vertrag', action: 'Unbekannte Funktion', declared: false });
});
it('a plain transfer shows the recipient by name and the amount', …);       // names → 'Bäckerei Müller', value 1e18 → amount '1'
it('a batch lists every call and warns when one is undeclared', () => {     // Review Focus 5
  const r = buildTransactionConfirm(app, [declared, declared, undeclared, ...seven], () => null);
  expect(r.title).toBe('10 Aktionen bestätigen');
  expect(r.rows.filter((x) => x.label.endsWith('Vertrag'))).toHaveLength(10);
  expect(r.warning).toMatch(/nicht angemeldet/);
});
it('a fully declared batch has no warning and says Bestätigen', …);
it('no row value contains a 0x address', …);                               // for every fixture above: !/0x[0-9a-fA-F]{6,}/.test(row.value)
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.** The warning box uses `colors.warning` if the theme has it, else the existing error colour token; no shadows.
- [ ] **Step 4: Run to verify it passes**; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(expo): mini-app confirm sheet names contracts and warns on undeclared calls`, push.

---

### Task 8: Expo — batches, capabilities, gasless sends

**Files:**
- Create: `apps/expo/lib/miniapp-calls.ts`
- Modify: `apps/expo/lib/miniapp-wallet.ts` (`executeSigning`, capabilities/status in `handleReadOnly`), `apps/expo/components/miniapp/MiniAppHost.tsx` (`walletRequest`)
- Modify: `apps/expo/lib/passkey/thirdweb-adapter.ts` (`send`), and the function it calls to post to `/api/passkey/sponsor` (follow `pollId` from `send` to the request body; `miniApp` travels the same way)
- Test: `apps/expo/lib/__tests__/miniapp-calls.test.ts`, extend `apps/expo/lib/passkey/__tests__/thirdweb-adapter.test.ts`

**Interfaces:**
- Consumes: `findDeclaredCall` (Task 1), `assertHostChain` (Task 6), `passkeySessionOf` (`apps/expo/lib/passkey/active.ts`), the sponsor route's `miniApp` field (Task 3).
- Produces:
  - `MAX_BATCH_CALLS = 10`
  - `parseSendCalls(params: unknown[], account: string): { calls: { to: string; data?: string; value?: string }[] }` — accepts the EIP-5792 object (`version`, `chainId`, `from`, `calls`, `atomicRequired`, `capabilities`); `chainId` through `assertHostChain`; `from`, when given, must equal the account; 1 to 10 calls, each with a 40-hex `to`; violations → `invalid_params`.
  - `preflightCalls(p: { app: Pick<MiniApp, 'manifestVersion' | 'contracts'>; calls; sponsored: boolean }): { ok: true; miniAppId: boolean } | { ok: false; error: BridgeErrorLike }` — `sponsored` = the account is a passkey session. For a sponsored account and a version-2 app: every call must be declared and carry no value, else `{ code: 'unauthorized', message: 'Diese Aktion ist für diese Mini-App nicht freigegeben.' }` **before any sheet is shown**; when all are declared, `miniAppId: true` (the app id is attached to the send). Version-1 apps and accounts on the old sign-in: always `ok`, `miniAppId: false` (today's path).
  - `capabilities(): Record<string, unknown>` = `{ '0x64': { atomic: { status: 'supported' } } }`.
  - `callsStatus(id: string, getReceipt: (hash: string) => Promise<{ status: string; … } | null>): Promise<{ version: '2.0.0'; id: string; chainId: '0x64'; status: 100 | 200 | 500; atomic: true; receipts?: unknown[] }>` — no receipt 100, status `0x1` 200, else 500.
  - `miniAppIdForTxs(txs: Array<{ miniAppId?: unknown }>): string | undefined` in the adapter module — all transactions of one send must carry the same id or none; a mix throws.
- Execution: `wallet_sendCalls` → one confirm sheet (`buildTransactionConfirm`) → `account.sendBatchTransaction(txs)` when the account has it, `account.sendTransaction` for a single call, otherwise `{ code: 'unsupported', message: 'Dieses Konto kann mehrere Aktionen nicht zusammen senden.' }` → result `{ id: <transaction hash> }`. For a passkey session with `miniAppId: true`, each tx object passed to the account carries `miniAppId: app.id` and `chainId: 100`, and `eth_sendTransaction` takes the same route (call `account.sendTransaction` directly instead of thirdweb's `prepareTransaction`, which drops unknown fields). Sponsor answers: 403 → `{ code: 'unauthorized', message: 'Diese Aktion ist für diese Mini-App nicht freigegeben.' }`; 429 with `scope: 'app'` → `{ code: 'budget_exceeded', message: 'Das Gas-Budget dieser Mini-App ist aufgebraucht.' }`; `scope: 'person'` → `{ code: 'budget_exceeded', message: 'Du hast dein Tageslimit für Mini-Apps erreicht. Morgen geht es weiter.' }`; `scope: 'global'` → `{ code: 'budget_exceeded', message: 'Mini-Apps sind heute ausgelastet. Bitte versuch es morgen wieder.' }`.

- [ ] **Step 1: Write the failing tests**

```ts
it('parses a 5792 request', …);
it('refuses another chain, a foreign from, zero calls and eleven calls', …);
it('a passkey account and a version-2 app: an undeclared call is refused before the sheet', () => {
  expect(preflightCalls({ app: v2, calls: [undeclared], sponsored: true })).toEqual({ ok: false, error: expect.objectContaining({ code: 'unauthorized' }) });
});
it('a passkey account and a version-2 app: declared calls carry the mini-app id', …);     // { ok: true, miniAppId: true }
it('a declared call with value is refused on a passkey account', …);
it('the old sign-in is never pre-checked', …);                                              // sponsored false, undeclared → { ok: true, miniAppId: false }
it('a version-1 app is never pre-checked', …);
it('status maps no receipt, success and revert to 100, 200, 500', …);
// thirdweb-adapter.test.ts (added)
it('passes the mini-app id to the sponsor request', …);        // send([{ to, data, miniAppId: 'uuid' }]) → sendUserOp called with miniApp: 'uuid'
it('refuses a batch that mixes mini-app ids', …);
it('a send without a mini-app id is unchanged', …);            // no miniApp key in the sendUserOp argument
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**; the whole `lib/passkey/__tests__` folder → PASS; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(expo): wallet_sendCalls and gasless declared calls for mini apps`, push.

---

### Task 9: Expo — `roebel.pay`

**Files:**
- Create: `apps/expo/lib/miniapp-pay.ts`
- Modify: `apps/expo/components/miniapp/MiniAppHost.tsx` (`pay` handler)
- Test: `apps/expo/lib/__tests__/miniapp-pay.test.ts`

**Interfaces:**
- Consumes: `prepareSendRoebelTaler`, `parseTalerAmount`, `getMuenzenBalance` (`apps/expo/lib/roebel-taler.ts`); the name lookup from Task 7; `walletAllowed`; `WalletConfirmSheet`.
- Produces:
  - `PAY_LIMITS = { maxAmount: 10_000, maxMemo: 80 }`
  - `parsePay(p: unknown): { to: string; amount: number; memo?: string }` — `to` a 40-hex address, `amount` a number > 0, at most 10,000, at most 2 decimal places, `memo` trimmed, at most 80 characters; violations → `invalid_params` with a German message.
  - `buildPayConfirm(appName: string, p: { recipientName: string; amount: number; memo?: string }): WalletConfirmRequest` — title `Röbel Münzen senden`, rows `An` (the name), `Betrag` (`${amount} Röbel Münzen`), `Verwendungszweck` (when a memo is given), `cta: 'Bezahlen'`.
- Handler: needs the `wallet` permission (the router already enforces it) and `walletAllowed`; `parsePay`; the recipient must resolve to a name (a person or an org account), else `{ code: 'invalid_params', message: 'Der Empfänger ist in Röbel nicht bekannt.' }`; paying yourself is refused; a balance below the amount → `{ code: 'invalid_params', message: 'Dein Guthaben reicht dafür nicht.' }`; sheet; send the prepared transfer with the same account the host signs with; result `{ txHash }`. The memo is shown and returned to nobody else: it is not written on chain and not logged. Telemetry: `track('pay', { amount })` only.
- On an independent account the transfer is an everyday action the sponsor already accepts (Circles Hub `safeTransferFrom` of the person's own balance); no mini-app id is attached.

- [ ] **Step 1: Write the failing test**

```ts
it('accepts a normal payment', () => expect(parsePay({ to: A, amount: 2.5, memo: ' Kaffee ' })).toEqual({ to: A, amount: 2.5, memo: 'Kaffee' }));
it('refuses zero, negative, more than 10000, three decimals, NaN', …);
it('refuses a recipient that is not an address', …);
it('refuses a memo over 80 characters', …);
it('the sheet shows the name, never the address', () => {
  const r = buildPayConfirm('Demo', { recipientName: 'PSV Röbel', amount: 5, memo: 'Beitrag' });
  expect(r.rows).toEqual([{ label: 'An', value: 'PSV Röbel' }, { label: 'Betrag', value: '5 Röbel Münzen' }, { label: 'Verwendungszweck', value: 'Beitrag' }]);
  expect(r.cta).toBe('Bezahlen');
});
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify it passes**; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(expo): roebel.pay in the mini-app host`, push.

---

### Task 10: Expo — the three missing events

**Files:**
- Create: `apps/expo/lib/miniapp-host-events.ts`
- Modify: `apps/expo/components/miniapp/MiniAppHost.tsx` (`ready` handler stores `handlesBack`; `onRequestClose`; effects; `buildContext` adds `host.theme`)
- Test: `apps/expo/lib/__tests__/miniapp-host-events.test.ts`

**Interfaces:**
- Produces:
  - `interface HostSignals { open: boolean; appActive: boolean; dark: boolean }`
  - `eventsFor(prev: HostSignals | null, next: HostSignals): { event: 'visibilityChanged' | 'themeChanged'; data: unknown }[]` — `visibilityChanged { visible }` when `open && appActive` changes (nothing on the first call); `themeChanged { theme }` when `dark` changes while open.
  - `backPress(handlesBack: boolean): 'event' | 'close'`.
- Host: `useTheme().isDark` and `AppState` feed `eventsFor`; each result goes to `bridge.sendEvent`. Android back (`Modal.onRequestClose`): `backPress(handlesBack)`; `'event'` sends `back` and keeps the host open (the app closes itself with `sdk.actions.close()`); `'close'` closes as today. The ✕ in the header always closes. `handlesBack` resets on every open.

- [ ] **Step 1: Write the failing test**

```ts
it('sends nothing on the first signal', () => expect(eventsFor(null, { open: true, appActive: true, dark: false })).toEqual([]));
it('backgrounding the app hides, returning shows', () => {
  expect(eventsFor(on, { ...on, appActive: false })).toEqual([{ event: 'visibilityChanged', data: { visible: false } }]);
  expect(eventsFor({ ...on, appActive: false }, on)).toEqual([{ event: 'visibilityChanged', data: { visible: true } }]);
});
it('a theme switch while open is reported', …);                             // [{ event: 'themeChanged', data: { theme: 'dark' } }]
it('a theme switch while closed is not', …);
it('back closes unless the app said it handles it', () => { expect(backPress(false)).toBe('close'); expect(backPress(true)).toBe('event'); });
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify it passes**; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(expo): mini-app host sends back, visibilityChanged and themeChanged`, push.

---

### Task 11: Web host parity

**Files:**
- Modify: `apps/web/src/lib/miniapp-host/index.ts` (`walletRequest`, `pay` message), `apps/web/src/components/mini-apps/Playground.tsx` (the confirm dialog text)
- Create: `apps/web/src/lib/miniapp-host/confirmText.ts`
- Test: `apps/web/tests/miniapp-web-host-confirm.test.ts`

**Interfaces:**
- Consumes: `findDeclaredCall` (Task 1), `gateWalletRequest` (plan 1).
- Produces: `confirmText(app: { name: string; contracts?: DeclaredContract[] }, req: Eip1193RequestArgs, toSelector): string` — the reviewer's confirmation text: the app name, the method, and for `eth_sendTransaction` / `wallet_sendCalls` one line per call `<Label> · <function>` or `NICHT ANGEMELDET · <address>` (the reviewer is the one person who should see the address). Reads and `wallet_sendCalls` go to the reviewer's wallet provider as they are; `roebel.pay` stays unsupported in the web preview with the message `Zahlungen lassen sich nur in der App testen.`

- [ ] **Step 1: Write the failing test**

```ts
test("a declared call is shown by label and function", () => assert.match(confirmText(app, send(TARGET, CHECK_IN), sel), /Trainingsbuch · checkIn/));
test("an undeclared call is flagged with its address", () => assert.match(confirmText(app, send(OTHER, "0xdeadbeef"), sel), /NICHT ANGEMELDET · 0x/));
test("every call of wallet_sendCalls gets a line", …);          // three calls → three lines
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify it passes**; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(web): reviewer preview shows declared and undeclared calls`, push.

---

## Owner gates

1. Apply `supabase/migrations/20261117b_mini_app_contracts_gas.sql` through the Supabase MCP (confirm the project ref first).
2. Web env: optional `MINIAPP_GAS_PER_PERSON_DAILY_WEI`, `MINIAPP_GAS_GLOBAL_DAILY_WEI`. The mini-app budget uses the shared store only when `PASSKEY_SPONSOR_BUDGET_STORE=supabase` is set (it is an existing production gate of the sovereign sign-up project); with the in-memory store the limits are per server instance.
3. Paymaster funding covers mini-app gas too: at the default global cap that is up to 0.05 xDAI per day on top of the citizens' budget.
4. Per app, at review: check the declared contracts and functions in the admin page, then grant a gas budget.
5. Deploy web, then the Expo OTA. Device pass on one account of each kind (old sign-in, passkey, 12 words): a read, a chain switch (error), a declared call (gasless on the independent accounts), an undeclared call (refused before the sheet on the independent accounts, warned on the old sign-in), `roebel.pay` to an org, Android back with and without `handlesBack`.

## Self-review (done while writing)

- Spec 5.5 bullets → tasks: reads (1, 5), chain honesty (1, 6), batches (1, 8), gasless on every account type (2, 3, 4, 8), confirm sheet (7), `roebel.pay` (9), events (1, 10). Web host kept in step (11).
- Review Focus lines 1 to 5 each name their test.
- Names checked across tasks: `DeclaredContract`, `CallRule`, `callRules` and `findDeclaredCall` (SDK host, the one shared rule), `rulesFor` (node), `MiniAppGasBudget`, `GasVerdict`, `preflightCalls`, `miniAppIdForTxs`, `assertHostChain`, `unsupportedChain`, `buildTransactionConfirm`, `eventsFor`.
- Not in this plan on purpose: sponsoring undeclared calls, other chains, payouts to unknown addresses.
