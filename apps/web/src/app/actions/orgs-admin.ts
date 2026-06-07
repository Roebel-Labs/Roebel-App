"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import type { ExternStatus, OrgRole, OrgSubType } from "@/types/account"

/** A single member of an org account (wallet + role), resolved to a name in the page via the directory. */
export interface AdminOrgMember {
  wallet_address: string // lowercase
  role: OrgRole
  joined_at: string | null
}

/** An organisation account with its members, for the admin overview. */
export interface AdminOrgRow {
  id: string
  name: string
  slug: string | null
  sub_type: OrgSubType | null
  avatar_url: string | null
  is_verified: boolean
  is_extern: boolean
  extern_status: ExternStatus | null
  created_at: string
  members: AdminOrgMember[]
}

/** owner → admin → member ordering for member lists. */
const ROLE_ORDER: Record<OrgRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
}

function asRole(value: unknown): OrgRole {
  return value === "owner" || value === "admin" || value === "member"
    ? value
    : "member"
}

/**
 * Fetch all organisation accounts together with their members.
 *
 * Two flat service-role queries (accounts + account_owners) grouped in memory —
 * no N+1, no PostgREST embedding. Empty-member orgs are kept so admins can see
 * orgs that nobody has joined yet.
 */
export async function getOrgAccountsAdminData(): Promise<{
  success: boolean
  orgs?: AdminOrgRow[]
  error?: string
}> {
  try {
    const supabase = createAdminClient()

    const accountsResult = await supabase
      .from("accounts")
      .select(
        "id, name, slug, sub_type, avatar_url, is_verified, is_extern, extern_status, created_at"
      )
      .eq("account_type", "organisation")
      .order("created_at", { ascending: false })

    if (accountsResult.error) {
      return { success: false, error: accountsResult.error.message }
    }

    const accounts = (accountsResult.data ?? []) as Array<
      Record<string, unknown>
    >
    const orgIds = accounts.map((a) => String(a.id))

    let ownerRows: Array<Record<string, unknown>> = []
    if (orgIds.length > 0) {
      const ownersResult = await supabase
        .from("account_owners")
        .select("account_id, wallet_address, role, joined_at")
        .in("account_id", orgIds)

      if (ownersResult.error) {
        return { success: false, error: ownersResult.error.message }
      }
      ownerRows = (ownersResult.data ?? []) as Array<Record<string, unknown>>
    }

    // Group members by account id.
    const membersByAccount = new Map<string, AdminOrgMember[]>()
    for (const o of ownerRows) {
      const accountId = String(o.account_id ?? "")
      const wallet = String(o.wallet_address ?? "").toLowerCase()
      if (!accountId || !wallet) continue
      const list = membersByAccount.get(accountId) ?? []
      list.push({
        wallet_address: wallet,
        role: asRole(o.role),
        joined_at: (o.joined_at as string) ?? null,
      })
      membersByAccount.set(accountId, list)
    }

    const orgs: AdminOrgRow[] = accounts.map((a) => {
      const id = String(a.id)
      const members = (membersByAccount.get(id) ?? []).sort((x, y) => {
        const byRole = ROLE_ORDER[x.role] - ROLE_ORDER[y.role]
        if (byRole !== 0) return byRole
        return (
          new Date(x.joined_at ?? 0).getTime() -
          new Date(y.joined_at ?? 0).getTime()
        )
      })

      return {
        id,
        name: (a.name as string) ?? "Unbenannt",
        slug: (a.slug as string) ?? null,
        sub_type: (a.sub_type as OrgSubType) ?? null,
        avatar_url: (a.avatar_url as string) ?? null,
        is_verified: !!a.is_verified,
        is_extern: !!a.is_extern,
        extern_status: (a.extern_status as ExternStatus) ?? null,
        created_at: (a.created_at as string) ?? new Date(0).toISOString(),
        members,
      }
    })

    return { success: true, orgs }
  } catch (error) {
    console.error("[orgs-admin] Failed to load org data:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
