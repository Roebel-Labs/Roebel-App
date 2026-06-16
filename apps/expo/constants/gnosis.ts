import { getContract } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { client } from "@/constants/thirdweb";

export const gnosis = defineChain(100);

// Pinned to a reliable public Gnosis RPC; override via env for staging/prod.
const GNOSIS_READ_RPC =
	process.env.EXPO_PUBLIC_GNOSIS_RPC_URL || "https://rpc.gnosischain.com";
export const gnosisRead = defineChain({ ...gnosis, rpc: GNOSIS_READ_RPC });

// CitizenNFT re-deployed on Gnosis in Phase 0 (address set later via env).
export const citizenNFTGnosisAddress =
	process.env.EXPO_PUBLIC_CITIZEN_NFT_GNOSIS || "";

// Röbeltaler group address, set after the one-time group registration.
export const roebeltalerGroupAddress =
	process.env.EXPO_PUBLIC_ROEBELTALER_GROUP || "";

/** Returns a contract handle for the CitizenNFT on Gnosis. */
export const citizenNFTGnosisContract = () =>
	getContract({ client, address: citizenNFTGnosisAddress, chain: gnosisRead });
