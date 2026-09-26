import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ConnectorCryptoError, connectorKey, decryptSecret, encryptSecret } from "./crypto";
import {
  TOOL_NAME_MAX, jsonSchemaToZod, mcpInputSchema, mcpToolName, riskForMcpTool, sanitizeHeaders,
  sanitizeSegment, serverSlug, shapeMcpResult, validateMcpUrl,
} from "./mcp";
import {
  GOOGLE_DISABLED_MESSAGE, buildAuthUrl, buildRawEmail, encodeHeader, googleConfig, googleEnabled, googleGate,
  openState, parseBerlinTime, parseRecipients, pkcePair, safeReturnUrl, sealState,
} from "./google";
import { toPublic } from "./store";
import type { ConnectorRow } from "./store";
import { toolsFromConnectors } from "../packs/connectors";

const key = randomBytes(32);

// ---- crypto ----------------------------------------------------------------------

test("crypto: roundtrip JSON with and without AAD", () => {
  const secret = { headers: { Authorization: "Bearer abc" }, n: 1 };
  assert.deepEqual(decryptSecret(encryptSecret(secret, { key }), { key }), secret);
  const bound = encryptSecret(secret, { key, aad: "row-1" });
  assert.deepEqual(decryptSecret(bound, { key, aad: "row-1" }), secret);
  assert.ok(bound.startsWith("v1:"));
  assert.ok(!bound.includes("abc"));
  // Fresh IV each time.
  assert.notEqual(encryptSecret(secret, { key }), encryptSecret(secret, { key }));
});

test("crypto: tampering, wrong key and wrong AAD are rejected", () => {
  const blob = encryptSecret({ refreshToken: "r" }, { key, aad: "row-1" });
  const raw = Buffer.from(blob.slice(3), "base64");
  raw[raw.length - 1] ^= 0x01;
  const tampered = `v1:${raw.toString("base64")}`;
  assert.throws(() => decryptSecret(tampered, { key, aad: "row-1" }), ConnectorCryptoError);
  assert.throws(() => decryptSecret(blob, { key: randomBytes(32), aad: "row-1" }), ConnectorCryptoError);
  assert.throws(() => decryptSecret(blob, { key, aad: "row-2" }), ConnectorCryptoError);
  assert.throws(() => decryptSecret("nonsense", { key }), ConnectorCryptoError);
});

test("crypto: key must be 32 bytes base64", () => {
  assert.equal(connectorKey(key.toString("base64")).length, 32);
  assert.throws(() => connectorKey(randomBytes(16).toString("base64")), ConnectorCryptoError);
  assert.throws(() => connectorKey(""), ConnectorCryptoError);
});

// ---- tool names + risk ------------------------------------------------------------

test("tool names are sanitised, namespaced and ≤ 64 chars", () => {
  assert.equal(sanitizeSegment("Mein Notion-Server!"), "mein_notion_server");
  assert.equal(sanitizeSegment("Größe/Übersicht"), "grosse_ubersicht");
  assert.equal(mcpToolName("Notion", "search-pages"), "mcp_notion_search_pages");
  assert.equal(mcpToolName("???", "!!!"), "mcp_server_tool");
  const long = mcpToolName("A very very long server name indeed", "an_extremely_long_tool_name_that_goes_on_and_on_forever_and_ever");
  assert.ok(long.length <= TOOL_NAME_MAX, long);
  assert.match(long, /^[a-z][a-z0-9_]*$/);
  const other = mcpToolName("A very very long server name indeed", "an_extremely_long_tool_name_that_goes_on_and_on_forever_and_evermore");
  assert.notEqual(long, other);
  assert.ok(serverSlug("x".repeat(80)).length <= 20);
});

test("risk: read only for readOnlyHint === true, else external", () => {
  assert.equal(riskForMcpTool({ readOnlyHint: true }), "read");
  assert.equal(riskForMcpTool({ readOnlyHint: false }), "external");
  assert.equal(riskForMcpTool({ readOnlyHint: "true" }), "external");
  assert.equal(riskForMcpTool(undefined), "external");
  assert.equal(riskForMcpTool(null), "external");
});

