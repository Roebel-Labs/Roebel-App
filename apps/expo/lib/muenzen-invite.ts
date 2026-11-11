/**
 * "Nachbarn einladen" — citizens bring the next citizens into Röbel Münzen.
 *
 * Mechanics (hidden from the user; never surface "CRC"/Circles in the UI):
 *   1. An inviter (a registered human) calls `Hub.trust(invitee, expiry)` — that IS the invitation.
 *   2. The invitee taps "Belohnungen erhalten" → `Hub.registerHuman(inviter, …)` from their wallet.
 *      At that moment the Hub burns 96 of the INVITER'S OWN personal Münzen (raw, not the shared
 *      Röbel Münzen) and mints a 48 welcome bonus to the invitee.
 *
 * The daily claim normally converts every personal Münze into the shared Röbel Münzen, which can
 * never be converted back. So an inviter has to HOLD BACK personal Münzen first:
 *   - "saving" (a per-wallet switch) holds back one invitation's worth while it fills up;
 *   - every open invitation (trusted, not yet registered) keeps its amount held back until the
 *     neighbour joins, so their join can never fail for lack of funds.
 * The claim (RoebelTalerProvider.dailyMint / lib/muenzen-claim.ts) subtracts this reserve from the
 * amount it converts.
 *
 * The first half of this file is pure (unit-tested); the second half loads on-chain state.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { roebeltalerGroupAddress, attesterSafeGnosisAddress } from '@/constants/gnosis';
import { supabase } from '@/lib/supabase';

const ONE = 10n ** 18n;

/** Burned from the inviter's own personal Münzen when the invitee joins. */
export const INVITE_COST = 96;
export const INVITE_COST_RAW = BigInt(INVITE_COST) * ONE;
/** Held back per invitation: the cost plus a cushion for the slow daily shrinkage (≈0.02 %/day). */
export const INVITE_RESERVE_RAW = 97n * ONE;
/** Minted to the invitee when they join. */
export const WELCOME_BONUS = 48;
/** Everyone earns about one Münze per hour. */
export const DAILY_MUENZEN = 24;
/** More open invitations than this are not offered (keeps the held-back amount bounded). */
export const MAX_OPEN_INVITES = 5;

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Personal Münzen the claim must NOT convert: open invitations, plus one more while saving. */
export function inviteReserveRaw(openInvites: number, saving: boolean): bigint {
  const slots = Math.max(0, Math.min(openInvites, MAX_OPEN_INVITES)) + (saving ? 1 : 0);
  return BigInt(slots) * INVITE_RESERVE_RAW;
}

/** How many NEW invitations the personal balance covers on top of the open ones. */
export function freeInviteSlots(personalRaw: bigint, openInvites: number): number {
  const covered = Number(personalRaw / INVITE_COST_RAW);
  return Math.max(0, Math.min(covered, MAX_OPEN_INVITES) - Math.max(0, openInvites));
}

/** Personal Münzen saved towards the NEXT invitation (after the open ones are covered), 0..96. */
export function savedTowardsNextRaw(personalRaw: bigint, openInvites: number): bigint {
  const committed = BigInt(Math.max(0, openInvites)) * INVITE_COST_RAW;
  const rest = personalRaw > committed ? personalRaw - committed : 0n;
  return rest > INVITE_COST_RAW ? INVITE_COST_RAW : rest;
}

/** Whole days of collecting until the next invitation is covered (0 = ready now). */
export function daysUntilNextInvite(personalRaw: bigint, openInvites: number, mintableRaw = 0n): number {
  const missing = INVITE_COST_RAW - savedTowardsNextRaw(personalRaw + mintableRaw, openInvites);
  if (missing <= 0n) return 0;
  const perDay = BigInt(DAILY_MUENZEN) * ONE;
  return Number((missing + perDay - 1n) / perDay);
}

/** What the claim converts into shared Röbel Münzen: everything personal above the reserve. */
export function convertibleRaw(personalRaw: bigint, reserveRaw: bigint): bigint {
  return personalRaw > reserveRaw ? personalRaw - reserveRaw : 0n;
}

