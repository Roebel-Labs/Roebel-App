"use server"

import { revalidatePath } from "next/cache"
import { isAuthenticated } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { runSource, type EventSource, type SourceRunResult } from "@/lib/event-requests/crawl"
import { settleExpiredRequests } from "@/lib/event-requests/service"

const ADMIN_PATH = "/admin/dashboard/events/anfragen"

async function guard(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Nicht autorisiert")
}

export interface AdminEventSource extends EventSource {
  last_run_at: string | null
  last_status: string | null
  account_name: string | null
}

export interface AdminEventRequest {
  id: string
  status: string
  source: string
  title: string
  date: string
  organizer_name: string | null
  account_name: string | null
  expires_at: string
  created_at: string
  event_id: string | null
}

export interface EventRequestsOverview {
  sources: AdminEventSource[]
  requests: AdminEventRequest[]
  organisations: { id: string; name: string }[]
}

export async function getEventRequestsOverview(): Promise<EventRequestsOverview> {
  await guard()
  const supabase = createAdminClient()
  const [sources, requests, orgs] = await Promise.all([
    supabase.from("event_sources").select("id, name, url, account_id, enabled, last_run_at, last_status").order("created_at"),
    supabase.from("event_requests").select("id, status, source, title, date, organizer_name, account_id, expires_at, created_at, event_id")
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("accounts").select("id, name").eq("account_type", "organisation").order("name"),
  ])
  const organisations = (orgs.data ?? []) as { id: string; name: string }[]
  const nameOf = new Map(organisations.map((o) => [o.id, o.name]))
  return {
    organisations,
    sources: ((sources.data ?? []) as Omit<AdminEventSource, "account_name">[]).map((s) => ({
      ...s, account_name: s.account_id ? nameOf.get(s.account_id) ?? null : null,
    })),
    requests: ((requests.data ?? []) as (Omit<AdminEventRequest, "account_name"> & { account_id: string | null })[]).map((r) => ({
      ...r, account_name: r.account_id ? nameOf.get(r.account_id) ?? null : null,
    })),
  }
}

export async function addEventSource(input: { name: string; url: string; accountId: string | null }): Promise<{ success: boolean; message: string }> {
  await guard()
  const name = input.name.trim()
  let url: URL
  try {
    url = new URL(input.url.trim())
  } catch {
    return { success: false, message: "Bitte gib eine vollständige Adresse an (https://…)." }
  }
  if (url.protocol !== "https:") return { success: false, message: "Nur https-Adressen sind erlaubt." }
  if (name.length < 2) return { success: false, message: "Bitte gib einen Namen für die Quelle an." }
  const { error } = await createAdminClient().from("event_sources").insert({ name, url: url.toString(), account_id: input.accountId })
  if (error) return { success: false, message: error.code === "23505" ? "Diese Adresse ist schon eingetragen." : "Speichern fehlgeschlagen." }
  revalidatePath(ADMIN_PATH)
  return { success: true, message: "Quelle hinzugefügt." }
}

export async function setEventSourceEnabled(id: string, enabled: boolean): Promise<{ success: boolean }> {
  await guard()
  const { error } = await createAdminClient().from("event_sources").update({ enabled }).eq("id", id)
  revalidatePath(ADMIN_PATH)
  return { success: !error }
}

export async function deleteEventSource(id: string): Promise<{ success: boolean }> {
  await guard()
  const { error } = await createAdminClient().from("event_sources").delete().eq("id", id)
  revalidatePath(ADMIN_PATH)
  return { success: !error }
}

export async function runEventSourceNow(id: string): Promise<{ success: boolean; message: string; result?: SourceRunResult }> {
  await guard()
  const { data } = await createAdminClient().from("event_sources").select("id, name, url, account_id, enabled").eq("id", id).maybeSingle()
  if (!data) return { success: false, message: "Quelle nicht gefunden." }
  const result = await runSource(data as EventSource)
  revalidatePath(ADMIN_PATH)
  if (result.error) return { success: false, message: `Abruf fehlgeschlagen: ${result.error}`, result }
  return {
    success: true, result,
    message: `${result.found} gefunden, ${result.requested} angefragt, ${result.published} eingestellt, ${result.duplicates} schon bekannt.`,
  }
}

/** Settles overdue requests now instead of waiting for the hourly job. */
export async function settleOverdueNow(): Promise<{ success: boolean; message: string }> {
  await guard()
  const r = await settleExpiredRequests()
  revalidatePath(ADMIN_PATH)
  return { success: true, message: `${r.due} fällig, ${r.published} eingestellt, ${r.review} zur Prüfung, ${r.failed} fehlgeschlagen.` }
}
