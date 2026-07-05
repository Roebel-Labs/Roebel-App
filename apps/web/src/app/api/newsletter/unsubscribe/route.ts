import { NextRequest, NextResponse } from "next/server"
import { unsubscribeByToken } from "@/app/actions/newsletter-public"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? ""
  await unsubscribeByToken(token)
  // RFC 8058: always 200, no body needed
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? ""
  return NextResponse.redirect(
    new URL(`/newsletter/abmelden?token=${encodeURIComponent(token)}`, req.nextUrl.origin)
  )
}
