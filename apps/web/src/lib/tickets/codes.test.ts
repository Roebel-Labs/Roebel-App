import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTicketCode, ticketQrPayload, parseTicketQrPayload } from "./codes";

process.env.TICKET_QR_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("codes are 10 chars of Crockford-ish base32 without ambiguous letters", () => {
  const code = generateTicketCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.notEqual(code, generateTicketCode());
});
test("payload round-trips and a tampered payload is rejected", () => {
  const code = generateTicketCode();
  const payload = ticketQrPayload(code);
  assert.match(payload, /^roebel-ticket:v1:[A-HJ-NP-Z2-9]{10}:[0-9a-f]{16}$/);
  assert.deepEqual(parseTicketQrPayload(payload), { code });
  assert.equal(parseTicketQrPayload(payload.slice(0, -1) + "0"), null);
  assert.equal(parseTicketQrPayload("roebel-card:v2:x"), null);
});
