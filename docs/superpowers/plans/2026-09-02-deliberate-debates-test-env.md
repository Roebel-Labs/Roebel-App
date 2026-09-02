# Deliberate Debates Test Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag-gated Deliberate debate integration in the Umfragen-Forum: a forum thread graduates into an on-chain argument-tree debate on Gnosis that Max can join, argue, and stake in from his dev build.

**Architecture:** Direct RPC reads against the deployed `Deliberate` contract (no indexer), thirdweb v5 `prepareContractCall`+`sendTransaction` writes through the gasless `gnosisWallet` smart account, argument texts content-addressed in Supabase (`debate_contents`, sha-256 digest PK). UI follows the forum idiom (StyleSheet+useTheme, BottomDrawer sheets) behind `__DEV__ || app_settings.deliberate_debates_enabled`.

**Tech Stack:** thirdweb ^5.105 (`readContract`, `prepareContractCall`, `sendTransaction`, `parseEventLogs`, `waitForReceipt`), expo-crypto sha-256, TanStack Query, Supabase (anon key + SECURITY DEFINER RPC), expo-router.

**Spec:** docs/superpowers/specs/2026-09-02-deliberate-debates-test-env-design.md

## Global Constraints

- Chain: Gnosis (100). Deliberate `0xB208C359a206a0c35a7D4D99dEF63d9F6143DE9b`; Röbel gate registry `0xD1d6d0c8fd4D232D810FF920c802d748537E14Fe`; any-human registry `0x0959525FF2b7436441192f4d14CfA91e44c40697`.
- Reads use `gnosisRead`, writes use `gnosis` (both from `constants/gnosis.ts`); account from `useGnosisWallet()`.
- Protocol constants: initial grant 10_000 hundredths; min deposit 1_000; fee ≤ 99 %; max 512 arguments; thesis = argument 0, not stakeable; approval = con/(pro+con).
- Copy: German UI; "Punkte" never Münzen/CRC; "Meinungsbild" never "Abstimmung"; never show raw 0x addresses (resolve via `users` table like the forum does).
- Code identifiers/comments English (house rule).
- Styling: StyleSheet + useTheme, NO NativeWind.
- Supabase changes applied directly via MCP (`apply_migration`) AND mirrored under `supabase/migrations/`.
- Jest from `apps/expo`: `npx jest <file> --silent`. Full tsc needs `NODE_OPTIONS=--max-old-space-size=8192`; baseline = 30 pre-existing errors, all under `app/`.
- React Compiler trap: never dereference nullable query data (`thread!.id`) inside a JSX callback's ARGUMENT LIST — guard inside handler bodies.
- Commit per task (pathspec adds only), push after each commit.

---

### Task 1: Supabase schema — debate_contents + thread linkage

**Files:**
- Create: `supabase/migrations/20260902_deliberate_debates.sql` (mirror of what MCP applies)

**Interfaces:**
- Produces: table `debate_contents(digest text PK, content text)`; columns `forum_threads.debate_id bigint`, `forum_threads.debate_created_by text`; RPC `attach_debate_to_thread(p_thread_id uuid, p_wallet text, p_debate_id bigint)`.

- [ ] **Step 1: Confirm MCP project** — `mcp__supabase__get_project_url` must return the `wwbeqhkslxdxhktqzqti` URL (memory trap: MCP can point at the wrong project).
- [ ] **Step 2: Apply migration via MCP `apply_migration`** (name `deliberate_debates`), content:

```sql
-- Deliberate debates test env: content-addressed argument texts + thread linkage.
create table if not exists public.debate_contents (
  digest text primary key check (digest ~ '^[0-9a-f]{64}$'),
  content text not null check (octet_length(content) between 1 and 1024),
  created_at timestamptz not null default now(),
  constraint debate_contents_digest_matches check (digest = encode(sha256(convert_to(content, 'UTF8')), 'hex'))
);
alter table public.debate_contents enable row level security;
create policy debate_contents_select on public.debate_contents for select using (true);
create policy debate_contents_insert on public.debate_contents for insert with check (true);

alter table public.forum_threads
  add column if not exists debate_id bigint,
  add column if not exists debate_created_by text;

create or replace function public.attach_debate_to_thread(p_thread_id uuid, p_wallet text, p_debate_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update forum_threads
     set debate_id = p_debate_id, debate_created_by = lower(p_wallet)
   where id = p_thread_id
     and status = 'published'
     and debate_id is null
     and lower(wallet_address) = lower(p_wallet);
  if not found then
    raise exception 'thread not found, not owned, or already has a debate';
  end if;
end $$;
```

