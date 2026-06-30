import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getPendingMessages } from "@/lib/gemeinschaftskasse/safe-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const items = await getPendingMessages();
    return NextResponse.json({ items });
  } catch (e) {
    return jsonError(e);
  }
}
