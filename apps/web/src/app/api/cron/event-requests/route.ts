import { NextRequest, NextResponse } from "next/server"
import { settleExpiredRequests } from "@/lib/event-requests/service"

export const runtime = "nodejs"
export const maxDuration = 120

// Hourly: event requests the organisation did not answer within two days.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await settleExpiredRequests())
  } catch (error) {
    console.error("Event requests cron error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
