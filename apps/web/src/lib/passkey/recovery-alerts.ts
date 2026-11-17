/**
 * Recovery alerts: the 3-day cancel window of the Candide SocialRecoveryModule only protects
 * people who find out. This scans the SRM for `RecoveryExecuted` (the event that starts the
 * delay) and alerts the wallet: by email to its verified warning address, and by push to the
 * devices registered under the wallet (alert-push.ts).
 *
 *   event RecoveryExecuted(address indexed wallet, address[] indexed newOwners,
 *     uint256 newThreshold, uint256 nonce, uint64 executeAfter, uint256 guardiansApprovalCount)
 *   (verified ABI of 0x38275826E1933303E508433dD5f289315Da2541c on Gnosis, compiler 0.8.20)
 *
 * Idempotent per (wallet, recovery nonce, channel): each channel is claimed in the store BEFORE
 * sending and released if its send fails, so a re-run neither double-sends nor drops it, and a
 * failed push is retried without a second email (and the other way round). A new recovery after
 * a cancel has a new nonce and alerts again. The cursor only advances past a block range once
 * every alert in it was sent or skipped; a failed range does not stop the scan of the later
 * ones (their alerts go out now, protected by their claims), it only holds the cursor.
 * A push that keeps failing is tried MAX_PUSH_ATTEMPTS times per (wallet, nonce), then given up
 * (claim kept, logged), so one broken device cannot hold the cursor for the whole delay window;
 * the email channel and the in-app banner still warn.
 * No log line carries an email address.
 */
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { gnosis } from "viem/chains";
import type { PasskeyEmailStore } from "./email-store";
import { recoveryAlertPush, type AlertPush } from "./alert-push";
import { recoveryAlertMail, type Mailer } from "./email-mailer";

export const SOCIAL_RECOVERY_MODULE: Address = "0x38275826E1933303E508433dD5f289315Da2541c";
export const RECOVERY_EXECUTED_EVENT = parseAbiItem(
  "event RecoveryExecuted(address indexed wallet, address[] indexed newOwners, uint256 newThreshold, uint256 nonce, uint64 executeAfter, uint256 guardiansApprovalCount)",
);
export const ALERT_CURSOR_ID = "srm-recovery-executed";

/** Gnosis ~5 s blocks: 3 days = 51 840 blocks. A first run looks back a little further. */
export const DEFAULT_LOOKBACK_BLOCKS = 60_000n;
export const DEFAULT_CHUNK_BLOCKS = 10_000n;
export const DEFAULT_MAX_BLOCKS_PER_RUN = 120_000n;
export const DEFAULT_CONFIRMATIONS = 5n;
/** Push sends per (wallet, nonce) before the push for that recovery is given up. */
export const MAX_PUSH_ATTEMPTS = 3;

export type RecoveryExecutedLog = { wallet: Address; nonce: bigint; executeAfter: bigint; blockNumber: bigint };

export interface RecoveryLogReader {
  latestBlock(): Promise<bigint>;
  recoveryExecuted(fromBlock: bigint, toBlock: bigint): Promise<RecoveryExecutedLog[]>;
}

export type RecoveryAlertResult = {
  fromBlock: string | null;
  toBlock: string | null;
  events: number;
  /** Emails sent. */
  sent: number;
  /** Push alerts sent (one per event, however many devices). */
  pushed: number;
  /**
   * noContact: email channel on, no verified address; noDevice: push channel on, no active device;
   * alreadySent: counted PER CHANNEL (an event whose email and push were both sent before adds 2).
   */
  skipped: { noContact: number; noDevice: number; alreadySent: number; windowOver: number };
  failed: number;
};

