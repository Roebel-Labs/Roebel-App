import { NextResponse } from "next/server";
import { z } from "zod";
import { accountOwnsEvent, resolveActor } from "@/lib/poster/auth";
import { proposePosters, PosterServiceError } from "@/lib/poster/service";

export const runtime = "nodejs";
export const maxDuration = 300;

const draftSchema = z.object({
  title: z.string().min(1),
  date: z.string().nullish(),
  time: z.string().nullish(),
  end_time: z.string().nullish(),
  location: z.string().nullish(),
  category: z.string().nullish(),
  ticket_price: z.union([z.number(), z.string()]).nullish(),
  organizer_name: z.string().nullish(),
  description: z.string().nullish(),
  website_url: z.string().nullish(),
  image_url: z.string().nullish(),
});

const bodySchema = z.object({
  eventId: z.string().uuid().optional(),
  draftId: z.string().uuid().optional(),
  draft: draftSchema.optional(),
  accountId: z.string().uuid().optional(),
  wallet: z.string().optional(),
  hint: z.string().max(400).optional(),
});

async function run(fn: () => ReturnType<typeof proposePosters>) {
  try {
    const result = await fn();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[api/posters/propose]", error);
    if (error instanceof PosterServiceError) {
      const status = error.code === "caps" ? 429 : error.code === "not_found" ? 404 : 502;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    return NextResponse.json({ success: false, error: "Vorschläge konnten nicht erzeugt werden." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Ungültige Anfrage" }, { status: 400 });
  const body = parsed.data;

  if (body.eventId) {
    const eventId = body.eventId;
    const actor = await resolveActor(req, body, "org");
    if (!actor) return NextResponse.json({ success: false, error: "Nicht berechtigt" }, { status: 401 });
    if (actor.requestedBy !== "admin" && !(await accountOwnsEvent(actor.accountId, eventId))) {
      return NextResponse.json({ success: false, error: "Keine Berechtigung für diese Veranstaltung" }, { status: 403 });
    }
    return run(() =>
      proposePosters(
        { kind: "event", eventId },
        {
          requestedBy: actor.requestedBy,
          accountId: actor.requestedBy === "admin" ? null : actor.accountId,
          hint: body.hint,
        },
      ),
    );
  }

  if (body.draftId && body.draft) {
    const { draftId, draft } = body;
    const actor = await resolveActor(req, body, "submitter");
    if (!actor) return NextResponse.json({ success: false, error: "Nicht berechtigt" }, { status: 401 });
    return run(() =>
      proposePosters(
        { kind: "draft", draftId, draft },
        {
          requestedBy: actor.requestedBy,
          accountId: actor.requestedBy === "admin" ? null : actor.accountId,
          hint: body.hint,
        },
      ),
    );
  }

  return NextResponse.json({ success: false, error: "eventId oder draftId + draft erforderlich" }, { status: 400 });
}
