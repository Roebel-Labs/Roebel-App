// GET /api/chat/my-orgs — the organisations the session's account manages (owner/admin).
// Ortis Studio uses it to publish a mini app for an org ("Nur für Mitglieder").
import { NextResponse } from "next/server";
import { orgsManagedBy } from "@/lib/miniapp/myOrgs";
import { requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  return NextResponse.json({ orgs: await orgsManagedBy(wallet) });
}
