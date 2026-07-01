"use server"

// Owner-scoped event management for the org dashboard (/dashboard/events).
// Every action verifies the caller owns the event's account. Unlike the legacy
// admin `updateEvent`, these only write org-permitted fields — they never touch
// admin-only flags (is_popular / "Event des Tages") and set `status` solely from
// the draft/publish toggle (publish = go live immediately → 'approved').

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAccountOwner } from "@/lib/supabase-accounts"
import { revalidatePath } from "next/cache"
import type {
  OrgEventFields,
  OrgEventRow,
  OrgEventsOverview,
  EventInterest,
  OrgEventStats,
  EventQrStatus,
} from "@/lib/org-events-types"

const QR_BASE = "https://www.roebel.app/e/"

function parseEventForm(fd: FormData): OrgEventFields {
  const str = (k: string) => {
    const v = fd.get(k)
    return typeof v === "string" && v.length > 0 ? v : null
  }
  return {
    title: (fd.get("title") as string) ?? "",
    description: str("description"),
    date: (fd.get("date") as string) ?? "",
    time: str("time"),
    end_time: str("end_time"),
    location: (fd.get("location") as string) ?? "",
    category: str("category"),
    organizer_name: (fd.get("organizer_name") as string) ?? "",
    organizer_email: (fd.get("organizer_email") as string) ?? "",
    organizer_phone: str("organizer_phone"),
    website_url: str("website_url"),
    ticket_price: str("ticket_price") ? parseFloat(str("ticket_price") as string) : null,
    max_attendees: str("max_attendees") ? parseInt(str("max_attendees") as string, 10) : null,
    is_cancelled: fd.get("is_cancelled") === "true",
    image_url: str("image_url"),
    audio_url: str("audio_url"),
    livestream_url: str("livestream_url"),
    livestream_active: fd.get("livestream_active") === "true",
  }
}

function validate(fields: OrgEventFields): string | null {
  if (!fields.title.trim()) return "Titel fehlt."
  if (!fields.date) return "Datum fehlt."
  if (!fields.location.trim()) return "Ort fehlt."
  if (!fields.organizer_name.trim()) return "Name des Veranstalters fehlt."
  if (!fields.organizer_email.trim()) return "E-Mail des Veranstalters fehlt."
  return null
}

