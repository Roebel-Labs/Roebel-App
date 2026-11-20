import { NextResponse } from "next/server";
import { MAX_LINK_TOKENS, SYNC_PROMPT, createLinkToken, deleteLinkToken, listLinkTokens } from "@/lib/chat/persona/link";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

function mcpUrl(request: Request): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return `${base}/api/ortis/mcp`;
}

/** GET /api/chat/persona/link → {tokens, mcpUrl, syncPrompt}. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    return NextResponse.json({ tokens: await listLinkTokens(wallet), mcpUrl: mcpUrl(request), syncPrompt: SYNC_PROMPT });
  } catch (err) {
    return handleError(err, "persona/link");
  }
}

/** POST /api/chat/persona/link — {label?} → the secret, shown once, plus ready-to-paste connection details. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  const label = typeof input?.label === "string" && input.label.trim() ? input.label.trim() : "Claude";
  try {
    if ((await listLinkTokens(wallet)).length >= MAX_LINK_TOKENS) return badRequest(`Du kannst höchstens ${MAX_LINK_TOKENS} Verbindungen haben. Trenn zuerst eine alte.`);
    const { token, secret } = await createLinkToken(wallet, label);
    const url = mcpUrl(request);
    return NextResponse.json({
      token, secret, mcpUrl: url,
      connectorUrl: `${url}?key=${secret}`,
      claudeCodeCommand: `claude mcp add --transport http --scope user ortis ${url} --header "Authorization: Bearer ${secret}"`,
      syncPrompt: SYNC_PROMPT,
    });
  } catch (err) {
    return handleError(err, "persona/link");
  }
}

/** DELETE /api/chat/persona/link?id=<uuid> → {ok}. */
export async function DELETE(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    if (!(await deleteLinkToken(wallet, new URL(request.url).searchParams.get("id") ?? ""))) return notFound("Die Verbindung");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "persona/link");
  }
}
