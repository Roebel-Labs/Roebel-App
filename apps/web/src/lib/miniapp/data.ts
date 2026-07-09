// Netizen Mini App data layer — typed helpers over the Supabase admin client
// (service role, bypasses RLS). Server-only. Every API route + the AI-builder
// agent import from here. See spec §5② + §3.5.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { rcrcBalance } from "@/lib/muenzen/gnosis";
import { attoToNumber } from "@/lib/muenzen/constants";
import { validateManifest, DEFAULT_PRIMARY_COLOR } from "./manifest";
import { issueMuenzenOnChain } from "./muenzen";
import {
  MiniAppError,
  type AnalyticsRange,
  type AnalyticsSummary,
  type AppRankings,
  type DeveloperRow,
  type GrantRewardInput,
  type GrantRewardOutcome,
  type ListAppsFilter,
  type MiniAppEventRow,
  type MiniAppRewardRow,
  type MiniAppRow,
  type MiniAppStatus,
  type MiniAppVersionRow,
  type ReviewDecision,
  type SubmitAppInput,
} from "./types";

// ── Config ──────────────────────────────────────────────────────────────────

/** Max reward grants per (app, wallet) inside the sliding window. */
const REWARD_RATE_LIMIT = 10;
const REWARD_RATE_WINDOW_MS = 60 * 60 * 1000; // 1h

/** Max Münzen one app may pay one wallet per rolling day. Requests above the
 * remaining allowance are clamped, a second grant the same day is rejected. */
const REWARD_DAILY_COIN_CAP = 1;
const REWARD_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

const RANGE_MS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "24h": 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
  "90d": 90 * 24 * 3600 * 1000,
};

function db() {
  return createAdminClient();
}

function lower(w: string): string {
  return String(w ?? "").trim().toLowerCase();
}

// ── Developers ──────────────────────────────────────────────────────────────

/** Resolve (or create) a developer row for a connected wallet. Lowercases wallet. */
export async function getOrCreateDeveloper(
  wallet: string,
  extra?: { displayName?: string; email?: string; town?: string },
): Promise<DeveloperRow> {
  const w = lower(wallet);
  if (!/^0x[0-9a-f]{40}$/.test(w)) {
    throw new MiniAppError("invalid_params", "Ungültige Wallet-Adresse.");
  }
  const supabase = db();
  const { data: existing, error: selErr } = await supabase
    .from("developers")
    .select("*")
    .eq("wallet", w)
    .maybeSingle();
  if (selErr) throw new MiniAppError("internal", selErr.message);
  if (existing) return existing as DeveloperRow;

  const { data: created, error: insErr } = await supabase
    .from("developers")
    .insert({
      wallet: w,
      display_name: extra?.displayName ?? null,
      email: extra?.email ?? null,
      town: extra?.town ?? null,
    })
    .select("*")
    .single();
  if (insErr) {
    // Race: another request created it first.
    const { data: retry } = await supabase
      .from("developers")
      .select("*")
      .eq("wallet", w)
      .maybeSingle();
    if (retry) return retry as DeveloperRow;
    throw new MiniAppError("internal", insErr.message);
  }
  return created as DeveloperRow;
}

export async function getDeveloperByWallet(wallet: string): Promise<DeveloperRow | null> {
  const { data } = await db()
    .from("developers")
    .select("*")
    .eq("wallet", lower(wallet))
    .maybeSingle();
  return (data as DeveloperRow) ?? null;
}

// ── Registry (mini_apps) ────────────────────────────────────────────────────

export async function listApps(filter: ListAppsFilter = {}): Promise<MiniAppRow[]> {
  let q = db().from("mini_apps").select("*").order("updated_at", { ascending: false });

  if (filter.status) {
    if (Array.isArray(filter.status)) q = q.in("status", filter.status);
    else q = q.eq("status", filter.status);
  }
  if (filter.developerId) q = q.eq("developer_id", filter.developerId);
  if (filter.category) q = q.eq("category", filter.category);
  if (typeof filter.featured === "boolean") q = q.eq("featured", filter.featured);
  if (filter.search) {
    const s = filter.search.replace(/[%,]/g, " ").trim();
    q = q.or(`name.ilike.%${s}%,slug.ilike.%${s}%,description.ilike.%${s}%`);
  }
  if (filter.limit) q = q.limit(filter.limit);

  const { data, error } = await q;
  if (error) throw new MiniAppError("internal", error.message);
  return (data as MiniAppRow[]) ?? [];
}

