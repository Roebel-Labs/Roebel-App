import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  payload: string,
  svixSignature: string
): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(`${svixId}.${svixTimestamp}.${payload}`)
    .digest("base64")
  const expectedBuf = Buffer.from(expected)
  return svixSignature.split(" ").some((part) => {
    const sig = part.split(",")[1]
    if (!sig) return false
    const sigBuf = Buffer.from(sig)
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
  })
}

type ResendEvent = {
  type: string
  data: { email_id?: string }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error("[Newsletter] RESEND_WEBHOOK_SECRET not set")
    return NextResponse.json({ error: "not configured" }, { status: 500 })
  }

  const payload = await req.text()
  const svixId = req.headers.get("svix-id") ?? ""
  const svixTimestamp = req.headers.get("svix-timestamp") ?? ""
  const svixSignature = req.headers.get("svix-signature") ?? ""

  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return NextResponse.json({ error: "stale timestamp" }, { status: 401 })
  }

  if (!verifySvixSignature(secret, svixId, svixTimestamp, payload, svixSignature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 })
  }

  const event = JSON.parse(payload) as ResendEvent
  const emailId = event.data?.email_id
  if (!emailId) return NextResponse.json({ ok: true })

  const supabase = createAdminClient()
  const { data: send } = await supabase
    .from("newsletter_sends")
    .select("id, issue_id, subscriber_id, status, opened_at, clicked_at")
    .eq("resend_id", emailId)
    .maybeSingle()
  // Not one of ours (other product emails share the Resend account) → ack.
  if (!send) return NextResponse.json({ ok: true })

  const now = new Date().toISOString()

  switch (event.type) {
    case "email.delivered": {
      if (send.status === "sent" || send.status === "queued") {
        await supabase.from("newsletter_sends").update({ status: "delivered" }).eq("id", send.id)
        await supabase.rpc("newsletter_bump_counter", { p_issue_id: send.issue_id, p_counter: "delivered_count" })
      }
      break
    }
    case "email.opened": {
      if (!send.opened_at) {
        await supabase.from("newsletter_sends").update({ opened_at: now }).eq("id", send.id)
        await supabase.rpc("newsletter_bump_counter", { p_issue_id: send.issue_id, p_counter: "opened_count" })
      }
      break
    }
    case "email.clicked": {
      if (!send.clicked_at) {
        await supabase.from("newsletter_sends").update({ clicked_at: now }).eq("id", send.id)
        await supabase.rpc("newsletter_bump_counter", { p_issue_id: send.issue_id, p_counter: "clicked_count" })
      }
      break
    }
    case "email.bounced": {
      if (send.status !== "bounced") {
        await supabase.from("newsletter_sends").update({ status: "bounced" }).eq("id", send.id)
        await supabase.rpc("newsletter_bump_counter", { p_issue_id: send.issue_id, p_counter: "bounced_count" })
        await supabase
          .from("newsletter_subscribers")
          .update({ status: "bounced", updated_at: now })
          .eq("id", send.subscriber_id)
      }
      break
    }
    case "email.complained": {
      await supabase.from("newsletter_sends").update({ status: "complained" }).eq("id", send.id)
      await supabase
        .from("newsletter_subscribers")
        .update({ status: "complained", updated_at: now })
        .eq("id", send.subscriber_id)
      break
    }
  }

  return NextResponse.json({ ok: true })
}
