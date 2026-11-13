import { NextResponse } from "next/server";
import { createCode, redeemCode } from "@/lib/chat/agent/channels";
import { agentAddress, mailEnabled, sendMail } from "@/lib/chat/agent/mail";
import { agentBot, getAgentProfile, patchProfileRaw } from "@/lib/chat/agent/profile";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** POST /api/chat/agent/email — {email}: sends a six-digit code to that address. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  if (!mailEnabled()) return badRequest("E-Mail ist noch nicht eingerichtet.");
  const input = await readJson(request);
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 200) return badRequest("Das ist keine gültige E-Mail-Adresse.");
  try {
    const profile = await getAgentProfile(wallet);
    const from = agentAddress(profile);
    if (!from) return badRequest("E-Mail ist noch nicht eingerichtet.");
    const bot = await agentBot(profile);
    const { code } = await createCode(wallet, "email", email);
    const ok = await sendMail({
      fromName: profile.name || bot.name, fromAddress: from, to: email, subject: `Dein Code: ${code}`,
      markdown: `Hallo,\n\ndein Code für Ortis lautet **${code}**. Er gilt 15 Minuten.\n\nWenn du das nicht angefordert hast, kannst du diese Mail ignorieren.`,
    });
    if (!ok) return badRequest("Die Mail konnte nicht gesendet werden. Bitte versuch es später noch einmal.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "agent/email");
  }
}

/** PUT /api/chat/agent/email — {code}: confirms the address the assistant answers to. */
export async function PUT(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  const code = typeof input?.code === "string" ? input.code.trim() : "";
  try {
    const hit = await redeemCode(code, "email");
    if (!hit || hit.wallet !== wallet || !hit.address) return badRequest("Der Code stimmt nicht oder ist abgelaufen.");
    await getAgentProfile(wallet);
    await patchProfileRaw(wallet, { owner_email: hit.address, owner_email_verified_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, ownerEmail: hit.address });
  } catch (err) {
    return handleError(err, "agent/email");
  }
}
