/**
 * Recovery alerts: the 3-day cancel window of the Candide SocialRecoveryModule only protects
 * people who find out. This scans the SRM for `RecoveryExecuted` (the event that starts the
 * delay) and emails the wallet's verified warning address.
 *
 *   event RecoveryExecuted(address indexed wallet, address[] indexed newOwners,
 *     uint256 newThreshold, uint256 nonce, uint64 executeAfter, uint256 guardiansApprovalCount)
 *   (verified ABI of 0x38275826E1933303E508433dD5f289315Da2541c on Gnosis, compiler 0.8.20)
 *
 * Idempotent per (wallet, recovery nonce): the alert is claimed in the store BEFORE sending and
 * released if the send fails, so a re-run neither double-sends nor drops it. The cursor only
 * advances past a block range once every alert in it was sent or skipped.
 * No log line carries an email address.
 */
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { gnosis } from "viem/chains";
import type { PasskeyEmailStore } from "./email-store";
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

export type RecoveryExecutedLog = { wallet: Address; nonce: bigint; executeAfter: bigint; blockNumber: bigint };

export interface RecoveryLogReader {
  latestBlock(): Promise<bigint>;
  recoveryExecuted(fromBlock: bigint, toBlock: bigint): Promise<RecoveryExecutedLog[]>;
}

export type RecoveryAlertResult = {
  fromBlock: string | null;
  toBlock: string | null;
  events: number;
  sent: number;
  skipped: { noContact: number; alreadySent: number; windowOver: number };
  failed: number;
};

export async function runRecoveryAlerts(deps: {
  reader: RecoveryLogReader;
  store: PasskeyEmailStore;
  mailer: Mailer;
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
    skipped: { noContact: 0, alreadySent: 0, windowOver: 0 },
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
      const contact = await deps.store.getContact(log.wallet);
      if (!contact || contact.emailVerifiedAt === null || !contact.alertsEnabled) {
        result.skipped.noContact++;
        continue;
      }
      if (!(await deps.store.claimAlert(log.wallet, log.nonce, log.executeAfter))) {
        result.skipped.alreadySent++;
        continue;
      }
      try {
        await deps.mailer.send(recoveryAlertMail(contact.email, log.executeAfter));
        result.sent++;
      } catch (e) {
        result.failed++;
        chunkOk = false;
        console.error("[passkey-recovery-alerts] alert mail failed:", e instanceof Error ? e.name : typeof e);
        await deps.store.releaseAlert(log.wallet, log.nonce).catch(() => undefined);
      }
    }
    if (!chunkOk) break; // retry this range next run; sent alerts are protected by their claims
    await deps.store.setCursor(ALERT_CURSOR_ID, end);
    result.toBlock = end.toString();
  }
  return result;
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
