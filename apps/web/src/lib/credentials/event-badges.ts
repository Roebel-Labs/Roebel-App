// Event badges: attendance (door check-ins and Smart Event QR claims) becomes an Abzeichen with
// one tap. A thin layer over the batch builder: one badge type per event (template `abzeichen`),
// created on chain in the same action as its first batch, and every later tap issues only the
// people who have no invitation of that type yet. Optionally the org appoints the node key as
// delegate so the node issues small batches itself while the event runs (badge-delegate.ts).
//
// Who counts as attended: a ticket with status `checked_in`, or an `event_attend` reward claim
// that was not rejected and whose reference is a reward_events row linked to the event.
// Refunded or void tickets never count.
// Relative imports only: loaded by `npx tsx --test`.
import { randomUUID } from "node:crypto";
import { credentialTypeId, localIdFromUuid, type RegisterStep } from "@netizen-labs/credential-registry";
import type { Address, Hex } from "viem";
import {
  configOf,
  orgFor,
  prepareAction,
  prepareDelegateAction,
  prepareTypeAction,
  readyOrgFor,
  viaOf,
  type Deps,
  type Fail,
  type Result,
} from "./actions";
import { BADGE_DELEGATE_LABEL, badgeDelegateAddress } from "./badge-delegate";
import { endOfDayBerlin, prepareBatch } from "./batch";
import type { Caller } from "./caller";
import type { OrgContext } from "./rights";
import type { ActionStatus, BatchRow, CredentialStore, EventRow, TypeRow } from "./store";
import { TYPE_TEMPLATES } from "./templates";

export type EventBadgeDeps = Deps & {
  /** The node's badge delegate address; defaults to CREDENTIAL_BADGE_DELEGATE_KEY's (null = not configured). */
  badgeDelegate?: () => Address | null;
};

export type EventBadgeView = { typeId: Hex; name: string; imageUrl: string | null; supplyCap: number; chain: "draft" | "onchain"; auto: boolean };
export type EventBadgeGetResult = { attendees: number; notYetIssued: number; issued: number; accepted: number; badge: EventBadgeView | null };

const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });
const bad = (message: string) => fail(400, "BAD_REQUEST", message);
const isFail = (v: unknown): v is Fail => typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WALLET = /^0x[0-9a-f]{40}$/;
const EVENT_NOT_FOUND = fail(404, "NOT_FOUND", "Diese Veranstaltung gibt es nicht.");
const NOTHING_TO_ISSUE = fail(409, "NOTHING_TO_ISSUE", "Alle Teilnehmenden haben ihr Abzeichen schon bekommen.");
const PENDING_STATUSES: readonly ActionStatus[] = ["awaiting_confirmation", "submitted"];

/** Claim window after the event's last day (open question 1 of the plan). */
export const BADGE_CLAIM_DAYS_AFTER = 14;

// ── attendees ─────────────────────────────────────────────────────────────────

/** Everyone who attended, each wallet once (lowercase); a ticket check-in wins over a QR claim. */
export async function attendeesOf(store: CredentialStore, eventId: string): Promise<{ wallet: string; source: "ticket" | "qr" }[]> {
  const out = new Map<string, "ticket" | "qr">();
  const add = (wallet: string, source: "ticket" | "qr") => {
    const w = wallet.trim().toLowerCase();
    if (WALLET.test(w) && !out.has(w)) out.set(w, source);
  };
  for (const t of await store.ticketsForEvent(eventId)) if (t.status === "checked_in") add(t.wallet, "ticket");
  for (const c of await store.attendClaimsForEvent(eventId)) if (c.status !== "rejected") add(c.wallet, "qr");
  return [...out].map(([wallet, source]) => ({ wallet, source }));
}

// ── claim window ──────────────────────────────────────────────────────────────

