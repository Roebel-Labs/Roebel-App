"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Business, BusinessStatus } from "@/types/business"
import { createAppNotification } from "@/app/actions/app-notifications"

export async function getAdminBusinesses(status?: BusinessStatus) {
  try {
    const supabase = await createClient()
    let query = supabase
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: false })

    if (status) {
      query = query.eq("status", status)
    }

    const { data, error } = await query

    if (error) throw error
    return { success: true, data: data as Business[] }
  } catch (error) {
    console.error("Error fetching admin businesses:", error)
    return { success: false, error: "Fehler beim Laden der Gewerbe" }
  }
}

export async function getAdminBusiness(id: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", id)
      .single()

    if (error) throw error
    return { success: true, data: data as Business }
  } catch (error) {
    console.error("Error fetching business:", error)
    return { success: false, error: "Gewerbe nicht gefunden" }
  }
}

export async function approveBusiness(id: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("businesses")
      .update({
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    // Create activity notification
    createAppNotification({
      type: "business_new",
      title: `Neues Gewerbe: ${data.name}`,
      body: data.description?.substring(0, 120) || null,
      link: `/app/gewerbe/${data.slug}`,
      reference_id: data.id,
      image_url: data.logo_url || null,
    }).catch(console.error)

    revalidatePath("/admin/dashboard/gewerbe")
    revalidatePath(`/admin/dashboard/gewerbe/${id}`)
    revalidatePath("/app/gewerbe")
    return { success: true, data: data as Business, message: "Gewerbe genehmigt" }
  } catch (error) {
    console.error("Error approving business:", error)
    return { success: false, error: "Fehler beim Genehmigen des Gewerbes" }
  }
}

export async function rejectBusiness(id: string, notes?: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("businesses")
      .update({
        status: "rejected",
        admin_notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/gewerbe")
    revalidatePath(`/admin/dashboard/gewerbe/${id}`)
    return { success: true, data: data as Business, message: "Gewerbe abgelehnt" }
  } catch (error) {
    console.error("Error rejecting business:", error)
    return { success: false, error: "Fehler beim Ablehnen des Gewerbes" }
  }
}

export async function updateAdminBusinessLocation(
  id: string,
  data: { latitude: number | null; longitude: number | null }
) {
  try {
    const supabase = await createClient()
    const { data: updated, error } = await supabase
      .from("businesses")
      .update({
        latitude: data.latitude,
        longitude: data.longitude,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/gewerbe")
    revalidatePath(`/admin/dashboard/gewerbe/${id}`)
    return { success: true, data: updated as Business, message: "Standort aktualisiert" }
  } catch (error) {
    console.error("Error updating business location:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Standorts" }
  }
}

export async function getPendingBusinessCount() {
  try {
    const supabase = await createClient()
    const { count, error } = await supabase
      .from("businesses")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")

    if (error) throw error
    return { success: true, count: count || 0 }
  } catch (error) {
    console.error("Error counting pending businesses:", error)
    return { success: false, count: 0 }
  }
}
