"use server"

import { createClient } from "@/lib/supabase/server"
import type { BusinessCategory } from "@/types/business"

export interface AdWithBusiness {
  id: string
  business_id: string
  title: string
  description: string | null
  deal_type: string
  deal_value: string | null
  start_date: string | null
  end_date: string | null
  image_url: string | null
  media_urls: string[]
  video_url: string | null
  status: string
  is_active: boolean
  is_boosted: boolean
  boost_expires_at: string | null
  views_count: number
  clicks_count: number
  created_at: string
  business_name: string
  business_slug: string
  business_logo_url: string | null
  business_category: BusinessCategory
  business_owner_wallet_address?: string
}

export async function getAllActiveAds(
  category?: BusinessCategory,
  search?: string
): Promise<{ success: boolean; data?: AdWithBusiness[]; error?: string }> {
  try {
    const supabase = await createClient()
    const today = new Date().toISOString().split("T")[0]

    let query = supabase
      .from("business_deals")
      .select(
        `
        *,
        businesses!inner (
          name,
          slug,
          logo_url,
          category,
          status
        )
      `
      )
      .eq("is_active", true)
      .neq("businesses.status", "rejected")
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("is_boosted", { ascending: false })
      .order("created_at", { ascending: false })

    if (category) {
      query = query.eq("businesses.category", category)
    }

    if (search) {
      query = query.ilike("title", `%${search}%`)
    }

    const { data, error } = await query

    if (error) throw error

    const ads: AdWithBusiness[] = (data || []).map((row: Record<string, unknown>) => {
      const biz = row.businesses as Record<string, unknown>
      return {
        id: row.id as string,
        business_id: row.business_id as string,
        title: row.title as string,
        description: row.description as string | null,
        deal_type: row.deal_type as string,
        deal_value: row.deal_value as string | null,
        start_date: row.start_date as string | null,
        end_date: row.end_date as string | null,
        image_url: row.image_url as string | null,
        media_urls: (row.media_urls as string[]) || [],
        video_url: (row.video_url as string | null) || null,
        status: (row.status as string) || "active",
        is_active: row.is_active as boolean,
        is_boosted: (row.is_boosted as boolean) || false,
        boost_expires_at: (row.boost_expires_at as string | null) || null,
        views_count: (row.views_count as number) || 0,
        clicks_count: (row.clicks_count as number) || 0,
        created_at: row.created_at as string,
        business_name: biz.name as string,
        business_slug: biz.slug as string,
        business_logo_url: biz.logo_url as string | null,
        business_category: biz.category as BusinessCategory,
      }
    })

    return { success: true, data: ads }
  } catch (error) {
    console.error("Error fetching active ads:", error)
    return { success: false, error: "Fehler beim Laden der Angebote" }
  }
}

export async function getAdWithBusinessById(
  dealId: string
): Promise<{ success: boolean; data?: AdWithBusiness; error?: string }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("business_deals")
      .select(
        `
        *,
        businesses!inner (
          name,
          slug,
          logo_url,
          category,
          status,
          owner_wallet_address
        )
      `
      )
      .eq("id", dealId)
      .single()

    if (error) throw error

    const biz = data.businesses as Record<string, unknown>
    const ad: AdWithBusiness = {
      id: data.id as string,
      business_id: data.business_id as string,
      title: data.title as string,
      description: data.description as string | null,
      deal_type: data.deal_type as string,
      deal_value: data.deal_value as string | null,
      start_date: data.start_date as string | null,
      end_date: data.end_date as string | null,
      image_url: data.image_url as string | null,
      media_urls: (data.media_urls as string[]) || [],
      video_url: (data.video_url as string | null) || null,
      status: (data.status as string) || "active",
      is_active: data.is_active as boolean,
      is_boosted: (data.is_boosted as boolean) || false,
      boost_expires_at: data.boost_expires_at as string | null,
      views_count: (data.views_count as number) || 0,
      clicks_count: (data.clicks_count as number) || 0,
      created_at: data.created_at as string,
      business_name: biz.name as string,
      business_slug: biz.slug as string,
      business_logo_url: biz.logo_url as string | null,
      business_category: biz.category as BusinessCategory,
      business_owner_wallet_address: biz.owner_wallet_address as string,
    }

    return { success: true, data: ad }
  } catch (error) {
    console.error("Error fetching ad:", error)
    return { success: false, error: "Angebot nicht gefunden" }
  }
}

export async function trackAdView(dealId: string) {
  try {
    const supabase = await createClient()
    await supabase.rpc("increment_deal_views", { deal_id: dealId })
  } catch {
    // Fire-and-forget, don't block on errors
  }
}

export async function trackAdClick(dealId: string) {
  try {
    const supabase = await createClient()
    await supabase.rpc("increment_deal_clicks", { deal_id: dealId })
  } catch {
    // Fire-and-forget
  }
}

export async function getAdStats(businessId: string): Promise<{
  success: boolean
  data?: { id: string; title: string; status: string; views_count: number; clicks_count: number; is_boosted: boolean }[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("business_deals")
      .select("id, title, status, views_count, clicks_count, is_boosted")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return {
      success: true,
      data: (data || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        title: d.title as string,
        status: (d.status as string) || "active",
        views_count: (d.views_count as number) || 0,
        clicks_count: (d.clicks_count as number) || 0,
        is_boosted: (d.is_boosted as boolean) || false,
      })),
    }
  } catch (error) {
    console.error("Error fetching ad stats:", error)
    return { success: false, error: "Fehler beim Laden der Statistiken" }
  }
}
