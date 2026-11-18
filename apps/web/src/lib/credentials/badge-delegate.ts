// The node's badge delegate key: one EOA (CREDENTIAL_BADGE_DELEGATE_KEY) that an org may appoint
// as delegate of its event badge types, so the node can issue small badge batches itself while the
// event runs. It can only ever be a delegate of types whose org appointed it on chain, and it
// never calls anything but addBatch on the register.
//
// runAutoBadges (cron every 5 minutes, and the attendee's nudge after a QR scan): for every badge
// type with auto_badges on, inside the event's window, while the node is still a delegate on chain
// and no earlier node batch of that type is waiting for the chain, one batch of at most 500 new
// attendees (same exclusion as the organiser's tap). The sync delivers the invitations when
// BatchAdded arrives.
// Relative imports only: loaded by `npx tsx --test`.
import { randomBytes, randomUUID } from "node:crypto";
import { encodeSteps, type RegisterStep } from "@netizen-labs/credential-registry";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Fail, Result } from "./actions";
import { buildBatch } from "./batch";
import type { Caller } from "./caller";
import { ACTION_TTL_MS } from "./config";
import { attendeesOf, badgeHolders, badgeTypeOf } from "./event-badges";
import { sealSecret } from "./secrets";
import type { CredentialStore, EventRow, TypeRow } from "./store";

/** The node key's address (lowercase), or null when the key is not configured. */
export function badgeDelegateAddress(env: Record<string, string | undefined> = process.env): Address | null {
  const key = env.CREDENTIAL_BADGE_DELEGATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  try {
    return privateKeyToAccount(key as `0x${string}`).address.toLowerCase() as Address;
  } catch {
    return null;
  }
}

/** How the node key is named wherever an org sees it (never its address). */
export const BADGE_DELEGATE_LABEL = "Röbel-Server (sofortige Abzeichen)";

/** At most this many people per node batch; the rest follow in the next run. */
export const AUTO_MAX_RECIPIENTS = 500;
/** Default balance floor of the node key: 0.01 xDAI. */
export const AUTO_MIN_BALANCE_WEI = 10n ** 16n;
/** The nudge runs a type at most once per this many milliseconds. */
export const NUDGE_INTERVAL_MS = 60_000;
/** One run per type at a time: every run takes this slot on last_auto_at (compare-and-set) first. */
export const RUN_LOCK_MS = 30_000;
const SEND_FAILED = "Senden fehlgeschlagen";

export type AutoSkip = "window" | "not_delegate" | "kill_switch" | "low_balance" | "nothing_new" | "pending_batch";
export type AutoResult = { type: Hex; issued: number; skipped?: AutoSkip };

export type AutoDeps = {
  store: CredentialStore;
  /** Only the delegate check is needed (a NodeRegistryReader plus a readContract of isDelegate). */
  reader: { isDelegate(typeId: Hex, account: Address): Promise<boolean> };
  /** Sends one transaction from the node key; returns its hash. */
  send: (call: { to: Address; data: Hex }) => Promise<Hex>;
  /** The node key's balance in wei. */
  balance: () => Promise<bigint>;
  /** true = kill switch on (app_settings.credentials_badge_delegate_enabled is not 'true'). */
  killSwitch: () => Promise<boolean>;
  /** Milliseconds. */
  now: () => number;
  registry: Address;
  minBalanceWei: bigint;
  /** The node key's address (badgeDelegateAddress()). */
  node: Address;
  /** Injected randomness (tests). */
  rand?: (bytes: number) => Uint8Array;
};

const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── the event's time window ───────────────────────────────────────────────────

/** Wall-clock time in Europe/Berlin → unix seconds. */
function berlinToUnix(day: string, h: number, m: number, s: number): number {
  const [y, mo, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m, s);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.floor((guess - (wall - guess)) / 1000);
}

