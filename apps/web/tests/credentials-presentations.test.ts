import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { InMemoryCredentialStore } from "../src/lib/credentials/store";
import {
  createPresentation,
  resolvePresentation,
  showMessage,
  SHOW_SCOPE,
  SHOW_TTL_SECONDS,
  type Presentation,
  type PresentationDeps,
} from "../src/lib/credentials/presentations";
import { CODE_ALPHABET } from "../src/lib/chat/pairing";
import type { Caller } from "../src/lib/credentials/caller";
import { recoverMessageAddress } from "viem";

const TYPE = `0x${"ab".repeat(32)}` as Hex;
const T0 = Date.parse("2026-11-17T10:00:00Z");
const holder = privateKeyToAccount(generatePrivateKey());
const HOLDER = holder.address.toLowerCase() as Address;
const OTHER = "0x00000000000000000000000000000000000000b2";

const caller = (wallet: string, action: Caller["action"], via: Caller["via"] = "signature"): Caller => ({ ok: true, wallet, via, action, payload: {} });

function world() {
  const store = new InMemoryCredentialStore();
  let now = T0;
  const d: PresentationDeps = {
    store,
    now: () => now,
    verifySignature: async (wallet, message, signature) => {
      try {
        return (await recoverMessageAddress({ message, signature: signature as Hex })).toLowerCase() === wallet.toLowerCase();
      } catch {
        return false;
      }
    },
  };
  return { store, d, setNow: (t: number) => (now = t) };
}

async function presentation(issuedAtSec = T0 / 1000, signer = holder): Promise<Presentation> {
  const nonce = "n0nce-123456";
  const accountSignature = await signer.signMessage({ message: showMessage({ typeId: TYPE, account: HOLDER, issuedAtSec, nonce }) });
  return { v: 1, typeId: TYPE, account: HOLDER, issuedAtSec, nonce, accountSignature };
}

test("showMessage has the fixed format", () => {
  assert.equal(SHOW_SCOPE, "roebel-credential-show-v1");
  assert.equal(SHOW_TTL_SECONDS, 300);
  assert.equal(
    showMessage({ typeId: TYPE, account: "0xABCDEF0000000000000000000000000000000001", issuedAtSec: 5, nonce: "x" }),
    `roebel-credential-show-v1:${TYPE}:0xabcdef0000000000000000000000000000000001:5:x`,
  );
});

test("present_create refuses a presentation for another account", async () => {
  const w = world();
  const r = await createPresentation(w.d, caller(OTHER, "present_create"), await presentation());
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
  assert.equal(w.store.presentations.size, 0);
});

test("present_resolve verifies the signature, returns the age and deletes the code", async () => {
  const w = world();
  const p = await presentation();
  const created = await createPresentation(w.d, caller(HOLDER, "present_create"), p);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const { code, expiresAt } = created.data;
  assert.equal(code.length, 12);
  for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch));
  assert.equal(expiresAt, new Date(T0 + 300_000).toISOString());
  // stored by hash only
  assert.ok(w.store.presentations.has(createHash("sha256").update(code).digest("hex")));
  assert.equal([...w.store.presentations.keys()].includes(code), false);

  w.setNow(T0 + 42_000);
  const r = await resolvePresentation(w.d, caller(OTHER, "present_resolve", "chat_session"), { code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}` });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.signatureValid, true);
  assert.equal(r.data.ageSeconds, 42);
  assert.equal(r.data.presentation.account, HOLDER);
  const json = JSON.stringify(r.data);
  assert.equal(/displayName|avatar/i.test(json), false);

  const again = await resolvePresentation(w.d, caller(OTHER, "present_resolve"), { code });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.status, 404);
});

test("a forged signature resolves with signatureValid false", async () => {
  const w = world();
  const p = await presentation(T0 / 1000, privateKeyToAccount(generatePrivateKey()));
  const created = await createPresentation(w.d, caller(HOLDER, "present_create"), p);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const r = await resolvePresentation(w.d, caller(OTHER, "present_resolve"), { code: created.data.code });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.signatureValid, false);
});

test("a presentation older than 300 s is gone", async () => {
  const w = world();
  const created = await createPresentation(w.d, caller(HOLDER, "present_create"), await presentation());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  w.setNow(T0 + 301_000);
  const r = await resolvePresentation(w.d, caller(OTHER, "present_resolve"), { code: created.data.code });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 404);
  // a presentation issued long ago is refused at create time
  const stale = await createPresentation(w.d, caller(HOLDER, "present_create"), await presentation(T0 / 1000 - 400));
  assert.equal(stale.ok, false);
});
