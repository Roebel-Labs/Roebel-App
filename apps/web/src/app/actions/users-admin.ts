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

export interface UsersAdminMetrics {
  totalUsers: number
  verifiedCitizens: number
  pendingVerifications: number
  newLast30Days: number
  activeLast30Days: number
  totalPointsInCirculation: number
  tierDistribution: { tier: string; label: string; count: number }[]
  verificationFunnel: { status: string; label: string; count: number }[]
  signups: { weekLabel: string; cumulative: number; new: number }[]
  topByPoints: { label: string; fullAddress: string; value: number }[]
  topByVotes: { label: string; fullAddress: string; value: number }[]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const TIER_LABELS: Record<string, string> = {
  citizen: "Bürger",
  tourist: "Gast",
  guest: "Gast",
}

const VERIFICATION_LABELS: Record<string, string> = {
  pending: "Ausstehend",
  approved: "Verifiziert",
  rejected: "Abgelehnt",
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

export async function getUsersAdminData(): Promise<{
  success: boolean
  rows?: AdminUserRow[]
  metrics?: UsersAdminMetrics
  error?: string
}> {
  try {
    const supabase = createAdminClient()

    const [usersResult, cardsResult] = await Promise.all([
      supabase.from("users").select("*").order("created_at", { ascending: false }),
      supabase.from("roebel_points_card").select("*"),
    ])

    if (usersResult.error) {
      return { success: false, error: usersResult.error.message }
    }

    const cardsByWallet = new Map<string, Record<string, unknown>>()
    for (const card of cardsResult.data ?? []) {
      const wallet = String((card as Record<string, unknown>).wallet_address ?? "").toLowerCase()
      if (wallet) cardsByWallet.set(wallet, card as Record<string, unknown>)
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

    const metrics = buildMetrics(rows)

    return { success: true, rows, metrics }
  } catch (error) {
    console.error("[users-admin] Failed to load user data:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

function buildMetrics(rows: AdminUserRow[]): UsersAdminMetrics {
  const now = Date.now()
  const cutoff30 = now - 30 * DAY_MS

  const totalUsers = rows.length
  const verifiedCitizens = rows.filter((r) => r.is_verified_citizen).length
  const pendingVerifications = rows.filter(
    (r) => r.verification_status === "pending"
  ).length
  const newLast30Days = rows.filter(
    (r) => new Date(r.created_at).getTime() >= cutoff30
  ).length
  const activeLast30Days = rows.filter(
    (r) => r.last_login_at && new Date(r.last_login_at).getTime() >= cutoff30
  ).length
  const totalPointsInCirculation = rows.reduce(
    (sum, r) => sum + (r.points_balance ?? 0),
    0
  )

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

  // Verification funnel
  const statusOrder = ["pending", "approved", "rejected"]
  const statusCounts = new Map<string, number>()
  for (const r of rows) {
    const s = statusOrder.includes(r.verification_status)
      ? r.verification_status
      : "pending"
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1)
  }
  const verificationFunnel = statusOrder.map((status) => ({
    status,
    label: VERIFICATION_LABELS[status] ?? status,
    count: statusCounts.get(status) ?? 0,
  }))

  // Signups over time — weekly buckets, cumulative
  const buckets = new Map<number, number>()
  for (const r of rows) {
    const ms = new Date(r.created_at).getTime()
    if (!Number.isFinite(ms)) continue
    const bucket = Math.floor(ms / WEEK_MS) * WEEK_MS
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
  }
  const orderedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])
  let cumulative = 0
  const signups = orderedBuckets.map(([bucket, count]) => {
    cumulative += count
    return {
      weekLabel: new Date(bucket).toLocaleDateString("de-DE", {
        month: "short",
        day: "2-digit",
      }),
      cumulative,
      new: count,
    }
  })

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
    pendingVerifications,
    newLast30Days,
    activeLast30Days,
    totalPointsInCirculation,
    tierDistribution,
    verificationFunnel,
    signups,
    topByPoints,
    topByVotes,
  }
}
