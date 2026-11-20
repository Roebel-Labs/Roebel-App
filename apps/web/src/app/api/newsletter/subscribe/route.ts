// Newsletter sign-up for clients without server actions (the Röbel app).
// Same double opt-in, cooldown and silent-success rules as the web form.
import { NextRequest, NextResponse } from "next/server"
import { subscribeToNewsletter } from "@/app/actions/newsletter-public"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null
  const email = typeof body?.email === "string" ? body.email : ""
  if (!email || email.length > 254) {
    return NextResponse.json(
      { success: false, message: "Bitte gib eine gültige E-Mail-Adresse ein." },
      { status: 400 }
    )
  }
  const result = await subscribeToNewsletter(email)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
