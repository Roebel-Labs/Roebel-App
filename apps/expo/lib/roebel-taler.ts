// Röbel-Taler on-chain service (Gnosis / Circles v2), accessed via thirdweb so we
// don't bundle the heavy Circles SDK into React Native. NOTE: per project rule the
// user-facing currency is ALWAYS "Röbel-Taler" — never surface "CRC"/Circles here.
//
// Mechanics (hidden from the user): each citizen is a Circles human on Gnosis;
//  - personalMint()          → the daily Röbel-Taler ("Heute abholen")
//  - groupMint(group,[me],[amt],"0x") → contributes to the shared Röbel-Taler
//  - Hub ERC1155 balanceOf(me, id=group) → the Röbel-Taler balance
import {
	getContract,
	readContract,
	prepareContractCall,
	type PreparedTransaction,
} from "thirdweb";
import { client } from "@/constants/thirdweb";
import {
	gnosis,
	gnosisRead,
	circlesHubAddress,
	roebeltalerGroupAddress,
} from "@/constants/gnosis";

const hubRead = getContract({ client, chain: gnosisRead, address: circlesHubAddress });
const hubWrite = getContract({ client, chain: gnosis, address: circlesHubAddress });

/** Circles encodes an avatar's token id as uint256(avatarAddress). */
const groupTokenId = BigInt(roebeltalerGroupAddress);

const ZERO_METADATA = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** True once the address is onboarded (a Circles human) — i.e. can mint daily. */
export async function isOnboarded(address: string): Promise<boolean> {
	return readContract({
		contract: hubRead,
		method: "function isHuman(address) view returns (bool)",
		params: [address],
	});
}

/** Röbel-Taler balance (demurraged ERC1155 balance of the group token). */
export async function getRoebelTalerBalance(address: string): Promise<bigint> {
	return readContract({
		contract: hubRead,
		method: "function balanceOf(address,uint256) view returns (uint256)",
		params: [address, groupTokenId],
	});
}

/** A citizen's own personal CRC (token id = uint256(self)) — the daily-claimed
 *  issuance that gets converted into Röbel-Taler. */
export async function getPersonalCrcBalance(address: string): Promise<bigint> {
	return readContract({
		contract: hubRead,
		method: "function balanceOf(address,uint256) view returns (uint256)",
		params: [address, BigInt(address)],
	});
}

/** Format an 18-decimal on-chain amount as a friendly Röbel-Taler string. */
export function formatTaler(raw: bigint): string {
	const whole = raw / 10n ** 18n;
	const frac = (raw % 10n ** 18n) / 10n ** 16n; // 2 decimals
	return `${whole}.${frac.toString().padStart(2, "0")}`;
}

/** Daily Röbel-Taler ("Heute abholen"). */
export function prepareDailyMint(): PreparedTransaction {
	return prepareContractCall({
		contract: hubWrite,
		method: "function personalMint()",
		params: [],
	});
}

/**
 * Onboard the citizen (register as a Circles human). Requires an `inviter` — a
 * Röbel operator avatar. SEAM: the inviter must be supplied by a trusted backend
 * (the operator key is never in the app). See the circles-invite edge function.
 */
export function prepareOnboard(inviter: string): PreparedTransaction {
	return prepareContractCall({
		contract: hubWrite,
		method: "function registerHuman(address,bytes32)",
		params: [inviter, ZERO_METADATA],
	});
}

/** Contribute `amount` (18-dec) of the citizen's own daily mint to the shared Röbel-Taler. */
export function prepareContributeToRoebelTaler(self: string, amount: bigint): PreparedTransaction {
	return prepareContractCall({
		contract: hubWrite,
		method: "function groupMint(address,address[],uint256[],bytes)",
		params: [roebeltalerGroupAddress, [self], [amount], "0x"],
	});
}

/** Send `amount` (18-dec) Röbel-Taler from `from` to `to` (ERC1155 group token). */
export function prepareSendRoebelTaler(from: string, to: string, amount: bigint): PreparedTransaction {
	return prepareContractCall({
		contract: hubWrite,
		method: "function safeTransferFrom(address,address,uint256,uint256,bytes)",
		params: [from, to, groupTokenId, amount, "0x"],
	});
}

/** Parse a user-entered Röbel-Taler amount ("12,50" or "12.5") to 18-dec bigint. */
export function parseTalerAmount(input: string): bigint {
	const clean = input.replace(",", ".").trim();
	if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return 0n;
	const [whole, frac = ""] = clean.split(".");
	const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
	return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded || "0");
}
