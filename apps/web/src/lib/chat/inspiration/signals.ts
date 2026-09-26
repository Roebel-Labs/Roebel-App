// Pure signal computation for the "Für dich" inspiration screen. The route loads raw facts
// (inspiration/load.ts) and this module turns them into the SIGNALS vocabulary of catalog.ts,
// picks the catalog audience for the viewer and decides which tasks are locked. No I/O.
import { SIGNALS, type Audience, type InspirationTask, type InspirationTier } from "./catalog";

/** Signals outside the catalog vocabulary: informational only, the ranking ignores them. */
export const EXTRA_SIGNALS = {
  chatActive: "user.chat_active_7d",
  profileIncomplete: "org.profile_incomplete",
} as const;

export type UserTier = "free" | "plus" | "ultra";

/** Grant windows per tenant (research §7: "gepflegt als Datum-Liste pro Mandant"). Dates inclusive, YYYY-MM-DD. */
export interface GrantWindow {
  name: string;
  from: string;
  to: string;
}

export const ROEBEL_GRANT_WINDOWS: GrantWindow[] = [
  // Ehrenamtsstiftung MV: Anträge 2026 bis 30.9.2026 (research [C2]).
  { name: "Ehrenamtsstiftung MV 2026", from: "2026-01-01", to: "2026-09-30" },
];

export interface UserFacts {
  isCitizen: boolean;
  /** users.created_at (ISO) or null. */
  createdAt: string | null;
  /** Owner/admin of at least one organisation. */
  ownsOrg: boolean;
  /** Most recent chat_threads.last_message_at (ISO) or null. */
  lastChatAt: string | null;
}

export interface OrgFacts {
  /** accounts.sub_type: restaurant | verein | fraktion | unternehmen | stadt | … */
  subType: string | null;
  /** Category of a linked `businesses` row (gastronomie, handwerk, einzelhandel, …), if any. */
  businessCategory: string | null;
  /** Name + bio + business description, for the tourism keyword check. */
  text: string;
  /** A published restaurants row exists for the account. */
  hasRestaurant: boolean;
  /** Available menu items of that restaurant. */
  menuItemCount: number;
  /** Newest menu item created_at (ISO) or null. */
  menuUpdatedAt: string | null;
  upcomingEvents: number;
  postsLast30d: number;
  activeDeals: number;
  /** A linked businesses row exists (deals hang off businesses). */
  hasBusiness: boolean;
  activeTicketTypes: number;
  ratingCount: number;
  ratingAvg: number | null;
  /** 0..1, see profileCompleteness(). */
  profileCompleteness: number;
}

export interface WorldFacts {
  now: Date;
  /** Approved events in the next 14 days (town-wide). */
  eventsNext14d: number;
  /** Governance proposals in Pending/Active state. */
  openProposals: number;
  grantWindows?: GrantWindow[];
}

const DAY = 86_400_000;
const TOURISM_WORDS = /ferienwohnung|ferienhaus|ferienhof|pension|hotel|camping|zeltplatz|gästehaus|gaestehaus|jugendherberge|bootsverleih|hausboot|charter|tourist|urlaub|unterkunft/i;
const CAFE_WORDS = /café|cafe|kaffee|eiscafé|eiscafe|konditorei|bäckerei|baeckerei/i;

/** Month in Europe/Berlin (1–12). */
export function berlinMonth(now: Date): number {
  const m = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", month: "numeric" }).format(now);
  return Number(m);
}

export function berlinDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** season=… and month=12 signals. */
export function timeSignals(now: Date): string[] {
  const m = berlinMonth(now);
  const out: string[] = [];
  if (m >= 3 && m <= 5) out.push(SIGNALS.preSeason);
  else if (m >= 6 && m <= 8) out.push(SIGNALS.summer);
  else if (m >= 9 && m <= 11) out.push(SIGNALS.autumn);
  else out.push(SIGNALS.winter);
  if (m === 12) out.push(SIGNALS.yearEnd);
  return out;
}

export function grantWindowOpen(now: Date, windows: GrantWindow[] = ROEBEL_GRANT_WINDOWS): boolean {
  const today = berlinDate(now);
  return windows.some((w) => w.from <= today && today <= w.to);
}

export function worldSignals(world: WorldFacts): string[] {
  const out = timeSignals(world.now);
  if (grantWindowOpen(world.now, world.grantWindows)) out.push(SIGNALS.grantWindow);
  if (world.eventsNext14d > 0) out.push(SIGNALS.eventSoon);
  if (world.openProposals > 0) out.push(SIGNALS.proposalOpen);
  return out;
}

export function userSignals(user: UserFacts, now: Date): string[] {
  const out: string[] = [];
  if (user.isCitizen) out.push(SIGNALS.citizen);
  if (user.ownsOrg) out.push(SIGNALS.orgOwner);
  const created = user.createdAt ? Date.parse(user.createdAt) : NaN;
  if (Number.isFinite(created) && now.getTime() - created < 45 * DAY) out.push(SIGNALS.newInTown);
  const lastChat = user.lastChatAt ? Date.parse(user.lastChatAt) : NaN;
  if (Number.isFinite(lastChat) && now.getTime() - lastChat < 7 * DAY) out.push(EXTRA_SIGNALS.chatActive);
  return out;
}

