// apps/web/tests/miniapp-subject.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSubject, subjectSecretFromEnv } from "../src/lib/miniapp/subject";

const S = "s".repeat(40);
const W = "0xc49de63ccfee46c6c5c3e393293f66779799fb28";
const APP_A = "11111111-2222-3333-4444-555555555555";
const APP_B = "66666666-7777-8888-9999-000000000000";

test("the pseudonym is stable per app and differs between apps", () => {
  const a = deriveSubject(S, APP_A, W), b = deriveSubject(S, APP_B, W);
  assert.equal(a, deriveSubject(S, APP_A, W.toUpperCase().replace("0X", "0x")));
  assert.notEqual(a, b);
  assert.match(a, /^nz_[A-Za-z0-9_-]{27}$/);
  assert.ok(!a.toLowerCase().includes(W.slice(2, 12)));
});

test("a different secret gives a different pseudonym", () => {
  assert.notEqual(deriveSubject(S, APP_A, W), deriveSubject("t".repeat(40), APP_A, W));
});

test("the secret must be at least 32 characters", () => {
  const old = process.env.MINIAPP_SUBJECT_SECRET;
  try {
    delete process.env.MINIAPP_SUBJECT_SECRET;
    assert.equal(subjectSecretFromEnv(), null);
    process.env.MINIAPP_SUBJECT_SECRET = "short";
    assert.equal(subjectSecretFromEnv(), null);
    process.env.MINIAPP_SUBJECT_SECRET = S;
    assert.equal(subjectSecretFromEnv(), S);
  } finally {
    if (old === undefined) delete process.env.MINIAPP_SUBJECT_SECRET;
    else process.env.MINIAPP_SUBJECT_SECRET = old;
  }
});
