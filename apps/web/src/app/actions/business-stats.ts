"use server"

import { createClient } from "@/lib/supabase/server"

export interface BusinessLandingStats {
  businessCount: number
  activeDealsCount: number
  userCount: number
}

export async function getBusinessLandingStats(): Promise<{
  success: boolean
  data?: BusinessLandingStats
  error?: string
}> {
  try {
    const supabase = await createClient()
    const today = new Date().toISOString().split("T")[0]

    const [businessesResult, dealsResult, usersResult] = await Promise.all([
      supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),

      supabase
        .from("business_deals")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .or(`end_date.is.null,end_date.gte.${today}`),

      supabase
        .from("users")
        .select("id", { count: "exact", head: true }),
    ])

    return {
      success: true,
      data: {
        businessCount: businessesResult.count || 0,
        activeDealsCount: dealsResult.count || 0,
        userCount: usersResult.count || 0,
      },
    }
  } catch (error) {
    console.error("Error fetching business landing stats:", error)
    return { success: false, error: "Fehler beim Laden der Statistiken" }
  }
}
