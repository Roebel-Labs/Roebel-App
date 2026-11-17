# Credential Register 2 — Node Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the register a node side: locked mirror tables, a batch builder that turns a list of people into a Merkle batch, server routes for dashboard, Studio and app, the hand-off that lets a phone confirm what a desktop prepared, invitation delivery, chain → mirror sync, sponsor allowlist entries and the data-protection paperwork.

**Architecture:** All logic lives in `apps/web/src/lib/credentials/` as pure modules over an injected `CredentialStore` (in-memory in tests, Supabase with the service role in production). Nothing on chain is ever sent by the server on a person's behalf: a desktop prepares an **action** (an ordered list of register steps), the phone fetches the steps, encodes the calls itself and sends them, and the server learns the outcome from the chain. The chain is the truth; the mirror exists to make lists fast and to hold the salts and claim keys that make the proofs.

**Tech Stack:** Next.js 15 route handlers (`runtime = "nodejs"`), Supabase Postgres (migration files; applied through the Supabase MCP by the owner), viem ^2.47, `@netizen-labs/credential-registry` (plan 1), node:test via tsx, `@react-pdf/renderer` and `qrcode` (already dependencies), the existing `send-notification` edge function, Resend through the existing mailer.

**Spec:** `docs/superpowers/specs/2026-11-17-credential-register-design.md` (sections 5.3, 5.4, 5.7, 6, 8). Contract and encodings: `docs/superpowers/plans/2026-11-17-credreg-1-contract.md` ("The interface", "Encodings"). Read both.

**Depends on:** plan 1 merged or this branch based on `feat/credreg-1-contract`. The owner decisions repeated at the top of plan 1 apply here.


> **Owner decision update 2026-11-17 (overrides item 1 below and every "private-only" rule in this plan):**
> each person can switch a credential between public and private at any time (public → private = renounce, and
> the app says the earlier public record stays in the chain history). The private-only switch belongs to the
> **org**: "Mitglieder dürfen öffentlich sichtbar sein". `fraktion` and `stadt` orgs start with it off and **the
> org's authority can turn it off and on**; an attester can only turn it off; the contract owner can do both.
> Offices stay always public. Zero-knowledge membership proofs are a later plan (`credreg-6-zk`); keep the leaf
> format and type ids so a Semaphore-style group per type can be added without a redeploy of this contract if
> possible, and say in your final report whether it is.

## Open questions for the owner

1. **Where type metadata lives.** Spec 7 says "follow what OrgRegistry metadata does", but the app registers orgs with an empty metadata URI, so there is nothing to follow. *Default: the node serves ERC-1155 metadata JSON at `https://www.roebel.app/api/credentials/types/<typeId>/metadata`, and that URL is what goes on chain. Name and image can then be corrected without a transaction; the price is that card art depends on the node (holding and validity never do). Alternative: upload to Irys through the existing `/api/irys/upload` and store the permanent URL.*
2. **Phone numbers.** Spec 5.4 allows "optional email or phone". There is no SMS sending for this. *Default: name plus optional email only; no phone number is collected. People without the app get a link, a QR code or a printed letter.*
3. **Who confirms on the phone.** *Default: any owner or admin of the org may confirm an action another owner or admin prepared; the person who prepared it gets the push.*
4. **How long a prepared action waits.** *Default: 7 days, then it expires and must be prepared again.*
5. **One registry address per database.** The preview device pass runs against the test-environment registry. *Default: the server reads `CREDENTIAL_REGISTRY_ADDRESS`; the mirror records which address it belongs to and the sync refuses to mix two; switching to the production registry empties the mirror first (Owner gates).*

## Global Constraints

- UI and user-facing error text German; code, comments and log lines English. Never return or log a wallet address where a person could read it; API responses that must carry an account address for the app's own use are allowed, screens never show it.
- "Röbel Münzen" by name. No vendor names in user-facing text.
- Web routes must accept **both** the app's signed request (`apps/web/src/lib/signed-request/verify.ts`, which already includes the passkey API session) **and** the pairing session (`apps/web/src/lib/chat/session.ts` `verifySessionToken`). Routes that hand out proofs or claim signatures accept the app only.
- Modules that tests load with `npx tsx --test` use **relative imports**, not the `@/` alias (see the header of `apps/web/src/lib/signed-request/message.ts`).
- Supabase: every schema change is a file under `supabase/migrations/`. New tables: RLS enabled, no policies, `revoke all … from anon, authenticated`. Applying a migration and deploying an edge function are owner gates through the Supabase MCP, never an agent step.
- The server never holds a key that can issue for an org, with one exception introduced in plan 4 (the optional badge delegate).
- No new npm dependencies except `@netizen-labs/credential-registry` (`workspace:*`). pnpm only.
- Web tests: `cd apps/web && npx tsx --test tests/<file>`. Lint: `cd apps/web && npx next lint --file <path>` for touched files.
- Work in a git worktree: `git worktree add .worktrees/credreg-2 -b feat/credreg-2-backend` (from `feat/credreg-1-contract` if that is not on `main` yet), `pnpm install --frozen-lockfile`. Stage by explicit path. Every task ends with commit + `git push -u origin feat/credreg-2-backend`. Never merge to `main`, never deploy.
- Commit convention: `feat(web): …`, `feat(credential-registry): …`, `test(web): …`, `docs: …`.

## Review Focus

1. **A desktop session reads a person's private proof.** A paired Studio or browser session is weaker than the phone. Expected: `mine`, `redeem`, `respond`, `present_create` refuse a pairing session with 403. Test in Task 3 and Task 8.
2. **The same list uploaded twice, or the same person twice in one list.** Expected: one invitation per person per type per batch; a second batch for people who already hold a live invitation is offered as a renewal, not silently duplicated. Test in Task 5.
3. **The phone sends the transaction but never reports back** (app killed, no network). Expected: the next sync finds the batch by its root, marks the action done and sends the invitations exactly once. Test in Task 6.
4. **A link opened by two people.** Expected: the first signed-in account that redeems a claim-key link owns it; the second gets "Dieser Ausweis wurde bereits abgeholt." Test in Task 8.
5. **A party membership leaking through a status list or a push.** Expected: for an org whose members may not be public the push text names neither org nor type, and no route reveals whether an accepted invitation was claimed publicly unless the chain already shows it. Test in Task 5 and Task 7.

---

### Task 1: Schema

**Files:**
- Create: `supabase/migrations/20261117cra_credential_register.sql` (the `20261117cr` prefix is reserved for the credential register plans: `cra` here, `crb` plan 4, `crc` plan 6)
- Test: `apps/web/tests/credentials-migration.test.ts`