const dayOf = (v: string) => (/^\d{4}-\d{2}-\d{2}/.exec(v.trim())?.[0] ?? null);

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 00:00 of that day in Europe/Berlin, unix seconds. (Midnight is never inside a DST switch.) */
function startOfDayBerlin(day: string): number {
  const end = endOfDayBerlin(day);
  if (end === null) throw new Error(`badgeWindow: not a date: ${day}`);
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return (guess - (wall - guess)) / 1000;
}

/** From the event day 00:00 to 14 days after its last day 23:59:59 (Europe/Berlin). */
export function badgeWindow(ev: { date: string; end_date?: string | null }): { claimStart: number; claimEnd: number } {
  const first = dayOf(ev.date);
  if (!first) throw new Error(`badgeWindow: not a date: ${ev.date}`);
  const last = (ev.end_date && dayOf(ev.end_date)) || first;
  const end = endOfDayBerlin(addDays(last >= first ? last : first, BADGE_CLAIM_DAYS_AFTER));
  return { claimStart: startOfDayBerlin(first), claimEnd: Number(end) };
}

// ── shared ────────────────────────────────────────────────────────────────────

async function eventOrg(d: Deps, c: Caller, eventId: unknown, ready: boolean): Promise<{ event: EventRow; org: OrgContext } | Fail> {
  if (typeof eventId !== "string" || !UUID.test(eventId)) return EVENT_NOT_FOUND;
  const event = await d.store.getEvent(eventId);
  if (!event || !event.accountId) return EVENT_NOT_FOUND;
  const org = ready ? await readyOrgFor(d, event.accountId, c.wallet) : await orgFor(d, event.accountId, c.wallet);
  if (isFail(org)) return org;
  return { event, org };
}

export async function badgeTypeOf(store: CredentialStore, accountId: string, eventId: string): Promise<TypeRow | null> {
  const types = await store.listTypes({ accountId, includeRetired: false });
  return types.find((t) => t.kind === "badge" && t.eventId === eventId && !t.retired) ?? null;
}

function view(t: TypeRow | null): EventBadgeView | null {
  if (!t) return null;
  return { typeId: t.typeId, name: t.name, imageUrl: t.imageUrl, supplyCap: t.supplyCap, chain: t.chainStatus === "onchain" ? "onchain" : "draft", auto: t.autoBadges === true };
}

/**
 * Who already has an invitation of the badge type, by wallet. `covered`: any status (declined and
 * revoked too, nobody gets a second badge), plus invitations of a batch still waiting for the phone;
 * a batch that was discarded or whose action expired or failed frees its people again.
 * `delivered`: invitations that reached the person. `accepted`: accepted ones.
 */
export async function badgeHolders(d: Pick<Deps, "store" | "now">, typeId: Hex): Promise<{ covered: Set<string>; delivered: Set<string>; accepted: Set<string> }> {
  const covered = new Set<string>();
  const delivered = new Set<string>();
  const accepted = new Set<string>();
  const batches = new Map<string, BatchRow | null>();
  const actionLive = new Map<string, boolean>();
  for (const i of await d.store.listInvitations({ typeId })) {
    const w = i.recipientWallet ?? (i.leafKind === "account" ? i.subject : null);
    if (!w) continue;
    if (!batches.has(i.batchId)) batches.set(i.batchId, await d.store.getBatch(i.batchId));
    const b = batches.get(i.batchId);
    if (!b || b.status === "cancelled") continue;
    if (i.status === "prepared" && b.status === "prepared") {
      if (!b.actionId) continue;
      if (!actionLive.has(b.actionId)) {
        const a = await d.store.getAction(b.actionId);
        actionLive.set(b.actionId, !!a && PENDING_STATUSES.includes(a.status) && Date.parse(a.expiresAt) > d.now());
      }
      if (!actionLive.get(b.actionId)) continue;
    }
    covered.add(w);
    if (i.status !== "prepared") delivered.add(w);
    if (i.status === "accepted") accepted.add(w);
  }
  return { covered, delivered, accepted };
}

