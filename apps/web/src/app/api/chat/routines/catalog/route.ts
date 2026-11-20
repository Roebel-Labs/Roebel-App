import { NextResponse } from "next/server";
import { ROUTINE_CATEGORIES, ROUTINE_TEMPLATES, installedTemplateIds } from "@/lib/chat/persona/catalog";
import { handleError, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET /api/chat/routines/catalog → {categories, templates} (ready-made routines, with `installed`). */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const installed = await installedTemplateIds(wallet);
    return NextResponse.json({
      categories: ROUTINE_CATEGORIES,
      templates: ROUTINE_TEMPLATES.map(({ prompt: _prompt, ...t }) => ({ ...t, installed: installed.has(t.id) })),
    });
  } catch (err) {
    return handleError(err, "routines/catalog");
  }
}