// ---- URL guard + headers ------------------------------------------------------------

test("MCP URL guard: https, public hosts only", () => {
  assert.equal(validateMcpUrl("https://mcp.notion.com/mcp").hostname, "mcp.notion.com");
  for (const u of [
    "http://mcp.example.com/mcp", "https://localhost/mcp", "https://127.0.0.1/mcp", "https://10.0.0.5/mcp",
    "https://169.254.169.254/", "https://[::1]/", "https://mcp.example.com:8080/mcp", "https://u:p@mcp.example.com/",
    "https://router.local/", "not a url",
  ]) assert.throws(() => validateMcpUrl(u), u);
});

test("headers: allowed names only, forbidden and CRLF rejected", () => {
  assert.deepEqual(sanitizeHeaders({ Authorization: " Bearer x " }), { Authorization: "Bearer x" });
  assert.deepEqual(sanitizeHeaders(undefined), {});
  assert.deepEqual(sanitizeHeaders({ Authorization: "" }), {});
  assert.throws(() => sanitizeHeaders({ Host: "evil" }));
  assert.throws(() => sanitizeHeaders({ Cookie: "a=b" }));
  assert.throws(() => sanitizeHeaders({ "X-Bad": "a\r\nb" }));
  assert.throws(() => sanitizeHeaders({ "bad name": "x" }));
  assert.throws(() => sanitizeHeaders("x"));
});

// ---- schema + output -------------------------------------------------------------------

