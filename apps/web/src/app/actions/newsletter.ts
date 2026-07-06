"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAuthenticated } from "@/lib/auth/session"
import { resend, EMAIL_CONFIG } from "@/lib/resend"
import { renderNewsletterEmail } from "@/lib/newsletter/template"
import { sendConfirmationEmail, buildInviteEmail } from "@/lib/newsletter/transactional"
import {
  generateNewsletterDraft,
  regenerateIssueContent,
  editIssueContentWithAI,
} from "@/lib/newsletter/generate"
import { sanitizeNewsletterHtml } from "@/lib/newsletter/sanitize"
import type { NewsletterIssue, NewsletterSubscriber } from "@/lib/newsletter/types"

export type { NewsletterIssue, NewsletterSubscriber }

const ADMIN_PATH = "/admin/dashboard/newsletter"
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

async function guard(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Nicht autorisiert")
}

// ---------- Issues ----------

export async function listIssues(): Promise<NewsletterIssue[]> {
  await guard()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("newsletter_issues")
    .select("*")
    .order("created_at", { ascending: false })
  return (data as NewsletterIssue[]) ?? []
}

export async function getIssue(id: string): Promise<NewsletterIssue | null> {
  await guard()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("newsletter_issues")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  return (data as NewsletterIssue) ?? null
}

export async function createBlankIssue(): Promise<{ success: boolean; issueId?: string }> {
  await guard()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("newsletter_issues")
    .insert({ subject: "", content_html: "", status: "draft", generated_by: "manual" })
    .select("id")
    .single()
  revalidatePath(ADMIN_PATH)
  return { success: !error, issueId: data?.id }
}

