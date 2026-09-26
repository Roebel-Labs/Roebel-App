// Data loading for GET /api/chat/inspiration: reads the raw facts that signals.ts turns into
// catalog signals, then ranks and shapes the response. Service role (server only); every query is
// scoped to the viewer's wallet or to an organisation the viewer belongs to.
import { db, getTier, rowToBot, type BotRow } from "../store";
import type { BotAvatarSpec } from "../types";
import { INSPIRATION_TASKS, rankInspiration, type Audience, type InspirationTask } from "./catalog";
import {
  berlinDate, computeSignals, fillOrgName, isTaskLocked, orgAudience, profileCompleteness, withoutDismissed,
  type OrgFacts, type UserFacts, type UserTier, type WorldFacts,
} from "./signals";

export const INSPIRATION_LIMIT = 8;
const DAY = 86_400_000;

export interface InspirationAudience {
  key: string;
  label: string;
  orgId?: string;
  orgName?: string;
  /** Catalog audience behind the chip ("citizen" for "Ich"). */
  audience: Audience;
}

export interface InspirationCardTask extends InspirationTask {
  locked: boolean;
  /** The preset bot that runs the task (resolved from botSlug; Mecky when null). */
  bot: { id: string; name: string; avatar: BotAvatarSpec } | null;
}

export interface InspirationResponse {
  audiences: InspirationAudience[];
  audienceKey: string;
  tier: UserTier;
  tasks: InspirationCardTask[];
}

interface MembershipRow {
  role: string;
  accounts: AccountRow | AccountRow[] | null;
}
interface AccountRow {
  id: string; name: string; account_type: string; sub_type: string | null; bio: string | null;
  avatar_url: string | null; cover_url: string | null; address: string | null; opening_hours: unknown;
}

