import { test } from "node:test";
import assert from "node:assert/strict";
import { bookErrorCode, isAllowedMediaUrl, bookingNotifyWallets, formatEuro, BOOK_ERRORS, logoEdgeColor } from "./sponsoring";

const SB = "https://wwbeqhkslxdxhktqzqti.supabase.co";

test("bookErrorCode finds our RPC codes inside a Postgres message", () => {
  assert.equal(bookErrorCode("P0001: sold_out"), "sold_out");
  assert.equal(bookErrorCode("deadline_passed"), "deadline_passed");
  assert.equal(bookErrorCode("connection reset"), null);
  assert.equal(bookErrorCode(null), null);
  for (const [status, copy] of Object.values(BOOK_ERRORS)) {
    assert.ok(status >= 400 && copy.length > 0);
  }
});

test("isAllowedMediaUrl accepts only our storage and Cloudflare Stream", () => {
  assert.ok(isAllowedMediaUrl(`${SB}/storage/v1/object/public/images/sponsoring/a.png`, SB));
  assert.ok(isAllowedMediaUrl("https://customer-ol2iliim6mvkfn8k.cloudflarestream.com/abc/manifest/video.m3u8", SB));
  assert.ok(!isAllowedMediaUrl(`${SB}/storage/v1/object/sign/images/a.png`, SB));
  assert.ok(!isAllowedMediaUrl("https://evil.example/storage/v1/object/public/a.png", SB));
  assert.ok(!isAllowedMediaUrl(`http://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/a.png`, SB));
  assert.ok(!isAllowedMediaUrl("not a url", SB));
});

test("bookingNotifyWallets defaults to Max and validates overrides", () => {
  assert.deepEqual(bookingNotifyWallets(undefined), ["0xc49de63ccfee46c6c5c3e393293f66779799fb28"]);
  assert.deepEqual(bookingNotifyWallets(" 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ,junk,"), ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]);
});

test("formatEuro", () => {
  assert.equal(formatEuro(2900), "29 €");
  assert.equal(formatEuro(44900), "449 €");
  assert.equal(formatEuro(1050), "10,50 €");
});

test("logoEdgeColor picks the dominant opaque border colour", () => {
  const w = 4, h = 4;
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([220, 30, 40, 255], i * 4); // red logo background
  px.set([255, 255, 255, 255], 0); // one white corner (part of the artwork)
  px.set([10, 10, 10, 255], (1 * w + 1) * 4); // centre pixel is ignored
  assert.equal(logoEdgeColor(px, w, h), "#DC1E28");
  assert.equal(logoEdgeColor(new Uint8Array(w * h * 4), w, h), null); // fully transparent → null
});