export async function updateIssue(
  id: string,
  fields: { subject: string; preheader: string; content_html: string; hero_image_url?: string | null }
): Promise<{ success: boolean; message: string }> {
  await guard()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("newsletter_issues")
    .update({
      ...fields,
      content_html: sanitizeNewsletterHtml(fields.content_html),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id")
  revalidatePath(ADMIN_PATH)
  if (error || !data?.length) {
    return { success: false, message: "Speichern fehlgeschlagen (nur Entwürfe sind editierbar)." }
  }
  return { success: true, message: "Gespeichert." }
}

export async function deleteIssue(id: string): Promise<{ success: boolean; message: string }> {
  await guard()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("newsletter_issues")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .select("id")
  revalidatePath(ADMIN_PATH)
  if (error || !data?.length) return { success: false, message: "Nur Entwürfe können gelöscht werden." }
  return { success: true, message: "Entwurf gelöscht." }
}

export async function generateDraftNow(): Promise<{ success: boolean; message: string; issueId?: string }> {
  await guard()
  try {
    const result = await generateNewsletterDraft({ force: true })
    revalidatePath(ADMIN_PATH)
    if (!result.created) return { success: false, message: result.reason ?? "Keine Inhalte gefunden." }
    return { success: true, message: "Entwurf erstellt.", issueId: result.issueId }
  } catch (err) {
    console.error("[Newsletter] generateDraftNow failed:", err)
    return { success: false, message: "KI-Generierung fehlgeschlagen. Bitte erneut versuchen." }
  }
}

export async function regenerateDraft(issueId: string): Promise<{ success: boolean; message: string }> {
  await guard()
  try {
    const result = await regenerateIssueContent(issueId)
    revalidatePath(ADMIN_PATH)
    return result
  } catch (err) {
    console.error("[Newsletter] regenerateDraft failed:", err)
    return { success: false, message: "KI-Generierung fehlgeschlagen. Bitte erneut versuchen." }
  }
}

export async function editDraftWithAI(
  issueId: string,
  instruction: string
): Promise<{ success: boolean; message: string }> {
  await guard()
  const trimmed = instruction.trim()
  if (!trimmed) return { success: false, message: "Bitte gib eine Anweisung ein." }
  try {
    const result = await editIssueContentWithAI(issueId, trimmed)
    revalidatePath(ADMIN_PATH)
    return result
  } catch (err) {
    console.error("[Newsletter] editDraftWithAI failed:", err)
    return { success: false, message: "KI-Bearbeitung fehlgeschlagen. Bitte erneut versuchen." }
  }
}

export async function previewIssueEmail(id: string): Promise<string> {
  await guard()
  const issue = await getIssue(id)
  if (!issue) return "<p>Ausgabe nicht gefunden</p>"
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"
  return renderNewsletterEmail({
    heroImageUrl: issue.hero_image_url,
    subject: issue.subject || "(Ohne Betreff)",
    preheader: issue.preheader,
    contentHtml: issue.content_html,
    unsubscribeUrl: `${baseUrl}/newsletter`,
  })
}

export async function sendTestEmail(
  issueId: string,
  to: string
): Promise<{ success: boolean; message: string }> {
  await guard()
  if (!EMAIL_RE.test(to.trim())) return { success: false, message: "Ungültige E-Mail-Adresse." }
  if (!resend) return { success: false, message: "Resend ist nicht konfiguriert." }
  const html = await previewIssueEmail(issueId)
  const issue = await getIssue(issueId)
  const { error } = await resend.emails.send({
    from: EMAIL_CONFIG.fromNewsletter,
    to: to.trim(),
    subject: `[TEST] ${issue?.subject || "Newsletter"}`,
    html,
  })
  if (error) return { success: false, message: "Versand fehlgeschlagen." }
  return { success: true, message: `Test-E-Mail an ${to.trim()} gesendet.` }
}

// ---------- Subscribers ----------

export async function getActiveSubscriberCount(): Promise<number> {
  await guard()
  const supabase = createAdminClient()
  const { count } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
  return count ?? 0
}

export async function getUnsentSendCount(issueId: string): Promise<number> {
  await guard()
  const supabase = createAdminClient()
  const { count } = await supabase
    .from("newsletter_sends")
    .select("id", { count: "exact", head: true })
    .eq("issue_id", issueId)
    .in("status", ["failed", "queued"])
  return count ?? 0
}

export async function listSubscribers(filter?: {
  search?: string
  status?: string
}): Promise<NewsletterSubscriber[]> {
  await guard()
  const supabase = createAdminClient()
  let query = supabase
    .from("newsletter_subscribers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000)
  if (filter?.status && filter.status !== "all") query = query.eq("status", filter.status)
  if (filter?.search) query = query.ilike("email", `%${filter.search.toLowerCase()}%`)
  const { data } = await query
  return (data as NewsletterSubscriber[]) ?? []
}

export async function addSubscriberManually(email: string): Promise<{ success: boolean; message: string }> {
  await guard()
  const normalized = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalized)) return { success: false, message: "Ungültige E-Mail-Adresse." }
  const supabase = createAdminClient()
  const { error } = await supabase.from("newsletter_subscribers").insert({
    email: normalized,
    status: "active",
    source: "admin",
    confirmed_at: new Date().toISOString(),
    consent_note: "Manuell im Admin-Dashboard hinzugefügt",
  })
  revalidatePath(ADMIN_PATH)
  if (error?.code === "23505") return { success: false, message: "Diese Adresse existiert bereits." }
  if (error) return { success: false, message: "Hinzufügen fehlgeschlagen." }
  return { success: true, message: `${normalized} hinzugefügt.` }
}

export async function importSubscribers(
  emails: string[]
): Promise<{ success: boolean; added: number; skipped: number }> {
  await guard()
  const supabase = createAdminClient()
  const valid = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))
  )
  const { data: existing } = await supabase.from("newsletter_subscribers").select("email")
  const existingSet = new Set((existing ?? []).map((r) => r.email))
  const fresh = valid.filter((e) => !existingSet.has(e))
  let added = 0
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500).map((email) => ({
      email,
      status: "active" as const,
      source: "import" as const,
      confirmed_at: new Date().toISOString(),
      consent_note: "CSV-Import (Einwilligung lag laut Import vor)",
    }))
    const { data: inserted, error } = await supabase
      .from("newsletter_subscribers")
      .upsert(chunk, { onConflict: "email", ignoreDuplicates: true })
      .select("id")
    if (error) console.error("[Newsletter] import chunk failed:", error)
    added += inserted?.length ?? 0
  }
  revalidatePath(ADMIN_PATH)
  return { success: true, added, skipped: emails.length - added }
}