/** Catalog audience for an organisation. Tourism wins over business when the texts say so. */
export function orgAudience(org: Pick<OrgFacts, "subType" | "businessCategory" | "text">): Audience {
  switch (org.subType) {
    case "restaurant":
      return "restaurant";
    case "verein":
    case "fraktion":
      return "verein";
    case "stadt":
      return "kommune";
  }
  if (TOURISM_WORDS.test(org.text)) return "tourism";
  if (org.businessCategory === "gastronomie") return "restaurant";
  return "business";
}

export function orgSignals(org: OrgFacts, now: Date): string[] {
  const audience = orgAudience(org);
  const out: string[] = [];
  const kind: Record<Audience, string> = {
    restaurant: SIGNALS.restaurant,
    verein: SIGNALS.verein,
    business: SIGNALS.business,
    tourism: SIGNALS.tourism,
    kommune: SIGNALS.kommune,
    citizen: SIGNALS.citizen,
  };
  out.push(kind[audience]);
  if (audience === "restaurant" && CAFE_WORDS.test(org.text)) out.push(SIGNALS.cafe);
  if (org.businessCategory === "handwerk") out.push(SIGNALS.handwerk);
  if (org.businessCategory === "einzelhandel") out.push(SIGNALS.retail);

  if (audience === "restaurant") {
    if (!org.hasRestaurant || org.menuItemCount === 0) out.push(SIGNALS.noMenu);
    else {
      const updated = org.menuUpdatedAt ? Date.parse(org.menuUpdatedAt) : NaN;
      if (!Number.isFinite(updated) || now.getTime() - updated > 180 * DAY) out.push(SIGNALS.menuStale);
    }
  }
  if (org.upcomingEvents === 0) out.push(SIGNALS.noEvents);
  if (org.postsLast30d === 0) out.push(SIGNALS.quietFeed);
  if (org.activeTicketTypes > 0) out.push(SIGNALS.hasTickets);
  if (org.ratingCount > 0 && org.ratingAvg !== null && org.ratingAvg < 4) out.push(SIGNALS.lowRating);
  if (audience !== "verein" && audience !== "kommune" && org.activeDeals === 0) out.push(SIGNALS.noDeals);
  if (org.profileCompleteness < 0.6) out.push(EXTRA_SIGNALS.profileIncomplete);
  return out;
}

/** Share of filled profile fields (bio, avatar, cover, address, opening hours). */
export function profileCompleteness(acc: {
  bio?: string | null; avatar_url?: string | null; cover_url?: string | null; address?: string | null;
  opening_hours?: unknown;
}): number {
  const filled = [
    Boolean(acc.bio?.trim()),
    Boolean(acc.avatar_url),
    Boolean(acc.cover_url),
    Boolean(acc.address?.trim()),
    Boolean(acc.opening_hours && typeof acc.opening_hours === "object" && Object.keys(acc.opening_hours as object).length),
  ];
  return filled.filter(Boolean).length / filled.length;
}

/** Full signal set for one viewer + audience. */
export function computeSignals(input: { user: UserFacts; org: OrgFacts | null; world: WorldFacts }): Set<string> {
  const now = input.world.now;
  return new Set([
    ...userSignals(input.user, now),
    ...(input.org ? orgSignals(input.org, now) : []),
    ...worldSignals(input.world),
  ]);
}

const TIER_RANK: Record<UserTier, number> = { free: 0, plus: 1, ultra: 2 };
/**
 * Rank needed to use a task. "business" (Betrieb, the org subscription) has no entitlement of
 * its own yet; per research §5 it carries the Ultra quota, so Ultra unlocks it until the org
 * subscription exists.
 */
const TASK_RANK: Record<InspirationTier, number> = { free: 0, plus: 1, ultra: 2, business: 2 };

export function isTaskLocked(taskTier: InspirationTier, userTier: UserTier): boolean {
  return TASK_RANK[taskTier] > (TIER_RANK[userTier] ?? 0);
}

export function fillOrgName(text: string, orgName: string | null | undefined): string {
  const name = orgName?.trim() || "meinen Betrieb";
  return text.replace(/\{orgName\}/g, name);
}

/** Parses `audience` (+ `orgId`) query params. "me"/"citizen"/"" → the personal view. */
export function parseAudienceQuery(audience: string | null, orgId: string | null): { kind: "me" } | { kind: "org"; orgId: string } {
  const a = (audience ?? "").trim();
  if (a.startsWith("org:") && a.length > 4) return { kind: "org", orgId: a.slice(4) };
  if (a === "org" && orgId?.trim()) return { kind: "org", orgId: orgId.trim() };
  if (orgId?.trim() && a !== "me") return { kind: "org", orgId: orgId.trim() };
  return { kind: "me" };
}

export type RankableTask = Pick<InspirationTask, "id">;

export function withoutDismissed<T extends RankableTask>(tasks: T[], dismissed: Set<string>): T[] {
  return dismissed.size ? tasks.filter((t) => !dismissed.has(t.id)) : tasks;
}