**Interfaces:**
- Produces tables (all `text` ids are lowercase 0x-hex unless noted):
  - `credential_types`: `type_id text primary key`, `registry text not null`, `account_id uuid references accounts(id) on delete set null` (null = community), `org_id text not null`, `local_uuid uuid`, `local_id text not null`, `kind text check (kind in ('role','membership','badge'))`, `policy text check (policy in ('issuer_batch','self_claim','external'))`, `name text not null`, `description text`, `image_url text`, `benefits jsonb not null default '[]'`, `template text`, `default_validity_seconds bigint not null default 0`, `claim_start timestamptz`, `claim_end timestamptz`, `supply_cap integer not null default 0`, `public_claim boolean not null default true`, `recognised boolean not null default false`, `retired boolean not null default false`, `chain_status text not null default 'draft' check (chain_status in ('draft','onchain'))`, `event_id uuid references events(id) on delete set null`, `created_by text not null`, `created_at timestamptz not null default now()`.
  - `credential_actions`: `id uuid primary key default gen_random_uuid()`, `account_id uuid`, `steps jsonb not null`, `summary jsonb not null`, `status text not null default 'awaiting_confirmation' check (status in ('awaiting_confirmation','submitted','done','failed','cancelled','expired'))`, `prepared_by text not null`, `prepared_via text not null check (prepared_via in ('app','dashboard','studio','node'))`, `confirmed_by text`, `tx_hash text`, `error text`, `created_at`, `expires_at timestamptz not null`.
  - `credential_batches`: `id uuid primary key`, `action_id uuid references credential_actions(id)`, `type_id text not null references credential_types(type_id)`, `root text not null`, `count integer not null`, `chain_batch_id bigint`, `status text not null default 'prepared' check (status in ('prepared','onchain','revoked','cancelled'))`, `source text not null check (source in ('people','member_list','event','node_delegate'))`, `created_at`. Unique `(root)` where `status <> 'cancelled'`.
  - `credential_invitations`: `id uuid primary key`, `batch_id uuid not null references credential_batches(id) on delete cascade`, `type_id text not null`, `leaf_kind text check (leaf_kind in ('account','claim_key'))`, `subject text not null`, `valid_until bigint not null default 0`, `salt text not null`, `leaf_hash text not null`, `proof jsonb not null`, `claim_key_enc text`, `token_hash text unique`, `token_enc text`, `recipient_wallet text`, `display_name text`, `contact_email text`, `email_sent_at timestamptz`, `status text not null default 'prepared' check (status in ('prepared','invited','accepted','declined','revoked'))`, `claimed_onchain boolean not null default false`, `invited_at`, `responded_at`, `created_at`. Indexes on `(recipient_wallet, status)`, `(batch_id)`, `(leaf_hash)`.
  - `credential_delegates`: `type_id text`, `delegate text`, `label text`, `active boolean`, primary key `(type_id, delegate)`.
  - `credential_presentations`: `code_hash text primary key`, `payload jsonb not null`, `expires_at timestamptz not null`.
  - `credential_sync_state`: `id boolean primary key default true check (id)`, `registry text not null`, `last_block bigint not null`.
- Produces: `alter table accounts add column if not exists credentials_members_public boolean;` (null = never set on chain, the sub-type default applies; written only by the sync from `OrgPrivateOnlySet`, so it always mirrors the chain) and `app_settings` rows `credentials_enabled` = `'false'`, `credentials_enabled_production` = `'false'` (`on conflict (key) do nothing`).
- The file ends with a commented block `-- RESET (switching registry address): truncate credential_presentations, credential_invitations, credential_batches, credential_actions, credential_delegates, credential_types, credential_sync_state;`.

- [ ] **Step 1: Write the failing test** — reads the SQL file as text and asserts: each of the seven `create table if not exists public.credential_*` statements is present; each of those seven tables has `enable row level security` and a `revoke all on table public.<name> from anon, authenticated`; the file contains no `create policy`; the two `app_settings` keys and the `accounts` column are present.
- [ ] **Step 2: Run** `cd apps/web && npx tsx --test tests/credentials-migration.test.ts` — Expected: FAIL (file missing).
- [ ] **Step 3: Write the migration.** Follow the default-privileges note in an existing locked table (search `supabase/migrations` for `revoke all on table public.nostr_identities` or `chat_device_pairings` and copy its header comment style and grant handling).
- [ ] **Step 4: Run** the test — Expected: PASS. **Commit** — `feat(web): credential register mirror tables (migration file, not applied)`.

---

### Task 2: Register steps in the shared package

A desktop prepares steps, the phone encodes them, the server checks the receipt. One definition for all three.

**Files:**
- Create: `packages/credential-registry/src/steps.ts`
- Modify: `packages/credential-registry/src/index.ts`
- Test: `packages/credential-registry/test/steps.test.ts`

**Interfaces:**
- Consumes: `CREDENTIAL_REGISTRY_ABI`, `Leaf` (plan 1).
- Produces:

```ts
export type TypeConfigInput = { metadataURI: string; defaultValidity: number; claimStart: number; claimEnd: number; supplyCap: number; publicClaim: boolean };
export type RegisterStep =
  | { fn: "createType"; orgId: Hex; localId: Hex; kind: "role" | "membership" | "badge"; policy: "issuerBatch" | "selfClaim"; config: TypeConfigInput }
  | { fn: "updateType"; typeId: Hex; config: TypeConfigInput }
  | { fn: "retireType"; typeId: Hex }
  | { fn: "setDelegate"; typeId: Hex; delegate: Address; allowed: boolean }
  | { fn: "setOrgPrivateOnly"; orgId: Hex; privateOnly: boolean }  // true = "Mitglieder dürfen öffentlich sichtbar sein" off
  | { fn: "addBatch"; typeId: Hex; root: Hex; count: number }
  | { fn: "revokeLeaves"; batchId: string; leaves: Hex[] }        // batchId as decimal string (JSON-safe)
  | { fn: "revokeBatch"; batchId: string };
export function parseSteps(raw: unknown): RegisterStep[];          // throws on any unknown fn, missing field, bad hex or more than 20 steps
export function encodeSteps(steps: readonly RegisterStep[], registry: Address): { to: Address; data: Hex }[];
export function claimCall(registry: Address, p: { batchId: bigint; leaf: Leaf; proof: readonly Hex[]; claimSignature?: Hex }): { to: Address; data: Hex };
export function selfClaimCall(registry: Address, typeId: Hex): { to: Address; data: Hex };
export function renounceCall(registry: Address, typeId: Hex): { to: Address; data: Hex };
export type ChainLog = { address: Address; topics: readonly Hex[]; data: Hex };
export function stepsConfirmedBy(steps: readonly RegisterStep[], registry: Address, logs: readonly ChainLog[]):
  { ok: true; batchIds: Record<string /* root */, bigint> } | { ok: false; missing: number /* index of the first unconfirmed step */ };
```

`stepsConfirmedBy` matches, in order and only among logs emitted by `registry`: `createType` → `TypeCreated` with the expected type id; `updateType` → `TypeConfigured`; `retireType` → `TypeRetired`; `setDelegate` → `DelegateSet` (delegate, allowed); `setOrgPrivateOnly` → `OrgPrivateOnlySet(orgId, privateOnly)`; `addBatch` → `BatchAdded` with the same `typeId` and `root`; `revokeLeaves` → one `LeafRevoked` per leaf; `revokeBatch` → `BatchRevoked`.

- [ ] **Step 1: Write the failing tests**