export type NeighbourStatus =
  /** Nobody who could pay for the invitation has invited them yet. */
  | 'waiting'
  /** I invited them; they only need to tap "Belohnungen erhalten". */
  | 'invitedByMe'
  /** Someone else invited them and has the Münzen for it. */
  | 'invitedByOther';

/** Status of a not-yet-joined citizen from who invited them and whether that inviter can pay. */
export function neighbourStatus(p: { self: string; fundedInviters: string[] }): NeighbourStatus {
  const self = p.self.toLowerCase();
  const funded = p.fundedInviters.map((a) => a.toLowerCase());
  if (funded.includes(self)) return 'invitedByMe';
  return funded.length > 0 ? 'invitedByOther' : 'waiting';
}

// ── Persistence (per wallet) ────────────────────────────────────────────────

const savingKey = (addr: string) => `@muenzen/invite_saving/${addr.toLowerCase()}`;
const openCountKey = (addr: string) => `@muenzen/invite_open/${addr.toLowerCase()}`;
const recentKey = (addr: string) => `@muenzen/invite_recent/${addr.toLowerCase()}`;
/** The indexer lags a few seconds behind a fresh invitation; remember it locally meanwhile. */
const RECENT_TTL_MS = 30 * 60 * 1000;

export async function isSavingForInvite(addr: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(savingKey(addr))) === '1'; } catch { return false; }
}

export async function setSavingForInvite(addr: string, on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(savingKey(addr), '1');
    else await AsyncStorage.removeItem(savingKey(addr));
  } catch { /* best effort */ }
}

type RecentInvite = { address: string; at: number; withdrawn?: boolean };

async function readRecent(addr: string): Promise<RecentInvite[]> {
  try {
    const raw = await AsyncStorage.getItem(recentKey(addr));
    const list = raw ? (JSON.parse(raw) as RecentInvite[]) : [];
    return list.filter((r) => r && typeof r.address === 'string' && Date.now() - r.at < RECENT_TTL_MS);
  } catch { return []; }
}

/** Remember a just-sent invitation (or its withdrawal) until the indexer has caught up. */
export async function rememberInvite(self: string, invitee: string, withdrawn = false): Promise<void> {
  try {
    const rest = (await readRecent(self)).filter((r) => r.address !== invitee.toLowerCase());
    rest.push({ address: invitee.toLowerCase(), at: Date.now(), withdrawn });
    await AsyncStorage.setItem(recentKey(self), JSON.stringify(rest));
  } catch { /* best effort */ }
}

// ── On-chain state ──────────────────────────────────────────────────────────

const CIRCLES_RPC = 'https://rpc.aboutcircles.com/';
const GNOSIS_RPC = 'https://rpc.gnosischain.com';
const HUB = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8';

// Accounts that are plumbing, not neighbours (mirrors hooks/useMuenzenLeaderboard.ts).
const SYSTEM = new Set(
  [
    '0x0000000000000000000000000000000000000000',
    roebeltalerGroupAddress,
    attesterSafeGnosisAddress,
    '0x0476fd3bD5EbCE0Af18C70dE221eC47F508e8763', // treasury vault
    '0x910A0C7Ae84E745B06eC6362Fa29Cd3779e0b96b', // mint handler
    '0xd5028284017A32C672CbD73Fe35aCD897bA874cf', // auto-invite bot
    '0x5ac82fD7f576c86aed8d174074bA707eC1979D9B', // operational funder
  ].map((a) => a.toLowerCase()),
);

async function postJson(url: string, body: unknown, timeoutMs = 12_000): Promise<any> {
  // React Native's fetch has no default timeout — a silent upstream would hang the screen.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function circlesQuery(query: Record<string, unknown>): Promise<Record<string, any>[]> {
  const json = await postJson(CIRCLES_RPC, { jsonrpc: '2.0', id: 1, method: 'circles_query', params: [query] });
  if (json?.error) throw new Error(String(json.error?.message ?? 'circles_query failed'));
  const columns: string[] = json?.result?.columns ?? [];
  const rows: any[][] = json?.result?.rows ?? [];
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
}

