"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isAuthenticated } from "@/lib/auth/session"

export type SommercampRegistration = {
  id: string
  created_at: string
  name: string
  age: number | null
  newsletter_opt_in: boolean
}

// Admin-only list for /admin/dashboard/sommercamp. Deliberately excludes the
// wallet column — UI shows names, never addresses.
export async function listSommercampRegistrations(): Promise<SommercampRegistration[]> {
  if (!(await isAuthenticated())) throw new Error("Nicht autorisiert")
  const { data, error } = await createAdminClient()
    .from("hackathon_registrations")
    .select("id, created_at, name, age, newsletter_opt_in")
    .eq("event", "sommercamp-2026")
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as SommercampRegistration[]
}
