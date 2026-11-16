// GET /api/event-requests → open event requests for the organisations the signed-in person manages.
import { NextResponse } from "next/server"
import { listOpenRequestsFor } from "@/lib/event-requests/service"
import { handleError, requireWallet, unauthorized } from "../chat/_lib/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const wallet = await requireWallet(request)
  if (!wallet) return unauthorized()
  try {
    return NextResponse.json({ requests: await listOpenRequestsFor(wallet) })
  } catch (err) {
    return handleError(err, "event-requests")
  }
}
