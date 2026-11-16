import { NextRequest, NextResponse } from "next/server"
import { runAllSources } from "@/lib/event-requests/crawl"

export const runtime = "nodejs"
export const maxDuration = 300

// Daily: reads the official pages listed in event_sources and files event requests.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json({ sources: await runAllSources() })
  } catch (error) {
    console.error("Event sources cron error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
