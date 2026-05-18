"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

export interface AppReleaseConfig {
  id: number
  ios_latest_version: string
  android_latest_version: string
  ios_store_url: string
  android_store_url: string
  title_de: string
  body_de: string
  cta_label_de: string
  dismiss_label_de: string
  is_active: boolean
  updated_at: string
}

export async function getAppReleaseConfig(): Promise<AppReleaseConfig | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("app_release_config")
      .select("*")
      .eq("id", 1)
      .single()

    if (error) throw error
    return data as AppReleaseConfig
  } catch (error) {
    console.error("Error fetching app release config:", error)
    return null
  }
}

export async function updateAppReleaseConfig(formData: FormData) {
  try {
    const supabase = createAdminClient()

    const payload = {
      id: 1,
      ios_latest_version: (formData.get("ios_latest_version") as string)?.trim() || "0.0.0",
      android_latest_version: (formData.get("android_latest_version") as string)?.trim() || "0.0.0",
      ios_store_url: (formData.get("ios_store_url") as string)?.trim() || "",
      android_store_url: (formData.get("android_store_url") as string)?.trim() || "",
      title_de: (formData.get("title_de") as string)?.trim() || "Update verfügbar",
      body_de: (formData.get("body_de") as string)?.trim() || "",
      cta_label_de: (formData.get("cta_label_de") as string)?.trim() || "Jetzt aktualisieren",
      dismiss_label_de: (formData.get("dismiss_label_de") as string)?.trim() || "Später",
      is_active: formData.get("is_active") === "true",
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from("app_release_config")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/app-release")

    return { success: true, data, message: "App-Release-Konfiguration gespeichert" }
  } catch (error) {
    console.error("Error updating app release config:", error)
    return { success: false, error: "Fehler beim Speichern der App-Release-Konfiguration" }
  }
}
