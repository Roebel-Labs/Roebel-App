import { test } from "node:test";
import assert from "node:assert/strict";

// crawl.ts imports server-only modules; the pure helpers are re-implemented nowhere, so load it with the stub below.
import Module from "node:module";
const originalLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

test("pageToText keeps links and images, drops scripts", async () => {
  const { pageToText } = await import("./crawl");
  const text = pageToText('<script>x()</script><h2>Lesung</h2><p>Freitag <a href="/e/1">mehr</a></p><img src="/p.jpg" alt="">');
  assert.match(text, /Lesung/);
  assert.match(text, /mehr \[Link: \/e\/1\]/);
  assert.match(text, /\[Bild: \/p\.jpg\]/);
  assert.doesNotMatch(text, /x\(\)/);
});

test("resolveUrl makes absolute https links and rejects the rest", async () => {
  const { resolveUrl } = await import("./crawl");
  assert.equal(resolveUrl("/e/1", "https://stadt.example/veranstaltungen"), "https://stadt.example/e/1");
  assert.equal(resolveUrl("javascript:alert(1)", "https://stadt.example/"), null);
  assert.equal(resolveUrl("http://stadt.example/x", "https://stadt.example/"), null);
  assert.equal(resolveUrl(null, "https://stadt.example/"), null);
});

test("usableEvents drops past, far-off and malformed events and sorts by date", async () => {
  const { usableEvents } = await import("./crawl");
  const base = { location: "Haus des Gastes", description: "", organizer: null, category: "Kultur" as const, link: null, image: null };
  const out = usableEvents([
    { ...base, title: "Später", date: "2026-12-01", time: "19:00" },
    { ...base, title: "Vorbei", date: "2026-11-01", time: null },
    { ...base, title: "Bald", date: "2026-11-20", time: "abends" },
    { ...base, title: "Fern", date: "2027-06-01", time: null },
    { ...base, title: "Kaputt", date: "20.11.2026", time: null },
    { ...base, title: "X", date: "2026-11-21", time: null, location: "" },
  ], "2026-11-16");
  assert.deepEqual(out.map((e) => e.title), ["Bald", "Später"]);
  assert.equal(out[0].time, null);
  assert.equal(out[1].time, "19:00");
});