```ts
test("encodeSteps round-trips through decodeFunctionData for every step kind", …);
test("parseSteps rejects an unknown fn, a 21st step, a short root and a non-boolean allowed", …);
test("stepsConfirmedBy returns the chain batch id per root", …);          // BatchAdded(7, typeId, issuer, root, 3) → { [root]: 7n }
test("stepsConfirmedBy ignores a matching event from another contract address", …);
test("stepsConfirmedBy reports the first missing step", …);
test("claimCall passes 0x as signature for an account leaf", …);
```

- [ ] **Step 2: Run** `cd packages/credential-registry && pnpm test` — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(credential-registry): register steps shared by desktop, phone and server`.

---

### Task 3: Server core — config, callers, org rights, store, metadata

**Files:**
- Modify: `apps/web/package.json` (add `"@netizen-labs/credential-registry": "workspace:*"`), `apps/web/next.config.*` (add it to `transpilePackages`; add a headers entry for `/api/credentials/:path*` identical to the `/api/chat/:path*` one at about line 153)
- Modify: `apps/web/src/lib/signed-request/message.ts` (add the scope and action type)
- Create: `apps/web/src/lib/credentials/config.ts`, `caller.ts`, `rights.ts`, `store.ts`, `store-supabase.ts`, `templates.ts`, `metadata.ts`, `secrets.ts`
- Create: `apps/web/src/app/api/credentials/types/[typeId]/metadata/route.ts`
- Test: `apps/web/tests/credentials-caller.test.ts`, `credentials-rights.test.ts`, `credentials-metadata.test.ts`, `credentials-secrets.test.ts`

**Interfaces:**
- Produces (`signed-request/message.ts`): `CREDENTIALS_SCOPE = "roebel-credentials-v1"`; `type CredentialAction = "types_list" | "type_prepare" | "people_list" | "people_search" | "batch_prepare" | "revoke_prepare" | "delegate_prepare" | "members_public_prepare" | "orgs_list" | "actions_list" | "action_get" | "action_submitted" | "action_cancel" | "letters" | "mine" | "redeem" | "respond" | "holdings" | "present_create" | "present_resolve" | "people_preview" | "event_badges_list" | "event_badge_setup" | "event_badge_get" | "event_badge_prepare" | "event_badge_auto" | "badge_nudge" | "zk_join" | "zk_status"` (the whole union is declared here once and mirrored in `apps/expo/lib/signed-request.ts`; `people_preview` and the event/badge actions are implemented in plan 4, the two `zk_*` actions in plan 6).
- Produces (`config.ts`): `registryConfig(): { address: Address; deployBlock: bigint; chainId: 100 } | null` from `CREDENTIAL_REGISTRY_ADDRESS` and `CREDENTIAL_REGISTRY_DEPLOY_BLOCK`; `publicBaseUrl()` = `https://www.roebel.app` unless `NEXT_PUBLIC_SITE_URL` is set; `ACTION_TTL_MS = 7 * 24 * 60 * 60 * 1000`.
- Produces (`caller.ts`):

```ts
export type Caller = { ok: true; wallet: string; via: "signature" | "passkey_session" | "chat_session"; action: CredentialAction; payload: Record<string, unknown> };
export const APP_ONLY_ACTIONS: readonly CredentialAction[] = ["mine", "redeem", "respond", "present_create", "action_submitted"];
export async function authenticateCaller(
  request: { headers: { get(n: string): string | null } }, body: unknown, actions: readonly CredentialAction[],
  deps?: { verifySigned?: typeof verifySignedRequest; verifyChatToken?: (t: string | null) => Promise<string | null> },
): Promise<Caller | VerifyFail>;
```

  Rule: a `Bearer` token that does not start with `pst1.` is tried as a chat session token; if it verifies, the caller is `{ wallet: sub, via: "chat_session" }` with `action` and `payload` read from the body, and an action in `APP_ONLY_ACTIONS` is refused with `403 APP_ONLY` ("Das geht nur in der Röbel App."). A Bearer token that fails verification is `401`, never a fall-through. Everything else goes to `verifySignedRequest(body, { scope: CREDENTIALS_SCOPE, actions, headers })`.
- Produces (`rights.ts`):
  - `type OrgContext = { accountId: string; orgId: Hex; name: string; subType: string | null; membersPublicColumn: boolean | null; role: "owner" | "admin" }`
  - `orgContextFor(store: CredentialStore, accountId: string, wallet: string): Promise<OrgContext | { error: "FORBIDDEN" | "NOT_FOUND" }>` — role from `account_owners` (owner or admin only; member is `FORBIDDEN`), `orgId` = `orgIdFromUuid(accountId)` from `@netizen-labs/protocol`.
  - `SENSITIVE_SUB_TYPES = ["fraktion", "stadt"] as const`; `membersMayBePublic(o: { subType: string | null; membersPublicColumn: boolean | null }): boolean` = `membersPublicColumn ?? !SENSITIVE_SUB_TYPES.includes(subType)` (spec 5.3: Fraktion and Stadt start closed, every other org open; once the chain flag was set, the chain decides).
  - `needsPrivateOnlyStep(o: OrgContext, chainPrivateOnly: boolean): boolean` = `!membersMayBePublic(o) && !chainPrivateOnly` (a closed org whose chain flag is not set yet: the next prepared action that creates a membership type sets it first).
  - `chainReadiness(reader, o: OrgContext, wallet: Address): Promise<"ready" | "org_not_registered" | "no_chain_authority">` — `org_not_registered` when `OrgRegistry.isRegistered(orgId)` is false; `no_chain_authority` when `reader.canManage(orgId, wallet)` is false.
