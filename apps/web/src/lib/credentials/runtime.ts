// Production wiring for the credential routes: Supabase (service role) store, a Gnosis reader of
// the configured register, the receipt lookup and the push hub. Server-only; never loaded by tests.
import { createPublicClient, http, TransactionReceiptNotFoundError, type Hex } from "viem";
import { gnosis } from "viem/chains";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Deps } from "./actions";
import { registryConfig } from "./config";
import { sendNotificationNotifier } from "./notify";
import { createNodeRegistryReader } from "./rights";
import { supabaseCredentialStore } from "./store-supabase";

const DEFAULT_GNOSIS_RPC = "https://rpc.gnosischain.com";

/** null when CREDENTIAL_REGISTRY_ADDRESS / _DEPLOY_BLOCK are not set (routes answer 503 NOT_CONFIGURED). */
export function credentialDeps(): Deps | null {
  const cfg = registryConfig();
  if (!cfg) return null;
  // batch:false — public Gnosis RPCs have returned null for batched calls before.
  const client = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL || DEFAULT_GNOSIS_RPC, { batch: false, timeout: 10_000 }) });
  return {
    store: supabaseCredentialStore(createAdminClient()),
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
    // Task 6 wires applyConfirmedAction here. Until then the action is marked done by
    // recordSubmitted and the chain sync applies the logs (it finds batches by root).
    applyConfirmed: async () => {},
  };
}
