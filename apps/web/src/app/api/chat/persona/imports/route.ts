import { NextResponse } from "next/server";
import { EXPORT_PROMPT } from "@/lib/chat/persona/prompts";
import * as persona from "@/lib/chat/persona/store";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const MAX_IMPORTS = 12;
const MAX_CHARS = 60_000;
const KINDS = ["claude", "chatgpt", "text"] as const;
const TITLES = { claude: "Gedächtnis aus Claude", chatgpt: "Gedächtnis aus ChatGPT", text: "Eigener Text" } as const;

/** GET /api/chat/persona/imports → {imports, exportPrompt}. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    return NextResponse.json({ imports: await persona.listImports(wallet), exportPrompt: EXPORT_PROMPT });
  } catch (err) {
    return handleError(err, "persona/imports");
  }
}

/** POST /api/chat/persona/imports — {kind, title?, text} → {import}. Used by the next wiki build. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  const kind = KINDS.find((k) => k === input?.kind);
  if (!kind) return badRequest("Unbekannte Quelle.");
  const text = typeof input?.text === "string" ? input.text.trim() : "";
  if (text.length < 20) return badRequest("Der Text ist zu kurz.");
  if (text.length > MAX_CHARS) return badRequest(`Der Text ist zu lang (höchstens ${MAX_CHARS.toLocaleString("de-DE")} Zeichen).`);
  const title = typeof input?.title === "string" && input.title.trim() ? input.title.trim() : TITLES[kind];
  try {
    if ((await persona.listImports(wallet)).length >= MAX_IMPORTS) return badRequest(`Du kannst höchstens ${MAX_IMPORTS} Importe speichern. Lösch zuerst einen alten.`);
    return NextResponse.json({ import: await persona.addImport(wallet, kind, title, text) });
  } catch (err) {
    return handleError(err, "persona/imports");
  }
}

/** DELETE /api/chat/persona/imports?id=<uuid> → {ok}. */
export async function DELETE(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    if (!(await persona.deleteImport(wallet, id))) return notFound("Der Import");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "persona/imports");
  }
}