- Produces (`store.ts`): `interface CredentialStore` with typed methods for every table in Task 1 (`getAccount`, `roleOf`, `listTypes`, `upsertType`, `insertAction`, `getAction`, `updateAction`, `listActions`, `insertBatchWithInvitations`, `getBatchByRoot`, `listInvitations`, `updateInvitation`, `findInvitationByTokenHash`, `invitationsForWallet`, `syncCursor`, `setSyncCursor`, `putPresentation`, `takePresentation`, …) and `class InMemoryCredentialStore implements CredentialStore`. `store-supabase.ts`: `supabaseCredentialStore(admin: SupabaseClient): CredentialStore` (pattern: `apps/web/src/lib/passkey/email-store.ts` + `email-store-supabase.ts`).
- Produces (`templates.ts`): `TYPE_TEMPLATES: Record<"mitglied" | "vorstand" | "mitarbeiter" | "ehrenmitglied" | "stadtvertreter" | "abzeichen", { name: string; kind: "role" | "membership" | "badge"; description: string; defaultValiditySeconds: number; benefits: string[] }>` — `mitglied` membership "Mitglied", `vorstand` role "Vorstand", `mitarbeiter` membership "Mitarbeiter:in", `ehrenmitglied` membership "Ehrenmitglied", `stadtvertreter` role "Stadtvertreter:in", `abzeichen` badge "Abzeichen"; validity 0 for all (the org sets a date per batch).
- Produces (`metadata.ts`): `metadataUrl(typeId: Hex): string` = `` `${publicBaseUrl()}/api/credentials/types/${typeId}/metadata` ``; `typeMetadataJson(t: TypeRow, org: { name: string } | null): { name: string; description: string; image: string | null; properties: { kind: string; organisation: string | null; recognised: boolean; benefits: string[] } }`; `RESERVED_METADATA: Record<"citizen" | "attester" | "guest", …>` with names "Bürgerausweis", "Bescheiniger-Ausweis", "Gastkarte" and the intro texts from `apps/expo/lib/credentials.ts` `CREDENTIAL_COPY`. The three reserved URLs are `metadataUrl(RESERVED_TYPE_IDS.*)`: these are the `--uris` values for the production deploy script of plan 1.
- Produces (`secrets.ts`): `sealSecret(plain: string): string`, `openSecret(sealed: string): string` — AES-256-GCM under `CREDENTIAL_SECRETS_KEY` (32 bytes, base64), output `v1.<iv>.<ciphertext>.<tag>` base64url; throws when the key is missing. Same construction as the provider keys in `apps/web/src/lib/chat/provider-keys.ts`.
- The metadata route is public `GET`, `Cache-Control: public, max-age=300`, 404 for an unknown type, and never includes an account address.
- Also create `apps/web/src/app/api/credentials/types/route.ts`: public `GET`, the directory of types that are on chain and not retired: `{ types: { typeId, kind, name, imageUrl, orgName, orgAccountId, recognised }[] }`, same cache header, no account address, no counts. The app uses it to show another person's public cards (plan 3 Task 2); project 3 uses it to name types. Built by `typeDirectory(store): Promise<DirectoryEntry[]>` in `metadata.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// credentials-caller.test.ts
test("a chat session token authenticates a dashboard action", …);            // via === "chat_session"
test("a chat session is refused for every APP_ONLY action with 403 APP_ONLY", …);
test("a bad bearer token is 401 and never falls through to the signature", …);
test("a pst1. bearer goes to verifySignedRequest untouched", …);
test("a signed request with another scope is refused", …);
// credentials-rights.test.ts
test("member role is FORBIDDEN, owner and admin pass", …);
test("fraktion and stadt start closed, every other sub-type open; a set column wins in both directions", …);
test("needsPrivateOnlyStep only for a closed org whose chain flag is not set yet", …);
test("chainReadiness distinguishes an unregistered org from a caller without chain authority", …);
// credentials-metadata.test.ts
test("metadata JSON carries name, kind, organisation and benefits and no address", …);
test("reserved metadata exists for the three reserved type ids", …);
test("the type directory lists on-chain, non-retired types only and carries no address or count", …);
// credentials-secrets.test.ts
test("seal/open round-trips; a flipped byte fails; a missing key throws", …);
```

- [ ] **Step 2: Run** the four files — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS (13 tests). Run `cd apps/web && npx tsx --test tests/org-membership-message.test.ts` — Expected: still PASS.
- [ ] **Step 5: Commit** — `feat(web): credential register server core (callers, org rights, store, metadata)`.

---

### Task 4: Actions — prepare on the desktop, confirm on the phone

**Files:**
- Create: `apps/web/src/lib/credentials/actions.ts`, `notify.ts`
- Create: `apps/web/src/app/api/credentials/org/route.ts`, `apps/web/src/app/api/credentials/actions/route.ts`
- Test: `apps/web/tests/credentials-actions.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces (`actions.ts`):

```ts
export type ActionSummary = { title: string; lines: string[]; orgName: string | null; counts?: { app: number; link: number } };
export async function prepareAction(d: Deps, p: { org: OrgContext | null; wallet: string; via: "app" | "dashboard" | "studio" | "node"; steps: RegisterStep[]; summary: ActionSummary; batchIds?: string[] }): Promise<{ actionId: string; expiresAt: string }>;
export async function prepareTypeAction(d: Deps, c: Caller, p: { accountId: string; op: "create" | "update" | "retire"; typeId?: Hex; template?: string; name?: string; description?: string; imageUrl?: string; benefits?: string[]; kind?: Kind; publicClaim?: boolean; supplyCap?: number; claimStart?: string; claimEnd?: string }): Promise<Result<{ actionId: string; typeId: Hex }>>;
export async function prepareDelegateAction(d: Deps, c: Caller, p: { accountId: string; typeId: Hex; delegate: Address; allowed: boolean; label?: string }): Promise<Result<{ actionId: string }>>;
export async function prepareMembersPublicAction(d: Deps, c: Caller, p: { accountId: string; membersPublic: boolean }): Promise<Result<{ actionId: string }>>;   // one setOrgPrivateOnly(orgId, !membersPublic) step
export async function getActionForPhone(d: Deps, c: Caller, actionId: string): Promise<Result<{ id: string; status: string; steps: RegisterStep[]; summary: ActionSummary; registry: Address; expiresAt: string }>>;
export async function recordSubmitted(d: Deps, c: Caller, p: { actionId: string; txHash: Hex }): Promise<Result<{ status: "done" | "submitted" }>>;
export async function cancelAction(d: Deps, c: Caller, actionId: string): Promise<Result<null>>;
export async function listActions(d: Deps, c: Caller, accountId: string): Promise<Result<ActionView[]>>;
```

  `Deps = { store: CredentialStore; reader: CredentialRegistryReader; receipt: (tx: Hex) => Promise<{ status: "success" | "reverted"; logs: ChainLog[] } | null>; notify: Notifier; now: () => number; registry: Address }`.
- Produces (`notify.ts`): `interface Notifier { push(p: { wallets: string[]; type: "credential_action" | "credential_invite"; title: string; body: string; data: Record<string, string> }): Promise<void> }`; `sendNotificationNotifier()` posting to the `send-notification` edge function (pattern: `apps/web/src/lib/chat/push.ts`), best effort, never throws.
- Routes: `POST /api/credentials/org` dispatches `types_list`, `type_prepare`, `delegate_prepare`, `members_public_prepare`, `orgs_list`, `actions_list` (and, from Task 5, `people_list`, `people_search`, `batch_prepare`, `revoke_prepare`, `letters`); `POST /api/credentials/actions` dispatches `action_get`, `action_submitted`, `action_cancel`. Both: `export const runtime = "nodejs"`, `503 NOT_CONFIGURED` when `registryConfig()` is null, responses through `jsonOk` / `jsonFail` from `signed-request/verify.ts`.

