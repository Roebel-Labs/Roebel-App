import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { openSecret, sealSecret } from "../src/lib/credentials/secrets";

test("seal/open round-trips; a flipped byte fails; a missing key throws", () => {
  const before = process.env.CREDENTIAL_SECRETS_KEY;
  try {
    process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");
    const sealed = sealSecret("0xprivate-key-material");
    assert.match(sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.ok(!sealed.includes("private-key"));
    assert.notEqual(sealSecret("same"), sealSecret("same"));
    assert.equal(openSecret(sealed), "0xprivate-key-material");

    const [v, iv, ct, tag] = sealed.split(".");
    const bytes = Buffer.from(ct, "base64url");
    bytes[0] ^= 0x01;
    assert.throws(() => openSecret([v, iv, bytes.toString("base64url"), tag].join(".")));
    assert.throws(() => openSecret("v2.a.b.c"));

    process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");
    assert.throws(() => openSecret(sealed));

    delete process.env.CREDENTIAL_SECRETS_KEY;
    assert.throws(() => sealSecret("x"));
    assert.throws(() => openSecret(sealed));
    process.env.CREDENTIAL_SECRETS_KEY = randomBytes(16).toString("base64");
    assert.throws(() => sealSecret("x"));
  } finally {
    if (before === undefined) delete process.env.CREDENTIAL_SECRETS_KEY;
    else process.env.CREDENTIAL_SECRETS_KEY = before;
  }
});
