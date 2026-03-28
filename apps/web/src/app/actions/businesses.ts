"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type {
  Business,
  BusinessDeal,
  BusinessCategory,
  CreateBusinessInput,
  UpdateBusinessInput,
  CreateDealInput,
  UpdateDealInput,
} from "@/types/business"
import { createAppNotification } from "@/app/actions/app-notifications"

// ============================================
// Image Upload
// ============================================

export async function uploadBusinessImage(formData: FormData) {
  try {
    const supabase = await createClient()
    const file = formData.get("file") as File
    const type = formData.get("type") as string // "logo" or "cover"

    if (!file || file.size === 0) {
      return { success: false, error: "Keine Datei ausgewählt." }
    }

    const fileExt = file.name.split(".").pop()
    const fileName = `${Date.now()}-${type}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `business-images/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(filePath, file, { cacheControl: "3600", upsert: false })

    if (uploadError) {
      console.error("Upload error:", uploadError)
      return { success: false, error: "Fehler beim Hochladen." }
    }

    const { data: urlData } = supabase.storage.from("images").getPublicUrl(filePath)
    return { success: true, url: urlData.publicUrl }
  } catch (error) {
    console.error("Upload error:", error)
    return { success: false, error: "Fehler beim Hochladen." }
  }
}

// ============================================
// Business Actions
// ============================================

export async function getApprovedBusinesses(
  category?: BusinessCategory,
  search?: string
) {
  try {
    const supabase = await createClient()
    let query = supabase
      .from("businesses")
      .select("*")
      .eq("status", "approved")
      .order("is_featured", { ascending: false })
      .order("name", { ascending: true })

    if (category) {
      query = query.eq("category", category)
    }

    if (search) {
      query = query.ilike("name", `%${search}%`)
    }

    const { data, error } = await query

    if (error) throw error
    return { success: true, data: data as Business[] }
  } catch (error) {
    console.error("Error fetching businesses:", error)
    return { success: false, error: "Fehler beim Laden der Gewerbe" }
  }
}

export async function getBusinessBySlug(slug: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("slug", slug)
      .single()

    if (error) throw error
    return { success: true, data: data as Business }
  } catch (error) {
    console.error("Error fetching business:", error)
    return { success: false, error: "Gewerbe nicht gefunden" }
  }
}

export async function getBusinessesByOwner(walletAddress: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_wallet_address", walletAddress.toLowerCase())
      .order("created_at", { ascending: false })

    if (error) throw error
    return { success: true, data: data as Business[] }
  } catch (error) {
    console.error("Error fetching owner businesses:", error)
    return { success: false, error: "Fehler beim Laden der Gewerbe" }
  }
}

export async function createBusiness(input: CreateBusinessInput) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("businesses")
      .insert({
        ...input,
        owner_wallet_address: input.owner_wallet_address.toLowerCase(),
        status: "pending",
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath("/app/gewerbe")
    revalidatePath("/app/profile")
    return { success: true, data: data as Business, message: "Gewerbe eingereicht" }
  } catch (error) {
    console.error("Error creating business:", error)
    return { success: false, error: "Fehler beim Erstellen des Gewerbes" }
  }
}

export async function updateBusiness(input: UpdateBusinessInput) {
  try {
    const { id, ...updateData } = input
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("businesses")
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/app/gewerbe")
    revalidatePath(`/app/gewerbe/${data.slug}`)
    revalidatePath("/app/gewerbe/bearbeiten")
    return { success: true, data: data as Business, message: "Gewerbe aktualisiert" }
  } catch (error) {
    console.error("Error updating business:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Gewerbes" }
  }
}

// ============================================
// Deal Actions
// ============================================

export async function getBusinessDeals(businessId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("business_deals")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return { success: true, data: data as BusinessDeal[] }
  } catch (error) {
    console.error("Error fetching deals:", error)
    return { success: false, error: "Fehler beim Laden der Angebote" }
  }
}

export async function getActiveDeals(businessId: string) {
  try {
    const supabase = await createClient()
    const today = new Date().toISOString().split("T")[0]
    const { data, error } = await supabase
      .from("business_deals")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("created_at", { ascending: false })

    if (error) throw error
    return { success: true, data: data as BusinessDeal[] }
  } catch (error) {
    console.error("Error fetching active deals:", error)
    return { success: false, error: "Fehler beim Laden der Angebote" }
  }
}

export async function createDeal(input: CreateDealInput) {
  try {
    const supabase = await createClient()
    const status = input.status || "active"
    const { data, error } = await supabase
      .from("business_deals")
      .insert({
        ...input,
        media_urls: input.media_urls || [],
        video_url: input.video_url || null,
        status,
        image_url: input.media_urls?.[0] || input.image_url || null,
        is_active: status === "active",
      })
      .select()
      .single()

    if (error) throw error

    // Create activity notification
    createAppNotification({
      type: "deal_new",
      title: `Neues Angebot: ${data.title}`,
      body: data.description?.substring(0, 120) || null,
      link: `/app/angebote/${data.id}`,
      reference_id: data.id,
      image_url: data.image_url || null,
    }).catch(console.error)

    revalidatePath("/app/gewerbe/angebote")
    return { success: true, data: data as BusinessDeal, message: "Angebot erstellt" }
  } catch (error) {
    console.error("Error creating deal:", error)
    return { success: false, error: "Fehler beim Erstellen des Angebots" }
  }
}

export async function updateDeal(input: UpdateDealInput) {
  try {
    const { id, ...updateData } = input
    // Sync backward-compat fields
    const syncedData: Record<string, unknown> = { ...updateData, updated_at: new Date().toISOString() }
    if (updateData.media_urls !== undefined) {
      syncedData.image_url = updateData.media_urls[0] || null
    }
    if (updateData.status !== undefined) {
      syncedData.is_active = updateData.status === "active"
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("business_deals")
      .update(syncedData)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/app/gewerbe/angebote")
    return { success: true, data: data as BusinessDeal, message: "Angebot aktualisiert" }
  } catch (error) {
    console.error("Error updating deal:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Angebots" }
  }
}

export async function getDealById(dealId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("business_deals")
      .select("*")
      .eq("id", dealId)
      .single()

    if (error) throw error
    return { success: true, data: data as BusinessDeal }
  } catch (error) {
    console.error("Error fetching deal:", error)
    return { success: false, error: "Angebot nicht gefunden" }
  }
}

export async function deleteDeal(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("business_deals")
      .delete()
      .eq("id", id)

    if (error) throw error

    revalidatePath("/app/gewerbe/angebote")
    return { success: true, message: "Angebot gelöscht" }
  } catch (error) {
    console.error("Error deleting deal:", error)
    return { success: false, error: "Fehler beim Löschen des Angebots" }
  }
}
