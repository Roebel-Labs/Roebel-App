"use server"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * A single user row for the admin dashboard — the `users` table merged with
 * its `roebel_points_card` (joined by wallet_address). Fully serializable
 * (no bigint) so it can be passed from the server component into client
 * components.
 */
export interface AdminUserRow {
  // Identity
  wallet_address: string
  username: string | null
  display_name: string | null
  profile_picture_url: string | null
  /** Masked for privacy (e.g. "ma•••••n@gmail.com") — raw value never leaves the server. */
  email: string | null
  email_verified: boolean
  /** Masked for privacy (e.g. "+49•••••78") — raw value never leaves the server. */
  phone_number: string | null
  phone_verified: boolean
  auth_provider: string | null

  // Classification
  tier: string // guest | tourist | citizen
  is_verified_citizen: boolean
  verification_status: string // pending | approved | rejected
  verification_notes: string | null
  is_extern: boolean
  neighborhood: string | null
  interests: string[]
  vereine: string[]
  bio: string | null

  // Device platform — derived from app_activity (latest) ∪ push_tokens (latest
  // active). Null when the user has no device record yet.
  platform: "ios" | "android" | "web" | null

  // On-chain / governance
  nft_balance: number
  has_delegated: boolean
  total_votes_cast: number
  voting_streak: number
  last_vote_date: string | null
  gamification_points: number
  achievements: unknown[]

  // Points card (may be absent → nulls)
  points_balance: number | null
  points_total_earned: number | null
  points_total_spent: number | null
  points_tier: string | null // besucher | burger | supporter
  taler_balance: number | null
  points_streak_days: number | null
  points_last_activity_at: string | null

  // Timestamps
  created_at: string
  last_login_at: string | null
}

export interface DailyPoint {
  date: string // YYYY-MM-DD
  count: number
}

export interface UsersAdminMetrics {
  totalUsers: number
  verifiedCitizens: number
  newLast7Days: number
  newLast30Days: number
  activeLast30Days: number
  tierDistribution: { tier: string; label: string; count: number }[]
  topByPoints: { label: string; fullAddress: string; value: number }[]
  topByVotes: { label: string; fullAddress: string; value: number }[]
  // Daily series over the last 60 days
  dailyRegistrations: DailyPoint[]
  dailyActiveProxy: DailyPoint[] // distinct wallets/day from points ledger (proxy)
  dailyActiveReal: DailyPoint[] // distinct wallets/day from app_activity (real DAU)
}

/** Per-user signup row used by the signups chart (with platform filter). */
export interface SignupRow {
  created_at: string
  platform: "ios" | "android" | "web" | null
}

const DAY_MS = 24 * 60 * 60 * 1000

const TIER_LABELS: Record<string, string> = {
  citizen: "Bürger",
  tourist: "Gast",
  guest: "Gast",
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === "bigint" ? Number(value) : Number(value)
  return Number.isFinite(n) ? n : 0
}

function shortAddress(address: string): string {
  if (!address || address.length < 11) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * Mask an email so it is recognizable but not fully exposed.
 * e.g. "maximilian@gmail.com" -> "ma•••••••n@gmail.com"
 * The raw value is never sent to the client.
 */
function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf("@")
  if (at <= 0) return "•••"
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)

  let maskedLocal: string
  if (local.length <= 2) {
    maskedLocal = `${local[0] ?? "•"}•`
  } else {
    const dots = "•".repeat(Math.max(3, local.length - 2))
    maskedLocal = `${local[0]}${dots}${local[local.length - 1]}`
  }

  return `${maskedLocal}@${domain}`
}

/**
 * Mask a phone number, keeping the country/area prefix and the last 2 digits.
 * e.g. "+4915112345678" -> "+49•••••••78"
 */
function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const trimmed = phone.trim()
  if (trimmed.length <= 5) return "•••"
  const prefix = trimmed.startsWith("+") ? trimmed.slice(0, 3) : trimmed.slice(0, 2)
  const suffix = trimmed.slice(-2)
  return `${prefix}${"•".repeat(Math.max(3, trimmed.length - prefix.length - 2))}${suffix}`
}

function displayLabel(row: AdminUserRow): string {
  return row.username || row.display_name || shortAddress(row.wallet_address)
}

const PLATFORM_VALUES = ["ios", "android", "web"] as const
type Platform = (typeof PLATFORM_VALUES)[number]

function asPlatform(value: unknown): Platform | null {
  return PLATFORM_VALUES.includes(value as Platform) ? (value as Platform) : null
}