test("JSON Schema → zod keeps required/optional, enums and passes unknown keys", () => {
  const s = mcpInputSchema({
    type: "object",
    properties: {
      query: { type: "string", description: "Suchtext" },
      limit: { type: "integer" },
      mode: { type: "string", enum: ["a", "b"] },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["query"],
  });
  assert.ok(s.safeParse({ query: "x" }).success);
  assert.ok(s.safeParse({ query: "x", limit: 3, mode: "a", tags: ["t"], extra: true }).success);
  assert.ok(!s.safeParse({}).success);
  assert.ok(!s.safeParse({ query: "x", mode: "c" }).success);
  assert.ok(!s.safeParse({ query: "x", limit: 1.5 }).success);
  assert.ok(mcpInputSchema(undefined).safeParse({ anything: 1 }).success);
  assert.ok(jsonSchemaToZod({ type: ["string", "null"] }).safeParse(null).success);
});

test("MCP output is flattened and truncated to 8k chars", () => {
  const out = shapeMcpResult({ content: [{ type: "text", text: "a".repeat(9000) }, { type: "image", mimeType: "image/png" }] }) as { ergebnis: string };
  assert.ok(out.ergebnis.length < 8100);
  assert.ok(out.ergebnis.endsWith("[…gekürzt]"));
  assert.deepEqual(shapeMcpResult({ content: [{ type: "text", text: "kaputt" }], isError: true }), { error: "kaputt" });
  assert.deepEqual(shapeMcpResult({ content: [], structuredContent: { a: 1 } }), { ergebnis: '{"a":1}' });
});

// ---- Google gate ------------------------------------------------------------------------

const row = (over: Partial<ConnectorRow>): ConnectorRow => ({
  id: "00000000-0000-4000-8000-000000000001", wallet: "0xabc", kind: "mcp", name: "Notion",
  url: "https://mcp.notion.com/mcp?token=secret", secret_enc: null, status: "active",
  tools_cache: [
    { name: "search", description: "Suche", inputSchema: { type: "object" }, readOnly: true },
    { name: "create-page", description: "Seite anlegen", inputSchema: { type: "object" }, readOnly: false },
  ],
  last_error: null, created_at: "", updated_at: "", ...over,
});

test("Google is disabled without both env vars (routes 503, tools not offered)", () => {
  assert.equal(googleConfig({}), null);
  assert.equal(googleEnabled({ GOOGLE_OAUTH_CLIENT_ID: "id" }), false);
  assert.equal(googleEnabled({ GOOGLE_OAUTH_CLIENT_SECRET: "s" }), false);
  assert.equal(googleEnabled({ GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "s" }), true);
  assert.deepEqual(googleGate({}), { status: 503, code: "google_unavailable", message: GOOGLE_DISABLED_MESSAGE });
  assert.equal(googleGate({ GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "s" }), null);

  const google = row({ id: "00000000-0000-4000-8000-000000000002", kind: "google", name: "Google", url: null, tools_cache: [] });
  const off = toolsFromConnectors([google], { google: false });
  assert.equal(off.length, 0);
  const on = toolsFromConnectors([google], { google: true }).map((t) => `${t.name}:${t.risk}`);
  assert.deepEqual(on, [
    "google_gmail_search:read", "google_gmail_draft:external", "google_calendar_list:read",
    "google_calendar_create:external", "google_drive_search:read",
  ]);
});

test("connector rows → MCP tools with namespaced names and mapped risk; inactive skipped", () => {
  const tools = toolsFromConnectors([row({}), row({ id: "00000000-0000-4000-8000-000000000003", name: "Off", status: "error" })], { google: false });
  assert.deepEqual(tools.map((t) => `${t.name}:${t.risk}:${t.pack}`), [
    "mcp_notion_search:read:connectors", "mcp_notion_create_page:external:connectors",
  ]);
});

test("public connector shape hides secrets and query strings", () => {
  const p = toPublic(row({ secret_enc: "v1:xyz" }));
  assert.equal(p.url, "https://mcp.notion.com/mcp");
  assert.equal(p.toolCount, 2);
  assert.ok(!("secret_enc" in p));
  assert.ok(!JSON.stringify(p).includes("0xabc"));
});

// ---- Google OAuth helpers -------------------------------------------------------------------

test("OAuth state is sealed, wallet-bound and expires", () => {
  const { verifier, challenge } = pkcePair();
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  const now = Date.now();
  const state = sealState({ wallet: "0xabc", verifier, returnUrl: "roebel://chat/settings/connections" }, now, key);
  assert.match(state, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(openState(state, now, key), { wallet: "0xabc", verifier, returnUrl: "roebel://chat/settings/connections" });
  assert.equal(openState(state, now + 11 * 60_000, key), null);
  assert.equal(openState(state, now, randomBytes(32)), null);
  assert.equal(openState(`${state.slice(0, -2)}xx`, now, key), null);
  const url = new URL(buildAuthUrl({ clientId: "cid", clientSecret: "s" }, { redirectUri: "https://x/cb", state, challenge }));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.ok(url.searchParams.get("scope")!.includes("gmail.compose"));
  assert.ok(!url.toString().includes("client_secret"));
});

test("return URL only allows app deep links", () => {
  assert.equal(safeReturnUrl("roebel://chat/settings/connections"), "roebel://chat/settings/connections");
  assert.equal(safeReturnUrl("exp://192.168.1.2:8081/--/chat/settings/connections"), "exp://192.168.1.2:8081/--/chat/settings/connections");
  assert.equal(safeReturnUrl("https://evil.example"), "roebel://chat/settings/connections");
  assert.equal(safeReturnUrl("javascript:alert(1)"), "roebel://chat/settings/connections");
});

test("Gmail draft encoding, recipients and Berlin times", () => {
  assert.equal(encodeHeader("Hallo"), "Hallo");
  assert.match(encodeHeader("Grüße"), /^=\?UTF-8\?B\?/);
  assert.deepEqual(parseRecipients("a@b.de, c@d.org"), ["a@b.de", "c@d.org"]);
  assert.throws(() => parseRecipients("nope"));
  const raw = buildRawEmail({ to: ["a@b.de"], subject: "Grüße", body: "Hallo Welt" });
  const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  assert.ok(decoded.includes("To: a@b.de"));
  assert.ok(decoded.includes(Buffer.from("Hallo Welt").toString("base64")));
  assert.equal(parseBerlinTime("2026-07-01T18:00").toISOString(), "2026-07-01T16:00:00.000Z");
  assert.equal(parseBerlinTime("2026-12-01T18:00").toISOString(), "2026-12-01T17:00:00.000Z");
  assert.equal(parseBerlinTime("2026-12-01T18:00:00Z").toISOString(), "2026-12-01T18:00:00.000Z");
});
