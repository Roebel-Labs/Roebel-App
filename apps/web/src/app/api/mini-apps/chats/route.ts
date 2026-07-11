// /api/mini-apps/chats — server-side editor chat history.
//   GET    ?limit=  → { chats: EditorChatMeta[] } (own + shared-with-me)
//   POST   { id?, session, appSlug?, title? } → { chat } (create or update)
//   DELETE ?id=     → owner-only hard delete
// Auth: existing builder wallet tier (x-wallet-address / wallet field).
import { NextResponse } from "next/server";
import { listChats, upsertChat, deleteChat } from "@/lib/miniapp/chats";
import { jsonError, getParam, resolveDeveloper } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dev = await resolveDeveloper(req);
    const limit = Math.min(Number(getParam(req, "limit") ?? "30") || 30, 100);
    const chats = await listChats(dev.id, dev.wallet, limit);
    return NextResponse.json({ chats });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dev = await resolveDeveloper(req, body);
    const chat = await upsertChat({
      id: typeof body.id === "string" && body.id ? body.id : null,
      developerId: dev.id,
      wallet: dev.wallet,
      session: body.session ?? {},
      appSlug: typeof body.appSlug === "string" ? body.appSlug : null,
      title: typeof body.title === "string" ? body.title : null,
    });
    return NextResponse.json({ chat });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const dev = await resolveDeveloper(req);
    const id = getParam(req, "id");
    if (!id) return NextResponse.json({ error: "id fehlt." }, { status: 400 });
    await deleteChat(id, dev.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