function revalidateEvent(eventId?: string) {
  revalidatePath("/dashboard/events")
  revalidatePath("/app/events")
  revalidatePath("/events")
  revalidatePath("/")
  if (eventId) {
    revalidatePath(`/app/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
  }
}

// ── Ownership guard ──────────────────────────────────────────
async function assertOwnsEvent(
  eventId: string,
  callerWallet?: string
): Promise<{ ok: true; accountId: string | null } | { ok: false; error: string }> {
  if (!callerWallet) return { ok: false, error: "Nicht angemeldet." }
  const supabase = await createClient()
  const { data: event } = await supabase
    .from("events")
    .select("id, account_id")
    .eq("id", eventId)
    .single()
  if (!event) return { ok: false, error: "Event nicht gefunden." }
  if (!event.account_id) return { ok: false, error: "Event ist keiner Organisation zugeordnet." }
  const owner = await isAccountOwner(event.account_id, callerWallet)
  if (!owner) return { ok: false, error: "Keine Berechtigung für dieses Event." }
  return { ok: true, accountId: event.account_id }
}

// ── Create ───────────────────────────────────────────────────
export async function createOrgEvent(
  accountId: string,
  formData: FormData,
  callerWallet: string | undefined,
  publish: boolean
) {
  try {
    if (!callerWallet) return { success: false, error: "Nicht angemeldet." }
    const owner = await isAccountOwner(accountId, callerWallet)
    if (!owner) return { success: false, error: "Keine Berechtigung für diese Organisation." }

    const fields = parseEventForm(formData)
    const invalid = validate(fields)
    if (invalid) return { success: false, error: invalid }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("events")
      .insert({
        ...fields,
        account_id: accountId,
        status: publish ? "approved" : "draft",
      })
      .select("id")
      .single()

    if (error) {
      console.error("createOrgEvent error:", error)
      return { success: false, error: "Event konnte nicht erstellt werden." }
    }

    revalidateEvent(data.id)
    return { success: true, id: data.id as string }
  } catch (e) {
    console.error("createOrgEvent server error:", e)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}

// ── Update ───────────────────────────────────────────────────
export async function updateOrgEvent(
  eventId: string,
  formData: FormData,
  callerWallet: string | undefined,
  publish: boolean
) {
  try {
    const guard = await assertOwnsEvent(eventId, callerWallet)
    if (!guard.ok) return { success: false, error: guard.error }

    const fields = parseEventForm(formData)
    const invalid = validate(fields)
    if (invalid) return { success: false, error: invalid }

    const supabase = await createClient()
    const { error } = await supabase
      .from("events")
      .update({
        ...fields,
        status: publish ? "approved" : "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)

    if (error) {
      console.error("updateOrgEvent error:", error)
      return { success: false, error: "Event konnte nicht gespeichert werden." }
    }

    revalidateEvent(eventId)
    return { success: true }
  } catch (e) {
    console.error("updateOrgEvent server error:", e)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}

// ── Publish toggle (from the list) ───────────────────────────
export async function setEventPublished(
  eventId: string,
  published: boolean,
  callerWallet?: string
) {
  try {
    const guard = await assertOwnsEvent(eventId, callerWallet)
    if (!guard.ok) return { success: false, error: guard.error }

    const supabase = await createClient()
    const { error } = await supabase
      .from("events")
      .update({
        status: published ? "approved" : "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)

    if (error) {
      console.error("setEventPublished error:", error)
      return { success: false, error: "Status konnte nicht geändert werden." }
    }
    revalidateEvent(eventId)
    return { success: true }
  } catch (e) {
    console.error("setEventPublished server error:", e)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}

// ── Duplicate ────────────────────────────────────────────────
export async function duplicateOrgEvent(eventId: string, callerWallet?: string) {
  try {
    const guard = await assertOwnsEvent(eventId, callerWallet)
    if (!guard.ok) return { success: false, error: guard.error }

    const supabase = await createClient()
    const { data: src, error: srcErr } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single()
    if (srcErr || !src) return { success: false, error: "Event nicht gefunden." }

    // Copy org-permitted fields only; new copy starts as a private draft and is
    // never a featured "Event des Tages".
    const copy = {
      title: `${src.title} (Kopie)`,
      description: src.description,
      date: src.date,
      time: src.time,
      end_time: src.end_time,
      location: src.location,
      category: src.category,
      organizer_name: src.organizer_name,
      organizer_email: src.organizer_email,
      organizer_phone: src.organizer_phone,
      website_url: src.website_url,
      ticket_price: src.ticket_price,
      max_attendees: src.max_attendees,
      image_url: src.image_url,
      audio_url: src.audio_url,
      livestream_url: src.livestream_url,
      livestream_active: false,
      is_cancelled: false,
      is_recurring: src.is_recurring,
      account_id: src.account_id,
      status: "draft",
      latitude: src.latitude,
      longitude: src.longitude,
      place_id: src.place_id,
      formatted_address: src.formatted_address,
      address_components: src.address_components,
    }

    const { data: created, error: insErr } = await supabase
      .from("events")
      .insert(copy)
      .select("id")
      .single()
    if (insErr || !created) {
      console.error("duplicateOrgEvent insert error:", insErr)
      return { success: false, error: "Kopie konnte nicht erstellt werden." }
    }

    // Copy recurring dates, if any.
    const { data: dates } = await supabase
      .from("event_dates")
      .select("date, is_cancelled, notes")
      .eq("event_id", eventId)
    if (dates && dates.length > 0) {
      await supabase.from("event_dates").insert(
        dates.map((d: { date: string; is_cancelled: boolean | null; notes: string | null }) => ({
          event_id: created.id,
          date: d.date,
          is_cancelled: d.is_cancelled ?? false,
          notes: d.notes ?? null,
        }))
      )
    }

    revalidateEvent(created.id)
    return { success: true, id: created.id as string }
  } catch (e) {
    console.error("duplicateOrgEvent server error:", e)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}

// ── Dashboard data (list + overview stats) ───────────────────
export async function getOrgEventsDashboard(accountId: string, callerWallet?: string) {
  try {
    if (!callerWallet) return { success: false as const, error: "Nicht angemeldet." }
    const owner = await isAccountOwner(accountId, callerWallet)
    if (!owner) return { success: false as const, error: "Keine Berechtigung." }

    const admin = createAdminClient()
    const { data: events, error } = await admin
      .from("events")
      .select(
        "id, title, date, time, status, is_cancelled, image_url, location, max_attendees, created_at"
      )
      .eq("account_id", accountId)
    if (error) {
      console.error("getOrgEventsDashboard events error:", error)
      return { success: false as const, error: "Events konnten nicht geladen werden." }
    }

    const ids = (events ?? []).map((e: { id: string }) => e.id)
    const countBy = (rows: { event_id: string }[] | null) => {
      const map: Record<string, number> = {}
      for (const r of rows ?? []) map[r.event_id] = (map[r.event_id] ?? 0) + 1
      return map
    }

    let interests: Record<string, number> = {}
    let views: Record<string, number> = {}
    let experiences: Record<string, number> = {}
    if (ids.length > 0) {
      const [iRes, vRes, xRes] = await Promise.all([
        admin.from("event_interests").select("event_id").in("event_id", ids),
        admin.from("event_views").select("event_id").in("event_id", ids),
        admin
          .from("event_experiences")
          .select("event_id")
          .in("event_id", ids)
          .eq("status", "published"),
      ])
      interests = countBy(iRes.data as { event_id: string }[] | null)
      views = countBy(vRes.data as { event_id: string }[] | null)
      experiences = countBy(xRes.data as { event_id: string }[] | null)
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const rows: OrgEventRow[] = (events ?? []).map((e: any) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      status: e.status,
      is_cancelled: e.is_cancelled ?? false,
      image_url: e.image_url,
      location: e.location,
      max_attendees: e.max_attendees,
      interestCount: interests[e.id] ?? 0,
      viewCount: views[e.id] ?? 0,
      experienceCount: experiences[e.id] ?? 0,
    }))

    const isUpcoming = (e: OrgEventRow) => {
      if (!e.date) return false
      const d = new Date(`${e.date}T${e.time ?? "23:59"}`)
      return d.getTime() >= now.getTime() - 12 * 60 * 60 * 1000
    }

    const overview: OrgEventsOverview = {
      total: rows.length,
      upcoming: rows.filter((e) => e.status !== "draft" && isUpcoming(e)).length,
      drafts: rows.filter((e) => e.status === "draft").length,
      published: rows.filter((e) => e.status === "approved").length,
      totalInterests: rows.reduce((s, e) => s + e.interestCount, 0),
      totalViews: rows.reduce((s, e) => s + e.viewCount, 0),
      thisMonth: (events ?? []).filter(
        (e: any) => e.created_at && new Date(e.created_at) >= startOfMonth
      ).length,
    }

    return { success: true as const, events: rows, overview }
  } catch (e) {
    console.error("getOrgEventsDashboard server error:", e)
    return { success: false as const, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}

// ── Interest / RSVP list (Anmeldungen tab) ───────────────────
export async function getOrgEventInterests(eventId: string, callerWallet?: string) {
  try {
    const guard = await assertOwnsEvent(eventId, callerWallet)
    if (!guard.ok) return { success: false as const, error: guard.error }

    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from("event_interests")
      .select("user_wallet, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
    if (error) {
      console.error("getOrgEventInterests error:", error)
      return { success: false as const, error: "Anmeldungen konnten nicht geladen werden." }
    }

    const wallets = Array.from(
      new Set((rows ?? []).map((r: { user_wallet: string }) => r.user_wallet.toLowerCase()))
    )

    // Resolve wallet → display name (never show a raw 0x… address).
    const nameByWallet: Record<string, string> = {}
    if (wallets.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("wallet_address, username")
        .in("wallet_address", wallets)
      for (const u of (users ?? []) as { wallet_address: string; username: string | null }[]) {
        if (u.username) nameByWallet[u.wallet_address.toLowerCase()] = u.username
      }
    }

    const interests: EventInterest[] = (rows ?? []).map(
      (r: { user_wallet: string; created_at: string | null }) => ({
        wallet: r.user_wallet,
        name: nameByWallet[r.user_wallet.toLowerCase()] ?? "Jemand",
        created_at: r.created_at,
      })
    )

    return { success: true as const, interests, count: interests.length }
  } catch (e) {
    console.error("getOrgEventInterests server error:", e)
    return { success: false as const, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}

// ── Per-event stats (Statistik tab) ──────────────────────────
export async function getOrgEventStats(eventId: string, callerWallet?: string) {
  try {
    const guard = await assertOwnsEvent(eventId, callerWallet)
    if (!guard.ok) return { success: false as const, error: guard.error }

    const admin = createAdminClient()
    const [evRes, vRes, iRes, xRes] = await Promise.all([
      admin.from("events").select("max_attendees").eq("id", eventId).single(),
      admin.from("event_views").select("*", { count: "exact", head: true }).eq("event_id", eventId),
      admin
        .from("event_interests")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId),
      admin
        .from("event_experiences")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "published"),
    ])

    const stats: OrgEventStats = {
      views: vRes.count ?? 0,
      interests: iRes.count ?? 0,
      experiences: xRes.count ?? 0,
      maxAttendees: (evRes.data as { max_attendees: number | null } | null)?.max_attendees ?? null,
    }
    return { success: true as const, stats }
  } catch (e) {
    console.error("getOrgEventStats server error:", e)
    return { success: false as const, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}

// ── Proof-of-attendance QR (Circles reward rail) ─────────────
async function loadQrStatus(
  eventId: string,
  eventStatus: string | null
): Promise<EventQrStatus> {
  const admin = createAdminClient()
  const { data: re } = await admin
    .from("reward_events")
    .select("id")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!re) {
    return {
      linked: false,
      rewardEventId: null,
      url: null,
      attendanceCount: 0,
      canCreate: eventStatus === "approved",
      reason: eventStatus === "approved" ? null : "Bitte das Event zuerst veröffentlichen.",
    }
  }

  const { count } = await admin
    .from("reward_claims")
    .select("*", { count: "exact", head: true })
    .eq("action", "event_attend")
    .eq("reference_id", re.id)

  return {
    linked: true,
    rewardEventId: re.id,
    url: `${QR_BASE}${re.id}`,
    attendanceCount: count ?? 0,
    canCreate: false,
    reason: null,
  }
}

export async function getEventQrStatus(eventId: string, callerWallet?: string) {
  try {
    const guard = await assertOwnsEvent(eventId, callerWallet)
    if (!guard.ok) return { success: false as const, error: guard.error }

    const supabase = await createClient()
    const { data: ev } = await supabase.from("events").select("status").eq("id", eventId).single()
    const status = await loadQrStatus(eventId, ev?.status ?? null)
    return { success: true as const, status }
  } catch (e) {
    console.error("getEventQrStatus server error:", e)
    return { success: false as const, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}

export async function createEventQr(eventId: string, callerWallet?: string) {
  try {
    const guard = await assertOwnsEvent(eventId, callerWallet)
    if (!guard.ok) return { success: false as const, error: guard.error }

    const supabase = await createClient()
    const { data: ev } = await supabase
      .from("events")
      .select("title, date, time, status, max_attendees")
      .eq("id", eventId)
      .single()
    if (!ev) return { success: false as const, error: "Event nicht gefunden." }
    if (ev.status !== "approved") {
      return { success: false as const, error: "Bitte das Event zuerst veröffentlichen." }
    }

    const admin = createAdminClient()
    // Idempotent: reuse an existing linked QR instead of minting a second one.
    const existing = await loadQrStatus(eventId, ev.status)
    if (existing.linked) return { success: true as const, status: existing }

    const startsAt = ev.date ? `${ev.date}T${ev.time ?? "00:00:00"}` : null
    const { error } = await admin.from("reward_events").insert({
      label: ev.title ?? "Röbel-Event",
      event_id: eventId,
      starts_at: startsAt,
      active: true,
      created_by: callerWallet,
      max_rewards: ev.max_attendees ?? null,
    })
    if (error) {
      console.error("createEventQr insert error:", error)
      return { success: false as const, error: "QR-Code konnte nicht erstellt werden." }
    }

    revalidatePath(`/dashboard/events/${eventId}/edit`)
    const status = await loadQrStatus(eventId, ev.status)
    return { success: true as const, status }
  } catch (e) {
    console.error("createEventQr server error:", e)
    return { success: false as const, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}