export async function runRecoveryAlerts(deps: {
  reader: RecoveryLogReader;
  store: PasskeyEmailStore;
  /** Email channel; omitted = no emails. */
  mailer?: Mailer;
  /** Push channel; omitted = no pushes. */
  push?: AlertPush;
  nowSec: () => number;
  lookbackBlocks?: bigint;
  chunkBlocks?: bigint;
  maxBlocksPerRun?: bigint;
  confirmations?: bigint;
}): Promise<RecoveryAlertResult> {
  const chunk = deps.chunkBlocks ?? DEFAULT_CHUNK_BLOCKS;
  const result: RecoveryAlertResult = {
    fromBlock: null,
    toBlock: null,
    events: 0,
    sent: 0,
    pushed: 0,
    skipped: { noContact: 0, noDevice: 0, alreadySent: 0, windowOver: 0 },
    failed: 0,
  };

  const head = (await deps.reader.latestBlock()) - (deps.confirmations ?? DEFAULT_CONFIRMATIONS);
  const cursor = await deps.store.getCursor(ALERT_CURSOR_ID);
  const lookback = deps.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS;
  let from = cursor !== null ? cursor + 1n : head - lookback > 0n ? head - lookback : 0n;
  // A long outage: skip what is older than the delay window (those recoveries are final anyway).
  if (head - from > lookback) from = head - lookback;
  const lastAllowed = from + (deps.maxBlocksPerRun ?? DEFAULT_MAX_BLOCKS_PER_RUN) - 1n;
  const to = lastAllowed < head ? lastAllowed : head;
  if (from > to) return result;
  result.fromBlock = from.toString();

  let held = false;
  for (let start = from; start <= to; start += chunk) {
    const end = start + chunk - 1n < to ? start + chunk - 1n : to;
    const logs = await deps.reader.recoveryExecuted(start, end);
    let chunkOk = true;
    for (const log of logs) {
      result.events++;
      if (log.executeAfter <= BigInt(deps.nowSec())) {
        result.skipped.windowOver++;
        continue;
      }
      if (deps.mailer && !(await alertByEmail(deps.store, deps.mailer, log, result))) chunkOk = false;
      if (deps.push && !(await alertByPush(deps.store, deps.push, log, result))) chunkOk = false;
    }
    // A failed range is retried next run (sent alerts are protected by their claims); later
    // ranges are still scanned so their alerts are not delayed, but the cursor stays put.
    if (!chunkOk) held = true;
    if (held) continue;
    await deps.store.setCursor(ALERT_CURSOR_ID, end);
    result.toBlock = end.toString();
  }
  return result;
}

/** False only when an alert failed (the claim was released; the range must be retried). */
async function alertByEmail(store: PasskeyEmailStore, mailer: Mailer, log: RecoveryExecutedLog, result: RecoveryAlertResult): Promise<boolean> {
  const contact = await store.getContact(log.wallet);
  if (!contact || contact.emailVerifiedAt === null || !contact.alertsEnabled) {
    result.skipped.noContact++;
    return true;
  }
  if (!(await store.claimAlert(log.wallet, log.nonce, log.executeAfter, "email"))) {
    result.skipped.alreadySent++;
    return true;
  }
  try {
    await mailer.send(recoveryAlertMail(contact.email, log.executeAfter));
    result.sent++;
    return true;
  } catch (e) {
    result.failed++;
    console.error("[passkey-recovery-alerts] alert mail failed:", e instanceof Error ? e.name : typeof e);
    await store.releaseAlert(log.wallet, log.nonce, "email").catch(() => undefined);
    return false;
  }
}

async function alertByPush(store: PasskeyEmailStore, push: AlertPush, log: RecoveryExecutedLog, result: RecoveryAlertResult): Promise<boolean> {
  let tokens: string[];
  try {
    tokens = await push.tokensFor(log.wallet);
  } catch (e) {
    result.failed++;
    console.error("[passkey-recovery-alerts] device lookup failed:", e instanceof Error ? e.name : typeof e);
    return false;
  }
  if (tokens.length === 0) {
    result.skipped.noDevice++;
    return true;
  }
  if (!(await store.claimAlert(log.wallet, log.nonce, log.executeAfter, "push"))) {
    result.skipped.alreadySent++;
    return true;
  }
  try {
    await push.send(tokens, recoveryAlertPush(log.executeAfter));
    result.pushed++;
    return true;
  } catch (e) {
    result.failed++;
    console.error("[passkey-recovery-alerts] alert push failed:", e instanceof Error ? e.name : typeof e);
    const attempts = await store.countAlertFailure(log.wallet, log.nonce, "push").catch(() => 0);
    if (attempts >= MAX_PUSH_ATTEMPTS) {
      // Given up: the claim stays, so the cursor can move on.
      console.error(`[passkey-recovery-alerts] push given up after ${attempts} attempts`);
      return true;
    }
    await store.releaseAlert(log.wallet, log.nonce, "push").catch(() => undefined);
    return false;
  }
}

export function createGnosisRecoveryLogReader(rpcUrl = process.env.GNOSIS_RPC_URL || "https://gnosis-rpc.publicnode.com"): RecoveryLogReader {
  const client = createPublicClient({ chain: gnosis, transport: http(rpcUrl, { timeout: 15_000, retryCount: 1 }) });
  return {
    latestBlock: () => client.getBlockNumber(),
    async recoveryExecuted(fromBlock, toBlock) {
      const logs = await client.getLogs({ address: SOCIAL_RECOVERY_MODULE, event: RECOVERY_EXECUTED_EVENT, fromBlock, toBlock, strict: true });
      return logs.map((l) => ({
        wallet: l.args.wallet,
        nonce: l.args.nonce,
        executeAfter: BigInt(l.args.executeAfter),
        blockNumber: l.blockNumber,
      }));
    },
  };
}