function one<T>(x: T | T[] | null): T | null {
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function logErr(what: string, error: { message: string } | null) {
  if (error) console.error(`[chat/inspiration] ${what}: ${error.message}`);
}

export async function loadMemberships(wallet: string): Promise<{ role: string; account: AccountRow }[]> {
  const res = await db().from("account_owners")
    .select("role, accounts(id, name, account_type, sub_type, bio, avatar_url, cover_url, address, opening_hours)")
    .ilike("wallet_address", wallet).limit(30);
  logErr("account_owners", res.error);
  return ((res.data as MembershipRow[] | null) ?? [])
    .map((r) => ({ role: r.role, account: one(r.accounts) }))
    .filter((x): x is { role: string; account: AccountRow } => Boolean(x.account && x.account.account_type === "organisation"));
}

async function loadUserFacts(wallet: string, ownsOrg: boolean): Promise<UserFacts> {
  const [userRes, threadRes] = await Promise.all([
    db().from("users").select("is_verified_citizen, tier, created_at").ilike("wallet_address", wallet).limit(1).maybeSingle(),
    db().from("chat_threads").select("last_message_at").eq("owner_wallet", wallet).order("last_message_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  logErr("users", userRes.error);
  logErr("chat_threads", threadRes.error);
  const u = userRes.data as { is_verified_citizen: boolean | null; tier: string | null; created_at: string | null } | null;
  return {
    // Column drift: tier='citizen' counts too.
    isCitizen: Boolean(u?.is_verified_citizen) || u?.tier === "citizen",
    createdAt: u?.created_at ?? null,
    ownsOrg,
    lastChatAt: (threadRes.data as { last_message_at: string | null } | null)?.last_message_at ?? null,
  };
}

async function loadWorldFacts(now: Date): Promise<WorldFacts> {
  const today = berlinDate(now);
  const in14 = berlinDate(new Date(now.getTime() + 14 * DAY));
  const [ev, pr] = await Promise.all([
    db().from("events").select("id", { count: "exact", head: true }).eq("status", "approved").gte("date", today).lte("date", in14),
    db().from("proposals").select("id", { count: "exact", head: true }).in("state", [0, 1]),
  ]);
  logErr("events", ev.error);
  logErr("proposals", pr.error);
  return { now, eventsNext14d: ev.count ?? 0, openProposals: pr.count ?? 0 };
}

export async function loadOrgFacts(account: AccountRow, now: Date): Promise<OrgFacts> {
  const today = berlinDate(now);
  const since30 = new Date(now.getTime() - 30 * DAY).toISOString();
  const d = db();

  // businesses have no account_id: match the org's owners' businesses, preferring the same name.
  const owners = await d.from("account_owners").select("wallet_address").eq("account_id", account.id).limit(20);
  logErr("org owners", owners.error);
  const wallets = [...new Set(((owners.data as { wallet_address: string }[] | null) ?? []).flatMap((o) => [o.wallet_address, o.wallet_address.toLowerCase()]))];

  const [restaurant, events, posts, tickets, ratings, businesses] = await Promise.all([
    d.from("restaurants").select("id").eq("account_id", account.id).eq("status", "published").limit(1).maybeSingle(),
    d.from("events").select("id", { count: "exact", head: true }).eq("account_id", account.id).gte("date", today).or("is_cancelled.is.null,is_cancelled.eq.false"),
    d.from("posts").select("id", { count: "exact", head: true }).eq("account_id", account.id).gte("created_at", since30),
    d.from("ticket_types").select("id", { count: "exact", head: true }).eq("account_id", account.id).eq("is_active", true),
    d.from("account_ratings").select("stars").eq("account_id", account.id).limit(500),
    wallets.length
      ? d.from("businesses").select("id, name, category, description").in("owner_wallet_address", wallets).limit(20)
      : Promise.resolve({ data: [] as { id: string; name: string; category: string | null; description: string | null }[], error: null }),
  ]);
  logErr("restaurants", restaurant.error);
  logErr("org events", events.error);
  logErr("org posts", posts.error);
  logErr("ticket_types", tickets.error);
  logErr("account_ratings", ratings.error);
  logErr("businesses", businesses.error);

  let menuItemCount = 0;
  let menuUpdatedAt: string | null = null;
  const restaurantId = (restaurant.data as { id: string } | null)?.id ?? null;
  if (restaurantId) {
    const [count, newest] = await Promise.all([
      d.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("is_available", true),
      d.from("menu_items").select("created_at").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    logErr("menu_items", count.error);
    menuItemCount = count.count ?? 0;
    menuUpdatedAt = (newest.data as { created_at: string } | null)?.created_at ?? null;
  }

  const bizRows = (businesses.data as { id: string; name: string; category: string | null; description: string | null }[] | null) ?? [];
  const sameName = bizRows.filter((b) => b.name.trim().toLowerCase() === account.name.trim().toLowerCase());
  const linked = sameName.length ? sameName : bizRows.length === 1 ? bizRows : [];
  let activeDeals = 0;
  if (linked.length) {
    const deals = await d.from("business_deals").select("id", { count: "exact", head: true })
      .in("business_id", linked.map((b) => b.id)).eq("is_active", true).or(`end_date.is.null,end_date.gte.${today}`);
    logErr("business_deals", deals.error);
    activeDeals = deals.count ?? 0;
  }

  const stars = ((ratings.data as { stars: number }[] | null) ?? []).map((r) => r.stars).filter((s) => typeof s === "number");
  return {
    subType: account.sub_type,
    businessCategory: linked[0]?.category ?? null,
    text: [account.name, account.bio, linked[0]?.description].filter(Boolean).join(" "),
    hasRestaurant: Boolean(restaurantId),
    menuItemCount,
    menuUpdatedAt,
    upcomingEvents: events.count ?? 0,
    postsLast30d: posts.count ?? 0,
    activeDeals,
    hasBusiness: linked.length > 0,
    activeTicketTypes: tickets.count ?? 0,
    ratingCount: stars.length,
    ratingAvg: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : null,
    profileCompleteness: profileCompleteness(account as unknown as Parameters<typeof profileCompleteness>[0]),
  };
}

export async function loadDismissed(wallet: string): Promise<Set<string>> {
  const res = await db().from("chat_inspiration_dismissals").select("task_id").eq("wallet", wallet).limit(500);
  // Missing table (migration not applied yet) must not break the screen.
  logErr("dismissals", res.error);
  return new Set(((res.data as { task_id: string }[] | null) ?? []).map((r) => r.task_id));
}

export async function dismissTask(wallet: string, taskId: string): Promise<void> {
  const res = await db().from("chat_inspiration_dismissals")
    .upsert({ wallet, task_id: taskId }, { onConflict: "wallet,task_id", ignoreDuplicates: true });
  if (res.error) throw new Error(`[chat/inspiration] dismiss: ${res.error.message}`);
}

export function isKnownTaskId(id: unknown): id is string {
  return typeof id === "string" && INSPIRATION_TASKS.some((t) => t.id === id);
}

async function presetBotsBySlug(): Promise<Map<string, InspirationCardTask["bot"]>> {
  const res = await db().from("chat_bots").select("*").eq("is_preset", true);
  logErr("preset bots", res.error);
  const map = new Map<string, InspirationCardTask["bot"]>();
  for (const row of (res.data as BotRow[] | null) ?? []) {
    if (!row.slug) continue;
    const bot = rowToBot(row);
    map.set(row.slug, { id: bot.id, name: bot.name, avatar: bot.avatar });
  }
  return map;
}

/**
 * Builds the whole inspiration response for one viewer. `target` = the chip the app selected;
 * an org the viewer does not belong to silently falls back to "Ich".
 */
export async function buildInspiration(
  wallet: string,
  target: { kind: "me" } | { kind: "org"; orgId: string },
  now: Date = new Date(),
): Promise<InspirationResponse> {
  const memberships = await loadMemberships(wallet);
  const ownsOrg = memberships.some((m) => m.role === "owner" || m.role === "admin");
  const selected = target.kind === "org" ? memberships.find((m) => m.account.id === target.orgId) ?? null : null;

  const [userFacts, world, orgFacts, dismissed, tier, bots] = await Promise.all([
    loadUserFacts(wallet, ownsOrg),
    loadWorldFacts(now),
    selected ? loadOrgFacts(selected.account, now) : Promise.resolve(null),
    loadDismissed(wallet),
    getTier(wallet, now) as Promise<UserTier>,
    presetBotsBySlug(),
  ]);
  const enforcePaywall = await paywallEnforced();

  const audiences: InspirationAudience[] = [
    { key: "me", label: "Ich", audience: "citizen" },
    ...memberships.map((m) => ({
      key: `org:${m.account.id}`,
      label: m.account.name,
      orgId: m.account.id,
      orgName: m.account.name,
      audience: orgAudience({ subType: m.account.sub_type, businessCategory: null, text: `${m.account.name} ${m.account.bio ?? ""}` }),
    })),
  ];

  const audience: Audience = orgFacts ? orgAudience(orgFacts) : "citizen";
  const signals = computeSignals({ user: userFacts, org: orgFacts, world });
  const ranked = rankInspiration(withoutDismissed(INSPIRATION_TASKS, dismissed), signals, audience, INSPIRATION_LIMIT);
  const orgName = selected?.account.name ?? null;
  const mecky = bots.get("mecky") ?? null;

  const tasks: InspirationCardTask[] = ranked.map((task) => ({
    ...task,
    starterPrompt: fillOrgName(task.starterPrompt, orgName),
    pitch: fillOrgName(task.pitch, orgName),
    title: fillOrgName(task.title, orgName),
    locked: enforcePaywall && isTaskLocked(task.tier, tier),
    bot: (task.botSlug ? bots.get(task.botSlug) : null) ?? mecky,
  }));

  return { audiences, audienceKey: selected ? `org:${selected.account.id}` : "me", tier, tasks };
}

/**
 * Tier locks only apply once billing exists (RevenueCat is not integrated yet).
 * Until `app_settings.chat_paywall_enforced` = 'true', every card is usable.
 */
async function paywallEnforced(): Promise<boolean> {
  const res = await db().from("app_settings").select("value").eq("key", "chat_paywall_enforced").maybeSingle();
  return !res.error && String(res.data?.value ?? "").trim().toLowerCase() === "true";
}
