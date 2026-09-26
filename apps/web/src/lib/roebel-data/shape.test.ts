import { test } from "node:test";
import assert from "node:assert/strict";
import { clip, plainText, scrubWallets, shapeOutput, WALLET_PLACEHOLDER } from "./shape";
import { sanitizeSearch } from "./tenant";
import { formatFeedPost, feedAuthor } from "./public";
import { formatMuenzen, getMyMuenzenBalance } from "./muenzen";
import { getTreasury, resolveTreasuryEuro, TREASURY_SNAPSHOT } from "./treasury";
import { walletFilter } from "./user";

const W = "0xAbCdEf0123456789abcdef0123456789ABCDEF01";

test("scrubWallets replaces every address", () => {
  assert.equal(scrubWallets(`von ${W} an ${W.toLowerCase()}`), `von ${WALLET_PLACEHOLDER} an ${WALLET_PLACEHOLDER}`);
  assert.equal(scrubWallets("0x1234 ist kurz"), "0x1234 ist kurz");
  assert.equal(scrubWallets("Veranstalter 0xd7ca07c0..."), `Veranstalter ${WALLET_PLACEHOLDER}`);
  assert.equal(scrubWallets("0xd7ca…ab12 hat"), `${WALLET_PLACEHOLDER} hat`);
  const hash = `0x${"a".repeat(64)}`;
  assert.equal(scrubWallets(`/app/proposals/${hash}`), `/app/proposals/${hash}`, "64-hex ids stay intact");
});

test("clip keeps short strings and ellipsizes long ones", () => {
  assert.equal(clip("abc", 5), "abc");
  assert.equal(clip("abcdefghij", 5), "abcd…");
  assert.equal(clip(null, 5), null);
});

test("shapeOutput drops wallet/contact keys and scrubs nested strings", () => {
  const out = shapeOutput({
    wallet_address: W,
    email: "a@b.de",
    phone: "0123",
    items: [{ name: "x", owner_wallet_address: W, note: `sent by ${W}` }],
  }) as Record<string, unknown>;
  const s = JSON.stringify(out);
  assert.ok(!/0x[0-9a-f]{40}/i.test(s), s);
  assert.ok(!s.includes("a@b.de"));
  assert.equal("wallet_address" in out, false);
  assert.equal("phone" in out, false);
});

test("shapeOutput trims the longest list to fit and marks gekuerzt", () => {
  const big = { events: Array.from({ length: 200 }, (_, i) => ({ id: i, title: `Veranstaltung Nummer ${i}` })), note: "ok" };
  const out = shapeOutput(big, { maxChars: 1000 }) as typeof big & { gekuerzt?: boolean };
  assert.ok(JSON.stringify(out).length <= 1000);
  assert.ok(out.events.length > 0 && out.events.length < 200);
  assert.equal(out.events[0].id, 0, "keeps the first (most relevant) items");
  assert.equal(out.gekuerzt, true);
  assert.equal(out.note, "ok");
});

test("shapeOutput clips long strings and leaves small results untouched", () => {
  const out = shapeOutput({ text: "a".repeat(5000) }, { maxString: 100 }) as { text: string };
  assert.equal(out.text.length, 100);
  const small = shapeOutput({ a: 1, b: ["x"] }) as Record<string, unknown>;
  assert.deepEqual(small, { a: 1, b: ["x"] });
});

test("shapeOutput tightens strings when no list is left", () => {
  const out = shapeOutput({ a: "x".repeat(3000), b: "y".repeat(3000) }, { maxChars: 1500, maxString: 3000 });
  assert.ok(JSON.stringify(out).length <= 1500);
});

test("plainText strips markdown and html", () => {
  assert.equal(plainText("## Titel\n**fett** [Link](https://x.de) <b>b</b>"), "Titel fett Link b");
});

test("sanitizeSearch removes PostgREST filter syntax", () => {
  assert.equal(sanitizeSearch("a,b)(c%d_e"), "a b c d e");
});

test("feed posts show a name, never the wallet", () => {
  const row = {
    id: "p1",
    wallet_address: W.toLowerCase(),
    content: `Hallo ${W}`,
    category: null,
    post_type: null,
    likes_count: 2,
    comments_count: 0,
    created_at: "2026-09-26T10:00:00Z",
    video_url: null,
    media_urls: ["a"],
    accounts: null,
  };
  const names = new Map<string, string>([[W.toLowerCase(), "Anna"]]);
  assert.equal(feedAuthor(row, names), "Anna");
  assert.equal(feedAuthor(row, new Map()), "Jemand aus Röbel");
  const out = JSON.stringify(shapeOutput(formatFeedPost(row, names, "https://www.roebel.app")));
  assert.ok(!/0x[0-9a-f]{40}/i.test(out), out);
  assert.ok(out.includes("https://www.roebel.app/app/posts/p1"));
});

test("walletFilter normalizes and rejects junk", () => {
  assert.equal(walletFilter(W), W.toLowerCase());
  assert.throws(() => walletFilter("0x123"));
  assert.throws(() => walletFilter("%"));
});

test("formatMuenzen rounds to 2 German decimals", () => {
  assert.equal(formatMuenzen(0n), "0,00");
  assert.equal(formatMuenzen(1234_567n * 10n ** 15n), "1.234,57");
});

test("getMyMuenzenBalance: reader result, no wallet, graceful failure", async () => {
  const ok = await getMyMuenzenBalance(W, { rcrcBalance: async () => 5n * 10n ** 18n, isHuman: async () => true });
  assert.equal((ok as { guthaben: string }).guthaben, "5,00");
  assert.ok(!JSON.stringify(ok).toLowerCase().includes(W.toLowerCase()));
  const down = await getMyMuenzenBalance(W, { rcrcBalance: async () => { throw new Error("rpc"); }, isHuman: async () => false });
  assert.equal(down.verfuegbar, false);
});

test("treasury falls back to the dated snapshot when the live read is ~0 or fails", async () => {
  assert.deepEqual(resolveTreasuryEuro(0), { euro: TREASURY_SNAPSHOT.euroTotal, fromSnapshot: true });
  assert.deepEqual(resolveTreasuryEuro(250), { euro: 250, fromSnapshot: false });
  const live = await getTreasury("roebel", { read: async () => 321.456 });
  assert.equal(live.guthaben_eur, 321.46);
  assert.equal(live.stand, "live");
  const failed = await getTreasury("roebel", { read: async () => { throw new Error("x"); } });
  assert.equal(failed.guthaben_eur, TREASURY_SNAPSHOT.euroTotal);
  assert.match(failed.stand, /Momentaufnahme/);
});
