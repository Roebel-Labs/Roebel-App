import { bindingStatement, isNostrPubkey, verifyBindingEvent } from "@netizen-labs/nostr";
import type { ChainVerifier, RegistryRow, VerificationOutcome } from "./types.js";

const BINDING_FAILURE_REASONS = {
  "wrong-kind": "binding-wrong-kind",
  "wrong-d-tag": "binding-wrong-d-tag",
  "account-mismatch": "binding-account-mismatch",
  "statement-mismatch": "binding-statement-mismatch",
  "bad-signature": "binding-bad-signature",
} as const;

/**
 * Decide whether one registry row earns a line in the relay allow-list.
 *
 * Four gates, cheapest first — the two pure checks run before any RPC, so a
 * malformed row never costs a network round trip:
 *
 *   1. the row is well-formed and not revoked
 *   2. the Nostr half of the binding verifies (offline Schnorr)
 *   3. the wallet half verifies via ERC-1271 (on-chain)
 *   4. the wallet currently holds a CitizenNFTv2 (on-chain) — sets `citizen`
 *
 * `allowed` (relay membership) needs gates 1-3 only; any bound account may
 * write. `citizen` additionally needs the NFT and gates citizen-only kinds.
 *
 * Binding/signature RPC failures are **thrown, not swallowed** — the caller
 * aborts the whole pass rather than treating an unreachable node as "invalid
 * signature" and revoking half the town. An NFT-check failure only costs that
 * row its `citizen` flag for this pass (logged); membership is unaffected.
 */
export async function verifyRegistryRow(
  row: RegistryRow,
  chain: ChainVerifier,
  log: (message: string) => void = () => {},
): Promise<VerificationOutcome> {
  const wallet = (row.wallet_address ?? "").toLowerCase();

  if (!/^0x[0-9a-f]{40}$/.test(wallet) || !row.binding_event || !row.eth_signature) {
    return { allowed: false, wallet, reason: "malformed-row" };
  }
  if (row.revoked_at) {
    return { allowed: false, wallet, reason: "revoked" };
  }

  const binding = verifyBindingEvent(row.binding_event, wallet);
  if (!binding.valid) {
    return { allowed: false, wallet, reason: BINDING_FAILURE_REASONS[binding.reason] };
  }

  // The row's stored pubkey must be the one that actually signed the binding —
  // otherwise a valid binding could be filed under someone else's key.
  if (!isNostrPubkey(row.pubkey_hex?.toLowerCase() ?? "") ||
      row.pubkey_hex.toLowerCase() !== binding.pubkey) {
    return { allowed: false, wallet, reason: "pubkey-mismatch" };
  }

  const statement = bindingStatement({ account: wallet, npub: binding.npub });
  const walletSignatureValid = await chain.verifyWalletSignature({
    address: wallet,
    message: statement,
    signature: row.eth_signature,
  });
  if (!walletSignatureValid) {
    return { allowed: false, wallet, reason: "wallet-signature-invalid" };
  }

  let citizen = false;
  try {
    citizen = await chain.holdsCitizenNft(wallet);
  } catch (error) {
    log(`  citizen check failed for ${wallet}: ${error instanceof Error ? error.message : error}`);
  }

  return { allowed: true, citizen, pubkey: binding.pubkey, wallet };
}
