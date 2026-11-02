import { test } from "node:test";
import assert from "node:assert/strict";
import { bookErrorCode, isAllowedMediaUrl, bookingNotifyWallets, formatEuro, BOOK_ERRORS } from "./sponsoring";

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
