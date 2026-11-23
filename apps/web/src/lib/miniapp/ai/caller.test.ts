import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILDER_LIMITS, clientIp, limitKey, providerErrorMessage, resolveBuilderCaller } from "./caller";

const W = "0x" + "a".repeat(40);

test("a verified bearer makes a session caller", async () => {
  const h = new Headers({ authorization: "Bearer good", "x-forwarded-for": "1.2.3.4" });
  const c = await resolveBuilderCaller(h, async (a) => (a === "Bearer good" ? W : null));
  assert.deepEqual(c, { kind: "session", wallet: W });
  assert.equal(limitKey(c), `w:${W}`);
});

test("an invalid bearer or a bare wallet header falls back to the IP", async () => {
  const h = new Headers({ authorization: "Bearer bad", "x-wallet-address": W, "x-forwarded-for": "5.6.7.8, 10.0.0.1" });
  const c = await resolveBuilderCaller(h, async () => null);
  assert.deepEqual(c, { kind: "anon", ip: "5.6.7.8" });
  assert.equal(limitKey(c), "ip:5.6.7.8");
});

test("clientIp handles missing headers", () => {
  assert.equal(clientIp(new Headers()), "unknown");
  assert.equal(clientIp(new Headers({ "x-real-ip": "9.9.9.9" })), "9.9.9.9");
});

test("anonymous callers get a smaller budget than sessions", () => {
  const sum = (k: "session" | "anon") => BUILDER_LIMITS[k].generate.reduce((n, r) => n + r.limit, 0);
  assert.ok(sum("anon") < sum("session"));
  const names = Object.values(BUILDER_LIMITS).flatMap((r) => [...r.generate, ...r.assist].map((x) => x.name));
  assert.equal(new Set(names).size, names.length, "limiter names must be unique");
});

test("provider errors become specific German messages", () => {
  assert.match(providerErrorMessage(new Error("Failed after 3 attempts. Last error: Insufficient balance or no resource package. Please recharge.")), /Guthaben/);
  assert.match(providerErrorMessage(new Error("429 Too Many Requests")), /ausgelastet/);
  assert.match(providerErrorMessage("boom"), /Fehler/);
});
