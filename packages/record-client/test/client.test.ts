import { test } from "node:test";
import assert from "node:assert/strict";
import { RecordClient, RecordUnavailableError } from "../src/index";

const fakeFetch = (payload: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;

test("events() builds the filter query string and unwraps rows", async () => {
  let seen = "";
  const fetchFn = (async (url: RequestInfo | URL) => {
    seen = String(url);
    return new Response(JSON.stringify({ events: [] }));
  }) as unknown as typeof fetch;
  const c = new RecordClient("https://index.example", fetchFn);
  await c.events({ kinds: [1, 7], e: ["abc"], d: ["news:1"], limit: 20 });
  assert.match(seen, /\/events\?/);
  assert.match(seen, /kinds=1%2C7|kinds=1,7/);
  assert.match(seen, /e=abc/);
  assert.match(seen, /d=news%3A1|d=news:1/);
  assert.match(seen, /limit=20/);
});

test("a non-200 becomes RecordUnavailableError", async () => {
  const c = new RecordClient("https://index.example", fakeFetch({}, 503));
  await assert.rejects(c.events({ kinds: [1] }), RecordUnavailableError);
});

test("mediaUrl is content-addressed on the base", () => {
  const c = new RecordClient("https://index.example/");
  assert.equal(c.mediaUrl("ff".repeat(32)), `https://index.example/media/${"ff".repeat(32)}`);
});

test("a 200 with an unparseable body becomes RecordUnavailableError", async () => {
  const fetchFn = (async () =>
    new Response("<html>502 Bad Gateway</html>", { status: 200 })) as unknown as typeof fetch;
  const c = new RecordClient("https://index.example", fetchFn);
  await assert.rejects(c.events({ kinds: [1] }), RecordUnavailableError);
});

test("a fetch that throws becomes RecordUnavailableError", async () => {
  const fetchFn = (async () => {
    throw new TypeError("network down");
  }) as unknown as typeof fetch;
  const c = new RecordClient("https://index.example", fetchFn);
  await assert.rejects(c.events({ kinds: [1] }), RecordUnavailableError);
});

test("a hung index fails fast instead of blocking forever", async () => {
  // The failure that motivated this: the node's host was deleted and its IP
  // blackholed packets — no RST, no response. `fetch` had nothing to reject
  // with, so every caller's catch/fallback was unreachable and the page hung.
  // A wall-clock bound is the only thing that turns that into an error.
  let aborted = false;
  const hangs = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("aborted", "AbortError"));
      });
    })) as unknown as typeof fetch;

  const c = new RecordClient("https://index.example", hangs, 40);
  await assert.rejects(
    () => c.events({ kinds: [1] }),
    (err: Error) => err.name === "RecordUnavailableError" && /timed out|aborted/i.test(err.message),
  );
  assert.equal(aborted, true, "the request must actually be aborted, not just abandoned");
});

test("a timely response is not cancelled by the timeout", async () => {
  const c = new RecordClient(
    "https://index.example",
    (async () => new Response(JSON.stringify({ events: [] }))) as unknown as typeof fetch,
    50,
  );
  assert.deepEqual(await c.events({ kinds: [1] }), []);
});