/** A still-pending action of the org that creates this draft type. */
async function pendingCreate(d: Deps, accountId: string, t: TypeRow): Promise<boolean> {
  const actions = await d.store.listActions({ accountId, statuses: PENDING_STATUSES });
  return actions.some(
    (a) => Date.parse(a.expiresAt) > d.now() && a.steps.some((s) => s.fn === "createType" && s.localId.toLowerCase() === t.localId.toLowerCase()),
  );
}

function cleanName(v: unknown): string | Fail | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || v.trim().length < 2 || v.trim().length > 60) return bad("Der Name muss 2 bis 60 Zeichen lang sein.");
  return v.trim();
}
function cleanImage(v: unknown): string | null | Fail | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !/^https:\/\/\S+$/.test(v)) return bad("Das Bild braucht eine https-Adresse.");
  return v;
}

function defaultName(title: string): string {
  return `Dabei: ${title.trim()}`.slice(0, 60).trim();
}

async function createDraft(
  d: Deps,
  c: Caller,
  org: OrgContext,
  event: EventRow,
  p: { name?: string; imageUrl?: string | null; supplyCap?: number },
): Promise<TypeRow | Fail> {
  const localUuid = randomUUID();
  const localId = localIdFromUuid(localUuid);
  const w = badgeWindow({ date: event.date, end_date: event.endDate });
  const tpl = TYPE_TEMPLATES.abzeichen;
  const row: TypeRow = {
    typeId: credentialTypeId(org.orgId, localId).toLowerCase() as Hex,
    registry: d.registry.toLowerCase(),
    accountId: org.accountId,
    orgId: org.orgId.toLowerCase() as Hex,
    localUuid,
    localId,
    kind: "badge",
    policy: "issuer_batch",
    name: p.name ?? defaultName(event.title),
    description: tpl.description,
    imageUrl: p.imageUrl !== undefined ? p.imageUrl : event.imageUrl,
    benefits: [],
    template: "abzeichen",
    defaultValiditySeconds: tpl.defaultValiditySeconds,
    claimStart: new Date(w.claimStart * 1000).toISOString(),
    claimEnd: new Date(w.claimEnd * 1000).toISOString(),
    supplyCap: p.supplyCap ?? 0,
    publicClaim: true,
    recognised: false,
    retired: false,
    chainStatus: "draft",
    eventId: event.id,
    createdBy: c.wallet.toLowerCase(),
    createdAt: new Date(d.now()).toISOString(),
  };
  try {
    await d.store.upsertType(row);
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") return fail(409, "BADGE_EXISTS", "Für diese Veranstaltung gibt es schon ein Abzeichen.");
    throw e;
  }
  return row;
}

// ── read ──────────────────────────────────────────────────────────────────────

async function stateOf(d: Deps, eventId: string, t: TypeRow | null): Promise<Omit<EventBadgeGetResult, "badge">> {
  const attendees = await attendeesOf(d.store, eventId);
  if (!t) return { attendees: attendees.length, notYetIssued: attendees.length, issued: 0, accepted: 0 };
  const h = await badgeHolders(d, t.typeId);
  return {
    attendees: attendees.length,
    notYetIssued: attendees.filter((a) => !h.covered.has(a.wallet)).length,
    issued: h.delivered.size,
    accepted: h.accepted.size,
  };
}

/** event_badges_list: the org's events with badge state (owner or admin). */
export async function eventBadgesList(
  d: Deps,
  c: Caller,
  p: { accountId: string },
): Promise<Result<{ eventId: string; title: string; date: string; badge: EventBadgeView | null; attendees: number; issued: number; accepted: number }[]>> {
  const org = await orgFor(d, p?.accountId, c.wallet);
  if (isFail(org)) return org;
  const types = (await d.store.listTypes({ accountId: org.accountId, includeRetired: false })).filter((t) => t.kind === "badge" && t.eventId && !t.retired);
  const out = [];
  for (const e of await d.store.listEventsForAccount(org.accountId)) {
    const t = types.find((x) => x.eventId === e.id) ?? null;
    const s = await stateOf(d, e.id, t);
    out.push({ eventId: e.id, title: e.title, date: e.date, badge: view(t), attendees: s.attendees, issued: s.issued, accepted: s.accepted });
  }
  return { ok: true, data: out };
}

