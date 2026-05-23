import { createThirdwebClient, getContract } from "thirdweb";
import { base } from "thirdweb/chains";
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
export const governorContractAddress = process.env.NEXT_PUBLIC_GOVERNOR || "0xb5333aFf2A0015aF0d58C0f92c826Fc503e63177";

// MACI v2 infrastructure
export const maciAddress = process.env.NEXT_PUBLIC_MACI || "0x2922e42945a10d1F765E3f9Cab136421d4556D30";
export const maciVerifierAddress = process.env.NEXT_PUBLIC_MACI_VERIFIER || "0x6682A865C9e2cAAC89DAAAdf25e15bc90db482D8";
export const maciVkRegistryAddress = process.env.NEXT_PUBLIC_MACI_VK_REGISTRY || "0xd6EF1Ad8cCAFC41bf025efe620e27d8CF18B91ED";
export const maciCoordinatorAddress = process.env.NEXT_PUBLIC_MACI_COORDINATOR || "0x5e6528D22283Daf1E4340B39d48a4D3CeaDC184C";

/** Block at (or slightly before) the MACI core deployment on Base mainnet.
 *  Used as the lower bound for SignUp event scans when recovering a citizen's
 *  stateIndex after an app cold-start. The actual deploy was around block
 *  ~45,697,600; we round down to absorb any RPC drift. */
export const MACI_DEPLOY_BLOCK = 45697000n;

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

/** Build a Poll contract handle for a per-proposal MACI Poll address. */
export function getPollContract(pollAddress: string) {
	return getContract({ client, address: pollAddress, chain: base });
}

/** Build a Tally contract handle for a per-proposal MACI Tally address. */
export function getTallyContract(tallyAddress: string) {
	return getContract({ client, address: tallyAddress, chain: base });
}
