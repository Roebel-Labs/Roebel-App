// Event requests: an event found by an assistant (forwarded poster) or by the daily
// fetch of official pages is offered to the responsible organisation. Its owners get a
// push and publish, change or decline it. Without an answer within two days a request
// from a trusted origin is listed under the default account; an untrusted one goes to
// the team's review queue. Nothing here is ever published on the say of one stranger.
import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { EMAIL_CONFIG } from "@/lib/resend"
import { dedupeKey, findDuplicate, formatDateDe, matchOrganisation, type OrgCandidate } from "./match"

/** How long the organisation has to answer. */
export const RESPONSE_WINDOW_MS = 48 * 60 * 60 * 1000
/** Fallback when app_settings has no `event_requests_default_account_id`. */
const DEFAULT_ACCOUNT_NAME = "Röbel.APP News"
const SETTING_DEFAULT_ACCOUNT = "event_requests_default_account_id"
export const NOTIFICATION_TYPE = "event_request"

export type EventRequestStatus = "pending_org" | "published_org" | "published_default" | "team_review" | "rejected"

export interface EventRequestInput {
  source: "forward" | "crawl"
  sourceId?: string | null
  sourceUrl?: string | null
  title: string
  description: string
  date: string
  time?: string | null
  location: string
  category?: string | null
  imageUrl?: string | null
  websiteUrl?: string | null
  organizerName?: string | null
  /** Organisation already known (page of one organisation); skips name matching. */
  accountId?: string | null
  requestedByWallet?: string | null
}

export interface EventRequestRow {
  id: string
  status: EventRequestStatus
  source: "forward" | "crawl"
  source_id: string | null
  source_url: string | null
  dedupe_key: string
  title: string
  description: string
  date: string
  time: string | null
  location: string
  category: string | null
  image_url: string | null
  website_url: string | null
  organizer_name: string | null
  account_id: string | null
  requested_by_wallet: string | null
  trusted: boolean
  event_id: string | null
  expires_at: string
  decided_at: string | null
  decided_by_wallet: string | null
  created_at: string
}

export type CreateResult =
  | { outcome: "duplicate"; reason: "listed" | "requested"; title: string }
  | { outcome: "requested"; requestId: string; accountName: string; expiresAt: string }
  | { outcome: "published_default"; requestId: string; eventId: string }
  | { outcome: "team_review"; requestId: string; eventId: string }

type Db = SupabaseClient

function db(): Db {
  return createAdminClient()
}

async function readSetting(supabase: Db, key: string): Promise<string | null> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle()
  const value = (data as { value: string | null } | null)?.value ?? null
  return value && value.trim() !== "" ? value.trim() : null
}

export async function defaultAccount(supabase: Db = db()): Promise<{ id: string; name: string } | null> {
  const configured = await readSetting(supabase, SETTING_DEFAULT_ACCOUNT)
  const query = supabase.from("accounts").select("id, name").eq("account_type", "organisation")
  const { data, error } = configured
    ? await query.eq("id", configured).maybeSingle()
    : await query.eq("name", DEFAULT_ACCOUNT_NAME).limit(1).maybeSingle()
  if (error) throw new Error(`[event-requests] default account: ${error.message}`)
  return (data as { id: string; name: string } | null) ?? null
}

async function organisations(supabase: Db): Promise<OrgCandidate[]> {
  const { data, error } = await supabase.from("accounts").select("id, name").eq("account_type", "organisation").limit(1000)
  if (error) throw new Error(`[event-requests] organisations: ${error.message}`)
  return (data as OrgCandidate[] | null) ?? []
}

/** Wallets that may decide for an organisation (owner or admin), lower-case. */
export async function deciders(supabase: Db, accountId: string): Promise<string[]> {
  const { data, error } = await supabase.from("account_owners").select("wallet_address, role").eq("account_id", accountId)
  if (error) throw new Error(`[event-requests] owners: ${error.message}`)
  return ((data ?? []) as { wallet_address: string; role: string }[])
    .filter((o) => o.role === "owner" || o.role === "admin")
    .map((o) => o.wallet_address.toLowerCase())
}

async function isTeamMember(supabase: Db, wallet: string | null | undefined, defaultAccountId: string | null): Promise<boolean> {
  if (!wallet || !defaultAccountId) return false
  return (await deciders(supabase, defaultAccountId)).includes(wallet.toLowerCase())
}

async function geocode(location: string) {
  try {
    const { geocodeLocation } = await import("@/lib/utils/geocoding")
    return await geocodeLocation(location)
  } catch (err) {
    console.error("[event-requests] geocode", err)
    return null
  }
}

type EventFields = Pick<EventRequestRow, "title" | "description" | "date" | "time" | "location" | "category" | "image_url" | "website_url">

