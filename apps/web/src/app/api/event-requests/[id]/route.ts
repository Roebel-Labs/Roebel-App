// GET  /api/event-requests/:id → the request, for owners and admins of its organisation only.
// POST /api/event-requests/:id {decision: "publish" | "reject", edits?} → publish under the
// organisation's account (optionally corrected) or decline.
import { NextResponse } from "next/server"
import { decideRequest, getRequestFor, type DecisionEdits } from "@/lib/event-requests/service"
import { badRequest, handleError, jsonError, notFound, readJson, requireWallet, unauthorized } from "../../chat/_lib/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request)
  if (!wallet) return unauthorized()
  const { id } = await params
  if (!UUID_RE.test(id)) return notFound("Die Anfrage")
  try {
    const view = await getRequestFor(id, wallet)
    return view ? NextResponse.json({ request: view }) : notFound("Die Anfrage")
  } catch (err) {
    return handleError(err, "event-requests/get")
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request)
  if (!wallet) return unauthorized()
  const { id } = await params
  if (!UUID_RE.test(id)) return notFound("Die Anfrage")
  const body = await readJson(request)
  const decision = body?.decision
  if (decision !== "publish" && decision !== "reject") return badRequest("Unbekannte Entscheidung.")
  const raw = (body?.edits && typeof body.edits === "object" ? body.edits : {}) as Record<string, unknown>
  const edits: DecisionEdits = {
    title: text(raw.title, 150),
    description: text(raw.description, 3000),
    date: text(raw.date, 10),
    location: text(raw.location, 200),
    ...(raw.time === null ? { time: null } : typeof raw.time === "string" ? { time: raw.time.slice(0, 5) } : {}),
  }
  try {
    const result = await decideRequest(id, wallet, decision, edits)
    if (result.ok) return NextResponse.json(result)
    if (result.code === "not_found") return notFound("Die Anfrage")
    return jsonError(result.code === "already_decided" ? 409 : 400, result.code, result.message)
  } catch (err) {
    return handleError(err, "event-requests/decide")
  }
}
