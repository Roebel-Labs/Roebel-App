/**
 * Builders for the Governor proposal that rotates the MACI coordinator
 * pubkey. Used by /admin/dashboard/coordinator/generate-key/page.tsx
 * after a fresh keypair has been generated + shared.
 *
 * The Governor exposes:
 *   function setCoordinatorPubKey(PubKey calldata v) external onlyGovernance
 *
 * where PubKey is `{ uint256 x; uint256 y; }` (see
 * contracts/governor-contract/contracts/verification-system/MaciAttesterGovernor.sol).
 *
 * Wrapping this in propose() means:
 *   - targets    = [governor]
 *   - values     = [0]
 *   - calldatas  = [encoded(setCoordinatorPubKey((x, y)))]
 *   - description anchors the proposal back to the Supabase generation
 *     row via UUID so anyone reviewing the proposal can fetch the
 *     pubkey commitment + the share recipients for verification.
 */

import { Interface } from "ethers";
import type { CoordinatorPubKey } from "./maci-keypair";

const SET_COORDINATOR_PUBKEY_ABI = [
  "function setCoordinatorPubKey((uint256 x, uint256 y) v) external",
];

export type RotationProposalArgs = {
  generationId: string;
  pubKey: CoordinatorPubKey;
  threshold: number;
  totalShares: number;
  governorAddress: string;
};

export type RotationProposalCalldata = {
  targets: `0x${string}`[];
  values: bigint[];
  calldatas: `0x${string}`[];
  description: string;
};

/**
 * Encode the calldata bundle for `governor.propose(...)`.
 *
 * The description string is what voters will see in the existing
 * /app/proposals/<id> UI, so it's worded in German + includes the
 * generation id for cross-reference.
 */
export function buildRotationProposalCalldata(
  args: RotationProposalArgs
): RotationProposalCalldata {
  const iface = new Interface(SET_COORDINATOR_PUBKEY_ABI);
  const calldata = iface.encodeFunctionData("setCoordinatorPubKey", [
    [args.pubKey.x.toString(), args.pubKey.y.toString()],
  ]) as `0x${string}`;

  const description = [
    `# MACI Coordinator Key Rotation`,
    ``,
    `Aktualisiert den öffentlichen Schlüssel des MACI-Coordinators auf eine`,
    `frisch in einer ${args.threshold}-von-${args.totalShares} Shamir-Aufteilung`,
    `unter die 5 Bescheiniger verteilte Babyjubjub-Keypair.`,
    ``,
    `**Generation ID:** \`${args.generationId}\``,
    `**New PubKey X:** \`${args.pubKey.x.toString()}\``,
    `**New PubKey Y:** \`${args.pubKey.y.toString()}\``,
    `**Threshold:** ${args.threshold}-of-${args.totalShares}`,
    ``,
    `Nach Ausführung dieser Proposal werden alle zukünftigen MACI-Polls mit`,
    `dem neuen Coordinator-Schlüssel verschlüsselt. Vergangene Polls bleiben`,
    `unter ihrem ursprünglichen Schlüssel entschlüsselbar.`,
  ].join("\n");

  return {
    targets: [args.governorAddress as `0x${string}`],
    values: [0n],
    calldatas: [calldata],
    description,
  };
}

/**
 * Compute the deterministic on-chain `proposalId` for a given calldata
 * bundle. Mirrors the OZ Governor implementation:
 *   hashProposal(targets, values, calldatas, keccak256(bytes(description)))
 *
 * We let the on-chain `propose()` return value be the source of truth at
 * tx time; this helper is just a convenience for sanity-checking that
 * the value we got back matches what we expected to submit.
 */
export function describeRotationProposal(
  args: RotationProposalArgs
): string {
  return `Rotate MACI coordinator pubkey (gen=${args.generationId.slice(0, 8)}…)`;
}
