import { NextResponse } from "next/server";
import { z } from "zod";
import { accountOwnsEvent, resolveActor } from "@/lib/poster/auth";
import { selectProposal } from "@/lib/poster/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  proposalId: z.string().uuid(),
  apply: z.boolean().optional(),
  accountId: z.string().uuid().optional(),
  wallet: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Ungültige Anfrage" }, { status: 400 });
  const body = parsed.data;
  const actor = await resolveActor(req, body, "submitter");
  if (!actor) return NextResponse.json({ success: false, error: "Nicht berechtigt" }, { status: 401 });

  if (actor.requestedBy !== "admin") {
    const admin = createAdminClient();
    const { data: p } = await admin
      .from("event_poster_proposals")
      .select("event_id, account_id")
      .eq("id", body.proposalId)
      .maybeSingle();
    if (!p) return NextResponse.json({ success: false, error: "Vorschlag nicht gefunden" }, { status: 404 });
    const row = p as { event_id: string | null; account_id: string | null };
    const owns = row.event_id
      ? await accountOwnsEvent(actor.accountId, row.event_id)
      : row.account_id === actor.accountId;
    if (!owns) return NextResponse.json({ success: false, error: "Keine Berechtigung" }, { status: 403 });
  }

  const res = await selectProposal(body.proposalId, body.apply ?? false);
  if (!res.ok) return NextResponse.json({ success: false, error: res.error }, { status: 400 });
  return NextResponse.json({ success: true, imageUrl: res.imageUrl, eventId: res.eventId });
}