/** Inserts the public event. An INSERT fires no "new event" broadcast push (those hang on UPDATE). */
async function insertEvent(
  supabase: Db, fields: EventFields, account: { id: string; name: string; contact_email?: string | null },
  status: "approved" | "pending", sourceNote: string | null,
): Promise<string> {
  const place = await geocode(fields.location)
  const description = sourceNote ? `${fields.description}\n\n${sourceNote}`.trim() : fields.description
  const { data, error } = await supabase.from("events").insert({
    title: fields.title,
    description,
    date: fields.date,
    time: fields.time,
    location: fields.location,
    organizer_name: account.name,
    organizer_email: account.contact_email?.trim() || EMAIL_CONFIG.replyTo,
    category: fields.category ?? "Sonstige",
    image_url: fields.image_url,
    website_url: fields.website_url,
    ticket_price: 0,
    status,
    is_recurring: false,
    account_id: account.id,
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    place_id: place?.place_id ?? null,
    formatted_address: place?.formatted_address ?? fields.location,
    address_components: place?.address_components ?? null,
  }).select("id").single()
  if (error || !data) throw new Error(`[event-requests] insert event: ${error?.message ?? "no row"}`)
  const id = (data as { id: string }).id
  const dates = await supabase.from("event_dates").insert({ event_id: id, date: fields.date })
  if (dates.error) console.error("[event-requests] event_dates", dates.error.message)
  return id
}

async function notifyDeciders(supabase: Db, request: EventRequestRow, wallets: string[]): Promise<void> {
  if (wallets.length === 0) return
  const when = `${formatDateDe(request.date)}${request.time ? `, ${request.time.slice(0, 5)} Uhr` : ""}`
  const rows = wallets.map((wallet) => ({
    recipient_wallet: wallet,
    type: NOTIFICATION_TYPE,
    title: "Ist das eure Veranstaltung?",
    body: `${request.title} am ${when}. Bitte kurz prüfen und veröffentlichen.`,
    metadata: { request_id: request.id, account_id: request.account_id },
  }))
  // The insert trigger on notifications sends the push.
  const { error } = await supabase.from("notifications").insert(rows)
  if (error) console.error("[event-requests] notify:", error.message)
}

/**
 * Entry point for both origins. Checks for an existing listing or request, matches the
 * organisation and either asks its owners or, without a match, falls back at once.
 */
export async function createEventRequest(input: EventRequestInput): Promise<CreateResult> {
  const supabase = db()
  const key = dedupeKey(input.date, input.title)

  const [{ data: sameDay, error: eventsError }, { data: open, error: openError }] = await Promise.all([
    supabase.from("events").select("id, title, date, status").eq("date", input.date).in("status", ["approved", "pending"]).limit(200),
    supabase.from("event_requests").select("id, title, date, dedupe_key").eq("date", input.date).limit(200),
  ])
  if (eventsError) throw new Error(`[event-requests] events: ${eventsError.message}`)
  if (openError) throw new Error(`[event-requests] requests: ${openError.message}`)

  const listed = findDuplicate(input, (sameDay ?? []) as { title: string; date: string }[])
  if (listed) return { outcome: "duplicate", reason: "listed", title: listed.title }
  const requests = (open ?? []) as { title: string; date: string; dedupe_key: string }[]
  const requested = requests.find((r) => r.dedupe_key === key) ?? findDuplicate(input, requests)
  if (requested) return { outcome: "duplicate", reason: "requested", title: requested.title }

  const fallback = await defaultAccount(supabase)
  const trusted = input.source === "crawl" || (await isTeamMember(supabase, input.requestedByWallet, fallback?.id ?? null))

  let org: OrgCandidate | null = null
  if (input.accountId) {
    const { data } = await supabase.from("accounts").select("id, name").eq("id", input.accountId).maybeSingle()
    org = (data as OrgCandidate | null) ?? null
  } else {
    org = matchOrganisation(input.organizerName, await organisations(supabase))
  }
  // The default account is where unanswered requests end up, never someone to ask.
  if (org && fallback && org.id === fallback.id) org = null
  const askable = org ? await deciders(supabase, org.id) : []

  const expiresAt = new Date(Date.now() + RESPONSE_WINDOW_MS).toISOString()
  const { data: inserted, error: insertError } = await supabase.from("event_requests").insert({
    status: "pending_org",
    source: input.source,
    source_id: input.sourceId ?? null,
    source_url: input.sourceUrl ?? null,
    dedupe_key: key,
    title: input.title.trim(),
    description: input.description.trim(),
    date: input.date,
    time: input.time ?? null,
    location: input.location.trim(),
    category: input.category ?? null,
    image_url: input.imageUrl ?? null,
    website_url: input.websiteUrl ?? null,
    organizer_name: input.organizerName?.trim() || null,
    account_id: org && askable.length > 0 ? org.id : null,
    requested_by_wallet: input.requestedByWallet?.toLowerCase() ?? null,
    trusted,
    expires_at: expiresAt,
  }).select("*").single()
  if (insertError || !inserted) {
    // Unique dedupe_key: a parallel run created the same request.
    if (insertError?.code === "23505") return { outcome: "duplicate", reason: "requested", title: input.title }
    throw new Error(`[event-requests] insert: ${insertError?.message ?? "no row"}`)
  }
  const request = inserted as EventRequestRow

  if (org && askable.length > 0) {
    await notifyDeciders(supabase, request, askable)
    return { outcome: "requested", requestId: request.id, accountName: org.name, expiresAt }
  }
  // Nobody to ask: fall back right away.
  const settled = await settleWithoutAnswer(supabase, request)
  return settled.status === "published_default"
    ? { outcome: "published_default", requestId: request.id, eventId: settled.eventId }
    : { outcome: "team_review", requestId: request.id, eventId: settled.eventId }
}

