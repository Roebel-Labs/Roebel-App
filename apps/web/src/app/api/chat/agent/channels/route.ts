import { NextResponse } from "next/server";
import { MAX_PHONE_CHANNELS, channelNumber, createCode, deleteChannel, listChannels } from "@/lib/chat/agent/channels";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/agent/channels — {kind: 'sms' | 'whatsapp'} → {code, expiresAt, number, link}.
 * The person texts the code to the number; the webhook then binds their phone.
 */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  const kind = input?.kind === "sms" || input?.kind === "whatsapp" ? input.kind : null;
  if (!kind) return badRequest("Unbekannter Kanal.");
  const number = channelNumber(kind);
  if (!number) return badRequest(kind === "sms" ? "SMS ist noch nicht eingerichtet." : "WhatsApp ist noch nicht eingerichtet.");
  try {
    if ((await listChannels(wallet)).length >= MAX_PHONE_CHANNELS) return badRequest(`Du kannst höchstens ${MAX_PHONE_CHANNELS} Telefone verbinden. Trenn zuerst eines.`);
    const { code, expiresAt } = await createCode(wallet, kind);
    const link = kind === "sms" ? `sms:${number}?&body=${code}` : `https://wa.me/${number.slice(1)}?text=${code}`;
    return NextResponse.json({ code, expiresAt, number, link });
  } catch (err) {
    return handleError(err, "agent/channels");
  }
}

/** DELETE /api/chat/agent/channels?id=<uuid> → {ok}. */
export async function DELETE(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    if (!(await deleteChannel(wallet, new URL(request.url).searchParams.get("id") ?? ""))) return notFound("Die Verbindung");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "agent/channels");
  }
}
