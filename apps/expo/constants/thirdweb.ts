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

// Governance Contracts
export const attesterNFTAddress = process.env.NEXT_PUBLIC_ATTESTER_NFT || "0xa06F09Cb406880512326318fbC09Cdb28631DA73";
export const citizenNFTAddress = process.env.NEXT_PUBLIC_CITIZEN_NFT || "0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7";
export const governorContractAddress = process.env.NEXT_PUBLIC_GOVERNOR || "0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b";

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

export const governorContract = getContract({
	client,
	address: governorContractAddress,
	chain: base,
});
