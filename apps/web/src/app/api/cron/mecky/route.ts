import { NextRequest, NextResponse } from "next/server"
import { generateMeckyDrafts } from "./generate"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await generateMeckyDrafts()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Mecky cron error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
