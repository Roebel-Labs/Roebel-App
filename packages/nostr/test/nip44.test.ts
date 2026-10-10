import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { calcPaddedLen, getConversationKey, nip44Decrypt, nip44Encrypt } from "../src/nip44";
import { getPublicKeyHex } from "../src/keys";

const vectors = JSON.parse(readFileSync(new URL("./nip44.vectors.json", import.meta.url), "utf8")).v2;

test("conversation keys match the official vectors", () => {
  for (const v of vectors.valid.get_conversation_key) {
    assert.equal(bytesToHex(getConversationKey(hexToBytes(v.sec1), v.pub2)), v.conversation_key);
  }
});

test("padded lengths match the official vectors", () => {
  for (const [len, padded] of vectors.valid.calc_padded_len) assert.equal(calcPaddedLen(len), padded);
});

test("encrypt/decrypt match the official vectors", () => {
  for (const v of vectors.valid.encrypt_decrypt) {
    const key = getConversationKey(hexToBytes(v.sec1), getPublicKeyHex(hexToBytes(v.sec2)));
    assert.equal(bytesToHex(key), v.conversation_key);
    assert.equal(nip44Encrypt(v.plaintext, key, hexToBytes(v.nonce)), v.payload);
    assert.equal(nip44Decrypt(v.payload, key), v.plaintext);
  }
});

test("tampered payloads are rejected", () => {
  const v = vectors.valid.encrypt_decrypt[0];
  const key = hexToBytes(v.conversation_key);
  const bad = v.payload.slice(0, -4) + (v.payload.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.throws(() => nip44Decrypt(bad, key));
});