/** event_badge_get: counts and badge of one event (owner or admin of its org). */
export async function eventBadgeGet(d: Deps, c: Caller, p: { eventId: string }): Promise<Result<EventBadgeGetResult>> {
  const ctx = await eventOrg(d, c, p?.eventId, false);
  if (isFail(ctx)) return ctx;
  const t = await badgeTypeOf(d.store, ctx.org.accountId, ctx.event.id);
  return { ok: true, data: { ...(await stateOf(d, ctx.event.id, t)), badge: view(t) } };
}

// ── prepare ───────────────────────────────────────────────────────────────────

/**
 * event_badge_prepare: one action. While the badge type is a draft it starts with createType;
 * then one addBatch for every attendee without an invitation of this type.
 */
export async function prepareEventBadge(d: Deps, c: Caller, p: { eventId: string; name?: string; imageUrl?: string }): Promise<Result<{ actionId: string; typeId: Hex; count: number }>> {
  const name = cleanName(p?.name);
  if (isFail(name)) return name;
  const imageUrl = cleanImage(p?.imageUrl);
  if (isFail(imageUrl)) return imageUrl;
  const ctx = await eventOrg(d, c, p?.eventId, true);
  if (isFail(ctx)) return ctx;
  const { event, org } = ctx;

  let t = await badgeTypeOf(d.store, org.accountId, event.id);
  if (!t) {
    const created = await createDraft(d, c, org, event, { name, imageUrl });
    if (isFail(created)) return created;
    t = created;
  } else if (t.chainStatus === "draft" && (name !== undefined || imageUrl !== undefined)) {
    const patch: Partial<TypeRow> = {};
    if (name !== undefined) patch.name = name;
    if (imageUrl !== undefined) patch.imageUrl = imageUrl;
    await d.store.updateType(t.typeId, patch);
    t = { ...t, ...patch };
  }
  const draft = t.chainStatus === "draft";
  if (draft && (await pendingCreate(d, org.accountId, t))) {
    return fail(409, "ALREADY_PENDING", "Die Bestätigung für dieses Abzeichen wartet schon auf dem Handy.");
  }

  const holders = await badgeHolders(d, t.typeId);
  const fresh = (await attendeesOf(d.store, event.id)).filter((a) => !holders.covered.has(a.wallet));
  const preSteps: RegisterStep[] = draft
    ? [{ fn: "createType", orgId: org.orgId, localId: t.localId, kind: "badge", policy: "issuerBatch", config: configOf(t) }]
    : [];

  if (fresh.length === 0) {
    if (!draft) return NOTHING_TO_ISSUE;
    // Set up before anyone attended: the type goes on chain alone, the batch follows later.
    const { actionId } = await prepareAction(d, {
      org,
      wallet: c.wallet,
      via: viaOf(c, c.payload?.client),
      steps: preSteps,
      summary: { title: `Abzeichen „${t.name}“ anlegen`, lines: ["Art: Abzeichen"], orgName: org.name },
    });
    return { ok: true, data: { actionId, typeId: t.typeId, count: 0 } };
  }

  const name60 = t.name;
  const r = await prepareBatch(
    d,
    c,
    { accountId: org.accountId, typeId: t.typeId, recipients: fresh.map((a) => ({ kind: "account" as const, wallet: a.wallet })), source: "event" },
    { preSteps, title: (n) => `${n} Abzeichen vergeben: ${name60}` },
  );
  if (!r.ok) return r.code === "NOTHING_TO_ISSUE" ? NOTHING_TO_ISSUE : r;
  return { ok: true, data: { actionId: r.data.actionId, typeId: t.typeId, count: r.data.counts.app + r.data.counts.link } };
}

/**
 * event_badge_setup (the event create/edit toggle): writes or retires the draft badge row, no chain
 * step. On a type already on chain, `enabled: false` prepares retireType and name/image edits are
 * written directly (the card text lives on this node).
 */
