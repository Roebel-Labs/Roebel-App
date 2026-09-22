import { NextResponse } from "next/server";
import { z } from "zod";
import { accountOwnsEvent, resolveActor } from "@/lib/poster/auth";
import { linkDraftProposals } from "@/lib/poster/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  draftId: z.string().uuid(),
  eventId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
  wallet: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Ungültige Anfrage" }, { status: 400 });
  const body = parsed.data;
  const actor = await resolveActor(req, body, "submitter");
  if (!actor) return NextResponse.json({ success: false, error: "Nicht berechtigt" }, { status: 401 });
  if (actor.requestedBy !== "admin" && !(await accountOwnsEvent(actor.accountId, body.eventId))) {
    return NextResponse.json({ success: false, error: "Keine Berechtigung" }, { status: 403 });
  }
  const res = await linkDraftProposals(body.draftId, body.eventId);
  return NextResponse.json({ success: res.ok, linked: res.linked }, { status: res.ok ? 200 : 400 });
}