/** Fallback for a request nobody answered (or nobody could be asked for). */
async function settleWithoutAnswer(
  supabase: Db, request: EventRequestRow,
): Promise<{ status: "published_default" | "team_review"; eventId: string }> {
  const fallback = await defaultAccount(supabase)
  if (!fallback) throw new Error("[event-requests] no default account configured")
  const status = request.trusted ? "published_default" : "team_review"
  const note = request.organizer_name ? `Veranstalter: ${request.organizer_name}` : null
  const eventId = await insertEvent(supabase, request, fallback, request.trusted ? "approved" : "pending", note)
  const { error } = await supabase.from("event_requests")
    .update({ status, event_id: eventId, decided_at: new Date().toISOString() })
    .eq("id", request.id).eq("status", "pending_org")
  if (error) console.error("[event-requests] settle:", error.message)
  return { status, eventId }
}

/** Hourly: requests whose two days are over. Each one is claimed before it is published. */
export async function settleExpiredRequests(limit = 25): Promise<{ due: number; published: number; review: number; failed: number }> {
  const supabase = db()
  const { data, error } = await supabase.from("event_requests").select("*")
    .eq("status", "pending_org").lte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true }).limit(limit)
  if (error) throw new Error(`[event-requests] expired: ${error.message}`)
  const due = (data ?? []) as EventRequestRow[]
  const today = new Date().toISOString().slice(0, 10)
  let published = 0, review = 0, failed = 0
  for (const request of due) {
    try {
      if (request.date < today) {
        // The event is over: nothing to list any more.
        await supabase.from("event_requests").update({ status: "rejected", decided_at: new Date().toISOString() })
          .eq("id", request.id).eq("status", "pending_org")
        continue
      }
      const settled = await settleWithoutAnswer(supabase, request)
      if (settled.status === "published_default") published++
      else review++
    } catch (err) {
      console.error("[event-requests] settle failed:", request.id, err)
      failed++
    }
  }
  return { due: due.length, published, review, failed }
}

export interface RequestView {
  id: string
  status: EventRequestStatus
  title: string
  description: string
  date: string
  time: string | null
  location: string
  category: string | null
  imageUrl: string | null
  websiteUrl: string | null
  organizerName: string | null
  accountName: string | null
  source: "forward" | "crawl"
  sourceUrl: string | null
  expiresAt: string
  eventId: string | null
  canDecide: boolean
}

/** The request as an owner or admin of its organisation sees it; null for everyone else. */
export async function getRequestFor(requestId: string, wallet: string): Promise<RequestView | null> {
  const supabase = db()
  const { data, error } = await supabase.from("event_requests").select("*").eq("id", requestId).maybeSingle()
  if (error) throw new Error(`[event-requests] get: ${error.message}`)
  const request = data as EventRequestRow | null
  if (!request || !request.account_id) return null
  if (!(await deciders(supabase, request.account_id)).includes(wallet.toLowerCase())) return null
  const { data: account } = await supabase.from("accounts").select("name").eq("id", request.account_id).maybeSingle()
  return {
    id: request.id, status: request.status, title: request.title, description: request.description,
    date: request.date, time: request.time ? request.time.slice(0, 5) : null, location: request.location,
    category: request.category, imageUrl: request.image_url, websiteUrl: request.website_url,
    organizerName: request.organizer_name, accountName: (account as { name: string } | null)?.name ?? null,
    source: request.source, sourceUrl: request.source_url, expiresAt: request.expires_at,
    eventId: request.event_id, canDecide: request.status === "pending_org",
  }
}

