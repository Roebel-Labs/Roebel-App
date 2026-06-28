import { parseAbi } from "viem";
import { ADDR } from "@/lib/muenzen/constants";

export const GK_SAFE = ADDR.safe; // 0x3A08…
export const GK_CHAIN_ID = 100;

export const SAFE_ABI = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function addOwnerWithThreshold(address owner, uint256 _threshold)",
  "function removeOwner(address prevOwner, address owner, uint256 _threshold)",
  "function changeThreshold(uint256 _threshold)",
]);

export type AssetId = "xdai" | "eure" | "muenzen";

export const TOKENS: { id: AssetId; label: string; decimals: number; address?: string }[] = [
  { id: "xdai", label: "xDAI", decimals: 18 },
  { id: "eure", label: "EURe", decimals: 18, address: ADDR.eure },
  { id: "muenzen", label: "Röbel-Münzen", decimals: 18, address: ADDR.group },
];

export interface OwnerView { address: string; name: string; short: string; isYou?: boolean }
export interface TxView {
  safeTxHash: string;
  kind: "auszahlung" | "mitglied_hinzu" | "mitglied_entfernt" | "schwelle" | "sonstige";
  title: string;          // de-jargoned German line
  confirmations: number;
  threshold: number;
  executed: boolean;
  signers: string[];      // owner addresses that have confirmed
  submissionDate?: string;
}
