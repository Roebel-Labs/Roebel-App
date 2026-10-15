import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANTHROPIC_MESSAGES_URL, extractMessagesUsage, handleAnthropicProxy, MAX_OUTPUT_TOKENS, sanitizeMessagesRequest,
  type AnthropicProxyDeps,
} from "./anthropic";
import { MemoryLimiter } from "../rate-limit/index";

const WALLET = "0x00000000000000000000000000000000000000ab";
const KEY = "sk-test-not-a-real-key";

function req(body: unknown, token: string | null = "good") {
  return new Request("https://x.test/api/ai/anthropic", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deps(over: Partial<AnthropicProxyDeps> = {}, fetchImpl?: typeof fetch): AnthropicProxyDeps & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    authenticate: async (r) => (r.headers.get("authorization") === "Bearer good" ? WALLET : null),
    limiters: [new MemoryLimiter(100, 60_000)],
    apiKey: KEY,
    fetchImpl:
      fetchImpl ??
      (async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ id: "msg_1", content: [{ type: "text", text: "Hallo" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    ...over,
  };
}

const BODY = { model: "claude-haiku-4-5", max_tokens: 300, messages: [{ role: "user", content: "Hi" }] };

test("rejects a request without a valid chat session (401, Anthropic error shape)", async () => {
  const d = deps();
  const res = await handleAnthropicProxy(req(BODY, null), d);
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.type, "error");
  assert.equal(typeof json.error.message, "string");
  assert.equal(d.calls.length, 0, "never reaches Anthropic");
  assert.equal((await handleAnthropicProxy(req(BODY, "forged"), d)).status, 401);
});

test("rate-limits per wallet with 429", async () => {
  const d = deps({ limiters: [new MemoryLimiter(2, 60_000)] });
  assert.equal((await handleAnthropicProxy(req(BODY), d)).status, 200);
  assert.equal((await handleAnthropicProxy(req(BODY), d)).status, 200);
  const third = await handleAnthropicProxy(req(BODY), d);
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error.type, "rate_limit_error");
  assert.equal(d.calls.length, 2);
});

test("passes the body through with the server key and returns the upstream JSON unchanged", async () => {
  const d = deps();
  const body = { ...BODY, system: "sys", tools: [{ name: "t", description: "d", input_schema: { type: "object" } }], temperature: 1 };
  const res = await handleAnthropicProxy(req(body), d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: "msg_1", content: [{ type: "text", text: "Hallo" }] });
  assert.equal(d.calls[0].url, ANTHROPIC_MESSAGES_URL);
  const headers = d.calls[0].init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], KEY);
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.deepEqual(JSON.parse(String(d.calls[0].init.body)), body);
});

test("streams the upstream SSE body through byte-for-byte", async () => {
  const sse = "event: message_start\ndata: {\"type\":\"message_start\"}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
  const d = deps({}, async () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }));
  const res = await handleAnthropicProxy(req({ ...BODY, stream: true }), d);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  assert.equal(await res.text(), sse);
});

test("upstream errors keep their status and body", async () => {
  const d = deps({}, async () => new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "busy" } }), { status: 529 }));
  const res = await handleAnthropicProxy(req(BODY), d);
  assert.equal(res.status, 529);
  assert.equal((await res.json()).error.message, "busy");
});

test("refuses unknown models, server tools and oversized token budgets are clamped", async () => {
  assert.equal(sanitizeMessagesRequest({ ...BODY, model: "claude-opus-4-1" }).ok, false);
  assert.equal(sanitizeMessagesRequest({ ...BODY, tools: [{ type: "web_search_20250305", name: "web_search" }] }).ok, false);
  assert.equal(sanitizeMessagesRequest({ ...BODY, messages: [] }).ok, false);
  const r = sanitizeMessagesRequest({ ...BODY, max_tokens: 100_000, metadata: { user_id: "x" }, betas: ["y"] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.body.max_tokens, MAX_OUTPUT_TOKENS);
    assert.equal("metadata" in r.body, false);
    assert.equal("betas" in r.body, false);
  }
  const d = deps();
  const res = await handleAnthropicProxy(req({ ...BODY, model: "claude-opus-4-1" }), d);
  assert.equal(res.status, 400);
  assert.equal(d.calls.length, 0);
});

test("503 without a server key, 400 on bad JSON", async () => {
  assert.equal((await handleAnthropicProxy(req(BODY), deps({ apiKey: undefined }))).status, 503);
  assert.equal((await handleAnthropicProxy(req("{not json"), deps())).status, 400);
});

test("extractMessagesUsage reads a JSON body and an SSE stream", () => {
  assert.deepEqual(extractMessagesUsage(JSON.stringify({ usage: { input_tokens: 12, output_tokens: 34 } })), {
    inputTokens: 12, outputTokens: 34, cacheReadTokens: 0, cacheWriteTokens: 0,
  });
  const sse = [
    "event: message_start",
    `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 50, cache_read_input_tokens: 7, output_tokens: 1 } } })}`,
    "",
    "event: content_block_delta",
    `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } })}`,
    "",
    "event: message_delta",
    `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 99 } })}`,
    "",
  ].join("\n");
  assert.deepEqual(extractMessagesUsage(sse), { inputTokens: 50, outputTokens: 99, cacheReadTokens: 7, cacheWriteTokens: 0 });
  assert.equal(extractMessagesUsage("not json"), null);
});

test("reports usage via onUsage while passing the body through unchanged", async () => {
  const seen: { usage: unknown; model: string }[] = [];
  const tasks: Promise<unknown>[] = [];
  const upstreamBody = JSON.stringify({ id: "msg_1", content: [], usage: { input_tokens: 3, output_tokens: 4 } });
  const d = deps(
    {
      onUsage: (usage, model) => {
        seen.push({ usage, model });
      },
      waitUntil: (t) => tasks.push(t),
    },
    async () => new Response(upstreamBody, { status: 200, headers: { "content-type": "application/json" } }),
  );
  const res = await handleAnthropicProxy(req(BODY), d);
  assert.equal(await res.text(), upstreamBody);
  await Promise.all(tasks);
  assert.deepEqual(seen, [
    { usage: { inputTokens: 3, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: "claude-haiku-4-5" },
  ]);
});
