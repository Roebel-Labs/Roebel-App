/**
 * Central MACI/governance config used by the admin dashboard.
 *
 * Source of truth: contracts/governor-contract/deployments/base.json. Mirror
 * relevant fields here so the web app can render them without bundling the
 * deployment JSON. Update this file when a new rotation lands (the deploy
 * script archives old addresses with timestamps in base.json).
 */

import { getContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { client } from "@/app/client";

// ----- live infrastructure on Base mainnet -----

export const MACI_INFRA = {
  // Rotated 2026-05-23: governance-mutable thresholds, 1+1 CitizenNFT
  // revocation, O(1) burn lookup, multi-sig rejection. Both NFTs owned by timelock.
  attesterNFT: "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb",
  citizenNFT: "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB",

  // MACI v2 core — rotated 2026-05-24 (NEW core binds to the new gatekeeper;
  // prior MACI was permanently stuck on the old gatekeeper because
  // MACI.signUpGatekeeper is `immutable`).
  maci: "0xEbcF0628c987B34cf2C2261aCe7b2F92f664492E",
  verifier: "0x6682A865C9e2cAAC89DAAAdf25e15bc90db482D8",
  voiceCreditProxy: "0x5b358A77E89FF3d699607b4fC235b381d67f3d05",
  pollFactory: "0x604B8b61488e02b2EEeeB4993825afD436D526fE",
  messageProcessorFactory: "0x34EDb8C26cc759D3e63C2580323eDcB0A136dAAb",
  tallyFactory: "0xC6351B4470CE0C1fab41b45a902554A8040Df463",

  // Rotated 2026-05-23 alongside the NFT redeploy (gatekeeper binds to the new CitizenNFT).
  // Re-pointed to the new MACI core via setMaciInstance() on 2026-05-24.
  gatekeeper: "0xcf12E8da5f7599dd9162e07388715bBa11739F2e",

  // Rotated 2026-05-08 to align VK keys with the production zKey signature.
  vkRegistry: "0xd6EF1Ad8cCAFC41bf025efe620e27d8CF18B91ED",

  // Active Governor + Timelock — rotated 2026-05-24 alongside MACI core
  // (Governor's `maci` is immutable; new MACI → new Governor → new Timelock).
  // votingPeriod is now 1 h (was 7 days). NFTs still owned by the prior
  // Timelock at 0xe8B8149F… — NFT threshold changes go through the prior
  // Governor 0xb5333aFf… not this one.
  governor: "0xffCeE774e226f354f261B5Cd264ce1325385A926",
  timelock: "0xB297f779ffBE41689Ce35927AEFC415B00abf8E0",

  // Off-chain coordinator EOA (Fly.io). Holds the Babyjubjub privkey + ETH key.
  coordinator: "0x5e6528D22283Daf1E4340B39d48a4D3CeaDC184C",
} as const;

// ----- production-ceremony zKey parameters baked into VkRegistry -----

export const MACI_TREE_DEPTHS = {
  stateTreeDepth: 14,
  intStateTreeDepth: 5,
  messageTreeSubDepth: 2,
  messageTreeDepth: 9,
  voteOptionTreeDepth: 3,
  messageBatchSize: 25,
} as const;

// ----- Governor parameter snapshot (also re-read live by useMaciInfra) -----

export const GOVERNOR_PARAMS_SNAPSHOT = {
  votingPeriodSeconds: 3600, // 1 hour (test phase); raise via Governor.setVotingPeriod() governance proposal
  quorumAbsolute: 2,
  quorumPercentage: 10,
  tallyGracePeriodSeconds: 604800, // 7 days
  timelockMinDelaySeconds: 3600, // 1 hour (test phase); raise via timelock.updateDelay()
} as const;

// ----- coordinator service URL -----

export const COORDINATOR_BASE_URL = "https://roebel-maci-coordinator.fly.dev";

// ----- archived addresses (rotation history) -----

export interface ArchivedAddress {
  kind: "governor" | "timelock" | "vkRegistry";
  address: string;
  archivedAt: string; // ISO
  reason: string;
}

export const ROTATION_HISTORY: ArchivedAddress[] = [
  {
    kind: "governor",
    address: "0x3B13913efe6E8bAACeE51f98cc83892320445c2e",
    archivedAt: "2026-05-07T21:05:08Z",
    reason: "Initial public-vote MaciAttesterGovernor; rotated when MACI was first wired in.",
  },
  {
    kind: "timelock",
    address: "0x62a32e9933790a5063AB5545012a7F8c307a2e4A",
    archivedAt: "2026-05-07T21:05:08Z",
    reason: "Bound to first Governor; rotated alongside.",
  },
  {
    kind: "vkRegistry",
    address: "0x585AAbaAE0CfAD7d11EbF89f470B03135BF88e38",
    archivedAt: "2026-05-08T15:42:39Z",
    reason: "messageBatchSize=5 baked into VK keys; replaced after switching MESSAGE_BATCH_DEPTH to 2.",
  },
  {
    kind: "governor",
    address: "0xc637C95623837319584aA1a2fCb54C7BFDe315A6",
    archivedAt: "2026-05-08T15:43:19Z",
    reason: "First MACI Governor; messageTreeSubDepth=1 didn't match prod zKey. Rotated to fix.",
  },
  {
    kind: "timelock",
    address: "0x6C5dc64eB88D6Dcd8807965c4F2Df38661B777dF",
    archivedAt: "2026-05-08T15:43:19Z",
    reason: "Bound to second Governor.",
  },
  {
    kind: "governor",
    address: "0xE7123B3190f42914b92045308687AF49Cc3d9d6F",
    archivedAt: "2026-05-08T16:52:16Z",
    reason: "7-day-voting Governor; rotated to a 30-min config for compressed E2E testing.",
  },
  {
    kind: "timelock",
    address: "0xA4E366bF1Ce6BE74b6965f89E5513a5c42bcd892",
    archivedAt: "2026-05-08T16:52:16Z",
    reason: "Bound to 7-day Governor.",
  },
  {
    kind: "vkRegistry",
    address: "0x26Eddb1d4c45e7cA516B54Ed4105e252cc608BAc",
    archivedAt: "2026-05-08T20:57:40Z",
    reason: "intStateTreeDepth=9 / messageTreeDepth=2 didn't match the 14-9-2-3 / 14-5-3 zKeys. Rotated after correcting depths.",
  },
  {
    kind: "governor",
    address: "0x11ed03Db610c88b010FfE38B13142D3657f2E84f",
    archivedAt: "2026-05-08T20:58:02Z",
    reason: "Wrong-depth Governor; rotated alongside its VkRegistry.",
  },
  {
    kind: "timelock",
    address: "0x41FC07b94070aA7319516C7f193Cca05D06Ee28b",
    archivedAt: "2026-05-08T20:58:02Z",
    reason: "Bound to wrong-depth Governor.",
  },
  {
    kind: "governor",
    address: "0x61E89990225114b941A23cD2a0864C52ddc1E60B",
    archivedAt: "2026-05-09T08:22:05Z",
    reason: "state() override trusted vacuously-true Tally.isTallied(); rotated after swapping to totalTallyResults() > 0.",
  },
  {
    kind: "timelock",
    address: "0xc50C8E2d7b8d13169aB2FAcb5000004d8Eb28465",
    archivedAt: "2026-05-09T08:22:05Z",
    reason: "Bound to the previous (isTallied-bug) Governor.",
  },
  {
    kind: "governor",
    address: "0x5983F6300bCE3D9C1336a858Bd73F259bB8330F3",
    archivedAt: "2026-05-23T00:00:00Z",
    reason: "Rotated alongside the NFT redeploy. New Governor adds governance-tunable setters (quorumPercentage, quorumAbsolute, tallyGracePeriod, coordinator, coordinatorPubKey) and rebinds to the new AttesterNFT + CitizenNFT.",
  },
  {
    kind: "timelock",
    address: "0xD1d6d0c8fd4D232D810FF920c802d748537E14Fe",
    archivedAt: "2026-05-23T00:00:00Z",
    reason: "Bound to the previous Governor; redeployed with 1-hour min delay for the test phase (raise via updateDelay() proposal).",
  },
  {
    kind: "governor",
    address: "0xb5333aFf2A0015aF0d58C0f92c826Fc503e63177",
    archivedAt: "2026-05-24T00:00:00Z",
    reason: "Rotated alongside MACI core. Prior Governor + MACI core paired with the OLD gatekeeper (MACI.signUpGatekeeper is immutable), so NEW CitizenNFT holders couldn't sign up to vote. Also fixed 7d → 1h voting period. This Governor STILL owns AttesterNFT + CitizenNFT — NFT threshold proposals go through it, not the current Governor.",
  },
  {
    kind: "timelock",
    address: "0xe8B8149F9373a56F55112e5Fc867E58308D014c1",
    archivedAt: "2026-05-24T00:00:00Z",
    reason: "Bound to the previous Governor (Governor's _executor is immutable). Still owns the two NFTs — NFT threshold proposals route through this Timelock.",
  },
];

// ----- thirdweb contract handles for chain reads -----

export const maciCoreContract = getContract({
  client,
  address: MACI_INFRA.maci,
  chain: base,
});

export const maciGovernorContract = getContract({
  client,
  address: MACI_INFRA.governor,
  chain: base,
});

export function basescanAddress(addr: string) {
  return `https://basescan.org/address/${addr}`;
}

export function basescanTx(hash: string) {
  return `https://basescan.org/tx/${hash}`;
}