const eq = (Column: string, Value: unknown) => ({ Type: 'FilterPredicate', FilterType: 'Equals', Column, Value });
const isIn = (Column: string, Value: string[]) => ({ Type: 'FilterPredicate', FilterType: 'In', Column, Value });
const and = (...Predicates: unknown[]) => ({ Type: 'Conjunction', ConjunctionType: 'And', Predicates });

const pad = (hex: string) => hex.toLowerCase().replace(/^0x/, '').padStart(64, '0');
// Hub selectors.
const SEL_IS_HUMAN = '0xf72c436f'; // isHuman(address)
const SEL_IS_TRUSTED = '0x6713e230'; // isTrusted(address,address)
const SEL_BALANCE_OF = '0x00fdd58e'; // balanceOf(address,uint256)

/** One JSON-RPC batch of Hub eth_calls; a missing/failed answer is `null` (unknown, never "false"). */
async function hubCalls(datas: string[]): Promise<(string | null)[]> {
  if (datas.length === 0) return [];
  const out: (string | null)[] = new Array(datas.length).fill(null);
  const CHUNK = 40;
  for (let start = 0; start < datas.length; start += CHUNK) {
    const batch = datas.slice(start, start + CHUNK).map((data, i) => ({
      jsonrpc: '2.0', id: start + i, method: 'eth_call', params: [{ to: HUB, data }, 'latest'],
    }));
    const json = await postJson(GNOSIS_RPC, batch);
    for (const r of Array.isArray(json) ? json : []) {
      if (typeof r?.id === 'number' && typeof r?.result === 'string') out[r.id] = r.result;
    }
  }
  return out;
}

const asBool = (hex: string | null): boolean | null => (hex == null ? null : BigInt(hex || '0x0') !== 0n);
const asUint = (hex: string | null): bigint | null => (hex == null || hex === '0x' ? null : BigInt(hex));

async function readHumans(addrs: string[]): Promise<Map<string, boolean | null>> {
  const res = await hubCalls(addrs.map((a) => SEL_IS_HUMAN + pad(a)));
  return new Map(addrs.map((a, i) => [a, asBool(res[i])]));
}

/** Each address's balance of its OWN personal Münzen (token id = the address). */
async function readOwnBalances(addrs: string[]): Promise<Map<string, bigint | null>> {
  const res = await hubCalls(addrs.map((a) => SEL_BALANCE_OF + pad(a) + pad(a)));
  return new Map(addrs.map((a, i) => [a, asUint(res[i])]));
}

async function readTrusts(pairs: [truster: string, trustee: string][]): Promise<(boolean | null)[]> {
  const res = await hubCalls(pairs.map(([a, b]) => SEL_IS_TRUSTED + pad(a) + pad(b)));
  return res.map(asBool);
}

/** Everyone the Röbel Münzen group accepts = every verified citizen (the auto-invite worker). */
async function fetchCitizens(): Promise<string[]> {
  const rows = await circlesQuery({
    Namespace: 'V_Crc',
    Table: 'TrustRelations',
    Columns: ['trustee'],
    Filter: [and(eq('version', 2), eq('truster', roebeltalerGroupAddress.toLowerCase()))],
    Order: [],
    Limit: 1000,
  });
  const out = new Set<string>();
  for (const r of rows) {
    const a = String(r.trustee ?? '').toLowerCase();
    if (a && !SYSTEM.has(a)) out.add(a);
  }
  return [...out];
}

/** Who has invited (trusts) each of `trustees` — excluding plumbing accounts. */
async function fetchInviters(trustees: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < trustees.length; i += 100) {
    const chunk = trustees.slice(i, i + 100);
    const rows = await circlesQuery({
      Namespace: 'V_Crc',
      Table: 'TrustRelations',
      Columns: ['truster', 'trustee'],
      Filter: [and(eq('version', 2), isIn('trustee', chunk))],
      Order: [],
      Limit: 2000,
    });
    for (const r of rows) {
      const truster = String(r.truster ?? '').toLowerCase();
      const trustee = String(r.trustee ?? '').toLowerCase();
      if (!truster || truster === trustee || SYSTEM.has(truster)) continue;
      const list = map.get(trustee) ?? [];
      if (!list.includes(truster)) list.push(truster);
      map.set(trustee, list);
    }
  }
  return map;
}

