// User-added remote MCP servers (spec §4 connectors): Streamable HTTP with SSE
// fallback via the installed @modelcontextprotocol/sdk client (ai v6 ships no
// MCP client). Every connection goes through guardedMcpFetch — the fetch_url
// SSRF guard (https, port 443, no private IPs, checked at connect time).
//
// Pure helpers (tool names, risk, JSON-Schema → zod, output shaping) are unit
// tested in mcp.test.ts; network code is kept thin around them.
import { createHash } from "node:crypto";
import https from "node:https";
import { Readable } from "node:stream";
import { z } from "zod";
import { assertFetchableUrl, FetchUrlError, guardedLookup } from "../packs/web";
import type { Risk } from "../types";

export const MCP_CONNECT_TIMEOUT_MS = 5_000;
export const MCP_CALL_TIMEOUT_MS = 30_000;
export const MCP_LIST_TIMEOUT_MS = 15_000;
export const MCP_OUTPUT_MAX = 8_000;
export const MCP_MAX_TOOLS = 40;
export const MCP_MAX_RESPONSE_BYTES = 5_000_000;
export const TOOL_NAME_MAX = 64;

// ---- names + risk ----------------------------------------------------------------

/** Lower-case [a-z0-9_] slug, collapsed underscores, no leading/trailing "_". */
export function sanitizeSegment(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 6);
}

/** Server slug used in tool names (≤ 20 chars, never empty). */
export function serverSlug(name: string): string {
  const s = sanitizeSegment(name).slice(0, 20).replace(/_+$/g, "");
  return s || "server";
}

/**
 * Harness tool name `mcp_<server>_<tool>` — [a-z0-9_], ≤ 64 chars. Over-long
 * names are cut and get a stable hash suffix so two tools never collide.
 */
export function mcpToolName(server: string, tool: string): string {
  const srv = serverSlug(server);
  const tl = sanitizeSegment(tool) || "tool";
  const full = `mcp_${srv}_${tl}`;
  if (full.length <= TOOL_NAME_MAX) return full;
  const suffix = `_${shortHash(`${srv}/${tool}`)}`;
  return `${full.slice(0, TOOL_NAME_MAX - suffix.length).replace(/_+$/g, "")}${suffix}`;
}

/** read when the server marks the tool read-only, else external (approval). */
export function riskForMcpTool(annotations: { readOnlyHint?: unknown } | null | undefined): Risk {
  return annotations?.readOnlyHint === true ? "read" : "external";
}

// ---- URL + headers ----------------------------------------------------------------

/** Validates a user-entered MCP URL (https, 443, no internal hosts). Throws FetchUrlError (German). */
export function validateMcpUrl(raw: string): URL {
  if (typeof raw !== "string" || raw.length > 2000) throw new FetchUrlError("Ungültige Adresse.");
  return assertFetchableUrl(raw);
}

const FORBIDDEN_HEADERS = new Set([
  "host", "cookie", "content-length", "content-type", "connection", "transfer-encoding", "accept",
  "mcp-session-id", "mcp-protocol-version", "upgrade", "te", "trailer", "keep-alive", "proxy-authorization",
]);

/** Cleans user-supplied request headers (≤ 5, token names, ≤ 4 KB values). */
export function sanitizeHeaders(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new FetchUrlError("Ungültige Header.");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const name = k.trim();
    if (typeof v !== "string" || !v.trim()) continue;
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) throw new FetchUrlError(`Ungültiger Header-Name „${name.slice(0, 40)}“.`);
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) throw new FetchUrlError(`Der Header „${name}“ ist nicht erlaubt.`);
    if (v.length > 4096 || /[\r\n]/.test(v)) throw new FetchUrlError(`Der Wert für „${name}“ ist ungültig.`);
    out[name] = v.trim();
  }
  if (Object.keys(out).length > 5) throw new FetchUrlError("Höchstens 5 Header.");
  return out;
}

// ---- guarded fetch (FetchLike for the SDK transports) ----------------------------

function headersToRecord(h: RequestInit["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(h ?? {}).forEach((v, k) => { out[k] = v; });
  return out;
}

async function bodyToBuffer(body: RequestInit["body"]): Promise<Buffer | undefined> {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));
  return Buffer.from(await new Response(body as BodyInit).arrayBuffer());
}

/**
 * fetch() replacement: validates the URL and resolves DNS through the private-IP
 * guard on every request (SSE keeps streaming). Redirects are not followed.
 */