const hm = (v: string | null | undefined): [number, number] | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec((v ?? "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return [Number(m[1]), Number(m[2])];
};

/**
 * When the event runs, unix seconds (Europe/Berlin). Without a start time it starts at 00:00;
 * without an end time it ends at 23:59:59 of its (last) day; an end time before the start time
 * belongs to the next day.
 */
export function eventTimes(ev: { date: string; time?: string | null; endTime?: string | null; endDate?: string | null }): { starts: number; ends: number } {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(ev.date.trim())?.[0];
  if (!day) throw new Error(`eventTimes: not a date: ${ev.date}`);
  const lastDay = (ev.endDate && /^\d{4}-\d{2}-\d{2}/.exec(ev.endDate.trim())?.[0]) || day;
  const st = hm(ev.time);
  const et = hm(ev.endTime);
  const starts = berlinToUnix(day, st?.[0] ?? 0, st?.[1] ?? 0, 0);
  let ends = et ? berlinToUnix(lastDay, et[0], et[1], 0) : berlinToUnix(lastDay, 23, 59, 59);
  if (ends < starts) ends = et ? ends + 24 * 3600 : starts;
  return { starts, ends };
}

/** From one hour before the start until six hours after the end. */
export function inAutoWindow(ev: { starts: number; ends: number }, nowSec: number): boolean {
  return ev.starts - 3600 <= nowSec && nowSec <= ev.ends + 6 * 3600;
}

// ── run ───────────────────────────────────────────────────────────────────────

/**
 * Earlier node batches of the type that are still `prepared`: true when one is still waiting for
 * the chain. One whose action expired never landed: it is given up (batch cancelled, action
 * failed), which frees its people for the next batch.
 */
async function pendingNodeBatch(d: AutoDeps, typeId: Hex): Promise<boolean> {
  let waiting = false;
  for (const b of await d.store.listBatches({ typeId, statuses: ["prepared"] })) {
    if (b.source !== "node_delegate") continue;
    const a = b.actionId ? await d.store.getAction(b.actionId) : null;
    if (a && Date.parse(a.expiresAt) > d.now()) {
      waiting = true;
      continue;
    }
    await d.store.updateBatch(b.id, { status: "cancelled" }, ["prepared"]);
    if (a) await d.store.updateAction(a.id, { status: "failed", error: "Nicht im Register angekommen." }, ["submitted", "awaiting_confirmation"]);
  }
  return waiting;
}

async function runType(d: AutoDeps, t: TypeRow, event: EventRow | null, balance: { value?: bigint }, slotHeld = false): Promise<AutoResult> {
  const skip = (skipped: AutoSkip): AutoResult => ({ type: t.typeId, issued: 0, skipped });
  if (!event || !inAutoWindow(eventTimes(event), Math.floor(d.now() / 1000))) return skip("window");
  if (!(await d.reader.isDelegate(t.typeId, d.node))) {
    await d.store.updateType(t.typeId, { autoBadges: false });
    return skip("not_delegate");
  }
  // The slot: a cron pass and a nudge (or two cron passes) never build batches for the same
  // attendees at once. The nudge takes its own, longer slot before it calls in (slotHeld).
  if (!slotHeld) {
    const nowMs = d.now();
    if (!(await d.store.claimAutoRun(t.typeId, new Date(nowMs - RUN_LOCK_MS + 1).toISOString(), new Date(nowMs).toISOString()))) {
      return skip("pending_batch");
    }
  }
  if (await pendingNodeBatch(d, t.typeId)) return skip("pending_batch");
  if (balance.value === undefined) balance.value = await d.balance();
  if (balance.value < d.minBalanceWei) {
    console.warn("[credentials/badges] node key balance below floor", balance.value.toString());
    return skip("low_balance");
  }

  const holders = await badgeHolders(d, t.typeId);
  const fresh = (await attendeesOf(d.store, event.id)).filter((a) => !holders.covered.has(a.wallet)).slice(0, AUTO_MAX_RECIPIENTS);
  if (fresh.length === 0) return skip("nothing_new");

  const nowMs = d.now();
  const validUntil = t.defaultValiditySeconds > 0 ? BigInt(Math.floor(nowMs / 1000) + t.defaultValiditySeconds) : 0n;
  const built = buildBatch({
    typeId: t.typeId,
    recipients: fresh.map((a) => ({ kind: "account" as const, wallet: a.wallet })),
    validUntil,
    rand: d.rand ?? ((n) => new Uint8Array(randomBytes(n))),
    seal: (plain, context) => sealSecret(plain, context),
  });
  const step: RegisterStep = { fn: "addBatch", typeId: t.typeId, root: built.root, count: built.count };
  const batchId = randomUUID();
  const actionId = randomUUID();
  await d.store.insertBatchWithInvitations({ id: batchId, actionId: null, typeId: t.typeId, root: built.root, count: built.count, source: "node_delegate" }, built.invitations);
  await d.store.insertAction({
    id: actionId,
    accountId: t.accountId,
    steps: [step],
    summary: { title: `${built.count} Abzeichen vergeben: ${t.name}`, lines: [`Ausgestellt von: ${BADGE_DELEGATE_LABEL}`], orgName: null },
    status: "submitted",
    preparedBy: d.node.toLowerCase(),
    preparedVia: "node",
    confirmedBy: d.node.toLowerCase(),
    txHash: null,
    error: null,
    preparedBlock: null,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ACTION_TTL_MS).toISOString(),
  });
  await d.store.updateBatch(batchId, { actionId });
  await d.store.updateType(t.typeId, { lastAutoAt: new Date(nowMs).toISOString() });

  // The only call the node key ever makes: addBatch on the register.
  const [call] = encodeSteps([step], d.registry);
  let hash: Hex;
  try {
    hash = await d.send({ to: d.registry, data: call.data });
  } catch (e) {
    await d.store.updateBatch(batchId, { status: "cancelled" }, ["prepared"]);
    // The raw error can carry the keyed RPC URL and addresses: admins see a fixed line, the log
    // only the error's name.
    await d.store.updateAction(actionId, { status: "failed", error: SEND_FAILED });
    throw new Error(`node send failed (${e instanceof Error ? e.name : "unknown"})`);
  }
  await d.store.updateAction(actionId, { txHash: hash.toLowerCase() });
  return { type: t.typeId, issued: built.count };
}