export async function setupEventBadge(
  d: Deps,
  c: Caller,
  p: { eventId: string; enabled: boolean; name?: string; imageUrl?: string; supplyCap?: number },
): Promise<Result<{ typeId: Hex | null; actionId?: string }>> {
  if (!p || typeof p.enabled !== "boolean") return bad("enabled muss wahr oder falsch sein.");
  const name = cleanName(p.name);
  if (isFail(name)) return name;
  const imageUrl = cleanImage(p.imageUrl);
  if (isFail(imageUrl)) return imageUrl;
  if (p.supplyCap !== undefined && (typeof p.supplyCap !== "number" || !Number.isSafeInteger(p.supplyCap) || p.supplyCap < 0 || p.supplyCap > 100_000)) {
    return bad("Die Höchstzahl muss eine ganze Zahl zwischen 0 und 100.000 sein.");
  }
  const ctx = await eventOrg(d, c, p.eventId, false);
  if (isFail(ctx)) return ctx;
  const { event, org } = ctx;
  const t = await badgeTypeOf(d.store, org.accountId, event.id);

  if (!p.enabled) {
    if (!t) return { ok: true, data: { typeId: null } };
    if (t.chainStatus === "draft") {
      await d.store.updateType(t.typeId, { retired: true });
      return { ok: true, data: { typeId: null } };
    }
    const r = await prepareTypeAction(d, c, { accountId: org.accountId, op: "retire", typeId: t.typeId, via: viaOf(c, c.payload?.client) });
    if (!r.ok) return r;
    return { ok: true, data: { typeId: t.typeId, actionId: r.data.actionId ?? undefined } };
  }

  if (!t) {
    const created = await createDraft(d, c, org, event, { name, imageUrl, supplyCap: p.supplyCap });
    if (isFail(created)) return created;
    return { ok: true, data: { typeId: created.typeId } };
  }
  const patch: Partial<TypeRow> = {};
  if (name !== undefined) patch.name = name;
  if (imageUrl !== undefined) patch.imageUrl = imageUrl;
  // The limit is part of the on-chain config: only a draft takes it here.
  if (p.supplyCap !== undefined && t.chainStatus === "draft") patch.supplyCap = p.supplyCap;
  if (Object.keys(patch).length > 0) await d.store.updateType(t.typeId, patch);
  return { ok: true, data: { typeId: t.typeId } };
}

/**
 * event_badge_auto: appoint (or remove) the node key as delegate of the event's badge type.
 * Turning it off clears auto_badges at once (stopping never waits for the chain); turning it on
 * sets auto_badges only when the sync sees DelegateSet.
 */
export async function prepareEventBadgeAuto(d: EventBadgeDeps, c: Caller, p: { eventId: string; enabled: boolean }): Promise<Result<{ actionId: string }>> {
  if (!p || typeof p.enabled !== "boolean") return bad("enabled muss wahr oder falsch sein.");
  const ctx = await eventOrg(d, c, p.eventId, true);
  if (isFail(ctx)) return ctx;
  const node = (d.badgeDelegate ?? (() => badgeDelegateAddress()))();
  if (!node) return fail(503, "NOT_CONFIGURED", "Nicht eingerichtet.");
  const t = await badgeTypeOf(d.store, ctx.org.accountId, ctx.event.id);
  if (!t) return fail(404, "NOT_FOUND", "Für diese Veranstaltung gibt es noch kein Abzeichen.");
  if (t.chainStatus !== "onchain") return fail(409, "TYPE_NOT_ON_CHAIN", "Dieses Abzeichen ist noch nicht im Register.");
  if (!p.enabled) await d.store.updateType(t.typeId, { autoBadges: false });
  return prepareDelegateAction(d, c, {
    accountId: ctx.org.accountId,
    typeId: t.typeId,
    delegate: node,
    allowed: p.enabled,
    label: BADGE_DELEGATE_LABEL,
    via: viaOf(c, c.payload?.client),
  });
}

// ── Smart Event QR (the badge QR at the door) ─────────────────────────────────