export async function guardedMcpFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const u = assertFetchableUrl(String(input));
  const payload = await bodyToBuffer(init.body);
  const headers = headersToRecord(init.headers);
  if (payload) headers["content-length"] = String(payload.length);
  headers["user-agent"] ??= "OrtisAgent/1.0 (+https://roebel.app)";
  return new Promise<Response>((resolve, reject) => {
    const req = https.request(u, {
      method: init.method ?? "GET",
      headers,
      lookup: guardedLookup() as never,
      signal: init.signal ?? undefined,
    }, (res) => {
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MCP_MAX_RESPONSE_BYTES) res.destroy(new Error("MCP-Antwort zu groß"));
      });
      const resHeaders = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        if (Array.isArray(v)) v.forEach((x) => resHeaders.append(k, x));
        else if (v !== undefined) resHeaders.set(k, String(v));
      }
      const status = res.statusCode ?? 502;
      const noBody = status === 204 || status === 304 || init.method === "HEAD";
      if (noBody) res.resume();
      resolve(new Response(noBody ? null : (Readable.toWeb(res) as unknown as ReadableStream), {
        status, statusText: res.statusMessage ?? "", headers: resHeaders,
      }));
    });
    req.on("error", (e: NodeJS.ErrnoException) => {
      reject(e?.code === "EBLOCKED" ? new FetchUrlError("Interne Adressen sind nicht erlaubt.") : e);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ---- JSON Schema → zod (subset; unknown shapes stay permissive) -----------------

type JsonSchema = {
  type?: string | string[]; description?: string; properties?: Record<string, JsonSchema>;
  required?: string[]; items?: JsonSchema; enum?: unknown[]; anyOf?: JsonSchema[]; oneOf?: JsonSchema[];
};

function describe<T extends z.ZodTypeAny>(schema: T, s: JsonSchema): T {
  return s.description ? (schema.describe(String(s.description).slice(0, 500)) as T) : schema;
}

export function jsonSchemaToZod(s: unknown, depth = 0): z.ZodTypeAny {
  if (!s || typeof s !== "object" || depth > 6) return z.any();
  const js = s as JsonSchema;
  if (Array.isArray(js.enum) && js.enum.length && js.enum.every((v) => typeof v === "string")) {
    return describe(z.enum(js.enum as [string, ...string[]]), js);
  }
  const types = Array.isArray(js.type) ? js.type.filter((t) => t !== "null") : js.type ? [js.type] : [];
  const nullable = Array.isArray(js.type) && js.type.includes("null");
  let out: z.ZodTypeAny;
  if (types.length !== 1) {
    out = z.any();
  } else {
    switch (types[0]) {
      case "string": out = z.string(); break;
      case "integer": out = z.number().int(); break;
      case "number": out = z.number(); break;
      case "boolean": out = z.boolean(); break;
      case "array": out = z.array(jsonSchemaToZod(js.items, depth + 1)); break;
      case "object": out = objectSchema(js, depth); break;
      default: out = z.any();
    }
  }
  if (nullable) out = out.nullable();
  return describe(out, js);
}

function objectSchema(js: JsonSchema, depth: number): z.ZodTypeAny {
  const required = new Set(Array.isArray(js.required) ? js.required : []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(js.properties ?? {}).slice(0, 60)) {
    const inner = jsonSchemaToZod(prop, depth + 1);
    shape[key] = required.has(key) ? inner : inner.optional();
  }
  return z.object(shape).passthrough();
}

/** Tool input schema: always an object at the top (model APIs require it). */
export function mcpInputSchema(inputSchema: unknown): z.ZodTypeAny {
  const js = (inputSchema && typeof inputSchema === "object" ? inputSchema : {}) as JsonSchema;
  return objectSchema({ ...js, type: "object" }, 0);
}

// ---- output ------------------------------------------------------------------------

type McpContent = { type?: string; text?: string; mimeType?: string; resource?: { uri?: string; text?: string }; uri?: string; name?: string };

export function truncate(text: string, max = MCP_OUTPUT_MAX): string {
  return text.length > max ? `${text.slice(0, max)} […gekürzt]` : text;
}

/** Flattens a CallToolResult into a compact model-facing value (≤ 8k chars). */
export function shapeMcpResult(result: { content?: unknown; structuredContent?: unknown; isError?: unknown } | null | undefined): unknown {
  const parts: string[] = [];
  for (const c of (Array.isArray(result?.content) ? result!.content : []) as McpContent[]) {
    if (c?.type === "text" && typeof c.text === "string") parts.push(c.text);
    else if (c?.type === "resource" && c.resource) parts.push(c.resource.text ?? `[Ressource ${c.resource.uri ?? ""}]`);
    else if (c?.type === "resource_link") parts.push(`[Link ${c.name ?? ""} ${c.uri ?? ""}]`.trim());
    else if (c?.type === "image") parts.push(`[Bild ${c.mimeType ?? ""}]`.trim());
    else if (c?.type === "audio") parts.push("[Audio]");
  }
  let text = parts.join("\n\n").trim();
  if (!text && result?.structuredContent !== undefined) {
    try { text = JSON.stringify(result.structuredContent); } catch { text = ""; }
  }
  if (result?.isError === true) return { error: truncate(text || "Das MCP-Werkzeug meldet einen Fehler.") };
  return { ergebnis: truncate(text || "(leere Antwort)") };
}

// ---- client ----------------------------------------------------------------------

export interface CachedMcpTool {
  name: string;
  description: string;
  inputSchema: unknown;
  readOnly: boolean;
}

type McpClient = import("@modelcontextprotocol/sdk/client/index.js").Client;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new FetchUrlError(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

async function newClient(): Promise<McpClient> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  return new Client({ name: "ortis-agent", version: "1.0.0" }, { capabilities: {} });
}

/** Connects (Streamable HTTP, then SSE) within `timeoutMs`. Caller closes. */
export async function connectMcp(
  url: string, headers: Record<string, string>, timeoutMs = MCP_CONNECT_TIMEOUT_MS,
): Promise<McpClient> {
  const target = validateMcpUrl(url);
  const requestInit: RequestInit = { headers };
  const deadline = Date.now() + timeoutMs;
  const left = () => Math.max(500, deadline - Date.now());
  const msg = `Der MCP-Server antwortet nicht (${Math.round(timeoutMs / 1000)} s).`;
  let firstError: unknown;
  try {
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const client = await newClient();
    const transport = new StreamableHTTPClientTransport(target, { requestInit, fetch: guardedMcpFetch });
    try {
      await withTimeout(client.connect(transport), left(), msg);
      return client;
    } catch (err) {
      await client.close().catch(() => {});
      throw err;
    }
  } catch (err) {
    firstError = err;
    if (err instanceof FetchUrlError && /Interne|https|Port|Zugangsdaten/.test(err.message)) throw err;
  }
  try {
    const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
    const client = await newClient();
    const transport = new SSEClientTransport(target, { requestInit, fetch: guardedMcpFetch });
    try {
      await withTimeout(client.connect(transport), left(), msg);
      return client;
    } catch (err) {
      await client.close().catch(() => {});
      throw err;
    }
  } catch (err) {
    throw humanMcpError(firstError ?? err);
  }
}

/** German, secret-free error text for the UI / last_error. */
export function humanMcpError(err: unknown): FetchUrlError {
  if (err instanceof FetchUrlError) return err;
  const m = err instanceof Error ? err.message : String(err);
  if (/\b401\b|unauthori[sz]ed/i.test(m)) return new FetchUrlError("Der MCP-Server verlangt eine Anmeldung (401). Prüfe den Authorization-Header.");
  if (/\b403\b|forbidden/i.test(m)) return new FetchUrlError("Der MCP-Server verweigert den Zugriff (403).");
  if (/\b404\b/.test(m)) return new FetchUrlError("Unter dieser Adresse wurde kein MCP-Server gefunden (404).");
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return new FetchUrlError("Die Adresse ist nicht erreichbar (DNS).");
  return new FetchUrlError("Verbindung zum MCP-Server fehlgeschlagen.");
}

/** Lists up to MCP_MAX_TOOLS tools (follows cursors) in the cache shape. */
export async function listMcpTools(client: McpClient): Promise<CachedMcpTool[]> {
  const out: CachedMcpTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5 && out.length < MCP_MAX_TOOLS; page++) {
    const res = await client.listTools(cursor ? { cursor } : undefined, { timeout: MCP_LIST_TIMEOUT_MS });
    for (const t of res.tools ?? []) {
      if (out.length >= MCP_MAX_TOOLS) break;
      out.push({
        name: String(t.name).slice(0, 128),
        description: String(t.description ?? t.title ?? "").slice(0, 1000),
        inputSchema: t.inputSchema ?? { type: "object" },
        readOnly: riskForMcpTool(t.annotations as { readOnlyHint?: unknown } | undefined) === "read",
      });
    }
    cursor = res.nextCursor;
    if (!cursor) break;
  }
  return out;
}

/** connect (5 s) → list → close. */
export async function discoverMcpTools(url: string, headers: Record<string, string>): Promise<CachedMcpTool[]> {
  const client = await connectMcp(url, headers);
  try {
    return await withTimeout(listMcpTools(client), MCP_LIST_TIMEOUT_MS, "Der MCP-Server liefert keine Werkzeugliste.");
  } catch (err) {
    throw humanMcpError(err);
  } finally {
    await client.close().catch(() => {});
  }
}

/** connect (5 s) → callTool (30 s) → close; output shaped + truncated. */
export async function callMcpTool(
  url: string, headers: Record<string, string>, tool: string, args: Record<string, unknown>,
): Promise<unknown> {
  const client = await connectMcp(url, headers);
  try {
    const result = await withTimeout(
      client.callTool({ name: tool, arguments: args }, undefined, { timeout: MCP_CALL_TIMEOUT_MS }),
      MCP_CALL_TIMEOUT_MS + 1_000,
      "Das MCP-Werkzeug hat nicht rechtzeitig geantwortet (30 s).",
    );
    return shapeMcpResult(result as Parameters<typeof shapeMcpResult>[0]);
  } catch (err) {
    return { error: humanMcpError(err).message };
  } finally {
    await client.close().catch(() => {});
  }
}
