/**
 * Task 12 security review (plan docs/superpowers/plans/2026-11-21-passkey-session-keys-mint.md).
 * Each test here pins a FINDING of the review and is EXPECTED TO FAIL until the finding is fixed.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/security-review.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { numberToHex, type Hex } from "viem";
import {
  SESSION_NONCE_KEY,
  permissionIdsOf,
  personalMintData,
  sessionClaimCallData,
} from "../session-keys-builders";
import { DEFAULT_SESSION_DAILY_WEI, sessionGroupKey } from "../session-key-policy";
import { handleSponsorRequest } from "../sponsor-handler";
import { InMemorySponsorBudget, reservationIdOf } from "../sponsor-budget";
import { DEVICE_SIGNER, deviceAuthFor } from "./device-auth";
import { parseSponsorUserOp, toPackedUserOperation } from "../sponsor-policy";
import { requiredPrefund } from "../voucher";
import { KEY, LEGACY, SAFE, fakeChain, migrateTo7579 } from "./fake-chain";

// Anvil/Hardhat well-known test key #0 - publicly known, test-only.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const PAYMASTER = "0x1234567890AbcdEF1234567890aBcdef12345678";
// The device session key bound on chain (fix of M-1: the request must carry its signature).
const DS_SIGNER = DEVICE_SIGNER;

function enable() {
  process.env.PASSKEY_SPONSOR_ENABLED = "1";
  process.env.PASSKEY_SPONSOR_KEY = TEST_KEY;
  process.env.PASSKEY_PAYMASTER_ADDRESS = PAYMASTER;
  delete process.env.PASSKEY_SPONSOR_SESSION_DAILY_WEI;
}

const migratedChain = () =>
  fakeChain((w) => {
    migrateTo7579(w, SAFE);
    w.smartSession.add(SAFE.toLowerCase());
    const pids = permissionIdsOf({ legacy: LEGACY, signer: DS_SIGNER, validUntil: Math.floor(Date.now() / 1000) + 86_400 });
    w.permissionIds.set(SAFE.toLowerCase(), [pids.personalMint, pids.groupMint]);
  });

/** A device-session personalMint op with the gas the app realistically sends (the route tests' numbers). */
const sessionUserOp = (over: Record<string, string> = {}) => ({
  sender: SAFE,
  nonce: numberToHex(SESSION_NONCE_KEY << 64n),
  callData: sessionClaimCallData(LEGACY, personalMintData()),
  callGasLimit: "0x493e0", // 300k
  verificationGasLimit: "0x7a120", // 500k
  preVerificationGas: "0xea60", // 60k
  maxFeePerGas: "0x77359400", // 2 gwei
  maxPriorityFeePerGas: "0x3b9aca00",
  paymasterVerificationGasLimit: "0x249f0", // 150k
  paymasterPostOpGasLimit: "0xc350", // 50k
  ...over,
});
const req = (b: unknown) =>
  new Request("http://localhost/api/passkey/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
// Everything in this body is PUBLIC: the Safe address, its passkey (x, y) (readable from the
// SharedSigner storage on chain) and the legacy account. No device key, no passkey needed.
const body = (uo: object) => ({ chainId: 100, userOp: uo, x: KEY.x, y: KEY.y, legacy: LEGACY });

// ---------------------------------------------------------------------------
// FINDING H-1: the kill switch lives in a table every anon client may write.
// ---------------------------------------------------------------------------
test("FINDING H-1: the kill switch row passkey_session_keys_enabled is not writable by anon / authenticated", () => {
  // Live policies (checked 2026-11-21 on wwbeqhkslxdxhktqzqti, pg_policies):
  //   app_settings_insert  INSERT  {public}  with_check (key <> 'newsletter_auto_enroll')
  //   app_settings_update  UPDATE  {public}  using/with_check (key <> 'newsletter_auto_enroll')
  // and has_table_privilege('anon', 'public.app_settings', 'INSERT'/'UPDATE') = true.
  // So anyone with the public anon key can INSERT/UPDATE passkey_session_keys_enabled = 'true'
  // (today the row does not exist: an INSERT turns the feature on in production) or flip it to
  // 'false' (every device's 403 then drops its local session in muenzen-claim.ts).
  // The flag migration must exclude the key from those policies (like newsletter_auto_enroll).
  const sql = readFileSync(
    join(__dirname, "../../../../../../supabase/migrations/20261121_passkey_session_keys_flag.sql"),
    "utf8",
  );
  const hardened = /policy[\s\S]*app_settings[\s\S]*passkey_session_keys_enabled/i.test(
    sql.replace(/^--.*$/gm, ""),
  );
  assert.ok(hardened, "the flag migration leaves app_settings INSERT/UPDATE open to anon for passkey_session_keys_enabled");
});

// ---------------------------------------------------------------------------
// FINDING M-1: anyone can burn a victim's session (and legacy) budget without the device key.
// ---------------------------------------------------------------------------
test("FINDING M-1: a stranger without the device key cannot exhaust the victim's session:<sender> budget", async () => {
  enable();
  const budget = new InMemorySponsorBudget();
  const deps = { chain: migratedChain(), budget, sessionKeysEnabled: async () => true };
  // Attacker: many voucher requests at the session caps, never submitted on chain. Without the
  // device key every one is a 403 and nothing is reserved (fix: deviceAuth, verified on chain).
  const maxed = sessionUserOp({ callGasLimit: numberToHex(300_000n), maxFeePerGas: numberToHex(2_000_000_000n) });
  const strangerKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
  for (let i = 0; i < 50; i++) {
    const uo = { ...maxed, nonce: numberToHex((SESSION_NONCE_KEY << 64n) + BigInt(i)) };
    const forged = i % 2 === 0 ? body(uo) : { ...body(uo), deviceAuth: await deviceAuthFor(uo, { pk: strangerKey }) };
    const r = await handleSponsorRequest(req(forged), deps);
    assert.equal(r.status, 403, `attacker request ${i} got ${r.status}`);
  }
  assert.equal((await budget.expiredReservations({ beforeSeconds: Number.MAX_SAFE_INTEGER, limit: 50 })).length, 0, "nothing reserved");
  // Victim's real claim afterwards, signed by the device key.
  const uo = sessionUserOp();
  const res = await handleSponsorRequest(req({ ...body(uo), deviceAuth: await deviceAuthFor(uo) }), deps);
  assert.equal(res.status, 200, `victim's claim got ${res.status} ${JSON.stringify(await res.clone().json())}`);
});

// ---------------------------------------------------------------------------
// FINDING M-2: the default budgets do not fit the owner's hourly claim pattern.
// ---------------------------------------------------------------------------
// Fix (owner decision): reserve the max prefund per voucher, SETTLE to the on-chain actualGasCost
// after landing. Actual per op, conservatively: fork total handleOps gas (~232k personalMint,
// ~234k groupMint) + preVerificationGas 60k + the EntryPoint v0.7 10% unused-gas penalty, rounded
// up to 320k, at the op's maxFeePerGas (the most it can pay per gas).
const ACTUAL_GAS_PER_OP = 320_000n;
const sessionLimits = (safe: Hex, i: number) => ({
  keyCapWei: DEFAULT_SESSION_DAILY_WEI,
  reservation: { id: reservationIdOf(safe, BigInt(i)), sender: safe, nonce: BigInt(i), expiresAt: 2_000_000_000 },
});

test("FINDING M-2: the default budgets fit one day of hourly claims (24 x personalMint + groupMint)", async () => {
  const budget = new InMemorySponsorBudget(); // defaults: 0.25 xDAI global; session key cap 0.05 xDAI
  const packed = toPackedUserOperation(parseSponsorUserOp(sessionUserOp()));
  const cost = requiredPrefund(packed);
  const actual = ACTUAL_GAS_PER_OP * BigInt(sessionUserOp().maxFeePerGas);
  let ok = 0;
  for (let i = 0; i < 48; i++) {
    if (await budget.reserve(sessionGroupKey(SAFE), cost, sessionLimits(SAFE, i))) {
      ok++;
      assert.equal(await budget.settle(reservationIdOf(SAFE, BigInt(i)), actual), "settled");
    }
  }
  assert.equal(ok, 48, `only ${ok} of 48 session ops (${ok / 2} claims) fit; prefund per op ${cost} wei`);
});

test("FINDING M-2: a handful (5) of hourly claimers fit the default global cap together", async () => {
  const budget = new InMemorySponsorBudget();
  const cost = requiredPrefund(toPackedUserOperation(parseSponsorUserOp(sessionUserOp())));
  const actual = ACTUAL_GAS_PER_OP * BigInt(sessionUserOp().maxFeePerGas);
  for (let u = 0; u < 5; u++) {
    const safe = `0x${(u + 1).toString(16).padStart(40, "a")}` as Hex;
    for (let i = 0; i < 48; i++) {
      assert.ok(await budget.reserve(sessionGroupKey(safe), cost, sessionLimits(safe, i)), `user ${u} op ${i}`);
      await budget.settle(reservationIdOf(safe, BigInt(i)), actual);
    }
  }
});

test("FINDING M-2 deny: without settling, the session cap still stops one Safe (no open faucet)", async () => {
  const budget = new InMemorySponsorBudget();
  const cost = requiredPrefund(toPackedUserOperation(parseSponsorUserOp(sessionUserOp())));
  let ok = 0;
  for (let i = 0; i < 48; i++) if (await budget.reserve(sessionGroupKey(SAFE), cost, sessionLimits(SAFE, i))) ok++;
  assert.equal(BigInt(ok), DEFAULT_SESSION_DAILY_WEI / cost, "unsettled reservations count in full");
  assert.ok(ok < 48);
});
