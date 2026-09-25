import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { handleError, notFound, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/chat/files/:id — file content for the file sheet. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    const file = await store.getFile(wallet, id);
    if (!file) return notFound("Die Datei");
    return NextResponse.json({ file });
  } catch (err) {
    return handleError(err, "files/:id");
  }
}