export async function getUsersAdminData(): Promise<{
  success: boolean
  rows?: AdminUserRow[]
  signupRows?: SignupRow[]
  metrics?: UsersAdminMetrics
  error?: string
}> {
  try {
    const supabase = createAdminClient()
    const since60 = new Date(Date.now() - 60 * DAY_MS).toISOString()

    const [usersResult, cardsResult, pushResult, activityResult, ledgerResult] =
      await Promise.all([
        supabase.from("users").select("*").order("created_at", { ascending: false }),
        supabase.from("roebel_points_card").select("*"),
        supabase
          .from("push_tokens")
          .select("wallet_address, platform, last_used_at")
          .eq("is_active", true),
        supabase
          .from("app_activity")
          .select("wallet_address, platform, activity_date, last_seen_at"),
        supabase
          .from("roebel_points_ledger")
          .select("wallet_address, created_at")
          .gte("created_at", since60),
      ])

    if (usersResult.error) {
      return { success: false, error: usersResult.error.message }
    }

    const cardsByWallet = new Map<string, Record<string, unknown>>()
    for (const card of cardsResult.data ?? []) {
      const wallet = String((card as Record<string, unknown>).wallet_address ?? "").toLowerCase()
      if (wallet) cardsByWallet.set(wallet, card as Record<string, unknown>)
    }

    // Per-wallet platform: prefer app_activity (most recent), fall back to
    // push_tokens (most recent active). Covers all logging-in users going
    // forward; push-only for legacy users.
    const platformByWallet = new Map<string, Platform>()
    const platformSeenAt = new Map<string, number>()
    const considerPlatform = (
      walletRaw: unknown,
      platformRaw: unknown,
      tsRaw: unknown
    ) => {
      const wallet = String(walletRaw ?? "").toLowerCase()
      const platform = asPlatform(platformRaw)
      if (!wallet || !platform) return
      const ts = tsRaw ? new Date(tsRaw as string).getTime() : 0
      const prev = platformSeenAt.get(wallet) ?? -1
      if (ts >= prev) {
        platformSeenAt.set(wallet, ts)
        platformByWallet.set(wallet, platform)
      }
    }
    // push_tokens first (lower priority), then app_activity overwrites when newer
    for (const t of pushResult.data ?? []) {
      const r = t as Record<string, unknown>
      considerPlatform(r.wallet_address, r.platform, r.last_used_at)
    }
    for (const a of activityResult.data ?? []) {
      const r = a as Record<string, unknown>
      considerPlatform(r.wallet_address, r.platform, r.last_seen_at)
    }

    const rows: AdminUserRow[] = (usersResult.data ?? []).map((raw) => {
      const u = raw as Record<string, unknown>
      const wallet = String(u.wallet_address ?? "")
      const card = cardsByWallet.get(wallet.toLowerCase())

      return {
        wallet_address: wallet,
        username: (u.username as string) ?? null,
        display_name: (u.display_name as string) ?? null,
        profile_picture_url: (u.profile_picture_url as string) ?? null,
        email: maskEmail(u.email as string | null),
        email_verified: !!u.email_verified,
        phone_number: maskPhone(u.phone_number as string | null),
        phone_verified: !!u.phone_verified,
        auth_provider: (u.auth_provider as string) ?? null,

        platform: platformByWallet.get(wallet.toLowerCase()) ?? null,

        tier: (u.tier as string) || "guest",
        is_verified_citizen: !!u.is_verified_citizen,
        verification_status: (u.verification_status as string) || "pending",
        verification_notes: (u.verification_notes as string) ?? null,
        is_extern: !!u.is_extern,
        neighborhood: (u.neighborhood as string) ?? null,
        interests: Array.isArray(u.interests) ? (u.interests as string[]) : [],
        vereine: Array.isArray(u.vereine) ? (u.vereine as string[]) : [],
        bio: (u.bio as string) ?? null,

        nft_balance: toNumber(u.nft_balance),
        has_delegated: !!u.has_delegated,
        total_votes_cast: toNumber(u.total_votes_cast),
        voting_streak: toNumber(u.voting_streak),
        last_vote_date: (u.last_vote_date as string) ?? null,
        gamification_points: toNumber(u.gamification_points),
        achievements: Array.isArray(u.achievements) ? (u.achievements as unknown[]) : [],

        points_balance: card ? toNumber(card.points_balance) : null,
        points_total_earned: card ? toNumber(card.total_earned) : null,
        points_total_spent: card ? toNumber(card.total_spent) : null,
        points_tier: card ? ((card.tier as string) ?? null) : null,
        taler_balance: card ? toNumber(card.taler_balance) : null,
        points_streak_days: card ? toNumber(card.streak_days) : null,
        points_last_activity_at: card ? ((card.last_activity_at as string) ?? null) : null,

        created_at: (u.created_at as string) ?? new Date(0).toISOString(),
        last_login_at: (u.last_login_at as string) ?? null,
      }
    })

    const signupRows: SignupRow[] = rows.map((r) => ({
      created_at: r.created_at,
      platform: r.platform,
    }))

    const ledgerRows = (ledgerResult.data ?? []).map((l) => {
      const r = l as Record<string, unknown>
      return {
        wallet: String(r.wallet_address ?? "").toLowerCase(),
        created_at: r.created_at as string,
      }
    })
    const activityRows = (activityResult.data ?? []).map((a) => {
      const r = a as Record<string, unknown>
      return {
        wallet: String(r.wallet_address ?? "").toLowerCase(),
        date: r.activity_date as string,
      }
    })

    const metrics = buildMetrics(rows, ledgerRows, activityRows)

    return { success: true, rows, signupRows, metrics }
  } catch (error) {
    console.error("[users-admin] Failed to load user data:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/** Distinct-wallets-per-day series over the last `days` days (zero-filled). */
function dailyDistinctSeries(
  entries: { wallet: string; day: string }[],
  days: number
): DailyPoint[] {
  const byDay = new Map<string, Set<string>>()
  for (const e of entries) {
    if (!e.day) continue
    const set = byDay.get(e.day) ?? new Set<string>()
    if (e.wallet) set.add(e.wallet)
    byDay.set(e.day, set)
  }
  return lastNDays(days).map((date) => ({
    date,
    count: byDay.get(date)?.size ?? 0,
  }))
}

/** Returns the last `days` calendar dates (UTC) as YYYY-MM-DD, oldest first. */
function lastNDays(days: number): string[] {
  const out: string[] = []
  const today = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(today - i * DAY_MS).toISOString().slice(0, 10))
  }
  return out
}

function buildMetrics(
  rows: AdminUserRow[],
  ledgerRows: { wallet: string; created_at: string }[],
  activityRows: { wallet: string; date: string }[]
): UsersAdminMetrics {
  const now = Date.now()
  const cutoff7 = now - 7 * DAY_MS
  const cutoff30 = now - 30 * DAY_MS

  const totalUsers = rows.length
  const verifiedCitizens = rows.filter((r) => r.is_verified_citizen).length
  const newLast7Days = rows.filter(
    (r) => new Date(r.created_at).getTime() >= cutoff7
  ).length
  const newLast30Days = rows.filter(
    (r) => new Date(r.created_at).getTime() >= cutoff30
  ).length
  const activeLast30Days = rows.filter(
    (r) => r.last_login_at && new Date(r.last_login_at).getTime() >= cutoff30
  ).length

  // Tier distribution
  const tierOrder = ["citizen", "tourist", "guest"]
  const tierCounts = new Map<string, number>()
  for (const r of rows) {
    const t = tierOrder.includes(r.tier) ? r.tier : "guest"
    tierCounts.set(t, (tierCounts.get(t) ?? 0) + 1)
  }
  const tierDistribution = tierOrder
    .map((tier) => ({
      tier,
      label: TIER_LABELS[tier] ?? tier,
      count: tierCounts.get(tier) ?? 0,
    }))
    .filter((d) => d.count > 0)

  // Daily registrations (new users/day) over last 60 days
  const regByDay = new Map<string, number>()
  for (const r of rows) {
    const ms = new Date(r.created_at).getTime()
    if (!Number.isFinite(ms)) continue
    const day = new Date(ms).toISOString().slice(0, 10)
    regByDay.set(day, (regByDay.get(day) ?? 0) + 1)
  }
  const dailyRegistrations: DailyPoint[] = lastNDays(60).map((date) => ({
    date,
    count: regByDay.get(date) ?? 0,
  }))

  // Daily active — proxy (points ledger) and real (app_activity)
  const dailyActiveProxy = dailyDistinctSeries(
    ledgerRows.map((l) => ({
      wallet: l.wallet,
      day: new Date(l.created_at).toISOString().slice(0, 10),
    })),
    60
  )
  const dailyActiveReal = dailyDistinctSeries(
    activityRows.map((a) => ({ wallet: a.wallet, day: a.date })),
    60
  )

  // Top users by points / votes
  const topByPoints = [...rows]
    .filter((r) => (r.points_balance ?? 0) > 0)
    .sort((a, b) => (b.points_balance ?? 0) - (a.points_balance ?? 0))
    .slice(0, 8)
    .map((r) => ({
      label: displayLabel(r),
      fullAddress: r.wallet_address,
      value: r.points_balance ?? 0,
    }))

  const topByVotes = [...rows]
    .filter((r) => r.total_votes_cast > 0)
    .sort((a, b) => b.total_votes_cast - a.total_votes_cast)
    .slice(0, 8)
    .map((r) => ({
      label: displayLabel(r),
      fullAddress: r.wallet_address,
      value: r.total_votes_cast,
    }))

  return {
    totalUsers,
    verifiedCitizens,
    newLast7Days,
    newLast30Days,
    activeLast30Days,
    tierDistribution,
    topByPoints,
    topByVotes,
    dailyRegistrations,
    dailyActiveProxy,
    dailyActiveReal,
  }
}
