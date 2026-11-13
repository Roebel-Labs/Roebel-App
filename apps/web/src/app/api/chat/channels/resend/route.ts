// Inbound mail for the assistants' mailboxes (<alias>@ORTIS_MAIL_DOMAIN).
// Only mail from the person's own verified address, authenticated by its sender
// domain, reaches the assistant; everything else is dropped without an answer.
import { NextResponse, after } from "next/server";
import { firstSight, runChannelTurn } from "@/lib/chat/agent/channels";
import { fetchReceivedMail, mailDomain, mailEnabled, sendAgentMail, verifySvix } from "@/lib/chat/agent/mail";
import { profileByAlias } from "@/lib/chat/agent/profile";
import { htmlToText, ownText, scrubSecrets } from "@/lib/chat/persona/classify";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface Received { type?: string; data?: { email_id?: string; from?: string; to?: string[]; received_for?: string[]; subject?: string; message_id?: string } }

export async function POST(request: Request) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET ?? process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !mailEnabled()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const payload = await request.text();
  const ok = verifySvix(secret, request.headers.get("svix-id") ?? "", request.headers.get("svix-timestamp") ?? "", payload, request.headers.get("svix-signature") ?? "");
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  let event: Received;
  try { event = JSON.parse(payload) as Received; } catch { return NextResponse.json({ ok: true }); }
  const id = event.data?.email_id;
  if (event.type !== "email.received" || !id) return NextResponse.json({ ok: true });
  if (!(await firstSight(`resend:${id}`))) return NextResponse.json({ ok: true });

  const domain = mailDomain();
  const aliases = [...(event.data?.to ?? []), ...(event.data?.received_for ?? [])]
    .map((a) => (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/.exec(a)?.[0] ?? "").toLowerCase())
    .filter((a) => a.endsWith(`@${domain}`)).map((a) => a.split("@")[0]);

  after(async () => {
    try {
      const profile = (await Promise.all([...new Set(aliases)].slice(0, 3).map(profileByAlias))).find(Boolean);
      if (!profile?.owner_email || !profile.owner_email_verified_at) return;
      const mail = await fetchReceivedMail(id);
      // Not from the owner, or not authenticated by the sender's domain: silently ignored.
      if (!mail || mail.from !== profile.owner_email.toLowerCase() || !mail.authenticated) return;
      const body = scrubSecrets(ownText(mail.text || htmlToText(mail.html ?? ""), 6000));
      if (!body && !mail.subject) return;
      const answer = await runChannelTurn({
        wallet: profile.wallet, channel: "email",
        text: `(Per E-Mail vom Menschen an dich. Betreff: „${mail.subject.slice(0, 160)}“)\n\n${body}`,
      });
      await sendAgentMail(profile.wallet, {
        subject: /^re:/i.test(mail.subject) ? mail.subject : `Re: ${mail.subject || "deine Nachricht"}`,
        markdown: answer, inReplyTo: mail.messageId ?? event.data?.message_id ?? null,
      });
    } catch (err) {
      console.error("[api/chat/channels/resend]", err);
    }
  });
  return NextResponse.json({ ok: true });
}
