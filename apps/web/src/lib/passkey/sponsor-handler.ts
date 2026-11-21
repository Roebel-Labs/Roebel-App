/**
 * Request handling for POST /api/passkey/sponsor, with the chain reader and
 * the budget injected so it is testable without RPC. The Next route only
 * wires the real Gnosis reader and the in-memory budget in.
 *
 * Request:  { chainId: 100,
 *             x, y,       // passkey P-256 public key, 0x + 32 bytes each, OR
 *             ecdsaOwner, // the expert-path Safe's single ECDSA owner (never both, never neither -> 400)
 *             legacy?,    // the citizen's legacy thirdweb account (the ONE account the op may drive);
 *                         // omitted when the sender Safe itself is the citizen, or for recovery ops
 *             recoveryLegacy?, // recovery ops: the legacy account the recovered wallet administers
 *             pollId?,    // everyday votes: MACI poll id (0x hex); MACI.polls(pollId) must be the vote target
 *             miniApp?,   // a mini app's uuid: sponsor mode "miniapp" (only its declared calls), charged
 *                         // to the mini-app gas budget (miniapp-gas-budget.ts), never the everyday budget
 *             deviceSession?, // { signer, validUntil }: session-upgrade / session-grant (session-key-policy.ts)
 *             deviceAuth?,    // { expiresAt, signature }: REQUIRED for a session op (SmartSession nonce key):
 *                             // the device key's EIP-191 signature over deviceSessionAuthHash
 *                             // (session-keys-builders.ts); missing / invalid / not bound on chain = 403,
 *                             // nothing reserved (security review M-1)
 *             userOp: { sender, nonce, factory?, factoryData?, callData,
 *               callGasLimit, verificationGasLimit, preVerificationGas,
 *               maxFeePerGas, maxPriorityFeePerGas,
 *               paymasterVerificationGasLimit, paymasterPostOpGasLimit } }
 *           (numerics as 0x hex)
 * Response: 200 { paymasterAndData, paymasterVerificationGasLimit,
 *           paymasterPostOpGasLimit, validUntil, mode }
 *           (mode = the sponsor mode; 'session-upgrade' tells the app to drop its cached Safe layout)
 *           | 400 { error: 'bad_request' }
 *           | 403 { error: 'not_sponsorable', reason }
 *           | 403 { error: 'not_sponsorable', reason: 'mini app has no approved contracts' }
 *           | 429 { error: 'budget_exhausted' }
 *           | 429 { error: 'budget_exhausted', scope: 'app' | 'person' | 'global' }  (mini-app ops)
 *           | 503 { error: 'disabled' } | 503 { error: 'chain_unavailable' }
 *           | 500 { error: 'sponsor_failed' }
 *
 * Env (server-only):
 *   PASSKEY_SPONSOR_ENABLED=1
 *   PASSKEY_SPONSOR_KEY        sponsorSigner key of the preview paymaster (never logged)
 *   PASSKEY_PAYMASTER_ADDRESS  the DEDICATED preview paymaster; required, no default
 *   PASSKEY_CITIZEN_NFT_V3     optional; CitizenNFTv3 (citizen check + moveTo target). Unset = v3 off
 *   PASSKEY_ATTESTER_NFT_V3    optional; AttesterNFTv3 (moveTo target). Unset = attester moveTo off
 *   PASSKEY_SPONSOR_ONBOARDING_DAILY_WEI optional; per guest (NON-citizen) account per UTC day
 *                              (every guest result), default 0.002 xDAI; never above the per-identity cap.
 *                              The default does NOT fit a guest's first op (deploy + guardian + request
 *                              measured 0.00234 xDAI at 1.5 gwei): the owner must set it (suggested
 *                              0.006 xDAI) before opening sign-up
 *   PASSKEY_SPONSOR_GUEST_GLOBAL_DAILY_WEI optional; ALL guest (non-citizen) Safes together per
 *                              UTC day, default 0.02 xDAI. MUST stay below the overall global cap:
 *                              guests also count against the global total, so a guest cap at or above
 *                              it would let guests use up the budget citizens need. Enforced in code
 *                              (guestGroupCap): a value at or above the global cap is clamped to
 *                              global cap - 1 wei
 *   MINIAPP_GAS_PER_PERSON_DAILY_WEI optional; per person per UTC day across all mini apps, default 0.003 xDAI
 *   MINIAPP_GAS_GLOBAL_DAILY_WEI     optional; all mini apps together per UTC day, default 0.05 xDAI
 *   PASSKEY_SPONSOR_SESSION_DAILY_WEI optional; device-session (mint) ops per Safe per UTC day (budget
 *                              key `session:<sender>`, its own per-key cap), default 0.05 xDAI. Each session
 *                              op reserves its max prefund as reservation `<sender>:<nonce>`, settled to the
 *                              actual gas by POST /api/passkey/sponsor/settle or the lazy sweep
 *                              (sponsor-settle.ts). Grants / upgrades are charged to `grant:<legacy>`
 *                              (per-key cap), session-revoke to the legacy.
 *
 * Kill switch: deps.sessionKeysEnabled (app_settings.passkey_session_keys_enabled, session-keys-flag.ts).
 * Missing dep, false or a rejected read = OFF (session-upgrade / -grant / session denied; revoke still ok).
 *
 * Logging: never a raw error message (viem errors can embed the RPC URL with
 * an API key). A fixed string plus the error's `name` only.
 */
