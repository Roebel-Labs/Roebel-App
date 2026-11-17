import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { openSecret, sealSecret } from "../src/lib/credentials/secrets";

const CTX = "invitation:11111111-1111-4111-8111-111111111111:claim_key";

test("seal/open round-trips; a flipped byte fails; a missing key throws", () => {
  const before = process.env.CREDENTIAL_SECRETS_KEY;
  try {
    process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");
    const sealed = sealSecret("0xprivate-key-material", CTX);
    assert.match(sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.ok(!sealed.includes("private-key"));
    assert.notEqual(sealSecret("same", CTX), sealSecret("same", CTX));
    assert.equal(openSecret(sealed, CTX), "0xprivate-key-material");

    const [v, iv, ct, tag] = sealed.split(".");
    const bytes = Buffer.from(ct, "base64url");
    bytes[0] ^= 0x01;
    assert.throws(() => openSecret([v, iv, bytes.toString("base64url"), tag].join("."), CTX));
    assert.throws(() => openSecret("v2.a.b.c", CTX));

    process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");
    assert.throws(() => openSecret(sealed, CTX));

    delete process.env.CREDENTIAL_SECRETS_KEY;
    assert.throws(() => sealSecret("x", CTX));
    assert.throws(() => openSecret(sealed, CTX));
    process.env.CREDENTIAL_SECRETS_KEY = randomBytes(16).toString("base64");
    assert.throws(() => sealSecret("x", CTX));
  } finally {
    if (before === undefined) delete process.env.CREDENTIAL_SECRETS_KEY;
    else process.env.CREDENTIAL_SECRETS_KEY = before;
  }
});

test("a sealed secret only opens under the context it was sealed for", () => {
  const before = process.env.CREDENTIAL_SECRETS_KEY;
  try {
    process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");
    const sealed = sealSecret("0xclaim-key", "invitation:a:claim_key");
    assert.equal(openSecret(sealed, "invitation:a:claim_key"), "0xclaim-key");
    assert.throws(() => openSecret(sealed, "invitation:b:claim_key"));
    assert.throws(() => openSecret(sealed, "invitation:a:token"));
    assert.throws(() => sealSecret("x", ""));
  } finally {
    if (before === undefined) delete process.env.CREDENTIAL_SECRETS_KEY;
    else process.env.CREDENTIAL_SECRETS_KEY = before;
  }
});
