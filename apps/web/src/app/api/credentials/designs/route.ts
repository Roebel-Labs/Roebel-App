// Card designer actions for Ortis Studio and the app: owner/admin orgs, drafts (list, get, save,
// delete). Accepts the app's signed request and the pairing session (lib/credentials/caller.ts).
// Drafts work without the register; they sit behind app_settings.credential_designer_enabled.
import { NextRequest, NextResponse } from "next/server";
import { failResponse, jsonFail, jsonOk } from "@/lib/signed-request/verify";
import { authenticateCaller, DESIGN_ACTIONS } from "@/lib/credentials/caller";
import { deleteDraft, getDraft, listDesignOrgs, listDrafts, saveDraft, type DesignResult } from "@/lib/credentials/designs/drafts";
import type { DesignKind } from "@/lib/credentials/designs/store";
import { designDeps } from "@/lib/credentials/designs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond<T>(r: DesignResult<T>) {
  if (r.ok) return jsonOk(r.data);
  // DRAFT_CONFLICT carries the newer draft so the editor can merge or reload.
  if (r.data !== undefined) return NextResponse.json({ ok: false, code: r.code, message: r.message, data: r.data }, { status: r.status });
  return jsonFail(r.status, r.code, r.message);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const c = await authenticateCaller(request, body, DESIGN_ACTIONS);
  if (!c.ok) return failResponse(c);
  const p = c.payload;
  const d = designDeps();
  try {
    switch (c.action) {
      case "design_orgs":
        return respond(await listDesignOrgs(d, c));
      case "design_drafts_list":
        return respond(await listDrafts(d, c, { accountId: String(p.accountId ?? "") }));
      case "design_draft_get":
        return respond(await getDraft(d, c, { draftId: String(p.draftId ?? "") }));
      case "design_draft_save":
        return respond(
          await saveDraft(d, c, {
            accountId: String(p.accountId ?? ""),
            draftId: typeof p.draftId === "string" ? p.draftId : undefined,
            baseRevision: p.baseRevision as number | undefined,
            name: p.name as string,
            kind: p.kind as DesignKind,
            template: p.template as string | null | undefined,
            design: p.design,
          }),
        );
      case "design_draft_delete":
        return respond(await deleteDraft(d, c, { draftId: String(p.draftId ?? "") }));
      default:
        return jsonFail(400, "BAD_REQUEST", "Unbekannte Aktion.");
    }
  } catch (err) {
    console.error("[credentials/designs]", c.action, err instanceof Error ? err.message : err);
    return jsonFail(502, "UNAVAILABLE", "Gerade nicht erreichbar. Bitte versuche es gleich noch einmal.");
  }
}
