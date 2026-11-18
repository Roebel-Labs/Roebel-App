// Production wiring for the credential routes: Supabase (service role) store, a Gnosis reader of
// the configured register, the receipt lookup and the push hub. Server-only; never loaded by tests.
import { CREDENTIAL_REGISTRY_ABI, REGISTER_EVENTS, type RegisterLog } from "@netizen-labs/credential-registry";
import { createPublicClient, createWalletClient, http, TransactionReceiptNotFoundError, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Deps } from "./actions";
import { AUTO_MIN_BALANCE_WEI, badgeDelegateAddress, type AutoDeps } from "./badge-delegate";
import { registryConfig } from "./config";
import { deliverInvitations, MAX_MAILS_PER_RUN, type DeliveryDeps } from "./delivery";
import { createResendMailer } from "@/lib/passkey/email-mailer";
import { sendNotificationNotifier } from "./notify";
import { createNodeRegistryReader } from "./rights";
import { supabaseCredentialStore } from "./store-supabase";
import { applyConfirmedAction, type SyncDeps } from "./sync";

const DEFAULT_GNOSIS_RPC = "https://rpc.gnosischain.com";
/** eth_getLogs block span per request (public Gnosis RPCs refuse very wide ranges). */
const LOG_CHUNK = 5_000n;

const REGISTER_EVENT_ABI = CREDENTIAL_REGISTRY_ABI.filter((e) => e.type === "event" && (REGISTER_EVENTS as readonly string[]).includes(e.name));

function gnosisClient() {
  // batch:false — public Gnosis RPCs have returned null for batched calls before.
  return createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL || DEFAULT_GNOSIS_RPC, { batch: false, timeout: 10_000 }) });
}

/** null when the register is not configured (the cron answers not_configured). */
export function credentialSyncDeps(): SyncDeps | null {
  const cfg = registryConfig();
  if (!cfg) return null;
  const client = gnosisClient();
  const store = supabaseCredentialStore(createAdminClient());
  const notify = sendNotificationNotifier();
  const resendKey = process.env.RESEND_API_KEY;
  // One mail budget per deps object, i.e. per request: the cron's sync and sweep share it.
  const delivery: DeliveryDeps = {
    store,
    notify,
    mailer: resendKey ? createResendMailer(resendKey) : null,
    now: () => Date.now(),
    mailBudget: { left: MAX_MAILS_PER_RUN },
  };
  return {
    store,
    registry: cfg.address,
    deployBlock: cfg.deployBlock,
    head: () => client.getBlockNumber(),
    async getLogs(from, to) {
      const out: RegisterLog[] = [];
      for (let lo = from; lo <= to; lo += LOG_CHUNK) {
        const hi = lo + LOG_CHUNK - 1n > to ? to : lo + LOG_CHUNK - 1n;
        const logs = await client.getLogs({ address: cfg.address as Address, events: REGISTER_EVENT_ABI as never, fromBlock: lo, toBlock: hi, strict: true });
        for (const l of logs as unknown as { eventName: RegisterLog["eventName"]; args: Record<string, unknown>; blockNumber: bigint; logIndex: number }[]) {
          out.push({ eventName: l.eventName, args: l.args, blockNumber: l.blockNumber, logIndex: l.logIndex });
        }
      }
      return out;
    },
    async deliver(batchRowId) {
      const r = await deliverInvitations(delivery, batchRowId);
      console.log("[credentials/sync] delivered", batchRowId, r);
    },
    notify,
    now: () => Date.now(),
  };
}

/** null when CREDENTIAL_REGISTRY_ADDRESS / _DEPLOY_BLOCK are not set (routes answer 503 NOT_CONFIGURED). */
export function credentialDeps(): Deps | null {
  const cfg = registryConfig();
  if (!cfg) return null;
  const client = gnosisClient();
  const sync = credentialSyncDeps();
  return {
    store: sync?.store ?? supabaseCredentialStore(createAdminClient()),
    reader: createNodeRegistryReader({ client: client as never, address: cfg.address }),
    async receipt(tx: Hex) {
      try {
        const r = await client.getTransactionReceipt({ hash: tx });
        return { status: r.status, blockNumber: r.blockNumber, logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data, blockNumber: l.blockNumber, logIndex: l.logIndex })) };
      } catch (e) {
        if (e instanceof TransactionReceiptNotFoundError) return null;
        throw e;
      }
    },
    head: () => client.getBlockNumber(),
    notify: sendNotificationNotifier(),
    now: () => Date.now(),
    registry: cfg.address,
    // The receipt's register logs go through the sync handlers right away (idempotent with the cron).
    applyConfirmed: async (actionId, logs) => {
      if (sync) await applyConfirmedAction(sync, actionId, logs);
    },
  };
}

/**
 * The node badge key's deps (cron and badge_nudge). null when the register or
 * CREDENTIAL_BADGE_DELEGATE_KEY is not configured: then nothing is ever sent.
 */
export function badgeAutoDeps(): AutoDeps | null {
  const cfg = registryConfig();
  const node = badgeDelegateAddress();
  const key = process.env.CREDENTIAL_BADGE_DELEGATE_KEY?.trim();
  if (!cfg || !node || !key) return null;
  const client = gnosisClient();
  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({ account, chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL || DEFAULT_GNOSIS_RPC, { batch: false, timeout: 15_000 }) });
  const admin = createAdminClient();
  return {
    store: supabaseCredentialStore(admin),
    reader: {
      isDelegate: (typeId, who) =>
        client.readContract({ address: cfg.address as Address, abi: CREDENTIAL_REGISTRY_ABI, functionName: "isDelegate", args: [typeId, who] } as never) as Promise<boolean>,
    },
    send: (call) => wallet.sendTransaction({ to: call.to, data: call.data, account, chain: gnosis }),
    balance: () => client.getBalance({ address: node }),
    // Missing key, read error or anything but 'true' = off: closed is the safe direction.
    async killSwitch() {
      try {
        const { data, error } = await admin.from("app_settings").select("value").eq("key", "credentials_badge_delegate_enabled").maybeSingle();
        if (error) return true;
        return String(data?.value ?? "").trim() !== "true";
      } catch {
        return true;
      }
    },
    now: () => Date.now(),
    registry: cfg.address as Address,
    minBalanceWei: AUTO_MIN_BALANCE_WEI,
    node,
  };
}
