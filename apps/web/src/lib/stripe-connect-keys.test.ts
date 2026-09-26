import { test } from "node:test";
import assert from "node:assert/strict";
import { connectPublishableKey } from "./stripe-connect";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const keys = ["STRIPE_CONNECT_SECRET_KEY", "STRIPE_SECRET_KEY_SANDBOX", "STRIPE_CONNECT_PUBLISHABLE_KEY", "STRIPE_PUBLIC_KEY_SANDBOX"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try { fn(); } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test("sandbox secret key pairs with a test publishable key", () => {
  withEnv({ STRIPE_SECRET_KEY_SANDBOX: "sk_test_x", STRIPE_PUBLIC_KEY_SANDBOX: "pk_test_y" }, () => {
    assert.equal(connectPublishableKey(), "pk_test_y");
  });
});
test("a live secret key never pairs with a test publishable key", () => {
  withEnv({ STRIPE_CONNECT_SECRET_KEY: "sk_live_x", STRIPE_PUBLIC_KEY_SANDBOX: "pk_test_y" }, () => {
    assert.equal(connectPublishableKey(), null);
  });
});
test("live pair works and the dedicated key wins over the sandbox fallback", () => {
  withEnv({ STRIPE_CONNECT_SECRET_KEY: "sk_live_x", STRIPE_CONNECT_PUBLISHABLE_KEY: "pk_live_z", STRIPE_PUBLIC_KEY_SANDBOX: "pk_test_y" }, () => {
    assert.equal(connectPublishableKey(), "pk_live_z");
  });
});
test("a secret key in the publishable slot is refused", () => {
  withEnv({ STRIPE_SECRET_KEY_SANDBOX: "sk_test_x", STRIPE_CONNECT_PUBLISHABLE_KEY: "sk_test_oops" }, () => {
    assert.equal(connectPublishableKey(), null);
  });
});