/** Fetch one app by uuid or slug. */
export async function getApp(idOrSlug: string): Promise<MiniAppRow | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const { data } = await db()
    .from("mini_apps")
    .select("*")
    .eq(isUuid ? "id" : "slug", idOrSlug)
    .maybeSingle();
  return (data as MiniAppRow) ?? null;
}

/**
 * Submit a new app: validate the manifest, create the mini_apps row (status
 * 'pending', reward_budget 0) and its first reviewable version.
 */
export async function submitApp(input: SubmitAppInput): Promise<MiniAppRow> {
  const manifest = validateManifest(input.manifest);
  const supabase = db();

  // Guard: unique slug (nicer error than the raw 23505).
  const { data: clash } = await supabase
    .from("mini_apps")
    .select("id")
    .eq("slug", manifest.slug)
    .maybeSingle();
  if (clash) {
    throw new MiniAppError("conflict", `Der slug "${manifest.slug}" ist bereits vergeben.`);
  }

  const { data: app, error } = await supabase
    .from("mini_apps")
    .insert({
      developer_id: input.developerId,
      slug: manifest.slug,
      name: manifest.name,
      icon_url: manifest.iconUrl || null,
      home_url: manifest.homeUrl,
      description: manifest.description || null,
      category: manifest.category,
      tags: manifest.tags,
      screenshots: manifest.screenshots,
      permissions: manifest.permissions,
      primary_color: manifest.primaryColor ?? DEFAULT_PRIMARY_COLOR,
      status: "pending",
      source: input.source ?? "external",
      reward_budget: 0,
    })
    .select("*")
    .single();
  if (error) throw new MiniAppError("internal", error.message);

  await createVersion((app as MiniAppRow).id, {
    version: input.version ?? "1.0.0",
    homeUrl: manifest.homeUrl,
    manifest,
  });

  return app as MiniAppRow;
}

/**
 * Update the developer-editable manifest fields of a draft/pending/rejected app
 * (never touches admin fields like reward_budget/featured/status→live). Used by
 * the builder "edit manifest" form. Re-enters review by resetting to 'pending'.
 */