Rules:
- Creating a type: the server picks `local_uuid = randomUUID()`, `localId = localIdFromUuid(local_uuid)`, `typeId = credentialTypeId(orgId, localId)`, `metadataURI = metadataUrl(typeId)`, `publicClaim` = the request (default true; the org-wide switch is enforced on chain by `orgPrivateOnly`, so opening the org later needs no type edit), writes the `credential_types` row with `chain_status = 'draft'` and builds the step. When `kind === "membership"` and `needsPrivateOnlyStep(org, reader.orgPrivateOnly(orgId))`, a `setOrgPrivateOnly(orgId, true)` step is put **before** the `createType` step.
- `orgs_list` returns the orgs where the caller is owner or admin: `{ accountId, name, avatarUrl, subType, role, membersMayBePublic, onChain: "ready" | "org_not_registered" | "no_chain_authority" }[]` (Studio and the dashboard org picker use it).
- `prepareMembersPublicAction` summary title: "Mitglieder dürfen öffentlich sichtbar sein" (open) or "Mitglieder nur noch privat" (close).
- Before preparing anything: `chainReadiness`. `org_not_registered` → `409 ORG_NOT_ON_CHAIN` ("Diese Organisation ist noch nicht im öffentlichen Register eingetragen."); `no_chain_authority` → `409 NO_CHAIN_AUTHORITY` ("Dein Konto ist für diese Organisation noch nicht im Register berechtigt. Öffne in der App Organisation → Einstellungen → Onchain-Organisation und gleiche die Rollen ab.").
- `prepareAction` sets `expires_at = now + ACTION_TTL_MS` and pushes to the preparer: type `credential_action`, title = `summary.title` (for example "70 Mitgliedsausweise ausstellen"), body "Tippe, um in der App zu bestätigen.", data `{ type: "credential_action", actionId }`.
- `getActionForPhone` is allowed for any owner or admin of the action's org with `ready` chain authority; an expired action is marked `expired` and returned as such.
- `recordSubmitted` (app only): stores the hash, fetches the receipt; `reverted` → `failed` with the reason; `success` → `stepsConfirmedBy`; not confirmed → `failed`; confirmed → hand to `applyConfirmedAction` (Task 6) and return `done`; receipt not found yet → `submitted` (the sync finishes it).

- [ ] **Step 1: Write the failing tests**

```ts
test("type_prepare writes a draft row and a createType step with the node metadata URL", …);
test("the first membership type of a fraktion gets a leading setOrgPrivateOnly(true) step and keeps publicClaim true", …);
test("members_public_prepare opens and closes with one setOrgPrivateOnly step; a member role is FORBIDDEN", …);
test("orgs_list returns only owner/admin orgs with their chain readiness", …);
test("a membership type for a verein keeps the requested publicClaim", …);
test("preparing for an org that is not registered on chain is 409 ORG_NOT_ON_CHAIN and writes nothing", …);
test("a DB admin without chain authority gets 409 NO_CHAIN_AUTHORITY", …);
test("prepareAction pushes credential_action to the preparer with the action id", …);
test("another admin of the same org may fetch the action; an admin of another org gets 404", …);
test("an expired action is returned as expired and cannot be submitted", …);
test("recordSubmitted: reverted receipt → failed; missing receipt → submitted; confirmed receipt → done", …);
test("recordSubmitted refuses a receipt whose BatchAdded root differs from the step", …);
test("cancelAction works only while awaiting confirmation", …);
```