export interface DecisionEdits {
  title?: string
  description?: string
  date?: string
  time?: string | null
  location?: string
}

export type DecisionResult =
  | { ok: true; status: "published_org"; eventId: string }
  | { ok: true; status: "rejected" }
  | { ok: false; code: "not_found" | "already_decided" | "invalid"; message: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

/** Publish (optionally with corrections) or decline. Only owners and admins of the organisation. */
export async function decideRequest(
  requestId: string, wallet: string, decision: "publish" | "reject", edits: DecisionEdits = {},
): Promise<DecisionResult> {
  const supabase = db()
  const { data, error } = await supabase.from("event_requests").select("*").eq("id", requestId).maybeSingle()
  if (error) throw new Error(`[event-requests] decide: ${error.message}`)
  const request = data as EventRequestRow | null
  if (!request || !request.account_id || !(await deciders(supabase, request.account_id)).includes(wallet.toLowerCase())) {
    return { ok: false, code: "not_found", message: "Diese Anfrage gibt es nicht." }
  }
  if (request.status !== "pending_org") {
    return { ok: false, code: "already_decided", message: "Über diese Anfrage wurde schon entschieden." }
  }

  const stamp = { decided_at: new Date().toISOString(), decided_by_wallet: wallet.toLowerCase() }
  if (decision === "reject") {
    const { data: claimed } = await supabase.from("event_requests").update({ status: "rejected", ...stamp })
      .eq("id", requestId).eq("status", "pending_org").select("id")
    if (!claimed?.length) return { ok: false, code: "already_decided", message: "Über diese Anfrage wurde schon entschieden." }
    return { ok: true, status: "rejected" }
  }

  const title = (edits.title ?? request.title).trim()
  const location = (edits.location ?? request.location).trim()
  const date = (edits.date ?? request.date).trim()
  const time = edits.time === undefined ? request.time : edits.time?.trim() || null
  if (title.length < 2 || title.length > 150) return { ok: false, code: "invalid", message: "Bitte gib einen Titel an." }
  if (location.length < 2) return { ok: false, code: "invalid", message: "Bitte gib einen Ort an." }
  if (!DATE_RE.test(date) || date < new Date().toISOString().slice(0, 10)) {
    return { ok: false, code: "invalid", message: "Das Datum liegt in der Vergangenheit oder ist ungültig." }
  }
  if (time && !TIME_RE.test(time.slice(0, 5))) return { ok: false, code: "invalid", message: "Bitte gib die Uhrzeit als HH:MM an." }

  // Claim first so a double tap or the hourly fallback cannot publish it twice.
  const { data: claimed } = await supabase.from("event_requests").update({ status: "published_org", ...stamp })
    .eq("id", requestId).eq("status", "pending_org").select("id")
  if (!claimed?.length) return { ok: false, code: "already_decided", message: "Über diese Anfrage wurde schon entschieden." }

  try {
    const { data: account } = await supabase.from("accounts").select("id, name, contact_email").eq("id", request.account_id).maybeSingle()
    if (!account) throw new Error("organisation missing")
    const eventId = await insertEvent(
      supabase,
      { ...request, title, location, date, time: time ? time.slice(0, 5) : null, description: (edits.description ?? request.description).trim() },
      account as { id: string; name: string; contact_email: string | null }, "approved", null,
    )
    await supabase.from("event_requests").update({ event_id: eventId }).eq("id", requestId)
    return { ok: true, status: "published_org", eventId }
  } catch (err) {
    // Give the request back so it can be decided again (or falls back on time).
    await supabase.from("event_requests").update({ status: "pending_org", decided_at: null, decided_by_wallet: null }).eq("id", requestId)
    throw err
  }
}

/** Open requests for the organisations this wallet may decide for. */
export async function listOpenRequestsFor(wallet: string): Promise<RequestView[]> {
  const supabase = db()
  const { data: owned } = await supabase.from("account_owners").select("account_id, role").eq("wallet_address", wallet.toLowerCase())
  const accountIds = ((owned ?? []) as { account_id: string; role: string }[])
    .filter((o) => o.role === "owner" || o.role === "admin").map((o) => o.account_id)
  if (accountIds.length === 0) return []
  const { data, error } = await supabase.from("event_requests").select("id")
    .in("account_id", accountIds).eq("status", "pending_org").order("date", { ascending: true }).limit(50)
  if (error) throw new Error(`[event-requests] list: ${error.message}`)
  const views = await Promise.all(((data ?? []) as { id: string }[]).map((r) => getRequestFor(r.id, wallet)))
  return views.filter((v): v is RequestView => v !== null)
}