export async function updateAppManifest(
  id: string,
  manifest: unknown,
  opts?: { newVersion?: string },
): Promise<MiniAppRow> {
  const app = await getApp(id);
  if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");
  const m = validateManifest(manifest);
  const supabase = db();

  // Slug can change only if still free.
  if (m.slug !== app.slug) {
    const { data: clash } = await supabase
      .from("mini_apps")
      .select("id")
      .eq("slug", m.slug)
      .maybeSingle();
    if (clash) throw new MiniAppError("conflict", `Der slug "${m.slug}" ist bereits vergeben.`);
  }

  const { data: updated, error } = await supabase
    .from("mini_apps")
    .update({
      slug: m.slug,
      name: m.name,
      icon_url: m.iconUrl || null,
      home_url: m.homeUrl,
      description: m.description || null,
      category: m.category,
      tags: m.tags,
      screenshots: m.screenshots,
      permissions: m.permissions,
      primary_color: m.primaryColor ?? DEFAULT_PRIMARY_COLOR,
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new MiniAppError("internal", error.message);

  await createVersion(id, {
    version: opts?.newVersion ?? (await nextVersionLabel(id)),
    homeUrl: m.homeUrl,
    manifest: m,
  });

  return updated as MiniAppRow;
}

/** `1.0.<n>` where n = existing version count (simple monotonic label). */
async function nextVersionLabel(miniAppId: string): Promise<string> {
  const { count } = await db()
    .from("mini_app_versions")
    .select("id", { count: "exact", head: true })
    .eq("mini_app_id", miniAppId);
  return `1.0.${(count ?? 0) + 1}`;
}

// ── Versions ────────────────────────────────────────────────────────────────

export async function createVersion(
  miniAppId: string,
  input: { version: string; homeUrl: string; manifest: unknown },
): Promise<MiniAppVersionRow> {
  const { data, error } = await db()
    .from("mini_app_versions")
    .insert({
      mini_app_id: miniAppId,
      version: input.version,
      home_url: input.homeUrl,
      manifest: (input.manifest ?? {}) as Record<string, unknown>,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw new MiniAppError("internal", error.message);
  return data as MiniAppVersionRow;
}

export async function listVersions(miniAppId: string): Promise<MiniAppVersionRow[]> {
  const { data, error } = await db()
    .from("mini_app_versions")
    .select("*")
    .eq("mini_app_id", miniAppId)
    .order("created_at", { ascending: false });
  if (error) throw new MiniAppError("internal", error.message);
  return (data as MiniAppVersionRow[]) ?? [];
}

// ── Admin actions ───────────────────────────────────────────────────────────

/**
 * Approve or reject an app (and its latest pending version). Approve →
 * status 'live' (visible in the store); reject → 'rejected'.
 */
export async function reviewApp(
  id: string,
  decision: ReviewDecision,
  notes: string | null,
  reviewerId: string,
): Promise<MiniAppRow> {
  const app = await getApp(id);
  if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");
  const supabase = db();
  const nextStatus: MiniAppStatus = decision === "approve" ? "live" : "rejected";

  const { data: updated, error } = await supabase
    .from("mini_apps")
    .update({
      status: nextStatus,
      review_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new MiniAppError("internal", error.message);

  // Settle the latest pending version too.
  const { data: pending } = await supabase
    .from("mini_app_versions")
    .select("id")
    .eq("mini_app_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending) {
    await supabase
      .from("mini_app_versions")
      .update({
        status: decision === "approve" ? "approved" : "rejected",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", (pending as { id: string }).id);
  }

  return updated as MiniAppRow;
}

export async function setRewardBudget(id: string, budget: number): Promise<MiniAppRow> {
  if (!Number.isFinite(budget) || budget < 0) {
    throw new MiniAppError("invalid_params", "Budget muss ≥ 0 sein.");
  }
  const { data, error } = await db()
    .from("mini_apps")
    .update({ reward_budget: budget, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new MiniAppError("internal", error.message);
  return data as MiniAppRow;
}

export async function toggleFeatured(id: string, featured: boolean): Promise<MiniAppRow> {
  const { data, error } = await db()
    .from("mini_apps")
    .update({ featured, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new MiniAppError("internal", error.message);
  return data as MiniAppRow;
}

/** Kill-switch / status setter (e.g. suspend a live app). */
export async function setStatus(id: string, status: MiniAppStatus): Promise<MiniAppRow> {
  const { data, error } = await db()
    .from("mini_apps")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new MiniAppError("internal", error.message);
  return data as MiniAppRow;
}

// ── Events (telemetry) ──────────────────────────────────────────────────────

/**
 * Ingest one analytics event. Anon-safe: resolves the app by id OR slug and
 * denormalizes the slug for convenience. Never throws for a missing app —
 * telemetry must not break the mini app. Returns whether the row was written.
 */
export async function ingestEvent(input: {
  miniAppId?: string | null;
  slug?: string | null;
  sessionId: string;
  wallet?: string | null;
  event: string;
  ref?: string | null;
  props?: Record<string, unknown>;
}): Promise<{ ok: boolean }> {
  const supabase = db();
  let miniAppId = input.miniAppId ?? null;
  let slug = input.slug ?? null;

  if (!miniAppId && slug) {
    const { data } = await supabase.from("mini_apps").select("id").eq("slug", slug).maybeSingle();
    miniAppId = (data as { id: string } | null)?.id ?? null;
  } else if (miniAppId && !slug) {
    const { data } = await supabase.from("mini_apps").select("slug").eq("id", miniAppId).maybeSingle();
    slug = (data as { slug: string } | null)?.slug ?? null;
  }

  const event = String(input.event ?? "").slice(0, 64);
  if (!event || !input.sessionId) return { ok: false };

  const { error } = await supabase.from("mini_app_events").insert({
    mini_app_id: miniAppId,
    slug,
    session_id: String(input.sessionId).slice(0, 128),
    wallet: input.wallet ? lower(input.wallet) : null,
    event,
    ref: input.ref ?? null,
    props: input.props ?? {},
  });
  if (error) {
    console.error("[miniapp] ingestEvent failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

// ── Rewards (server-authorized grant) ───────────────────────────────────────

/**
 * The server-authorized reward grant. Enforces (spec §4.3):
 *  - app.status === 'live'
 *  - reward_spent + amount ≤ reward_budget  (else `budget_exceeded`)
 *  - per-(app, wallet) rate-limit             (else `rate_limited`)
 *  - max 1 Münze per (app, wallet) per rolling day — requests are clamped to
 *    the remaining allowance, a fully spent allowance → `rate_limited`
 *  - unique(mini_app_id, idempotency_key)     (idempotent replay)
 * then records `mini_app_rewards`, increments `reward_spent`, and attempts the
 * on-chain issuance via the isolated rail.
 */
export async function grantReward(
  appId: string,
  input: GrantRewardInput,
): Promise<GrantRewardOutcome> {
  const supabase = db();
  const wallet = lower(input.wallet);
  const amount = Number(input.amount);
  const key = String(input.idempotencyKey ?? "").trim();

  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    throw new MiniAppError("invalid_params", "Ungültige Empfänger-Wallet.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MiniAppError("invalid_params", "amount muss > 0 sein.");
  }
  if (!key) throw new MiniAppError("invalid_params", "idempotencyKey ist erforderlich.");

  const app = await getApp(appId);
  if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");

  // Idempotency: a prior grant with this key wins (no double-spend on replay).
  const { data: prior } = await supabase
    .from("mini_app_rewards")
    .select("*")
    .eq("mini_app_id", app.id)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (prior) {
    const p = prior as MiniAppRewardRow;
    return {
      granted: p.status === "granted",
      txRef: p.tx_ref ?? undefined,
      remainingBudget: Math.max(0, app.reward_budget - app.reward_spent),
    };
  }

  // Unreviewed/unapproved apps → budget 0 → this trips.
  if (app.status !== "live") {
    throw new MiniAppError(
      "budget_exceeded",
      "App ist nicht freigegeben — Belohnungen sind deaktiviert.",
    );
  }

  // Rate-limit per (app, wallet).
  const since = new Date(Date.now() - REWARD_RATE_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("mini_app_rewards")
    .select("id", { count: "exact", head: true })
    .eq("mini_app_id", app.id)
    .eq("wallet", wallet)
    .neq("status", "rejected")
    .gte("created_at", since);
  if ((count ?? 0) >= REWARD_RATE_LIMIT) {
    throw new MiniAppError("rate_limited", "Zu viele Belohnungen — bitte später erneut.");
  }

  // Daily coin cap per (app, wallet): sum what this app already paid (or has
  // pending toward) this wallet in the last 24h. Failed/rejected rows don't
  // burn the allowance. Requests above the remainder are CLAMPED, not refused,
  // so an app asking for 5 still delivers the 1 the user is owed.
  const daySince = new Date(Date.now() - REWARD_DAILY_WINDOW_MS).toISOString();
  const { data: dayRows } = await supabase
    .from("mini_app_rewards")
    .select("amount")
    .eq("mini_app_id", app.id)
    .eq("wallet", wallet)
    .in("status", ["pending", "granted"])
    .gte("created_at", daySince);
  const paidToday = (dayRows ?? []).reduce(
    (sum, r) => sum + Number((r as { amount: number | string }).amount || 0),
    0,
  );
  const allowance = REWARD_DAILY_COIN_CAP - paidToday;
  if (allowance <= 0) {
    throw new MiniAppError(
      "rate_limited",
      "Tageslimit erreicht — diese App kann dir höchstens 1 Röbel-Münze pro Tag geben. Versuch es morgen wieder.",
    );
  }
  const grantAmount = Math.min(amount, allowance);

  // Budget check (on the clamped amount).
  if (app.reward_spent + grantAmount > app.reward_budget) {
    throw new MiniAppError(
      "budget_exceeded",
      "Belohnungs-Budget dieser App ist erschöpft.",
    );
  }

  // Reserve the ledger row (the unique index is the lock).
  const { data: row, error: insErr } = await supabase
    .from("mini_app_rewards")
    .insert({
      mini_app_id: app.id,
      wallet,
      amount: grantAmount,
      reason: input.reason ?? null,
      idempotency_key: key,
      status: "pending",
    })
    .select("*")
    .single();
  if (insErr) {
    // Concurrent duplicate on the unique index.
    if ((insErr as { code?: string }).code === "23505") {
      return {
        granted: false,
        remainingBudget: Math.max(0, app.reward_budget - app.reward_spent),
      };
    }
    throw new MiniAppError("internal", insErr.message);
  }
  const rowId = (row as MiniAppRewardRow).id;

  // Increment reward_spent (reserve budget) BEFORE the chain call so concurrent
  // grants see the higher spent value.
  const { error: budErr } = await supabase
    .from("mini_apps")
    .update({ reward_spent: app.reward_spent + grantAmount })
    .eq("id", app.id);
  if (budErr) {
    await supabase
      .from("mini_app_rewards")
      .update({ status: "failed" })
      .eq("id", rowId);
    throw new MiniAppError("internal", budErr.message);
  }

  // Attempt on-chain issuance (isolated). Ledger stays 'pending' when the rail
  // isn't wired yet so an operator can settle later; budget stays reserved.
  const issue = await issueMuenzenOnChain({
    wallet,
    amount: grantAmount,
    reason: input.reason,
    ref: rowId,
  });
  if (issue.onChain) {
    await supabase
      .from("mini_app_rewards")
      .update({ status: "granted", tx_ref: issue.txRef ?? null })
      .eq("id", rowId);
    return {
      granted: true,
      amount: grantAmount,
      txRef: issue.txRef,
      remainingBudget: Math.max(0, app.reward_budget - (app.reward_spent + grantAmount)),
    };
  }

  // On-chain rail unavailable: keep the pending ledger row (budget reserved),
  // annotate the note for the operator. Report success=false to the client.
  if (issue.note) {
    // Only annotate rows the edge fn hasn't settled itself in the meantime.
    await supabase
      .from("mini_app_rewards")
      .update({ tx_ref: issue.note.slice(0, 500) })
      .eq("id", rowId)
      .eq("status", "pending");
    console.warn("[miniapp] grantReward on-chain deferred:", issue.note);
  }
  return {
    granted: false,
    amount: grantAmount,
    remainingBudget: Math.max(0, app.reward_budget - (app.reward_spent + grantAmount)),
  };
}

// ── Muenzen balance (read) ──────────────────────────────────────────────────

/** Live Röbel-Münzen balance for a wallet (whole units + atto decimals). */
export async function getMuenzenBalance(
  wallet: string,
): Promise<{ balance: string; decimals: number; symbol: "RÖ" }> {
  const atto = await rcrcBalance(wallet).catch(() => 0n);
  return { balance: attoToNumber(atto).toString(), decimals: 18, symbol: "RÖ" };
}

// ── Analytics ───────────────────────────────────────────────────────────────

/**
 * Aggregate analytics for one app (`appId`) or the whole platform (`'all'`).
 * Opens, unique wallets, retention (returning-wallet rate across the range
 * midpoint), rewards, a daily series and the top events.
 */
export async function queryAnalytics(
  appId: string | "all",
  range: AnalyticsRange = "30d",
): Promise<AnalyticsSummary> {
  const supabase = db();
  const now = Date.now();
  const windowMs = range === "all" ? null : RANGE_MS[range];
  const sinceIso = windowMs ? new Date(now - windowMs).toISOString() : null;

  let evQ = supabase
    .from("mini_app_events")
    .select("mini_app_id, session_id, wallet, event, created_at")
    .order("created_at", { ascending: true })
    .limit(50000);
  if (appId !== "all") evQ = evQ.eq("mini_app_id", appId);
  if (sinceIso) evQ = evQ.gte("created_at", sinceIso);

  let rwQ = supabase
    .from("mini_app_rewards")
    .select("amount, status, created_at")
    .limit(50000);
  if (appId !== "all") rwQ = rwQ.eq("mini_app_id", appId);
  if (sinceIso) rwQ = rwQ.gte("created_at", sinceIso);

  const [{ data: events, error: evErr }, { data: rewards }] = await Promise.all([evQ, rwQ]);
  if (evErr) throw new MiniAppError("internal", evErr.message);

  const evs =
    (events as Pick<
      MiniAppEventRow,
      "wallet" | "event" | "created_at" | "session_id"
    >[]) ?? [];
  const rws =
    (rewards as Pick<MiniAppRewardRow, "amount" | "status" | "created_at">[]) ?? [];

  // Opens = app_open events; unique wallets + unique sessions across all events.
  const wallets = new Set<string>();
  const sessionIds = new Set<string>();
  let opens = 0;
  const eventCounts = new Map<string, number>();
  const dailyOpens = new Map<string, number>();
  const dailyWallets = new Map<string, Set<string>>();

  for (const e of evs) {
    if (e.wallet) wallets.add(e.wallet);
    if (e.session_id) sessionIds.add(e.session_id);
    eventCounts.set(e.event, (eventCounts.get(e.event) ?? 0) + 1);
    const day = e.created_at.slice(0, 10);
    if (e.event === "app_open") {
      opens += 1;
      dailyOpens.set(day, (dailyOpens.get(day) ?? 0) + 1);
    }
    if (e.wallet) {
      const set = dailyWallets.get(day) ?? new Set<string>();
      set.add(e.wallet);
      dailyWallets.set(day, set);
    }
  }

  // Retention: wallets active in the second half who were also in the first half.
  const anchor = windowMs ? now - windowMs : evs.length ? Date.parse(evs[0].created_at) : now;
  const mid = anchor + (now - anchor) / 2;
  const firstHalf = new Set<string>();
  const secondHalf = new Set<string>();
  for (const e of evs) {
    if (!e.wallet) continue;
    if (Date.parse(e.created_at) < mid) firstHalf.add(e.wallet);
    else secondHalf.add(e.wallet);
  }
  let returning = 0;
  for (const w of secondHalf) if (firstHalf.has(w)) returning += 1;
  const retentionRate = firstHalf.size ? returning / firstHalf.size : 0;

  // Rewards.
  const granted = rws.filter((r) => r.status === "granted");
  const rewardsAmount = granted.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const dailyRewards = new Map<string, number>();
  for (const r of granted) {
    const day = r.created_at.slice(0, 10);
    dailyRewards.set(day, (dailyRewards.get(day) ?? 0) + Number(r.amount ?? 0));
  }

  // Build the daily series across the union of day keys.
  const days = new Set<string>([
    ...dailyOpens.keys(),
    ...dailyWallets.keys(),
    ...dailyRewards.keys(),
  ]);
  const series = [...days]
    .sort()
    .map((date) => ({
      date,
      opens: dailyOpens.get(date) ?? 0,
      uniqueWallets: dailyWallets.get(date)?.size ?? 0,
      rewards: dailyRewards.get(date) ?? 0,
    }));

  const topEvents = [...eventCounts.entries()]
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Budget/spent (only meaningful for a single app).
  let budget: number | null = null;
  let spent: number | null = null;
  if (appId !== "all") {
    const app = await getApp(appId);
    budget = app?.reward_budget ?? null;
    spent = app?.reward_spent ?? null;
  }

  return {
    appId,
    range,
    opens,
    uniqueWallets: wallets.size,
    events: evs.length,
    sessions: sessionIds.size,
    returningWallets: returning,
    retentionRate,
    rewardsGranted: granted.length,
    rewardsAmount,
    budget,
    spent,
    series,
    topEvents,
    generatedAt: now,
  };
}

// ── Rankings ────────────────────────────────────────────────────────────────

/**
 * Public "Beliebte Apps" ranking: every published app ranked by unique active
 * wallets (fallback: opens) over the trailing window. Powers
 * /dashboard/mini-apps/rankings — no auth, no wallets exposed.
 */
export async function queryAppRankings(windowDays = 7): Promise<AppRankings> {
  const supabase = db();
  const now = Date.now();
  const sinceIso = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: apps, error: appErr }, { data: events, error: evErr }] =
    await Promise.all([
      supabase
        .from("mini_apps")
        .select("id, name, slug, icon_url, primary_color, status")
        .eq("status", "published"),
      supabase
        .from("mini_app_events")
        .select("mini_app_id, wallet, session_id, event, created_at")
        .gte("created_at", sinceIso)
        .limit(50000),
    ]);
  if (appErr) throw new MiniAppError("internal", appErr.message);
  if (evErr) throw new MiniAppError("internal", evErr.message);

  const byApp = new Map<string, { wallets: Set<string>; sessions: Set<string>; opens: number }>();
  for (const e of (events ?? []) as Pick<
    MiniAppEventRow,
    "mini_app_id" | "wallet" | "session_id" | "event"
  >[]) {
    if (!e.mini_app_id) continue;
    const agg =
      byApp.get(e.mini_app_id) ??
      { wallets: new Set<string>(), sessions: new Set<string>(), opens: 0 };
    if (e.wallet) agg.wallets.add(e.wallet);
    if (e.session_id) agg.sessions.add(e.session_id);
    if (e.event === "app_open") agg.opens += 1;
    byApp.set(e.mini_app_id, agg);
  }

  const rows = ((apps ?? []) as Pick<
    MiniAppRow,
    "id" | "name" | "slug" | "icon_url" | "primary_color"
  >[])
    .map((a) => {
      const agg = byApp.get(a.id);
      // Anonymous sessions still count as usage when no wallet was connected.
      const users = agg ? Math.max(agg.wallets.size, Math.min(agg.sessions.size, 999999)) : 0;
      return {
        id: a.id,
        name: a.name,
        slug: a.slug,
        icon_url: a.icon_url,
        primary_color: a.primary_color,
        users,
        opens: agg?.opens ?? 0,
      };
    })
    .sort((x, y) => y.users - x.users || y.opens - x.opens || x.name.localeCompare(y.name));

  return { apps: rows, windowDays, generatedAt: now };
}