/**
 * event_badge_qr: the event's Smart Event QR id (`roebel.app/e/<id>`), created on first use for a
 * published event, exactly like the org dashboard's QR panel does (reward_events row linked to
 * the event, so its claims count as attendance). Owner or admin of the event's org. Idempotent.
 */
export async function ensureEventQr(d: Deps, c: Caller, p: { eventId: string }): Promise<Result<{ rewardEventId: string }>> {
  const ctx = await eventOrg(d, c, p?.eventId, false);
  if (isFail(ctx)) return ctx;
  const existing = await d.store.rewardEventIdFor(ctx.event.id);
  if (existing) return { ok: true, data: { rewardEventId: existing } };
  if (ctx.event.status !== "approved") return fail(409, "NOT_PUBLISHED", "Bitte die Veranstaltung zuerst veröffentlichen.");
  const startsAt = ctx.event.date ? `${ctx.event.date}T${ctx.event.time ?? "00:00:00"}` : null;
  const id = await d.store.createRewardEvent({
    eventId: ctx.event.id,
    label: (ctx.event.title || "Röbel-Event").slice(0, 80),
    startsAt,
    createdBy: c.wallet,
    maxRewards: ctx.event.maxAttendees ?? null,
  });
  return { ok: true, data: { rewardEventId: id } };
}

// ── public ────────────────────────────────────────────────────────────────────

export type PublicEventBadge = { typeId: Hex; name: string; imageUrl: string | null; claimStart: number; claimEnd: number; collected: number };

/**
 * GET /api/credentials/events/<eventId>/badge: what anyone may see of an event's badge (the event
 * page before and after). collected = accepted invitations, counted, never named.
 */
export async function publicEventBadge(store: CredentialStore, eventId: string): Promise<{ badge: PublicEventBadge | null }> {
  if (typeof eventId !== "string" || !UUID.test(eventId)) return { badge: null };
  const event = await store.getEvent(eventId);
  if (!event?.accountId) return { badge: null };
  // Unpublished events stay private, their draft badge with them (status absent = not read).
  if (event.status != null && event.status !== "approved") return { badge: null };
  const t = await badgeTypeOf(store, event.accountId, event.id);
  if (!t) return { badge: null };
  const w = badgeWindow({ date: event.date, end_date: event.endDate });
  const unix = (iso: string | null, fallback: number) => (iso && !Number.isNaN(Date.parse(iso)) ? Math.floor(Date.parse(iso) / 1000) : fallback);
  const accepted = new Set<string>();
  for (const i of await store.listInvitations({ typeId: t.typeId, statuses: ["accepted"] })) accepted.add(i.recipientWallet ?? i.subject);
  return {
    badge: { typeId: t.typeId, name: t.name, imageUrl: t.imageUrl, claimStart: unix(t.claimStart, w.claimStart), claimEnd: unix(t.claimEnd, w.claimEnd), collected: accepted.size },
  };
}

export type PublicScanBadge = { eventId: string | null; eventTitle: string | null; eventDate: string | null; badge: PublicEventBadge | null };

/**
 * GET /api/credentials/scan/<rewardEventId>: what the app needs right after a Smart Event QR scan.
 * reward_events is not readable with the app's anon key (RLS, no policy), so the lookup from the
 * QR id to the event happens here. Only public facts: event title and date, and the public badge.
 */
export async function publicScanBadge(store: CredentialStore, rewardEventId: string): Promise<PublicScanBadge> {
  const none: PublicScanBadge = { eventId: null, eventTitle: null, eventDate: null, badge: null };
  if (typeof rewardEventId !== "string" || !UUID.test(rewardEventId)) return none;
  const eventId = await store.eventIdForRewardEvent(rewardEventId);
  if (!eventId) return none;
  const event = await store.getEvent(eventId);
  if (!event || (event.status != null && event.status !== "approved")) return none;
  const { badge } = await publicEventBadge(store, eventId);
  return { eventId, eventTitle: event.title, eventDate: event.date, badge };
}
