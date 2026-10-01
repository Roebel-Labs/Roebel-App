import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import { createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";
import { ATTESTER_SAFE, CHAIN_ID } from "../constants";
import { casStatus, settleIfMined, type DispatchDeps } from "../dispatch";
import { notify } from "../notify";
import type { LineRow } from "../repo";
import type { Db } from "../settings";
import { buildEureTransfers } from "./safe-batch";

export interface SafeKit {
  nextNonce(): Promise<number>;
  hashFor(txs: { to: string; value: string; data: string }[], nonce: number): Promise<{ safeTxHash: string; safeTransactionData: Record<string, unknown> }>;
  propose(safeTxHash: string, safeTransactionData: Record<string, unknown>): Promise<void>;
  /** null ONLY when the transaction service positively does not know the hash (404); other errors throw. */
  /** The executed Safe tx at this nonce, if the service has indexed one. */
  executedAtNonce(nonce: number): Promise<{ safeTxHash: string } | null>;
  getTx(safeTxHash: string): Promise<{ isExecuted: boolean; isSuccessful: boolean | null; transactionHash: string | null } | null>;
}
export interface SafeRailDeps {
  db: Db; kit: SafeKit; nowMs: () => number; onchainNonce: () => Promise<number>;
  notifyOwners: (proposalId: string) => Promise<void>;
  receiptStatus: DispatchDeps["receiptStatus"];
}
const STALE_MS = 10 * 60 * 1000;
const RPC = () => process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com";

export function realSafeKit(): SafeKit {
  const apiKey = process.env.SAFE_API_KEY;
  const pk = process.env.GK_PROPOSER_DELEGATE_PRIVKEY;
  if (!apiKey || !pk) throw new Error("SAFE_API_KEY / GK_PROPOSER_DELEGATE_PRIVKEY not set");
  const signer = pk.startsWith("0x") ? pk : `0x${pk}`;
  const api = new SafeApiKit({ chainId: BigInt(CHAIN_ID), apiKey });
  const init = (withSigner: boolean) =>
    Safe.init({ provider: RPC(), safeAddress: ATTESTER_SAFE, ...(withSigner ? { signer } : {}) });
  return {
    nextNonce: async () => Number(await api.getNextNonce(ATTESTER_SAFE)),
    hashFor: async (txs, nonce) => {
      const safe = await init(false);
      const tx = await safe.createTransaction({ transactions: txs, options: { nonce } }); // >1 tx → MultiSend
      return { safeTxHash: await safe.getTransactionHash(tx), safeTransactionData: tx.data as unknown as Record<string, unknown> };
    },
    propose: async (safeTxHash, safeTransactionData) => {
      const safe = await init(true); // signer = the delegate; signHash does not require ownership
      const sig = await safe.signHash(safeTxHash);
      await api.proposeTransaction({
        safeAddress: ATTESTER_SAFE, safeTransactionData: safeTransactionData as never, safeTxHash,
        senderAddress: privateKeyToAccount(signer as `0x${string}`).address, senderSignature: sig.data,
        origin: "Röbel App – Vorschlags-Auszahlung",
      });
    },
    executedAtNonce: async (nonce) => {
      const r = await api.getMultisigTransactions(ATTESTER_SAFE, { executed: true, nonce: String(nonce) });
      const t = r.results?.[0];
      return t ? { safeTxHash: t.safeTxHash } : null;
    },
    getTx: async (safeTxHash) => {
      try {
        const t = await api.getTransaction(safeTxHash);
        return { isExecuted: !!t.isExecuted, isSuccessful: t.isSuccessful ?? null, transactionHash: t.transactionHash ?? null };
      } catch (e) {
        if ((e as { statusCode?: number } | null)?.statusCode === 404) return null;
        throw e;
      }
    },
  };
}

/** Env-gated rail for the routes: null (with a one-time warning) unless both secrets are set. */
let warned = false;
export function safeRailFromEnv(db: Db, receiptStatus: DispatchDeps["receiptStatus"]):
  { proposeSafe: DispatchDeps["proposeSafe"]; pollSafe: DispatchDeps["pollSafe"] } | null {
  if (!process.env.SAFE_API_KEY || !process.env.GK_PROPOSER_DELEGATE_PRIVKEY) {
    if (!warned) { warned = true; console.warn("[vorhaben] Safe rail disabled: SAFE_API_KEY / GK_PROPOSER_DELEGATE_PRIVKEY not set"); }
    return null;
  }
  const pub = createPublicClient({ chain: gnosis, transport: http(RPC(), { batch: false }) });
  const deps: SafeRailDeps = {
    db, kit: realSafeKit(), nowMs: Date.now, receiptStatus,
    onchainNonce: async () => Number(await pub.readContract({ address: ATTESTER_SAFE, abi: parseAbi(["function nonce() view returns (uint256)"]), functionName: "nonce" })),
    notifyOwners: async (proposalUuid) => {
      const owners = (await pub.readContract({ address: ATTESTER_SAFE, abi: parseAbi(["function getOwners() view returns (address[])"]), functionName: "getOwners" })) as string[];
      const { data } = await db.from("proposals").select("proposal_id, proposal_number").eq("id", proposalUuid).maybeSingle();
      const p = data as { proposal_id: string; proposal_number: number } | null;
      if (!p) return;
      await notify(db, owners.map((w) => ({
        wallet: w, kind: "vorhaben_safe" as const, screen: "vertrag" as const, proposalKey: p.proposal_id,
        title: "Auszahlung freigeben", body: `Für Vorschlag #${p.proposal_number} wartet eine Auszahlung auf deine Signatur in der Gemeinschaftskasse.`,
      })));
    },
  };
  return { proposeSafe: (lines) => proposeSafeBatch(deps, lines), pollSafe: (line) => pollSafeLine(deps, line) };
}

async function releaseAll(db: Db, lines: LineRow[], reason: string): Promise<void> {
  const failed: string[] = [];
  for (const c of lines) {
    const { error } = await db.rpc("release_payout_line", { p_line_id: c.id, p_error: reason });
    if (error) { console.error(`[vorhaben] release ${c.id} failed: ${error.message}`); failed.push(c.id); }
  }
  if (failed.length) throw new Error(`release failed for lines ${failed.join(",")}`);
}

export async function proposeSafeBatch(deps: SafeRailDeps, lines: LineRow[]): Promise<void> {
  if (lines.length === 0) return;
  const claimed: LineRow[] = [];
  for (const l of lines) {
    const { data, error } = await deps.db.rpc("claim_payout_line", { p_line_id: l.id });
    if (error) {
      await releaseAll(deps.db, claimed, "batch_incomplete");
      throw new Error(`claim ${l.id}: ${error.message}`);
    }
    if ((data as unknown[] | null)?.length) claimed.push(l);
    else break;
  }
  if (claimed.length !== lines.length) {
    await releaseAll(deps.db, claimed, "batch_incomplete");
    return;
  }
  let transfers: ReturnType<typeof buildEureTransfers>;
  try {
    transfers = buildEureTransfers(lines);
  } catch (e) {
    // A malformed row never becomes valid by retrying: park it as failed instead of looping forever.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[vorhaben] invalid Safe payout lines ${lines.map((x) => x.id).join(",")}: ${msg}`);
    for (const l of lines) await casStatus(deps.db, l.id, ["sendend"], { status: "fehlgeschlagen", error: `invalid_line: ${msg}`.slice(0, 200) });
    return;
  }
  let hash: { safeTxHash: string; safeTransactionData: Record<string, unknown> };
  let nonce: number;
  try {
    nonce = await deps.kit.nextNonce();
    hash = await deps.kit.hashFor(transfers, nonce);
  } catch (e) {
    // Nothing is stored yet, so a release is safe.
    await releaseAll(deps.db, claimed, "batch_prepare_failed");
    throw e;
  }
  // Store the hash BEFORE proposing, so a crash/timeout during propose stays resolvable by pollSafeLine.
  for (const l of lines) {
    if (!(await casStatus(deps.db, l.id, ["sendend"], { safe_tx_hash: hash.safeTxHash, safe_nonce: nonce })))
      throw new Error(`line ${l.id} left sendend before its Safe hash was stored`);
  }
  await deps.kit.propose(hash.safeTxHash, hash.safeTransactionData); // throws → stays sendend; pollSafeLine resolves
  for (const l of lines) await casStatus(deps.db, l.id, ["sendend"], { status: "vorgeschlagen" });
  await deps.notifyOwners(lines[0].proposal_id);
}

export async function pollSafeLine(deps: SafeRailDeps, line: LineRow): Promise<void> {
  if (!line.safe_tx_hash) return;
  const OPEN = ["sendend", "vorgeschlagen"];
  const tx = await deps.kit.getTx(line.safe_tx_hash);
  if (!tx) {
    const started = line.attempt_started_at ? new Date(line.attempt_started_at).getTime() : 0;
    if (line.status === "sendend" && deps.nowMs() - started > STALE_MS) {
      await casStatus(deps.db, line.id, ["sendend"], { status: "geplant", safe_tx_hash: null, safe_nonce: null, error: "propose_failed" });
    }
    return;
  }
  if (tx.isExecuted) {
    if (tx.isSuccessful === false) {
      await casStatus(deps.db, line.id, OPEN, { status: "fehlgeschlagen", error: "reverted" });
    } else if (tx.isSuccessful && tx.transactionHash) {
      // Persist the execution hash first, then settle through the receipt-checked CAS path.
      if (!(await casStatus(deps.db, line.id, OPEN, { tx_hash: tx.transactionHash }))) return;
      await settleIfMined(deps, { ...line, tx_hash: tx.transactionHash });
    } // else: service has not finished indexing the execution; stay pending
    return;
  }
  if (line.safe_nonce !== null && (await deps.onchainNonce()) > line.safe_nonce) {
    // Only a DIFFERENT executed tx at this nonce proves replacement; indexing lag must never fail a possibly-paid line.
    const other = await deps.kit.executedAtNonce(line.safe_nonce);
    if (other && other.safeTxHash !== line.safe_tx_hash) {
      if (await casStatus(deps.db, line.id, OPEN, { status: "fehlgeschlagen", error: "replaced" }))
        console.error(`[vorhaben] Safe tx ${line.safe_tx_hash} was replaced at nonce ${line.safe_nonce}; line ${line.id} needs manual review`);
    }
    return;
  }
  if (line.status === "sendend") {
    if (await casStatus(deps.db, line.id, ["sendend"], { status: "vorgeschlagen" })) await deps.notifyOwners(line.proposal_id);
  }
}