/** Addresses `self` has invited that have not joined yet, checked against the chain itself. */
async function fetchOpenInvitees(self: string): Promise<string[]> {
  const me = self.toLowerCase();
  const recent = await readRecent(me);
  let indexed: string[] = [];
  try {
    const rows = await circlesQuery({
      Namespace: 'V_Crc',
      Table: 'TrustRelations',
      Columns: ['trustee'],
      Filter: [and(eq('version', 2), eq('truster', me))],
      Order: [],
      Limit: 500,
    });
    indexed = rows.map((r) => String(r.trustee ?? '').toLowerCase());
  } catch (e) {
    // Without the indexer only the locally remembered invitations are known.
    if (recent.length === 0) throw e;
  }
  const withdrawn = new Set(recent.filter((r) => r.withdrawn).map((r) => r.address));
  const candidates = [...new Set([...indexed, ...recent.filter((r) => !r.withdrawn).map((r) => r.address)])]
    .filter((a) => a && a !== me && !SYSTEM.has(a) && !withdrawn.has(a));
  if (candidates.length === 0) return [];
  // The chain decides: still trusted by me, accepted by the group (a citizen), not yet joined.
  const group = roebeltalerGroupAddress.toLowerCase();
  const [mine, citizen, humans] = await Promise.all([
    readTrusts(candidates.map((a) => [me, a])),
    readTrusts(candidates.map((a) => [group, a])),
    readHumans(candidates),
  ]);
  return candidates.filter((a, i) => mine[i] !== false && citizen[i] === true && humans.get(a) === false);
}

/**
 * Number of open invitations of `self`, for the claim's reserve. Falls back to the last known
 * count when the network read fails, so a flaky connection never converts held-back Münzen.
 */
export async function getOpenInviteCount(self: string): Promise<number> {
  try {
    const n = (await fetchOpenInvitees(self)).length;
    AsyncStorage.setItem(openCountKey(self), String(n)).catch(() => {});
    return n;
  } catch {
    try { return Number(await AsyncStorage.getItem(openCountKey(self))) || 0; } catch { return 0; }
  }
}

/** Personal Münzen the next claim holds back for `self` (open invitations + saving switch). */
export async function getInviteReserveRaw(self: string): Promise<bigint> {
  const saving = await isSavingForInvite(self);
  // Nothing was ever saved or sent from this device and nothing is remembered: skip the network.
  let known: string | null = null;
  try { known = await AsyncStorage.getItem(openCountKey(self)); } catch { /* unknown */ }
  if (!saving && known === null) return 0n;
  return inviteReserveRaw(await getOpenInviteCount(self), saving);
}

export interface Neighbour {
  address: string;
  /** Display name — never a raw wallet address. */
  name: string;
  imageUrl: string | null;
  status: NeighbourStatus;
  /** Name of the inviter for `invitedByOther`, when known. */
  inviterName: string | null;
}

export interface InviteOverview {
  /** Verified citizens who have not joined Röbel Münzen yet, the ones still waiting first. */
  neighbours: Neighbour[];
  /** My open invitations (invited, not yet joined). */
  openInvites: number;
  /** Citizens already collecting Röbel Münzen (including me, if I do). */
  joined: number;
  /** All verified citizens. */
  citizens: number;
}

async function fetchNames(addrs: string[]): Promise<Map<string, { name: string | null; imageUrl: string | null }>> {
  const map = new Map<string, { name: string | null; imageUrl: string | null }>();
  if (addrs.length === 0) return map;
  try {
    const { data } = await supabase
      .from('users')
      .select('wallet_address, username, display_name, profile_picture_url')
      .in('wallet_address', addrs);
    for (const u of (data ?? []) as any[]) {
      const w = (u.wallet_address as string | null)?.toLowerCase();
      if (!w) continue;
      map.set(w, {
        name: (u.display_name as string) || (u.username as string) || null,
        imageUrl: (u.profile_picture_url as string) || null,
      });
    }
  } catch { /* names stay generic */ }
  return map;
}