export async function setSubscriberUnsubscribed(id: string): Promise<{ success: boolean }> {
  await guard()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  revalidatePath(ADMIN_PATH)
  return { success: !error }
}

export async function deleteSubscriberById(id: string): Promise<{ success: boolean }> {
  await guard()
  const supabase = createAdminClient()
  const { error } = await supabase.from("newsletter_subscribers").delete().eq("id", id)
  revalidatePath(ADMIN_PATH)
  return { success: !error }
}

export async function exportSubscribersCsv(): Promise<string> {
  await guard()
  // Query directly instead of listSubscribers() — that helper caps at 1000 rows,
  // which would silently truncate the export for larger subscriber lists.
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("newsletter_subscribers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50000)
  const subscribers = (data as NewsletterSubscriber[]) ?? []
  // Formel-Injektion in Excel/Sheets verhindern: gefährliche Startzeichen neutralisieren
  const safeCell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
  const header = "email,status,source,created_at"
  const rows = subscribers.map((s) => `${safeCell(s.email)},${s.status},${s.source},${s.created_at}`)
  return [header, ...rows].join("\n")
}

export async function inviteAppUsers(): Promise<{
  success: boolean
  invited: number
  failed: number
  alreadySubscribed: number
}> {
  await guard()
  const supabase = createAdminClient()
  const { data: users } = await supabase
    .from("users")
    .select("wallet_address, email")
    .not("email", "is", null)
    .neq("email", "")
  const { data: subs } = await supabase.from("newsletter_subscribers").select("email")
  const existingSet = new Set((subs ?? []).map((r) => r.email))
  const targets = (users ?? []).filter(
    (u) => u.email && EMAIL_RE.test(u.email) && !existingSet.has(u.email.toLowerCase())
  )

  const rows = targets.map((u) => ({
    email: u.email!.toLowerCase(),
    status: "pending" as const,
    source: "app_user" as const,
    wallet_address: u.wallet_address,
    consent_note: "Einladung an bestehenden App-Nutzer",
  }))

  let invited = 0
  let failed = 0

  if (rows.length > 0 && resend) {
    const { data: created, error: insertError } = await supabase
      .from("newsletter_subscribers")
      .upsert(rows, { onConflict: "email", ignoreDuplicates: true })
      .select("email, confirm_token")
    if (insertError) console.error("[Newsletter] invite insert failed:", insertError)
    const createdRows = created ?? []
    for (let i = 0; i < createdRows.length; i += 100) {
      const chunk = createdRows.slice(i, i + 100)
      const payloads = chunk.map((row) => {
        const { subject, html } = buildInviteEmail(row.confirm_token)
        return { from: EMAIL_CONFIG.fromNewsletter, to: row.email, replyTo: EMAIL_CONFIG.replyTo, subject, html }
      })
      try {
        const { error } = await resend.batch.send(payloads)
        if (error) throw error
        invited += chunk.length
      } catch (err) {
        // Zeilen bleiben 'pending' — ein späterer Re-Run lädt sie NICHT erneut ein
        // (existingSet greift dann bereits). Sichtbar für Admins als "Unbestätigt"
        // in der Abonnenten-Tabelle — das ist der Sichtbarkeits-Mechanismus.
        failed += chunk.length
        console.error("[Newsletter] invite batch failed:", err)
      }
      if (i + 100 < createdRows.length) await new Promise((r) => setTimeout(r, 600)) // Resend ~2 req/s
    }
    failed += rows.length - createdRows.length
  } else if (rows.length > 0) {
    failed += rows.length
    console.error("[Newsletter] invite skipped: Resend nicht konfiguriert")
  }

  revalidatePath(ADMIN_PATH)
  return { success: true, invited, failed, alreadySubscribed: (users?.length ?? 0) - targets.length }
}