/** One pass over every auto badge type (or only `typeId`). */
export async function runAutoBadges(d: AutoDeps, opts: { typeId?: Hex; slotHeld?: boolean } = {}): Promise<AutoResult[]> {
  const types = (await d.store.listTypes({ chainStatus: "onchain", includeRetired: false, ...(opts.typeId ? { typeIds: [opts.typeId] } : {}) })).filter(
    (t) => t.autoBadges === true && t.kind === "badge" && t.eventId,
  );
  if (types.length === 0) return [];
  if (await d.killSwitch()) return types.map((t) => ({ type: t.typeId, issued: 0, skipped: "kill_switch" as const }));
  const out: AutoResult[] = [];
  const balance: { value?: bigint } = {};
  for (const t of types) {
    try {
      out.push(await runType(d, t, await d.store.getEvent(t.eventId!), balance, opts.slotHeld === true));
      if (out.at(-1)!.issued > 0) balance.value = undefined; // gas was spent: read it again
    } catch (e) {
      console.error("[credentials/badges] run failed", t.typeId, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/**
 * badge_nudge (app only): after an attendee's QR scan, runs the event's auto badge type right away
 * instead of waiting for the cron, at most once per type per 60 s (compare-and-set on
 * last_auto_at), and only for someone who attended.
 */
export async function nudgeAutoBadges(d: AutoDeps, c: Caller, p: { eventId: string }): Promise<Result<{ ran: boolean }>> {
  if (typeof p?.eventId !== "string" || !UUID.test(p.eventId)) return fail(404, "NOT_FOUND", "Diese Veranstaltung gibt es nicht.");
  const no = { ok: true as const, data: { ran: false } };
  const event = await d.store.getEvent(p.eventId);
  if (!event?.accountId) return no;
  const t = await badgeTypeOf(d.store, event.accountId, event.id);
  if (!t || t.chainStatus !== "onchain" || t.autoBadges !== true) return no;
  const me = c.wallet.toLowerCase();
  if (!(await attendeesOf(d.store, event.id)).some((a) => a.wallet === me)) return no;
  const nowMs = d.now();
  if (!(await d.store.claimAutoRun(t.typeId, new Date(nowMs - NUDGE_INTERVAL_MS + 1).toISOString(), new Date(nowMs).toISOString()))) return no;
  await runAutoBadges(d, { typeId: t.typeId, slotHeld: true });
  return { ok: true, data: { ran: true } };
}