import { NextResponse } from "next/server";
import { isAddress, numberToHex, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import {
  ChainReadError,
  evaluateSponsorPolicy,
  parseSponsorRequest,
  toPackedUserOperation,
  type ChainReader,
  type V3Config,
} from "./sponsor-policy";
import {
  DEFAULT_GLOBAL_DAILY_WEI,
  DEFAULT_GUEST_GLOBAL_DAILY_WEI,
  DEFAULT_ONBOARDING_DAILY_WEI,
  GUEST_GROUP_KEY,
  weiFromEnv,
  type ReserveLimits,
  type SponsorBudget,
} from "./sponsor-budget";
import { VOUCHER_TTL_SECONDS, issueSponsorship, requiredPrefund } from "./voucher";
import { reservationIdOf } from "./sponsor-budget";
import { sweepExpiredReservations, type UserOpEventReader } from "./sponsor-settle";
import { DEFAULT_SESSION_DAILY_WEI, sessionGroupKey } from "./session-key-policy";
import type { CallRule } from "@netizen-labs/miniapp-sdk/host";
import type { GasVerdict, MiniAppGasBudget } from "./miniapp-gas-budget";

/** Mini-app sponsorship (mode "miniapp"). */
export interface MiniAppSponsorDeps {
  /** The rules of a LIVE app with manifest_version '2' and at least one declared contract, else null. */
  rules(id: string): Promise<CallRule[] | null>;
  budget: MiniAppGasBudget;
}

const GAS_SCOPE: Record<Exclude<GasVerdict, "ok">, "app" | "person" | "global"> = {
  app_budget: "app",
  person_budget: "person",
  global_budget: "global",
};

const CHAIN_ID = 100;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

/** Sponsor signers that must never sign passkey vouchers: the Netizen Accounts
 * production signer (NetizenVerifyingPaymaster 0x11ed…'s sponsorSigner). */
export const PRODUCTION_SPONSOR_SIGNERS: readonly Hex[] = ["0x218B0a592f2078Aa542d7B981638595DF6bA8bF7"];

const disabled = () => NextResponse.json({ error: "disabled" }, { status: 503 });
const badRequest = () => NextResponse.json({ error: "bad_request" }, { status: 400 });
const notSponsorable = (reason: string) =>
  NextResponse.json({ error: "not_sponsorable", reason }, { status: 403 });

function errName(err: unknown): string {
  const inner = err instanceof ChainReadError ? err.cause : err;
  return inner instanceof Error ? inner.name : typeof inner;
}

/** Validated config, or null (logged) when the route must stay off. */
function readConfig(): { key: Hex; paymaster: Hex } | null {
  if (process.env.PASSKEY_SPONSOR_ENABLED !== "1") return null;
  const key = process.env.PASSKEY_SPONSOR_KEY ?? "";
  if (!PRIVATE_KEY.test(key)) {
    console.error("[passkey-sponsor] enabled but PASSKEY_SPONSOR_KEY is missing or malformed");
    return null;
  }
  const paymaster = process.env.PASSKEY_PAYMASTER_ADDRESS ?? "";
  if (!isAddress(paymaster, { strict: false })) {
    console.error("[passkey-sponsor] enabled but PASSKEY_PAYMASTER_ADDRESS is missing or malformed");
    return null;
  }
  const signer = privateKeyToAddress(key as Hex).toLowerCase();
  if (PRODUCTION_SPONSOR_SIGNERS.some((a) => a.toLowerCase() === signer)) {
    console.error("[passkey-sponsor] refusing the production sponsor signer; use a dedicated preview paymaster");
    return null;
  }
  return { key: key as Hex, paymaster: paymaster as Hex };
}

/** Optional v3 contracts; a malformed value is logged and treated as unset (v3 shapes rejected). */
export function v3ConfigFromEnv(env: Record<string, string | undefined> = process.env): V3Config {
  const pick = (name: string): Hex | undefined => {
    const v = env[name];
    if (!v) return undefined;
    if (!isAddress(v, { strict: false })) {
      console.error(`[passkey-sponsor] ${name} is malformed; v3 stays off`);
      return undefined;
    }
    return v as Hex;
  };
  return { citizenNft: pick("PASSKEY_CITIZEN_NFT_V3"), attesterNft: pick("PASSKEY_ATTESTER_NFT_V3") };
}

/**
 * The guest group's daily cap, always strictly below the overall global cap (fail-safe against a
 * misconfigured env): guests also count against the global total, so a guest cap at or above it
 * would let guests use up the budget citizens need.
 */
export function guestGroupCap(env: Record<string, string | undefined> = process.env): bigint {
  const guest = weiFromEnv(env.PASSKEY_SPONSOR_GUEST_GLOBAL_DAILY_WEI, DEFAULT_GUEST_GLOBAL_DAILY_WEI);
  const global = weiFromEnv(env.PASSKEY_SPONSOR_GLOBAL_DAILY_WEI, DEFAULT_GLOBAL_DAILY_WEI);
  const ceiling = global > 0n ? global - 1n : 0n;
  return guest < ceiling ? guest : ceiling;
}

export async function handleSponsorRequest(
  request: Request,
  deps: {
    chain: ChainReader;
    budget: SponsorBudget;
    miniApps?: MiniAppSponsorDeps;
    /** Kill switch for device sessions; absent or rejecting = OFF (fail closed). */
    sessionKeysEnabled?: () => Promise<boolean>;
    /** EntryPoint event reader for the lazy sweep of a session sender's expired reservations (optional). */
    events?: UserOpEventReader;
  },
) {
  if (process.env.PASSKEY_SPONSOR_ENABLED !== "1") return disabled();
  const config = readConfig();
  if (!config) return disabled();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest();
  }
  let parsed: ReturnType<typeof parseSponsorRequest>;
  try {
    parsed = parseSponsorRequest(raw);
  } catch {
    return badRequest();
  }
  const { userOp: op, x, y, ecdsaOwner, legacy, recoveryLegacy, pollId, miniApp: miniAppId, deviceSession, deviceAuth } = parsed;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (parsed.chainId !== CHAIN_ID) return notSponsorable("chainId must be 100");

  // Mode "miniapp": the request names a mini app; only its reviewed declaration counts.
  let miniApp: { id: string; rules: CallRule[] } | undefined;
  if (miniAppId !== undefined) {
    let rules: CallRule[] | null = null;
    try {
      rules = deps.miniApps ? await deps.miniApps.rules(miniAppId) : null;
    } catch (err) {
      console.error("[passkey-sponsor] mini-app lookup failed:", errName(err));
      return NextResponse.json({ error: "chain_unavailable" }, { status: 503 });
    }
    if (!rules || rules.length === 0) return notSponsorable("mini app has no approved contracts");
    miniApp = { id: miniAppId, rules };
  }

  // Fail closed: only an explicit true from the flag reader opens the minting session modes.
  let sessionKeysEnabled = false;
  if (deps.sessionKeysEnabled) {
    try {
      sessionKeysEnabled = (await deps.sessionKeysEnabled()) === true;
    } catch (err) {
      console.error("[passkey-sponsor] session-keys flag read failed:", errName(err));
      sessionKeysEnabled = false;
    }
  }

  let budgetKey: string;
  let mode: string;
  let limits: ReserveLimits | undefined;
  try {
    const verdict = await evaluateSponsorPolicy(
      op,
      {
        x,
        y,
        ecdsaOwner,
        legacy,
        recoveryLegacy,
        pollId,
        nowSeconds,
        v3: v3ConfigFromEnv(),
        ...(miniApp ? { miniApp } : {}),
        ...(deviceSession ? { deviceSession } : {}),
        ...(deviceAuth ? { deviceAuth } : {}),
        sessionKeysEnabled,
      },
      deps.chain,
    );
    if (!verdict.ok) return notSponsorable(verdict.reason);
    // A passing mini-app request is always mode "miniapp" (the policy decides by the request alone).
    if (miniApp && verdict.mode !== "miniapp") return notSponsorable("mini-app request outside miniapp mode");
    budgetKey = verdict.budgetKey;
    mode = verdict.mode;
    // Device-session mint ops: the Safe's own `session:<sender>` key and cap (never the legacy's
    // everyday budget), as a reservation per (sender, nonce) that is settled to the actual gas.
    if (verdict.mode === "session") {
      if (budgetKey !== sessionGroupKey(op.sender)) return notSponsorable("session op budget key mismatch");
      limits = {
        keyCapWei: weiFromEnv(process.env.PASSKEY_SPONSOR_SESSION_DAILY_WEI, DEFAULT_SESSION_DAILY_WEI),
        reservation: {
          id: reservationIdOf(op.sender, op.nonce),
          sender: op.sender,
          nonce: op.nonce,
          expiresAt: nowSeconds + VOUCHER_TTL_SECONDS,
        },
      };
    }
    // Every guest result (everyday onboarding, guardian management, recovery of a guest Safe -
    // the latter keyed to the SUBMITTING Safe, see sponsor-policy mode C) gets the onboarding
    // per-account cap AND counts against the one shared guest total.
    // Citizen results carry no `guest` and keep the ordinary caps.
    if (verdict.guest) {
      limits = {
        perKeyDailyWei: weiFromEnv(process.env.PASSKEY_SPONSOR_ONBOARDING_DAILY_WEI, DEFAULT_ONBOARDING_DAILY_WEI),
        group: { key: GUEST_GROUP_KEY, dailyWei: guestGroupCap() },
      };
    }
  } catch (err) {
    // Fail closed: no chain facts, no voucher.
    console.error("[passkey-sponsor] chain read failed:", errName(err));
    return NextResponse.json({ error: "chain_unavailable" }, { status: 503 });
  }

  const packed = toPackedUserOperation(op);
  if (miniApp && deps.miniApps) {
    // ONLY the mini-app counters: the citizens' everyday budget (deps.budget) is never touched.
    try {
      const gas = await deps.miniApps.budget.reserve(miniApp.id, budgetKey.toLowerCase(), requiredPrefund(packed));
      if (gas !== "ok") return NextResponse.json({ error: "budget_exhausted", scope: GAS_SCOPE[gas] }, { status: 429 });
    } catch (err) {
      console.error("[passkey-sponsor] mini-app gas budget unavailable:", errName(err));
      return NextResponse.json({ error: "chain_unavailable" }, { status: 503 });
    }
  } else {
    // Give the Safe back what its expired, never-landed session vouchers still hold (bounded, never throws).
    if (mode === "session" && deps.events) {
      await sweepExpiredReservations(deps.budget, deps.events, config.paymaster, { nowSeconds, budgetKey: budgetKey.toLowerCase(), limit: 3 });
    }
    try {
      const reserved = await deps.budget.reserve(budgetKey.toLowerCase(), requiredPrefund(packed), limits);
      if (!reserved) return NextResponse.json({ error: "budget_exhausted" }, { status: 429 });
    } catch (err) {
      console.error("[passkey-sponsor] budget unavailable:", errName(err));
      return NextResponse.json({ error: "chain_unavailable" }, { status: 503 });
    }
  }

  try {
    const { paymasterAndData, validUntil } = await issueSponsorship({
      op: packed,
      privateKey: config.key,
      ctx: { chainId: CHAIN_ID, paymaster: config.paymaster },
      nowSeconds,
    });
    return NextResponse.json({
      paymasterAndData,
      paymasterVerificationGasLimit: numberToHex(op.paymasterVerificationGasLimit),
      paymasterPostOpGasLimit: numberToHex(op.paymasterPostOpGasLimit),
      validUntil,
      mode,
    });
  } catch (err) {
    console.error("[passkey-sponsor] signing failed:", errName(err));
    return NextResponse.json({ error: "sponsor_failed" }, { status: 500 });
  }
}
