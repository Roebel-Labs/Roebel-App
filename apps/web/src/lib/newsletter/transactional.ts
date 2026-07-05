import { resend, EMAIL_CONFIG } from "@/lib/resend"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"

function simpleEmailHtml(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f3f4f6;">
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" style="width:100%;max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border-collapse:collapse;">
<tr><td style="background:#00498B;padding:20px 28px;font-size:17px;font-weight:700;color:#ffffff;">Röbel App</td></tr>
<tr><td style="padding:28px;">
  <h1 style="font-size:20px;color:#111827;margin:0 0 12px;">${heading}</h1>
  ${bodyHtml}
</td></tr>
<tr><td style="padding:20px 28px;background:#f9fafb;border-top:1px solid #E5E7EB;font-size:12px;color:#6B7280;">
  <a href="${BASE_URL}/impressum" style="color:#6B7280;">Impressum</a> · <a href="${BASE_URL}/datenschutz" style="color:#6B7280;">Datenschutz</a>
</td></tr></table></td></tr></table></body></html>`
}

const CONFIRM_BUTTON = (url: string) =>
  `<a href="${url}" style="display:inline-block;background:#00498B;color:#ffffff;font-size:15px;font-weight:600;padding:12px 24px;border-radius:10px;text-decoration:none;margin:8px 0 16px;">Anmeldung bestätigen</a>`

/** Builds the invite-variant subject+html so `inviteAppUsers` can batch-send
 *  without going through the single-send `sendConfirmationEmail` per recipient. */
export function buildInviteEmail(confirmToken: string): { subject: string; html: string } {
  const url = `${BASE_URL}/newsletter/bestaetigen?token=${confirmToken}`
  const intro = `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Moin! Du nutzt die Röbel App — ab jetzt gibt es auch einen wöchentlichen Newsletter mit allem, was in Röbel passiert: Neuigkeiten, Veranstaltungen, Abstimmungen und mehr.</p>`
  return {
    subject: "Der Röbel-Newsletter ist da — möchtest du dabei sein?",
    html: simpleEmailHtml(
      "Der Röbel-Newsletter ist da",
      `${intro}${CONFIRM_BUTTON(url)}<p style="font-size:13px;line-height:1.6;color:#6B7280;margin:0;">Wenn du das nicht warst, kannst du diese E-Mail einfach ignorieren — ohne Bestätigung bekommst du keinen Newsletter.</p>`
    ),
  }
}

export async function sendConfirmationEmail(
  email: string,
  confirmToken: string,
  kind: "signup" | "invite"
): Promise<boolean> {
  if (!resend) return false
  const url = `${BASE_URL}/newsletter/bestaetigen?token=${confirmToken}`
  if (kind === "invite") {
    const { subject, html } = buildInviteEmail(confirmToken)
    const { error } = await resend.emails.send({
      from: EMAIL_CONFIG.fromNewsletter,
      to: email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject,
      html,
    })
    if (error) console.error("[Newsletter] Confirmation email failed:", error)
    return !error
  }
  const intro = `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Moin! Nur noch ein Klick, dann bekommst du jede Woche die wichtigsten Neuigkeiten aus Röbel/Müritz direkt ins Postfach.</p>`
  const { error } = await resend.emails.send({
    from: EMAIL_CONFIG.fromNewsletter,
    to: email,
    replyTo: EMAIL_CONFIG.replyTo,
    subject: "Bitte bestätige deine Newsletter-Anmeldung",
    html: simpleEmailHtml(
      "Fast geschafft!",
      `${intro}${CONFIRM_BUTTON(url)}<p style="font-size:13px;line-height:1.6;color:#6B7280;margin:0;">Wenn du das nicht warst, kannst du diese E-Mail einfach ignorieren — ohne Bestätigung bekommst du keinen Newsletter.</p>`
    ),
  })
  if (error) console.error("[Newsletter] Confirmation email failed:", error)
  return !error
}

export async function sendDraftReadyEmail(issueId: string, subject: string): Promise<boolean> {
  if (!resend) return false
  const adminEmail = process.env.NEWSLETTER_ADMIN_EMAIL || EMAIL_CONFIG.replyTo
  const url = `${BASE_URL}/admin/dashboard/newsletter/${issueId}`
  const { error } = await resend.emails.send({
    from: EMAIL_CONFIG.fromNewsletter,
    to: adminEmail,
    subject: `Newsletter-Entwurf bereit: ${subject}`,
    html: simpleEmailHtml(
      "Der Wochen-Entwurf ist fertig",
      `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Die KI hat den Newsletter-Entwurf für diese Woche erstellt. Prüfen, bei Bedarf anpassen — und dann senden.</p>
       <a href="${url}" style="display:inline-block;background:#00498B;color:#ffffff;font-size:15px;font-weight:600;padding:12px 24px;border-radius:10px;text-decoration:none;">Entwurf öffnen</a>`
    ),
  })
  if (error) console.error("[Newsletter] Draft-ready email failed:", error)
  return !error
}
