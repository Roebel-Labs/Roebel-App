import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/miniapp/http"
import { generateEventRadio } from "@/lib/event-radio/generate"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: { force?: boolean; dryRun?: boolean } = {}
  try {
    body = (await req.json()) as { force?: boolean; dryRun?: boolean }
  } catch {
    body = {}
  }
  try {
    const result = await generateEventRadio({ force: Boolean(body.force), dryRun: Boolean(body.dryRun) })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Event radio generate error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generierung fehlgeschlagen" },
      { status: 500 }
    )
  }
}
