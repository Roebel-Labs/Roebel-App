import { NextRequest, NextResponse } from "next/server"
import { generateNewsletterDraft } from "@/lib/newsletter/generate"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await generateNewsletterDraft({ notify: true })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Newsletter draft cron error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}