If the `debate_contents_digest_matches` CHECK is rejected (function volatility), re-apply without that constraint — the app re-hashes on read anyway; note the fallback in the commit message.
- [ ] **Step 3: Probe** via `execute_sql`: insert a row with digest `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824` / content `hello` (valid pair) → succeeds; insert digest of all-zeros with content `x` → must FAIL the CHECK; delete the probe row.
- [ ] **Step 4: Write the identical SQL to the mirror file, commit** `git add supabase/migrations/20260902_deliberate_debates.sql && git commit -m "feat(supabase): debate_contents + forum_threads.debate_id for Deliberate test env" && git push`

### Task 2: Constants + pure protocol helpers (TDD)

**Files:**
- Create: `apps/expo/constants/deliberate.ts`
- Create: `apps/expo/lib/deliberate/protocol.ts`
- Test: `apps/expo/lib/__tests__/deliberate-protocol.test.ts`

**Interfaces:**
- Produces:
  - constants: `DELIBERATE_ADDRESS`, `ROEBEL_DEBATE_REGISTRY`, `OPEN_REGISTRY_ZERO = '0x0000000000000000000000000000000000000000'`, `deliberateContract` (chain `gnosis`), `deliberateReadContract` (chain `gnosisRead`), `INITIAL_TOKENS = 10000`, `MIN_DEPOSIT = 1000`, `DEFAULT_DURATIONS = { locking: 86400, editing: 604800, rating: 259200 }`, `DEFAULT_FEE_PERCENT = 5`.
  - protocol: `type DebatePhase = 'editing' | 'rating' | 'tallying' | 'finished'`; `derivePhase(nowSec: number, editingEnd: number, ratingEnd: number, finished: boolean): DebatePhase`; `approvalPercent(pro: number, con: number): number` (0–100, con/(pro+con), 50 when both 0); `formatPunkte(hundredths: number): string` (`10000 → "100"`, `1050 → "10,5"`, `1234 → "12,34"`); `utf8ByteLength(s: string): number`; `MAX_CONTENT_BYTES = 1024`; `type DebateArgument = { id: number; parentId: number | null; creator: string; isSupporting: boolean | null; contentDigest: string; finalizationTime: number; pro: number; con: number; votes: number; rating: number | null; children: DebateArgument[] }`; `buildArgumentTree(args: Omit<DebateArgument,'children'>[]): DebateArgument` (returns thesis id 0 with nested children; throws if 0 missing).

- [ ] **Step 1: Write failing tests** covering: derivePhase all four branches (boundary: `now === editingEnd` → rating); approvalPercent (0/0→50, 1000/3000→75); formatPunkte trims `,00` and uses comma; utf8ByteLength (`"a"`→1, `"ä"`→2, `"🚲"`→4); buildArgumentTree nests one pro + one con child under 0 and a grandchild under the pro child; tree throws without id 0.
- [ ] **Step 2: Run** `cd apps/expo && npx jest lib/__tests__/deliberate-protocol.test.ts --silent` → FAIL (module missing).
- [ ] **Step 3: Implement** `protocol.ts` (pure, no imports from expo/thirdweb) and `constants/deliberate.ts` following `constants/thirdweb.ts` idiom:

```ts
// constants/deliberate.ts
import { getContract } from 'thirdweb';
import { client } from './thirdweb';
import { gnosis, gnosisRead } from './gnosis';

export const DELIBERATE_ADDRESS =
  process.env.EXPO_PUBLIC_DELIBERATE_ADDRESS || '0xB208C359a206a0c35a7D4D99dEF63d9F6143DE9b';
export const ROEBEL_DEBATE_REGISTRY =
  process.env.EXPO_PUBLIC_DELIBERATE_REGISTRY || '0xD1d6d0c8fd4D232D810FF920c802d748537E14Fe';
export const OPEN_REGISTRY_ZERO = '0x0000000000000000000000000000000000000000';
export const deliberateContract = getContract({ client, address: DELIBERATE_ADDRESS, chain: gnosis });
export const deliberateReadContract = getContract({ client, address: DELIBERATE_ADDRESS, chain: gnosisRead });
export const INITIAL_TOKENS = 10_000;
export const MIN_DEPOSIT = 1_000;
export const DEFAULT_FEE_PERCENT = 5;
export const DEFAULT_DURATIONS = { locking: 86_400, editing: 604_800, rating: 259_200 };
```

- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** `feat(expo): deliberate constants + pure protocol helpers`

### Task 3: Content module — digest + Supabase store (TDD)

**Files:**
- Create: `apps/expo/lib/deliberate/content.ts`
- Test: `apps/expo/lib/__tests__/deliberate-content.test.ts`

**Interfaces:**
- Consumes: `utf8ByteLength`, `MAX_CONTENT_BYTES` from `./protocol`; `supabase` from `../supabase`.
- Produces: `sha256HexOf(text: string): Promise<string>` (expo-crypto `digestStringAsync`, lowercase hex, injectable impl for tests: second optional arg `(t: string) => Promise<string>`); `digestToBytes32(hex: string): `0x${string}``; `putDebateContent(text: string): Promise<string>` (validates 1..1024 bytes, inserts `{digest, content}` ignoring unique-violation code `23505`, returns digest); `fetchDebateContents(digests: string[]): Promise<Map<string, string>>` (batch `.in('digest', …)`, re-hashes each row and drops mismatches).

- [ ] **Step 1: Failing tests**: digestToBytes32 prefixes 0x and rejects non-64-hex; sha256HexOf with injected node-crypto impl returns the `hello` vector `2cf24dba…b9824`; putDebateContent rejects empty and >1024-byte text (mock supabase like existing forum tests mock — if no mock idiom exists, test only the validation guard by injecting a fake client is NOT available: keep `putDebateContent` thin over an exported pure `assertValidContent(text)` and test that).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(expo): deliberate content store — sha-256 digests + debate_contents`

### Task 4: Chain module — reads and prepared writes

**Files:**
- Create: `apps/expo/lib/deliberate/chain.ts`

**Interfaces:**
- Consumes: `deliberateReadContract`, `deliberateContract`, constants (Task 2); `DebateArgument`, `buildArgumentTree`, `derivePhase` (Task 2).
- Produces:
  - `type DebateSummary = { id: number; argumentsCount: number; participantsCount: number; totalVotes: number; feePercentage: number; identityRegistry: string; phase: DebatePhase; editingEndTime: number; ratingEndTime: number; lockingDuration: number; approved: boolean | null }`
  - `readDebate(id: number): Promise<DebateSummary | null>` (null when `argumentsCount === 0` and `editingEndTime === 0`)
  - `readDebateTree(id: number, argumentsCount: number): Promise<DebateArgument>` (parallel `getArgument` for ids `0..count-1`, then `buildArgumentTree`; thesis `parentId = null`, `isSupporting = null`)
  - `readMyDebateState(id: number, wallet: string): Promise<{ joined: boolean; tokens: number }>`
  - `readMyShares(id: number, argumentId: number, wallet: string): Promise<{ pro: number; con: number }>`
  - `quoteStake(id: number, argumentId: number, isPro: boolean, amount: number): Promise<{ fee: number; sharesOut: number }>`
  - `prepareJoin(id: number)`, `prepareAddArgument(id, parentId, contentURI: `0x${string}`, isSupporting, initialApproval, deposit)`, `prepareStake(id, argumentId, isPro, amount)`, `prepareTally(id)`, `prepareCreateDebate(contentURI, locking, editing, rating, feePercent, registry)` — all returning `PreparedTransaction` via `prepareContractCall` (pattern of `lib/roebel-taler.ts:551-565`)
  - `extractDebateIdFromReceipt(receipt): number | null` via `parseEventLogs` on `event DebateCreated(uint256 indexed debateId, address indexed creator, bytes32 contentURI, uint48 lockingDuration, uint48 editingEndTime, uint48 ratingEndTime, uint8 feePercentage, address identityRegistry)`

Method strings (exact, from pinned `IDeliberate.sol`):

```ts
'function debates(uint256) view returns (uint32, uint16, uint32, uint8, address)'
'function phases(uint256) view returns (uint8, uint48, uint48, uint48)'
'function outcome(uint256) view returns (bool)'
'function users(uint256, address) view returns (uint8, uint32, bool)'
'function getArgument(uint256, uint16) view returns ((bytes32 contentURI, address creator, bool isSupporting, uint16 parentArgumentId, uint16 untalliedChilds, uint48 finalizationTime, uint32 pro, uint32 con, uint32 votes, uint32 subtreeVotes, int64 descendantsAggregate, int64 rating, int88 centeredApprovalSeconds, uint80 votesSeconds, uint48 lastAccrualTime, uint32 fees))'
'function getUserShares(uint256, uint16, address) view returns ((uint32 pro, uint32 con))'
'function quoteStake(uint256, uint16, bool, uint32) view returns ((bool isPro, uint32 voteTokensStaked, uint32 fee, uint32 sharesOut))'
'function createDebate(bytes32, uint48, uint48, uint48, uint8, address, address, uint256) returns (uint256)'
'function join(uint256)'
'function addArgument(uint256, uint16, bytes32, bool, uint8, uint32) returns (uint16)'
'function stakePro(uint256, uint16, uint32)'
'function stakeCon(uint256, uint16, uint32)'
'function tallyTree(uint256)'
```

Numeric mapping: everything fits `Number()` (uint32/uint48/int64 ratings); `rating` is `null` until phase `finished`. `phase` from `derivePhase(Date.now()/1000, editingEnd, ratingEnd, currentPhase === 4)` — currentPhase enum: 0 Uninitialized, 4 Finished; treat enum 4 as finished, ignore 3 (Tallying derives from time). BigInt params passed as `BigInt(id)` where the ABI slot is uint256.

- [ ] **Step 1: Implement the module** (no unit tests — thin chain adapters; correctness is exercised in Task 10's live seed + the device test).
- [ ] **Step 2:** `cd apps/expo && npx tsc --noEmit -p tsconfig.json` is too heavy per-file; instead run jest suite to catch import errors: `npx jest lib/__tests__ --silent` → existing tests still PASS.
- [ ] **Step 3: Commit** `feat(expo): deliberate chain module — reads + prepared writes`

### Task 5: Feature flag + forum data plumbing

**Files:**
- Modify: `apps/expo/lib/supabase-app-settings.ts` (add flag)
- Modify: `apps/expo/lib/types/feed.ts` (ForumThreadRecord + Create input stay untouched; add `debate_id?: number | null` to `ForumThreadRecord`)
- Modify: `apps/expo/lib/supabase-forum.ts` (select `debate_id` in `THREAD_SELECT`, add `attachDebateToThread`)

**Interfaces:**
- Produces: `isDeliberateDebatesEnabled(): Promise<boolean>` = `__DEV__ ? true : (await fetchAppSetting('deliberate_debates_enabled')) === 'true'`; `attachDebateToThread(threadId: string, wallet: string, debateId: number): Promise<void>` calling `supabase.rpc('attach_debate_to_thread', { p_thread_id, p_wallet, p_debate_id })` (throw on error, forum RPC idiom).

- [ ] **Step 1: Implement all three edits.** In `supabase-app-settings.ts` follow the `fetchBuzzWorkspaceEnabled` wrapper shape exactly (pilot gate: missing key = OFF), but export as `isDeliberateDebatesEnabled` with the `__DEV__` short-circuit.
- [ ] **Step 2:** `npx jest lib/__tests__ --silent` → PASS.
- [ ] **Step 3: Commit** `feat(expo): deliberate flag + thread debate linkage plumbing`

### Task 6: DebateStrip + thread/card surfaces

**Files:**
- Create: `apps/expo/components/forum/DebateStrip.tsx`
- Modify: `apps/expo/components/forum/ForumThreadCard.tsx` (render strip when `thread.debate_id != null` and flag on)
- Modify: `apps/expo/app/forum/thread/[id].tsx` (strip under the head; "Strukturierte Debatte starten" row appended to `ForumOptionsDrawer` items for the thread owner when no debate yet, navigating to `/forum/debate/new?thread=<id>`)

**Interfaces:**
- Consumes: `readDebate` (Task 4), `approvalPercent`/`formatPunkte` (Task 2), `isDeliberateDebatesEnabled` (Task 5).
- Produces: `<DebateStrip debateId={number} onPress={() => router.push('/forum/debate/' + debateId)} />` — one-line pill: phase label (Bearbeitung / Bewertung / Auszählung / Meinungsbild: angenommen|abgelehnt) + participants + root approval; loads via `useQuery(['debate', id])`, renders nothing while loading/absent.

- [ ] **Step 1: Implement DebateStrip** (forum chip idiom: borderRadius 999, borderWidth 1, `colors.primary` accents; phase labels in German).
- [ ] **Step 2: Wire into ForumThreadCard + thread screen.** Flag check via `useQuery(['flags','deliberate'], isDeliberateDebatesEnabled)`. Guard the React Compiler trap: read `thread?.debate_id` into a local before any callback arg list.
- [ ] **Step 3:** `npx jest --silent` full app suite → PASS. **Step 4: Commit** `feat(expo): debate strip on forum cards + thread screen`

### Task 7: Debate screen — read-only + join

**Files:**
- Create: `apps/expo/app/forum/debate/[id].tsx`

**Interfaces:**
- Consumes: Tasks 2–5 modules; `useGnosisWallet()`; `useAuth()` (wallet address + citizen check, same as `forum/new.tsx:106`); `fetchDebateContents`; display-name resolution copied from forum (`users` join is not available for arbitrary creators — reuse `PostAuthorRow`-less minimal author line: query `users` table by wallet list, fall back to "Bürger:in").
- Produces: route `/forum/debate/[id]` rendering: header (back + "Debatte"); thesis card (content, phase clock line "Bearbeitung bis 5. Sep, 14:00" via `new Date(sec*1000).toLocaleString('de-DE', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})`); when finished → verdict banner "Meinungsbild: These angenommen/abgelehnt"; my state row (joined → "Punkte: 87,5", else "Debatte beitreten" button); focused-argument model: `const [focusId, setFocusId] = useState(0)`, children of focus split into Pro/Contra columns (two side-by-side FlatList-free map inside a ScrollView, cards show text, approval bar (`View` with width `${approvalPercent}%`), votes as "Einsatz: 12,5 P."), tap a card → drill down (breadcrumb row of ancestor titles truncated, tap to jump back).
- Join flow: `sendTransaction({ transaction: prepareJoin(id), account })` → `waitForReceipt` → invalidate `['debate', id, 'me']`. Errors surfaced via the app's alert idiom; special-case revert containing `NotRegistered`/gate failure → "Nur Mitglieder der Röbel Münzen Gemeinschaft können beitreten."

- [ ] **Step 1: Implement the screen** (query keys `['debate', id]`, `['debate', id, 'args']` with `enabled: !!summary`, contents batch-fetched after args, `refetchOnWindowFocus`, pull-to-refresh).
- [ ] **Step 2: Jest suite still green; Step 3: Commit** `feat(expo): debate screen — tree drill-down, phase clock, join`

### Task 8: Composer + stake sheets

**Files:**
- Create: `apps/expo/components/forum/DebateComposerSheet.tsx`
- Create: `apps/expo/components/forum/DebateStakeSheet.tsx`
- Modify: `apps/expo/app/forum/debate/[id].tsx` (mount sheets; "Argument hinzufügen" buttons per column during editing; "Einschätzen" button per card during rating)

**Interfaces:**
- Composer props: `{ visible, onClose, debateId, parentArgumentId, isSupporting, onCreated: () => void }`. Body: multiline input (counter `utf8ByteLength`/1024), "Einschätzung" slider 1–99 % (default 60), "Einsatz" stepper 10,00–50,00 Punkte step 5 (hundredths internally, min `MIN_DEPOSIT`), submit = `putDebateContent` → `prepareAddArgument(debateId, parentArgumentId, digestToBytes32(digest), isSupporting, approval, deposit)` → send → receipt → `onCreated`.
- Stake sheet props: `{ visible, onClose, debateId, argument: DebateArgument, onStaked: () => void }`. Pro/Contra toggle, amount stepper, live `quoteStake` (debounced 400 ms) showing "Gebühr … · Anteile …", submit sends `prepareStake`.
- Both sheets: `BottomDrawer` base, disable submit while pending, restore draft on failure (forum A2 lesson).

- [ ] **Step 1: Implement both sheets. Step 2: Wire into the screen** (editing phase → composers; rating phase → stake buttons; joined-only, else the join CTA). **Step 3: Jest green. Step 4: Commit** `feat(expo): debate argument composer + stake sheets`

### Task 9: Creation flow from a thread

**Files:**
- Create: `apps/expo/app/forum/debate/new.tsx`

**Interfaces:**
- Consumes: `useLocalSearchParams<{ thread: string }>`, `fetchForumThread`, `putDebateContent`, `digestToBytes32`, `prepareCreateDebate`, `extractDebateIdFromReceipt`, `attachDebateToThread`, `DEFAULT_DURATIONS`, `DEFAULT_FEE_PERCENT`, `ROEBEL_DEBATE_REGISTRY`, `OPEN_REGISTRY_ZERO`.
- Produces: screen "Strukturierte Debatte": thesis input prefilled with thread title (editable, ≤1024 bytes), schedule picker (three presets: "Schnell (Test): 10 min Sperre / 1 h Bearbeitung / 1 h Bewertung", "Standard: 1 Tag / 7 Tage / 3 Tage" (default), "Kompakt: 12 h / 3 Tage / 2 Tage"), gate toggle "Nur Münzen-Mitglieder" (default ON → `ROEBEL_DEBATE_REGISTRY`, OFF → `OPEN_REGISTRY_ZERO`), submit flow: pin content → `prepareCreateDebate(contentURI, locking, editing, rating, DEFAULT_FEE_PERCENT, registry)` with `bountyToken = OPEN_REGISTRY_ZERO, bountyAmount = 0n` → send → `waitForReceipt` → `extractDebateIdFromReceipt` (fallback: `debatesCount()-1` when logs unparsable) → `attachDebateToThread` → `router.replace('/forum/debate/' + debateId)`.

- [ ] **Step 1: Implement.** Guard: citizen-only (copy `forum/new.tsx:106` guard), flag-gated. bountyToken/amount hardcoded zero (spec: bounties OFF).
- [ ] **Step 2: Jest green. Step 3: Commit** `feat(expo): create a structured debate from a forum thread`

### Task 10: Seed on-chain test debates + contents

**Files:** throwaway script in scratchpad (spike-style; not committed)

- [ ] **Step 1:** Via `cast send` from the deployer (open registry so the EOA may act):
  - Debate A (fast lifecycle): `createDebate(sha256("Röbel sollte die Uferpromenade autofrei machen."), 300, 1200, 900, 5, 0x0, 0x0, 0)` → join → add 2 pro / 1 con argument (deposits 1000–2000, approvals 60–70) → after windows pass, `tallyTree` → Finished with real ratings.
  - Debate B (live playground): `createDebate(sha256("Röbel braucht mehr sichere Fahrradwege zur Schule."), 3600, 259200, 259200, 5, 0x0, 0x0, 0)` → join → add 1 pro + 1 con argument → stays in Editing for 3 days.
- [ ] **Step 2:** Insert the matching `debate_contents` rows (thesis + every argument text) via MCP `execute_sql`.
- [ ] **Step 3:** Verify with `cast call`: `debatesCount() == 2`, `getArgument(0,1)` non-zero, app-side `readDebate(0)`/`readDebate(1)` shapes sane (checked in Task 11's smoke).

### Task 11: Verification + handoff

- [ ] **Step 1:** `cd apps/expo && npx jest --silent` → full suite green.
- [ ] **Step 2:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → error count ≤ baseline 30, none in `lib/deliberate/*` or new files.
- [ ] **Step 3:** Smoke-run the debate read path in Node (ts-node/esbuild-run the chain module against Gnosis: print `readDebate(0)`, `readDebateTree(0, n)` with contents resolved) — proves RPC + decoding without a device.
- [ ] **Step 4:** Final commit + push; write Max's device test script in the handoff message (join, argue, stake on debate B; verify Finished rendering on debate A; create a gated debate from a thread; production checklist from spec §6).
