// /api/mini-apps/chats/[id] — one editor chat.
//   GET  [?invite=<token>] → { chat: full row incl. session }. With a valid
//        invite token the caller's wallet is added as collaborator first —
//        this is how an invite link (/editor?chat=<id>&invite=<t>) is redeemed.
//   POST { action: "invite" } → { shareToken } (owner only)
import { NextResponse } from "next/server";
import { getChat, createInvite, joinChat } from "@/lib/miniapp/chats";
import { jsonError, getParam, resolveDeveloper } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const dev = await resolveDeveloper(req);
    const invite = getParam(req, "invite");
    if (invite) await joinChat(id, invite, dev.wallet);
    const row = await getChat(id, dev.id, dev.wallet);
    return NextResponse.json({
      chat: {
        id: row.id,
        title: row.title,
        app_slug: row.app_slug,
        updated_at: row.updated_at,
        session: row.session,
        shared: row.developer_id !== dev.id,
        share_token: row.developer_id === dev.id ? row.share_token : null,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dev = await resolveDeveloper(req, body);
    if (body.action !== "invite") {
      return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
    }
    const shareToken = await createInvite(id, dev.id);
    return NextResponse.json({ shareToken });
  } catch (e) {
    return jsonError(e);
  }
}
