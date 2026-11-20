import { NextRequest, NextResponse } from "next/server"
import { generateAppUpdateDraft } from "@/lib/app-updates/draft"

export const runtime = "nodejs"
export const maxDuration = 300

// Weekly: drafts the next "Was ist neu" post from the git history. Never publishes.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await generateAppUpdateDraft({ notify: true })
    return NextResponse.json(result)
  } catch (error) {
    console.error("App update draft cron error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}