/** Everything the "Nachbarn einladen" screen shows. Throws when the network is unreachable. */
export async function loadInviteOverview(self: string): Promise<InviteOverview> {
  const me = self.toLowerCase();
  const citizens = await fetchCitizens();
  const humans = await readHumans(citizens);
  // Unknown (failed read) is treated as joined: never offer an invitation that might be wasted.
  const notJoined = citizens.filter((a) => a !== me && humans.get(a) === false);
  const joined = citizens.filter((a) => humans.get(a) === true).length;

  const [invitersOf, mineOpen] = await Promise.all([
    fetchInviters(notJoined).catch(() => new Map<string, string[]>()),
    fetchOpenInvitees(me).catch(() => [] as string[]),
  ]);
  const mineSet = new Set(mineOpen);

  // Only a joined human with enough personal Münzen is an invitation that will actually work.
  const inviterAddrs = [...new Set([...invitersOf.values()].flat())].filter((a) => a !== me);
  const [inviterHumans, inviterBalances] = await Promise.all([
    readHumans(inviterAddrs).catch(() => new Map<string, boolean | null>()),
    readOwnBalances(inviterAddrs).catch(() => new Map<string, bigint | null>()),
  ]);
  const canPay = (a: string) =>
    inviterHumans.get(a) === true && (inviterBalances.get(a) ?? 0n) >= INVITE_COST_RAW;

  const names = await fetchNames([...notJoined, ...inviterAddrs]);

  const neighbours: Neighbour[] = notJoined.map((address) => {
    const funded = (invitersOf.get(address) ?? []).filter((a) => a !== me && canPay(a));
    if (mineSet.has(address)) funded.unshift(me);
    const status = neighbourStatus({ self: me, fundedInviters: funded });
    const other = status === 'invitedByOther' ? funded[0] : null;
    return {
      address,
      name: names.get(address)?.name || 'Nachbar:in',
      imageUrl: names.get(address)?.imageUrl ?? null,
      status,
      inviterName: other ? names.get(other)?.name ?? null : null,
    };
  });
  const order: Record<NeighbourStatus, number> = { invitedByMe: 0, waiting: 1, invitedByOther: 2 };
  neighbours.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, 'de'));

  AsyncStorage.setItem(openCountKey(me), String(mineSet.size)).catch(() => {});
  return { neighbours, openInvites: mineSet.size, joined, citizens: citizens.length };
}

export interface MyInvitation {
  /** An inviter who can pay right now (join works), else null. */
  inviter: string | null;
  /** Someone invited me but is still saving up for it. */
  pendingInviter: string | null;
  /** Display name of whichever of the two is set. */
  inviterName: string | null;
}

/**
 * Who invited `addr`, for the join button. Only registered humans count (the group and its mint
 * handler also trust every citizen, and registering with them always fails); among those, one
 * who holds enough personal Münzen is preferred because the join burns them.
 */
export async function findMyInvitation(addr: string): Promise<MyInvitation> {
  const me = addr.toLowerCase();
  const trusters = ((await fetchInviters([me])).get(me) ?? []).filter((a) => a !== me);
  if (trusters.length === 0) return { inviter: null, pendingInviter: null, inviterName: null };
  const [humans, balances] = await Promise.all([readHumans(trusters), readOwnBalances(trusters)]);
  const people = trusters.filter((a) => humans.get(a) === true);
  // An unreadable balance is given the benefit of the doubt (the chain rejects it if wrong).
  const funded = people.find((a) => (balances.get(a) ?? INVITE_COST_RAW) >= INVITE_COST_RAW) ?? null;
  const chosen = funded ?? people[0] ?? null;
  const inviterName = chosen ? (await fetchNames([chosen])).get(chosen)?.name ?? null : null;
  return { inviter: funded, pendingInviter: funded ? null : chosen, inviterName };
}
