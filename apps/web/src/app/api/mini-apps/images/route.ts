// POST: start a Seedream 4.5 generation (or edit, mode="edit") for an app
// icon, store hero or 1:1 preview. Returns { taskId } — the client polls
// /api/mini-apps/images/status.
// DELETE: remove the icon or a preview slot.
import { NextResponse } from "next/server";
import { jsonError, getParam } from "@/lib/miniapp/http";
import { requireAppAccess } from "@/lib/miniapp/images/access";
import { createImageTask } from "@/lib/miniapp/images/kie";
import {
  buildEditPrompt,
  buildFeaturePrompt,
  buildIconPrompt,
  buildPreviewPrompt,
} from "@/lib/miniapp/images/prompts";
import { MAX_PREVIEWS, removeImageFromApp } from "@/lib/miniapp/images/storage";
import { MiniAppError } from "@/lib/miniapp/types";

export const runtime = "nodejs";

// 20 Generierungen pro App und Tag (Best-Effort, warm-lambda scope) — schützt
// das KIE-Budget während des Hackathons.
const DAILY_LIMIT = 20;
const hits = new Map<string, { count: number; resetAt: number }>();
function limited(appId: string): boolean {
  const now = Date.now();
  const entry = hits.get(appId);
  if (!entry || now > entry.resetAt) {
    hits.set(appId, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > DAILY_LIMIT;
}

type Body = {
  appId?: string;
  kind?: string;
  slot?: number;
  prompt?: string;
  referenceUrl?: string;
  /** "edit": referenceUrl is the CURRENT image, prompt the change request. */
  mode?: string;
  wallet?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const appId = body?.appId ?? "";
    const kind = body?.kind ?? "";
    if (!appId || (kind !== "icon" && kind !== "preview" && kind !== "feature")) {
      throw new MiniAppError(
        "invalid_params",
        "appId und kind (icon|preview|feature) erforderlich.",
      );
    }
    const app = await requireAppAccess(req, appId);

    if (limited(app.id)) {
      throw new MiniAppError(
        "rate_limited",
        "Tageslimit für Bildgenerierung erreicht — versuche es morgen wieder.",
        429,
      );
    }

    const referenceUrl = body?.referenceUrl?.trim();
    if (referenceUrl && !/^https:\/\//.test(referenceUrl)) {
      throw new MiniAppError("invalid_params", "referenceUrl muss eine https-URL sein.");
    }

    const isEdit = body?.mode === "edit";
    if (isEdit && (!referenceUrl || !body?.prompt?.trim())) {
      throw new MiniAppError(
        "invalid_params",
        "Bearbeiten braucht referenceUrl (aktuelles Bild) und prompt (gewünschte Änderung).",
      );
    }

    const prompt = isEdit
      ? buildEditPrompt(app, {
          userPrompt: body?.prompt ?? "",
          kind: kind as "icon" | "feature" | "preview",
        })
      : kind === "icon"
        ? buildIconPrompt(app, body?.prompt)
        : kind === "feature"
          ? buildFeaturePrompt(app, body?.prompt)
          : buildPreviewPrompt(app, {
              userPrompt: body?.prompt,
              hasReference: !!referenceUrl,
            });

    const taskId = await createImageTask({
      prompt,
      referenceUrls: referenceUrl ? [referenceUrl] : [],
      aspectRatio: kind === "feature" ? "16:9" : "1:1",
    });
    return NextResponse.json({ taskId });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const appId = getParam(req, "appId") ?? "";
    const kind = getParam(req, "kind") ?? "";
    const slot = Number(getParam(req, "slot") ?? "-1");
    if (!appId || (kind !== "icon" && kind !== "preview" && kind !== "feature")) {
      throw new MiniAppError(
        "invalid_params",
        "appId und kind (icon|preview|feature) erforderlich.",
      );
    }
    if (kind === "preview" && (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PREVIEWS)) {
      throw new MiniAppError("invalid_params", "Ungültiger Vorschau-Slot.");
    }
    const app = await requireAppAccess(req, appId);
    await removeImageFromApp(app, kind, kind === "preview" ? slot : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
