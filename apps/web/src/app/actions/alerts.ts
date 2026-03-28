"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createAppNotification } from "@/app/actions/app-notifications"

export interface ServiceAlert {
  id: string
  title: string
  description: string | null
  alert_type: "water_outage" | "road_closure" | "storm_warning" | "fire_department" | "general"
  severity: "info" | "warning" | "critical"
  status: "active" | "resolved" | "draft"
  location: string | null
  starts_at: string
  ends_at: string | null
  created_at: string
  updated_at: string
  created_by: string
}

const alertTypeLabels: Record<string, string> = {
  water_outage: "Wasserausfall",
  road_closure: "Straßensperrung",
  storm_warning: "Sturmwarnung",
  fire_department: "Feuerwehr",
  general: "Hinweis",
}

export async function createServiceAlert(formData: FormData) {
  try {
    const supabase = await createClient()

    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const alert_type = formData.get("alert_type") as string
    const severity = formData.get("severity") as string
    const status = formData.get("status") as "active" | "draft"
    const location = formData.get("location") as string
    const starts_at = formData.get("starts_at") as string
    const ends_at = formData.get("ends_at") as string

    const { data, error } = await supabase
      .from("service_alerts")
      .insert({
        title,
        description: description || null,
        alert_type,
        severity,
        status,
        location: location || null,
        starts_at: starts_at || new Date().toISOString(),
        ends_at: ends_at || null,
      })
      .select()
      .single()

    if (error) throw error

    if (status === "active") {
      const typeLabel = alertTypeLabels[alert_type] || "Meldung"
      createAppNotification({
        type: "alert_new",
        title: `${typeLabel}: ${title}`,
        body: description?.substring(0, 120) || null,
        link: null,
        reference_id: data.id,
      }).catch(console.error)
    }

    revalidatePath("/admin/dashboard/alerts")
    revalidatePath("/app")

    return { success: true, data, message: "Meldung erfolgreich erstellt" }
  } catch (error) {
    console.error("Error creating service alert:", error)
    return { success: false, error: "Fehler beim Erstellen der Meldung" }
  }
}

export async function updateServiceAlert(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const alert_type = formData.get("alert_type") as string
    const severity = formData.get("severity") as string
    const status = formData.get("status") as "active" | "resolved" | "draft"
    const location = formData.get("location") as string
    const starts_at = formData.get("starts_at") as string
    const ends_at = formData.get("ends_at") as string

    const { data: currentAlert } = await supabase
      .from("service_alerts")
      .select("status")
      .eq("id", id)
      .single()

    const { data, error } = await supabase
      .from("service_alerts")
      .update({
        title,
        description: description || null,
        alert_type,
        severity,
        status,
        location: location || null,
        starts_at: starts_at || new Date().toISOString(),
        ends_at: ends_at || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    if (status === "active" && currentAlert?.status === "draft") {
      const typeLabel = alertTypeLabels[alert_type] || "Meldung"
      createAppNotification({
        type: "alert_new",
        title: `${typeLabel}: ${title}`,
        body: description?.substring(0, 120) || null,
        link: null,
        reference_id: data.id,
      }).catch(console.error)
    }

    revalidatePath("/admin/dashboard/alerts")
    revalidatePath("/app")

    return { success: true, data, message: "Meldung erfolgreich aktualisiert" }
  } catch (error) {
    console.error("Error updating service alert:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Meldung" }
  }
}

export async function deleteServiceAlert(id: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("service_alerts").delete().eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/alerts")
    revalidatePath("/app")

    return { success: true, message: "Meldung erfolgreich gelöscht" }
  } catch (error) {
    console.error("Error deleting service alert:", error)
    return { success: false, error: "Fehler beim Löschen der Meldung" }
  }
}

export async function resolveServiceAlert(id: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("service_alerts")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/alerts")
    revalidatePath("/app")

    return { success: true, message: "Meldung als gelöst markiert" }
  } catch (error) {
    console.error("Error resolving service alert:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Meldung" }
  }
}

export async function reactivateServiceAlert(id: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("service_alerts")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/alerts")
    revalidatePath("/app")

    return { success: true, message: "Meldung reaktiviert" }
  } catch (error) {
    console.error("Error reactivating service alert:", error)
    return { success: false, error: "Fehler beim Reaktivieren der Meldung" }
  }
}
