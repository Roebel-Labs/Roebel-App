import { createThirdwebClient, getContract } from "thirdweb";
import { base, defineChain } from "thirdweb/chains";
import Constants from "expo-constants";

const clientId = Constants.expoConfig?.extra?.THIRDWEB_CLIENT_ID ??
                 process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID ??
                 "";

if (!clientId) {
	console.warn(
		"⚠️ Missing EXPO_PUBLIC_THIRDWEB_CLIENT_ID - Thirdweb features will be disabled",
	);
}

export const client = createThirdwebClient({
	clientId: clientId || "dummy-client-id", // Provide fallback to prevent crashes
});

export const chain = base;

// Read-only Base chain pinned to a reliable public RPC. The default thirdweb
// hosted RPC (clientId-only) is intermittently rate-limited on preview builds,
// which surfaced as "Blockchain RPC unavailable" and stalled the MACI SignUp
// event scan. Use this for reads / event scans / eth_blockNumber; keep `base`
// (+ client) for gasless tx submission, which needs the thirdweb bundler.
const BASE_READ_RPC = process.env.EXPO_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";
export const baseRead = defineChain({ ...base, rpc: BASE_READ_RPC });

export const contract = getContract({
	client,
	address: "0x82e50a6BF13A70366eDFC871f8FB8a428C43Dc03",
	chain: base,
});

export const usdcContract = getContract({
	address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
	chain: base,
	client,
});

// Governance Contracts (Base mainnet, source of truth:
// contracts/governor-contract/deployments/base.json).
//
// Two governance regimes coexist:
//  - legacyGovernorContract — old public-vote AttesterGovernor; kept for
//    historical proposals. Reads only.
//  - governorContract       — current MACI v2 privacy-voting governor. All
//    new proposals + votes go here.
// Rotated 2026-05-23: governance-mutable thresholds, 1+1 revocation, Bug A/B/C fixes.
export const attesterNFTAddress = process.env.NEXT_PUBLIC_ATTESTER_NFT || "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb";
export const citizenNFTAddress = process.env.NEXT_PUBLIC_CITIZEN_NFT || "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB";

export const legacyGovernorContractAddress = process.env.NEXT_PUBLIC_LEGACY_GOVERNOR || "0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b";
// Rotated 2026-05-24: new Governor binds to a fresh MACI core that uses the new
// gatekeeper for signup (the prior MACI was permanently stuck on the old
// gatekeeper). Voting period is now 1 h.
export const governorContractAddress = process.env.NEXT_PUBLIC_GOVERNOR || "0xCd3b0feEE7C7dAEf7976A46627E5a6fE310A4F91";

// MACI v2 infrastructure. MACI core rotated 2026-05-24 (see governor comment above).
export const maciAddress = process.env.NEXT_PUBLIC_MACI || "0x76e0097D2F1e0D747B3dd58622c76b278e2f587a";
export const maciVerifierAddress = process.env.NEXT_PUBLIC_MACI_VERIFIER || "0x6682A865C9e2cAAC89DAAAdf25e15bc90db482D8";
export const maciVkRegistryAddress = process.env.NEXT_PUBLIC_MACI_VK_REGISTRY || "0xd6EF1Ad8cCAFC41bf025efe620e27d8CF18B91ED";
export const maciCoordinatorAddress = process.env.NEXT_PUBLIC_MACI_COORDINATOR || "0x5e6528D22283Daf1E4340B39d48a4D3CeaDC184C";

/** Block at (or slightly before) the MACI core deployment on Base mainnet.
 *  Used as the lower bound for SignUp event scans when recovering a citizen's
 *  stateIndex after an app cold-start. The current MACI core
 *  (0xEbcF0628c987B34cf2C2261aCe7b2F92f664492E, rotated 2026-05-24) was
 *  deployed around block ~46,387,xxx; we round down ~30 minutes' worth of
 *  blocks for RPC-drift safety. KEEP THIS IN SYNC with the MACI core
 *  address above — a stale value forces the SignUp event scan to span
 *  hundreds of thousands of blocks, which the public Base RPC will reject
 *  and which can crash the app at cold start. */
export const MACI_DEPLOY_BLOCK = 47070086n;

export const attesterNFTContract = getContract({
	client,
	address: attesterNFTAddress,
	chain: base,
});

export const citizenNFTContract = getContract({
	client,
	address: citizenNFTAddress,
	chain: base,
});

export const legacyGovernorContract = getContract({
	client,
	address: legacyGovernorContractAddress,
	chain: base,
});

export const governorContract = getContract({
	client,
	address: governorContractAddress,
	chain: base,
});

export const maciContract = getContract({
	client,
	address: maciAddress,
	chain: base,
});

// Same MACI core, but pinned to the reliable read RPC — used for the SignUp
// event scan (recovering a citizen's stateIndex) so it isn't blocked by the
// hosted-RPC rate limit.
export const maciReadContract = getContract({
	client,
	address: maciAddress,
	chain: baseRead,
});

/** Build a Poll contract handle for a per-proposal MACI Poll address. */
export function getPollContract(pollAddress: string) {
	return getContract({ client, address: pollAddress, chain: base });
}

/** Build a Tally contract handle for a per-proposal MACI Tally address. */
export function getTallyContract(tallyAddress: string) {
	return getContract({ client, address: tallyAddress, chain: base });
}
