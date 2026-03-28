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
const attesterNFTAddress = process.env.NEXT_PUBLIC_ATTESTER_NFT || "0x9b6cc0f9BC74E0a64f662028C4CF52e00bD35D4f";
const citizenNFTAddress = process.env.NEXT_PUBLIC_CITIZEN_NFT || "0x78C88B01664Df4AA2F026DA68e834B4f33a3d751";
const governorContractAddress = process.env.NEXT_PUBLIC_GOVERNOR || "0x572c97329ACaCBeBA74e28E3998674E9058A095a";

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