- [ ] **Step 2: Run** `npx tsx --test tests/credentials-actions.test.ts` — Expected: FAIL. **Step 3: Implement** (Task 6's `applyConfirmedAction` is injected through `Deps`; use a stub here). **Step 4: Run** — Expected: PASS (13 tests).
- [ ] **Step 5: Commit** — `feat(web): credential actions — prepare on the desktop, confirm on the phone`.

---

### Task 5: Batch builder, people and revocation

**Files:**
- Create: `apps/web/src/lib/credentials/batch.ts`, `people.ts`
- Modify: `apps/web/src/app/api/credentials/org/route.ts`
- Test: `apps/web/tests/credentials-batch.test.ts`, `credentials-people.test.ts`

**Interfaces:**
- Produces (`batch.ts`):

```ts
export type RecipientInput =
  | { kind: "account"; wallet: string; displayName?: string }
  | { kind: "contact"; name: string; email?: string };
export const MAX_BATCH_RECIPIENTS = 2000;
export type BuiltBatch = { root: Hex; count: number; invitations: NewInvitation[]; plainTokens: Map<string /* invitation id */, string> };
export function buildBatch(p: { typeId: Hex; recipients: readonly RecipientInput[]; validUntil: bigint; rand: (bytes: number) => Uint8Array; seal: (s: string) => string }): BuiltBatch;
export async function prepareBatch(d: Deps, c: Caller, p: { accountId: string; typeId: Hex; recipients?: RecipientInput[]; fromMemberList?: boolean; validUntil?: string /* ISO date, end of that day Europe/Berlin */ ; source?: "people" | "member_list" | "event" }): Promise<Result<{ actionId: string; batchId: string; counts: { app: number; link: number; skipped: number } }>>;
export async function prepareRevocation(d: Deps, c: Caller, p: { accountId: string; invitationIds?: string[]; batchId?: string }): Promise<Result<{ actionId: string }>>;
```

- Produces (`people.ts`): `normaliseRecipients(raw: unknown): { recipients: RecipientInput[]; rejected: { row: number; reason: string }[] }`; `parsePeopleCsv(text: string): unknown[]` (separator `,` or `;`, header row optional, columns name and e-mail in either order, detected by the `@`); `listPeople(d, c, { accountId, typeId })` → `{ id, displayName, state: "eingeladen" | "angenommen" | "abgelehnt" | "widerrufen" | "abgelaufen", public: boolean, validUntil: string | null, hasLink: boolean }[]`; `searchPeople(d, c, { accountId, query })` → app users by display name `{ wallet, displayName, avatarUrl }[]`, at most 20 (reuse the user search the member invite screen already has: `apps/web/src/lib/supabase-member-management.ts`).

Rules for `buildBatch`:
- An `account` recipient becomes an `Account` leaf with `subject = wallet`. A `contact` recipient gets a fresh secp256k1 key (`viem/accounts` `generatePrivateKey` driven by `rand`), a `ClaimKey` leaf with `subject = that key's address`, `claim_key_enc = seal(privateKey)`, and a link token of 32 random bytes (base64url) stored as `token_hash = sha256(token)` and `token_enc = seal(token)`.
- `salt` = 32 random bytes per leaf. `leaf_hash` and `proof` come from `leafHash` and `buildTree` of the package. `count` = number of leaves.
- Duplicates inside one call (same wallet, or same lowercase email, or same name without email) collapse to one.
- More than `MAX_BATCH_RECIPIENTS` or zero recipients is an error.

Rules for `prepareBatch`:
- `fromMemberList` loads `account_owners` of the org (all roles) as `account` recipients.
- People who already have an invitation for this type that is `invited` or `accepted`, not revoked, and whose `valid_until` is 0 or not before the new `validUntil`, are skipped and counted in `skipped`. Everyone else is included (this is how a renewal works).
- Writes batch (`prepared`) and invitations (`prepared`) in one store call, then `prepareAction` with one `addBatch` step. Summary title: `` `${count} ${count === 1 ? "Ausweis" : "Ausweise"} ausstellen: ${typeName}` `` for roles and memberships, `` `${count} Abzeichen vergeben: ${typeName}` `` for badges; `counts.app` and `counts.link` as built.
- Never puts an email, a name or a wallet into `steps` or `summary`.

Rules for `prepareRevocation`: given invitation ids of one batch → one `revokeLeaves` step with their leaf hashes (at most 200 per step, more steps if needed, at most 20 steps); given `batchId` → `revokeBatch`. Only for batches that are `onchain`.

Rules for `listPeople`: `public` is true only when `claimed_onchain` is true (the chain shows it anyway). Accepted-but-private and declined are both shown as their state; nothing else about a private holder is returned.

- [ ] **Step 1: Write the failing tests**

```ts
test("70 account recipients build one root; every stored proof verifies against it", …);
test("a contact recipient gets a claim-key leaf, a sealed key and a token whose hash is stored", …);
test("no plaintext claim key or token is in the invitation rows", …);
test("the same person twice in one list is one leaf", …);
test("2001 recipients and an empty list are refused", …);
test("prepareBatch skips people with a live invitation and includes expired or revoked ones", …);
test("fromMemberList uses every account_owners row of the org", …);
test("steps and summary contain no name, email or address", …);            // JSON.stringify(action) scanned for each input value
test("prepareRevocation of 450 invitations yields three revokeLeaves steps", …);
test("prepareRevocation refuses a batch that is not on chain", …);
test("listPeople reports public only after the chain claim and nothing more about private holders", …);
test("parsePeopleCsv reads 'Name;E-Mail' with and without a header and reports rows without a name", …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement**; wire `people_list`, `people_search`, `batch_prepare`, `revoke_prepare` into the org route. **Step 4: Run** — Expected: PASS (12 tests).
- [ ] **Step 5: Commit** — `feat(web): credential batch builder, people lists and revocation`.

---

### Task 6: Chain → mirror sync

**Files:**
- Create: `apps/web/src/lib/credentials/sync.ts`
- Create: `apps/web/src/app/api/cron/credentials-sync/route.ts`
- Modify: `apps/web/vercel.json` (cron `{ "path": "/api/cron/credentials-sync", "schedule": "*/5 * * * *" }`)
- Test: `apps/web/tests/credentials-sync.test.ts`

**Interfaces:**
- Consumes: `REGISTER_EVENTS`, `RegisterLog` (plan 1 Task 6); `deliverInvitations` (Task 7, injected).
- Produces:
  - `applyRegisterLogs(d: SyncDeps, logs: readonly RegisterLog[]): Promise<{ applied: number }>` — idempotent.
  - `applyConfirmedAction(d: SyncDeps, actionId: string, logs: readonly RegisterLog[]): Promise<void>` — the same handlers, then action → `done`.
  - `syncRegister(d: SyncDeps, opts?: { maxBlocks?: bigint }): Promise<{ from: bigint; to: bigint; applied: number } | { skipped: "registry_mismatch" | "not_configured" }>` — reads `credential_sync_state`; on first run starts at the deploy block; processes at most `maxBlocks` (default 20000) up to `head - 3`; advances the cursor only after the logs were applied.
  - `SyncDeps = { store; getLogs(from: bigint, to: bigint): Promise<RegisterLog[]>; head(): Promise<bigint>; registry: Address; deployBlock: bigint; deliver(batchRowId: string): Promise<void> }`.

Handlers: `TypeCreated` / `TypeConfigured` / `TypeRetired` / `TypeRecognised` → update the `credential_types` row (insert a minimal row for a type created outside the node); `BatchAdded` → find `credential_batches` by `root` with status `prepared`, set `chain_batch_id`, status `onchain`, mark its action `done`, then `deliver(batch.id)` **once** (guarded by the status change, so a replay does not send twice); `Claimed` → invitation by `leaf_hash`: `claimed_onchain = true`, status `accepted`, `recipient_wallet` = account; `Renounced` / `Pruned` → `claimed_onchain = false` for that account and type; `LeafRevoked` → status `revoked`; `BatchRevoked` → batch `revoked` and its invitations `revoked`; `DelegateSet` → `credential_delegates`; `OrgPrivateOnlySet(orgId, privateOnly)` → `accounts.credentials_members_public = !privateOnly` for the account whose `orgIdFromUuid(id)` matches; when `privateOnly` is true, push every holder with `claimed_onchain` for a membership type of that org: title "Ausweis", body "Diese Organisation zeigt ihre Mitglieder nicht mehr öffentlich. Du kannst deinen Ausweis privat machen.", data `{ type: "credential_visibility", typeId }`.

The cron route copies the authorisation of an existing cron route (read `apps/web/src/app/api/cron/vorhaben/route.ts` and use the same check), then `syncRegister`.

- [ ] **Step 1: Write the failing tests**

```ts
test("BatchAdded turns a prepared batch onchain, finishes its action and delivers once", …);
test("replaying the same logs changes nothing and delivers nothing", …);
test("an action whose phone never reported is finished by the sync (found by root)", …);
test("a BatchAdded with an unknown root is ignored", …);
test("Claimed sets claimed_onchain; Renounced clears it and keeps the invitation accepted", …);
test("LeafRevoked and BatchRevoked mark invitations revoked", …);
test("OrgPrivateOnlySet mirrors into credentials_members_public and pushes public members once on closing", …);
test("the cursor advances only after apply; a throwing handler leaves it where it was", …);
test("a registry address different from the stored one skips with registry_mismatch", …);
test("the window is capped at maxBlocks and stops three blocks before head", …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `npx tsx --test tests/credentials-sync.test.ts tests/credentials-actions.test.ts` — Expected: PASS (10 + 13).
- [ ] **Step 5: Commit** — `feat(web): credential register chain-to-mirror sync`.

---

### Task 7: Invitation delivery — push, link, e-mail once, printable letters

**Files:**
- Create: `apps/web/src/lib/credentials/delivery.ts`, `letters.tsx`
- Create: `apps/web/src/app/invite/ausweis/[token]/page.tsx`
- Modify: `apps/web/public/.well-known/apple-app-site-association` (add `{ "/": "/invite/ausweis/*", "comment": "Credential invitation (Ausweis abholen)" }`)
- Modify: `apps/web/src/app/api/credentials/org/route.ts` (`letters`)
- Test: `apps/web/tests/credentials-delivery.test.ts`

**Interfaces:**
- Produces (`delivery.ts`):
  - `inviteUrl(token: string): string` = `` `${publicBaseUrl()}/invite/ausweis/${token}` `` (Android already claims the `/invite` prefix in `apps/expo/app.config.ts`, so no native build is needed; iOS needs the association entry above).
  - `deliverInvitations(d: DeliveryDeps, batchRowId: string): Promise<{ pushed: number; mailed: number; linkOnly: number }>` — for every `prepared` invitation of the batch: account leaf → push; claim-key leaf with `contact_email` → one mail, then `contact_email = null`, `email_sent_at = now`; claim-key leaf without → nothing sent (`linkOnly`). All become `invited`.
  - `invitePush(type: TypeRow, orgName: string | null, membersMayBePublic: boolean): { title: string; body: string }` — title "Neuer Ausweis" (role, membership) or "Neues Abzeichen" (badge); body `` `${orgName}: ${type.name}` `` normally, and for an org whose members may not be public only "Du hast einen Ausweis erhalten. Öffne die App, um ihn anzusehen." Data `{ type: "credential_invite", invitationId }`.
  - `inviteMail(…)`: subject `` `Dein Ausweis: ${type.name}` ``, text with the link and one sentence that the link is personal; sent through the existing mailer (`apps/web/src/lib/passkey/email-mailer.ts` shows the Resend call to reuse).
- Produces (`letters.tsx`): `renderLetters(rows: { displayName: string; url: string }[], ctx: { orgName: string; typeName: string }): Promise<Buffer>` — one A4 page per person with name, org, type, a QR code of the URL (`qrcode` → data URL), the URL in text and three lines of instructions ("1. Röbel App installieren. 2. Diesen Code scannen. 3. Ausweis annehmen."), built with `@react-pdf/renderer`.
- Route action `letters` (`{ accountId, batchId }`): owner or admin; opens `token_enc` for claim-key invitations that are not accepted or revoked; returns `application/pdf`.
- Page `/invite/ausweis/[token]`: public, no data fetch by token on the server (the token must not hit logs through a server-side API call with the token in the query); shows "Du hast einen Ausweis erhalten", a button "In der Röbel App öffnen" (`roebel://invite/ausweis/<token>`) and the two store links (copy them from `apps/web/src/app/invite/[token]/page.tsx`).

- [ ] **Step 1: Write the failing tests**

```ts
test("account leaves are pushed, mail leaves are mailed once and the address is erased", …);
test("a second deliverInvitations call for the same batch sends nothing", …);
test("push text for a closed org (membersMayBePublic false) names neither org nor type", …);
test("push text for a verein is 'Neuer Ausweis' / '<Org>: <Typ>'; a badge says 'Neues Abzeichen'", …);
test("a failing push does not stop the others and still marks the invitation invited", …);
test("letters include only open claim-key invitations and one page each", …);   // renderLetters called with the right rows
test("inviteUrl uses the www host", …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS (7 tests).
- [ ] **Step 5: Commit** — `feat(web): credential invitation delivery (push, link, mail once, printable letters)`.

---

### Task 8: Holder routes — mine, redeem, respond, holdings, presentations

**Files:**
- Create: `apps/web/src/lib/credentials/holder.ts`, `presentations.ts`
- Create: `apps/web/src/app/api/credentials/me/route.ts`
- Test: `apps/web/tests/credentials-holder.test.ts`, `credentials-presentations.test.ts`

**Interfaces:**
- Produces (`holder.ts`):

```ts
export type InvitationView = {
  id: string; state: "invited" | "accepted" | "declined" | "revoked";
  type: { typeId: Hex; name: string; description: string | null; imageUrl: string | null; kind: "role" | "membership" | "badge"; recognised: boolean; publicClaimAllowed: boolean; benefits: string[] };
  org: { accountId: string; name: string; avatarUrl: string | null } | null;
  validUntil: string | null;
  claim: { batchId: string; leaf: { kind: "account" | "claimKey"; typeId: Hex; subject: Address; validUntil: string; salt: Hex }; proof: Hex[]; claimSignature: Hex | null };
};
export async function mine(d: Deps, c: Caller): Promise<Result<InvitationView[]>>;                 // every invitation whose recipient_wallet is the caller, batch on chain
export async function redeem(d: Deps, c: Caller, p: { token: string }): Promise<Result<InvitationView>>;
export async function respond(d: Deps, c: Caller, p: { invitationId: string; decision: "accept" | "decline" }): Promise<Result<null>>;
export async function holdings(d: Deps, c: Caller, p: { typeIds: Hex[] }): Promise<Result<{ typeId: Hex; held: boolean; visibility: "public" | "private" | null; validUntil: string | null }[]>>;
```

- Produces (`presentations.ts`):
  - `SHOW_SCOPE = "roebel-credential-show-v1"`; `showMessage(p: { typeId: Hex; account: string; issuedAtSec: number; nonce: string }): string` = `` `${SHOW_SCOPE}:${typeId}:${account.toLowerCase()}:${issuedAtSec}:${nonce}` ``; `SHOW_TTL_SECONDS = 300`.
  - `type Presentation = { v: 1; typeId: Hex; account: Address; issuedAtSec: number; nonce: string; accountSignature: Hex; private?: { batchId: string; leaf: InvitationView["claim"]["leaf"]; proof: Hex[]; claimSignature: Hex | null } }`
  - `createPresentation(d, c, p: Presentation): Promise<Result<{ code: string; expiresAt: string }>>` — the caller must be `p.account`; code = 12 characters from `CODE_ALPHABET` (`apps/web/src/lib/chat/pairing.ts`), stored by SHA-256, TTL 300 s.
  - `resolvePresentation(d, c, p: { code: string }): Promise<Result<{ presentation: Presentation; signatureValid: boolean; ageSeconds: number }>>` — verifies `accountSignature` over `showMessage` with `verifyWalletSignature` (`apps/web/src/lib/signed-request/signature.ts`), deletes the row after the first successful resolve, never returns a display name or avatar of the holder.
- Route `POST /api/credentials/me`: actions `mine`, `redeem`, `respond`, `holdings`, `present_create`, `present_resolve`. `holdings` and `present_resolve` accept a pairing session too; the other four are app only (Task 3).

Rules:
- `redeem`: hash the token, find the invitation; not found → `404` "Dieser Link ist nicht gültig."; already bound to another wallet → `409 ALREADY_REDEEMED` "Dieser Ausweis wurde bereits abgeholt."; revoked → `410`. Otherwise bind `recipient_wallet = caller` (compare-and-set on `recipient_wallet is null`) and return the view. Rate limit: 10 per wallet per minute (`sharedLimiters` from `apps/web/src/lib/rate-limit/server.ts`).
- `claimSignature` for a claim-key invitation: the server opens `claim_key_enc` and signs `Claim(batchId, leaf, account = caller)` with `signClaim` for the configured registry and chain 100. The key itself never leaves the server. For an account leaf it is `null`.
- `publicClaimAllowed` = the type's `public_claim` and not (`kind === "membership"` and the chain's `orgPrivateOnly(orgId)` is true). Read from chain at request time (the reader), not from the mirror, so a just-opened org is immediately open.
- `respond` only records `accepted` / `declined` and `responded_at`. Whether the person then claims publicly is their own transaction and is learned from the chain. The route does not take, store or return a visibility choice.
- `holdings`: `public` when `reader.holdsMany` says so (this includes Citizen, Attester, Guest); otherwise `private` when the caller has an `accepted` invitation for that type that is not revoked, whose batch is on chain and not revoked, and that has not expired; otherwise `held: false`. This is the route project 3 uses.

- [ ] **Step 1: Write the failing tests**

```ts
test("mine returns leaf, proof and batch id for account invitations of the caller only", …);
test("redeem binds a claim-key invitation to the first caller and returns a signature that recovers to the leaf subject for that caller", …);
test("a second account redeeming the same token gets 409 ALREADY_REDEEMED", …);
test("the same account may redeem again (reinstall) and gets a fresh signature", …);
test("redeem of a revoked invitation is 410; an unknown token 404", …);
test("respond does not accept a visibility field and stores none", …);
test("holdings: public from chain, private from an accepted invitation, false after revocation or expiry", …);
test("holdings never reports another wallet's invitation", …);
test("present_create refuses a presentation for another account", …);
test("present_resolve verifies the signature, returns the age and deletes the code", …);
test("a presentation older than 300 s is gone", …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS (11 tests).
- [ ] **Step 5: Commit** — `feat(web): credential holder routes and presentation relay`.

---

### Task 9: Sponsoring

**Files:**
- Modify: `apps/web/src/lib/passkey/everyday-allowlist.ts`
- Modify: `docs/PASSKEY_SIGNIN_NOTES.md` (the allowlist section: add the register rows)
- Test: `apps/web/src/lib/passkey/__tests__/everyday-policy.test.ts`, `org-safe-policy.test.ts`

**Interfaces:**
- Produces: `credentialRegistryAddress(): Hex | null` (from `CREDENTIAL_REGISTRY_ADDRESS`; null = no register entries match); `credentialRegistryHolderAbi` (`claim`, `selfClaim`, `renounce`); `credentialRegistryIssuerAbi` (`createType`, `updateType`, `retireType`, `setDelegate`, `setOrgPrivateOnly`, `addBatch`, `revokeBatch`, `revokeLeaves`); eleven new rows in `EVERYDAY_SELECTORS` (compute the selectors with viem `toFunctionSelector` in the test and pin them as literals).
- `classifyEverydayCall`: target = the register → holder functions return tier `"onboarding"` (a guest may claim and self-claim under the onboarding budget); issuer functions return tier `"citizen"`; `prune`, the owner-only functions and anything else are refused ("CredentialRegistry function not allowlisted").
- `checkOrgSafeInner`: the org Safe may also call the register's issuer functions (so an owner can act through the Safe as well as directly).

- [ ] **Step 1: Write the failing tests**

```ts
it("a non-citizen Safe may claim, self-claim and renounce (onboarding tier)", …);
it("issuer functions need the citizen tier", …);
it("setRecognised, proposeSources and prune are not sponsored", …);
it("a register call with value is refused", …);
it("with CREDENTIAL_REGISTRY_ADDRESS unset no register call is sponsored", …);
it("an org Safe may call addBatch through execTransaction and through multiSend", …);
it("one op with selfClaim + createAttestationRequest stays onboarding-only", …);   // through the policy, see sponsor-policy.test.ts helpers
```

- [ ] **Step 2: Run** `cd apps/web && npx tsx --test src/lib/passkey/__tests__/everyday-policy.test.ts src/lib/passkey/__tests__/org-safe-policy.test.ts` — Expected: FAIL on the new tests. **Step 3: Implement.** **Step 4: Run** the two files plus `src/lib/passkey/__tests__/sponsor-policy.test.ts` — Expected: PASS, no earlier test changed.
- [ ] **Step 5: Commit** — `feat(web): sponsor credential register calls (holders: onboarding tier, issuers: citizen tier)`.

Note for the executor: `docs/superpowers/plans/2026-11-17-sovsignup-1-foundations.md` adds a guest tier to the same file. If that work has landed, holder functions go into the guest-allowed set as well; if it lands later, its author needs this line.

---

### Task 10: Account deletion and the data-protection record

**Files:**
- Modify: `apps/expo/supabase/functions/delete-user-account/index.ts`
- Modify: `docs/DPIA_ROEBEL_APP.md` (§2.1, §2.3 and the risk section that covers on-chain data)
- Test: `apps/web/tests/credentials-dpia-doc.test.ts`

- [ ] **Step 1: Write the failing doc test** — the DPIA text contains: a row for OrgRegistry `0x320b4e…` naming `RoleSet` logs (who is admin or member of which org, including Fraktionen); a row for the credential register naming what is public (type, batch size, and for a public claim account ↔ credential) and what is not (unclaimed entries: only a salted commitment); the words "Öffentlich zeigen" and "Privat behalten"; the org switch "Mitglieder dürfen öffentlich sichtbar sein" (Fraktion and Stadt start with it off, the org can open it, an attester can close it) and that a person can switch public/private any time while an earlier public record stays in the chain history; the mirror tables and that the invitation e-mail address is erased after one use.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Write the DPIA changes.** Also state plainly: a public claim is permanent in the chain's history even after renouncing; revoking a leaf that was never claimed reveals no person; members stop being written to OrgRegistry from the app release of plan 3, existing `RoleSet` entries remain; this text is not legal advice and the membership part (GDPR Art. 9: political opinions, religious beliefs, trade-union membership) is marked for legal review before production.
- [ ] **Step 4: Extend the deletion sweep:** for the deleted wallet, in `credential_invitations` set `display_name = null`, `contact_email = null`, `claim_key_enc = null`, `token_enc = null`, `token_hash = null`, `proof = '[]'`, `salt = ''` where `recipient_wallet` is that wallet, and delete that wallet's `credential_actions` rows that are still awaiting confirmation. The row itself stays so the org's count is right. Add the two tables to the sweep's table list comment. (No unit test exists for this function; verify by reading the diff against the existing `account_owners` block at about line 174.)
- [ ] **Step 5: Run** the doc test — Expected: PASS. **Commit** — `docs: DPIA covers OrgRegistry and the credential register` and `feat(expo): account deletion erases credential invitation data`.

---

## Owner gates (Max)

1. **Apply the migration** `20261117cra_credential_register.sql` through the Supabase MCP (check the project ref first; the MCP has pointed at the wrong project before).
2. **Deploy the edge function** `delete-user-account` (Task 10).
3. **Vercel env:** `CREDENTIAL_REGISTRY_ADDRESS` and `CREDENTIAL_REGISTRY_DEPLOY_BLOCK` (test-environment values from `deployments/gnosis-test.json` for the preview pass, production values later), `CREDENTIAL_SECRETS_KEY` (32 random bytes, base64; losing it makes every unredeemed letter useless), `GNOSIS_RPC_URL` if not set.
4. **Vendor-side sponsorship rules** for accounts on the old sign-in: allow the register address for `claim`, `selfClaim`, `renounce` and the issuer functions.
5. **Switching to the production registry:** run the RESET block from the migration, set the two env values, redeploy.
6. **Legal review** of the membership part of the DPIA before `credentials_enabled_production` is switched on.
7. **iOS:** the association file change goes live with the web deploy; confirm on a device that `https://www.roebel.app/invite/ausweis/test` opens the app after the plan-3 update.

## Self-review notes

- Spec 5.7: mirror tables locked down (Task 1), filled from chain events (Task 6), routes for app and pairing session with owner/admin check (Tasks 3 to 5, 8), delivery by push, link, QR, PDF, e-mail once (Task 7), sponsoring (Task 9). Spec 5.3 server side: the org switch "Mitglieder dürfen öffentlich sichtbar sein" with the Fraktion/Stadt default (Tasks 3, 4, 6), status list (Task 5). Spec 5.4 steps 1 to 5: Tasks 4 to 8. Spec 6: DPIA (Task 10). Spec 8: `holdings` (Task 8), metadata (Task 3).
- Event badges and the node delegate are plan 4; they reuse `prepareBatch` (`source: "event"`) and `prepareDelegateAction`.
- Known limit, stated in the DPIA: an org can work out who accepted privately (accepted minus publicly visible).
