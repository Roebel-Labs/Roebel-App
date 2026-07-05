import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/miniapp/http"
import { createAdminClient } from "@/lib/supabase/admin"
import { resend, EMAIL_CONFIG } from "@/lib/resend"
import { renderNewsletterEmail } from "@/lib/newsletter/template"

export const runtime = "nodejs"
export const maxDuration = 300

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"
const BATCH_SIZE = 100

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  if (!resend) return NextResponse.json({ error: "Resend nicht konfiguriert" }, { status: 500 })

  const { issueId, retryFailedOnly } = (await req.json()) as {
    issueId?: string
    retryFailedOnly?: boolean
  }
  if (!issueId) return NextResponse.json({ error: "issueId fehlt" }, { status: 400 })

  const supabase = createAdminClient()
  const { data: issue } = await supabase
    .from("newsletter_issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle()
  if (!issue) return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 })
  if (!issue.subject?.trim()) return NextResponse.json({ error: "Betreff fehlt" }, { status: 400 })

  // Lock: draft → sending (normal send) / sent|failed → sending (retry).
  const fromStatuses = retryFailedOnly ? ["sent", "failed"] : ["draft"]
  const { data: locked } = await supabase
    .from("newsletter_issues")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", issueId)
    .in("status", fromStatuses)
    .select("id")
  if (!locked?.length) {
    return NextResponse.json(
      { error: retryFailedOnly ? "Kein erneuter Versand möglich." : "Ausgabe ist kein Entwurf (läuft der Versand bereits?)" },
      { status: 409 }
    )
  }

  try {
    // Build the recipient list.
    let recipients: Array<{ sendId: string; subscriberId: string; email: string; unsubscribeToken: string }> = []

    if (retryFailedOnly) {
      const { data: failedSends } = await supabase
        .from("newsletter_sends")
        .select("id, subscriber_id, email, newsletter_subscribers(unsubscribe_token, status)")
        .eq("issue_id", issueId)
        // 'queued' mit einschließen: Zeilen, deren Status-Update nach dem Versand fehlschlug
        // oder die nie dispatched wurden. Dank Idempotency-Key ist ein erneuter Versand
        // derselben Batch-Zusammensetzung dedupliziert.
        .in("status", ["failed", "queued"])
      recipients = (failedSends ?? [])
        .filter((s: any) => s.newsletter_subscribers?.status === "active")
        .map((s: any) => ({
          sendId: s.id,
          subscriberId: s.subscriber_id,
          email: s.email,
          unsubscribeToken: s.newsletter_subscribers.unsubscribe_token,
        }))
    } else {
      const { data: subscribers } = await supabase
        .from("newsletter_subscribers")
        .select("id, email, unsubscribe_token")
        .eq("status", "active")
      const subs = subscribers ?? []
      if (subs.length === 0) {
        await supabase
          .from("newsletter_issues")
          .update({ status: "draft", updated_at: new Date().toISOString() })
          .eq("id", issueId)
        return NextResponse.json({ error: "Keine aktiven Abonnenten." }, { status: 400 })
      }
      const rows = subs.map((s) => ({ issue_id: issueId, subscriber_id: s.id, email: s.email }))
      const { data: sendRows, error: insertError } = await supabase
        .from("newsletter_sends")
        .upsert(rows, { onConflict: "issue_id,subscriber_id", ignoreDuplicates: true })
        .select("id, subscriber_id, email")
      if (insertError) throw insertError
      const tokenBySubscriber = new Map(subs.map((s) => [s.id, s.unsubscribe_token]))
      recipients = (sendRows ?? []).map((r) => ({
        sendId: r.id,
        subscriberId: r.subscriber_id,
        email: r.email,
        unsubscribeToken: tokenBySubscriber.get(r.subscriber_id)!,
      }))
    }

    // Deterministische Reihenfolge → stabile Idempotency-Keys bei Retries
    recipients.sort((a, b) => (a.sendId < b.sendId ? -1 : 1))

    let sent = 0
    let failed = 0

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)
      const payloads = batch.map((r) => {
        const unsubscribeUrl = `${BASE_URL}/newsletter/abmelden?token=${r.unsubscribeToken}`
        const oneClickUrl = `${BASE_URL}/api/newsletter/unsubscribe?token=${r.unsubscribeToken}`
        return {
          from: EMAIL_CONFIG.fromNewsletter,
          to: r.email,
          replyTo: EMAIL_CONFIG.replyTo,
          subject: issue.subject,
          html: renderNewsletterEmail({
            subject: issue.subject,
            preheader: issue.preheader,
            contentHtml: issue.content_html,
            unsubscribeUrl,
          }),
          headers: {
            "List-Unsubscribe": `<${oneClickUrl}>, <mailto:${EMAIL_CONFIG.replyTo}?subject=Newsletter%20abbestellen>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      })

      const idempotencyKey = `newsletter/${issueId}/${crypto
        .createHash("sha256")
        .update(batch.map((r) => r.sendId).join(","))
        .digest("hex")
        .slice(0, 32)}`

      try {
        const { data, error } = await resend.batch.send(payloads, { idempotencyKey })
        if (error) throw error
        const ids: Array<{ id: string }> = (data as any)?.data ?? []
        const updateResults = await Promise.all(
          batch.map((r, idx) =>
            supabase
              .from("newsletter_sends")
              .update({ status: "sent", resend_id: ids[idx]?.id ?? null })
              .eq("id", r.sendId)
          )
        )
        updateResults.forEach((res, idx) => {
          if (res.error) {
            console.error(
              `[Newsletter] send-row update failed (bleibt 'queued', wird beim Retry erneut versucht): sendId=${batch[idx].sendId} resendId=${ids[idx]?.id}`,
              res.error
            )
          }
        })
        sent += batch.length
      } catch (batchError) {
        console.error("[Newsletter] batch failed:", batchError)
        const updateResults = await Promise.all(
          batch.map((r) =>
            supabase.from("newsletter_sends").update({ status: "failed" }).eq("id", r.sendId)
          )
        )
        updateResults.forEach((res, idx) => {
          if (res.error) {
            console.error(
              `[Newsletter] send-row update failed (bleibt 'queued', wird beim Retry erneut versucht): sendId=${batch[idx].sendId}`,
              res.error
            )
          }
        })
        failed += batch.length
      }
      if (i + BATCH_SIZE < recipients.length) await sleep(600) // Resend ~2 req/s
    }

    const finalStatus = sent === 0 && failed > 0 ? "failed" : "sent"
    await supabase
      .from("newsletter_issues")
      .update({
        status: finalStatus,
        recipient_count: retryFailedOnly ? issue.recipient_count : recipients.length,
        sent_at: issue.sent_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", issueId)

    return NextResponse.json({ sent, failed })
  } catch (error) {
    console.error("[Newsletter] send pipeline error:", error)
    await supabase
      .from("newsletter_issues")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", issueId)
    return NextResponse.json({ error: "Versand fehlgeschlagen" }, { status: 500 })
  }
}
