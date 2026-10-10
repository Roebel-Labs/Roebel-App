// apps/web/tests/miniapp-safe-fetch.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlockedIp, wellKnownUrlFor, fetchManifestJson } from "../src/lib/miniapp/safeFetch";

const publicLookup = async () => ["76.76.21.21"];

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("blocks private, loopback, link-local, metadata, v6 local", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ["76.76.21.21", "8.8.8.8", "2606:4700::1111"]) {
    assert.equal(isBlockedIp(ip), false, ip);
  }
});

test("wellKnownUrlFor normalizes deep links and bare hosts", () => {
  assert.deepEqual(wellKnownUrlFor("https://app.example/some/page?x=1#y"), {
    origin: "https://app.example",
    url: "https://app.example/.well-known/roebel-miniapp.json",
  });
  assert.equal(wellKnownUrlFor("app.example").origin, "https://app.example");
});

test("wellKnownUrlFor rejects http, ports, credentials, IP literals", () => {
  for (const bad of ["http://app.example", "https://app.example:8443", "https://u:p@app.example", "https://127.0.0.1", "https://[::1]", "not a url"]) {
    assert.throws(() => wellKnownUrlFor(bad), undefined, bad);
  }
});

test("fetches and parses JSON", async () => {
  const body = { owner: "0x1", miniapp: {} };
  const got = await fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
    lookup: publicLookup,
    fetch: async () => jsonResponse(body),
  });
  assert.deepEqual(got, body);
});

test("refuses hosts resolving to private IPs", async () => {
  await assert.rejects(
    fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
      lookup: async () => ["10.1.2.3"],
      fetch: async () => jsonResponse({}),
    }),
    /nicht öffentlich/,
  );
});

test("follows same-origin redirect, refuses cross-origin with a hint", async () => {
  let calls = 0;
  const same = await fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
    lookup: publicLookup,
    fetch: async () =>
      ++calls === 1
        ? new Response(null, { status: 301, headers: { location: "/.well-known/roebel-miniapp.json?v=2" } })
        : jsonResponse({ ok: 1 }),
  });
  assert.deepEqual(same, { ok: 1 });

  await assert.rejects(
    fetchManifestJson("https://example.app/.well-known/roebel-miniapp.json", {
      lookup: publicLookup,
      fetch: async () =>
        new Response(null, { status: 308, headers: { location: "https://www.example.app/.well-known/roebel-miniapp.json" } }),
    }),
    /https:\/\/www\.example\.app/,
  );
});

test("too many redirects", async () => {
  await assert.rejects(
    fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
      lookup: publicLookup,
      fetch: async () => new Response(null, { status: 302, headers: { location: "/.well-known/roebel-miniapp.json" } }),
    }),
    /Weiterleitungen/,
  );
});

test("404, wrong content-type, oversize, invalid JSON, timeout", async () => {
  const url = "https://app.example/.well-known/roebel-miniapp.json";
  await assert.rejects(fetchManifestJson(url, { lookup: publicLookup, fetch: async () => new Response("x", { status: 404 }) }), /404/);
  await assert.rejects(
    fetchManifestJson(url, { lookup: publicLookup, fetch: async () => new Response("{}", { headers: { "content-type": "text/html" } }) }),
    /JSON/,
  );
  await assert.rejects(
    fetchManifestJson(url, { lookup: publicLookup, fetch: async () => jsonResponse({ big: "x".repeat(70_000) }) }),
    /64 KB/,
  );
  await assert.rejects(
    fetchManifestJson(url, { lookup: publicLookup, fetch: async () => new Response("{nope", { headers: { "content-type": "application/json" } }) }),
    /JSON/,
  );
  await assert.rejects(
    fetchManifestJson(url, {
      lookup: publicLookup,
      timeoutMs: 20,
      fetch: (_u, init) =>
        new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
    }),
    /nicht erreichbar|Zeit/,
  );
});

test("body stall past the timeout fails with a German MiniAppError", async () => {
  await assert.rejects(
    fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
      lookup: publicLookup,
      timeoutMs: 20,
      fetch: async (_u, init) =>
        new Response(
          new ReadableStream({
            start(c) {
              init.signal.addEventListener("abort", () => c.error(new Error("aborted")));
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    }),
    (e: Error & { code?: string }) => e.code === "invalid_params" && /nicht erreichbar|Zeit/.test(e.message),
  );
});

test("streamed oversize body without content-length is cut off", async () => {
  let pulled = 0;
  await assert.rejects(
    fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
      lookup: publicLookup,
      fetch: async () =>
        new Response(
          new ReadableStream({
            pull(c) {
              pulled++;
              c.enqueue(new Uint8Array(16 * 1024));
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    }),
    /64 KB/,
  );
  assert.ok(pulled < 20);
});

test("content-length above the cap is rejected early", async () => {
  await assert.rejects(
    fetchManifestJson("https://app.example/.well-known/roebel-miniapp.json", {
      lookup: publicLookup,
      fetch: async () =>
        new Response("{}", { headers: { "content-type": "application/json", "content-length": "999999" } }),
    }),
    /64 KB/,
  );
});
