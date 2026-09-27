// Server-side Anthropic Messages proxy for the Expo app (POST /api/ai/anthropic).
//
// Before 2026-09-27 the app called api.anthropic.com directly with EXPO_PUBLIC_ANTHROPIC_API_KEY
// inlined in the JS bundle. Now the key lives only on the server (ANTHROPIC_API_KEY) and the app
// sends the SAME Messages request body here, authenticated with its chat-session Bearer token
// (lib/chat/session.ts: one wallet signature per 30 days, identity = thirdweb Gnosis account).
//
// Passthrough: the request body is forwarded as-is after an allowlist pass (model, token cap,
// no server-side tools), and the upstream response (JSON or the raw SSE stream) is returned
// byte-for-byte with its status, so the client parsers keep working unchanged.
//
// No next/* imports and relative imports only, so `npx tsx --test` can load it.
import { takeAll, type RateLimiter } from "../rate-limit/index";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Models the app is allowed to use through the proxy. */
export const ALLOWED_MODELS: readonly string[] = ["claude-haiku-4-5", "claude-sonnet-4-6"];
export const MAX_OUTPUT_TOKENS = 4096;
export const MAX_MESSAGES = 80;
/** Vercel caps function request bodies at 4.5 MB; stay under it with a clear error. */
export const MAX_BODY_BYTES = 4_000_000;

/** Top-level Messages API fields the app may send. Everything else is dropped. */
const ALLOWED_FIELDS = [
  "model", "max_tokens", "messages", "system", "tools", "tool_choice", "temperature",
  "top_p", "top_k", "stop_sequences", "stream",
] as const;

export interface AnthropicProxyDeps {
  /** Lowercased wallet of a valid chat session, or null. */
  authenticate(request: Request): Promise<string | null>;
  limiters: RateLimiter[];
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
}

/** Anthropic-shaped error, so the existing client code (`error.error?.message`) reads it. */
export function anthropicError(status: number, type: string, message: string): Response {
  return new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export type SanitizeResult = { ok: true; body: Record<string, unknown> } | { ok: false; message: string };

export function sanitizeMessagesRequest(input: unknown): SanitizeResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "body must be a JSON object" };
  const src = input as Record<string, unknown>;
  const model = src.model;
  if (typeof model !== "string" || !ALLOWED_MODELS.includes(model)) {
    return { ok: false, message: `model not allowed (use one of ${ALLOWED_MODELS.join(", ")})` };
  }
  if (!Array.isArray(src.messages) || src.messages.length === 0) return { ok: false, message: "messages must be a non-empty array" };
  if (src.messages.length > MAX_MESSAGES) return { ok: false, message: `too many messages (max ${MAX_MESSAGES})` };
  if (src.tools !== undefined) {
    if (!Array.isArray(src.tools)) return { ok: false, message: "tools must be an array" };
    // Only client tools (name + input_schema). Server tools (web_search, code_execution, …) carry
    // a `type` and bill extra on our key, so they are refused.
    for (const t of src.tools) {
      if (!t || typeof t !== "object") return { ok: false, message: "invalid tool" };
      const tool = t as Record<string, unknown>;
      if (tool.type !== undefined && tool.type !== "custom") return { ok: false, message: "server tools are not allowed" };
      if (typeof tool.name !== "string" || !tool.input_schema) return { ok: false, message: "invalid tool" };
    }
  }
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) if (src[key] !== undefined) out[key] = src[key];
  const requested = Number(src.max_tokens);
  out.max_tokens = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_OUTPUT_TOKENS) : 1024;
  if (out.stream !== undefined) out.stream = out.stream === true;
  return { ok: true, body: out };
}

export async function handleAnthropicProxy(request: Request, deps: AnthropicProxyDeps): Promise<Response> {
  const wallet = await deps.authenticate(request);
  if (!wallet) return anthropicError(401, "authentication_error", "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");

  if (!(await takeAll(deps.limiters, wallet))) {
    return anthropicError(429, "rate_limit_error", "Zu viele Anfragen. Bitte versuche es gleich noch einmal.");
  }

  if (!deps.apiKey) {
    console.error("[api/ai/anthropic] ANTHROPIC_API_KEY is not set");
    return anthropicError(503, "api_error", "Der KI-Dienst ist gerade nicht konfiguriert.");
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return anthropicError(413, "request_too_large", "Die Anfrage ist zu groß.");
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return anthropicError(400, "invalid_request_error", "Ungültige Anfrage.");
  }
  if (raw.length > MAX_BODY_BYTES) return anthropicError(413, "request_too_large", "Die Anfrage ist zu groß.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return anthropicError(400, "invalid_request_error", "Ungültiges JSON.");
  }
  const clean = sanitizeMessagesRequest(parsed);
  if (!clean.ok) return anthropicError(400, "invalid_request_error", clean.message);

  const doFetch = deps.fetchImpl ?? fetch;
  let upstream: Response;
  try {
    upstream = await doFetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": deps.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(clean.body),
    });
  } catch (err) {
    console.error("[api/ai/anthropic] upstream unreachable", err instanceof Error ? err.message : err);
    return anthropicError(502, "api_error", "Der KI-Dienst ist gerade nicht erreichbar.");
  }

  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store",
  });
  if (clean.body.stream === true) headers.set("x-accel-buffering", "no");
  return new Response(upstream.body, { status: upstream.status, headers });
}

/** Per-wallet windows: bursts for Mecky's tool loop (up to 10 calls per message), a daily cost cap. */
export const ANTHROPIC_RATE_RULES = [
  { name: "ai-anthropic-min", limit: 40, windowMs: 60_000 },
  { name: "ai-anthropic-day", limit: 400, windowMs: 86_400_000 },
];
