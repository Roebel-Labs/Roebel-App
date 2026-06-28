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

export interface OwnerView {
  address: string;
  name: string;
  short: string;
  isYou?: boolean;
  avatarUrl: string | null;
  username: string | null;
  verified: boolean;
  source: string;
}

export interface AssetHolding {
  id: AssetId;
  label: string;
  amount: number;       // human units
  atto: string;         // raw 18-dec string
  eur: number | null;   // null = not euro-redeemable (Röbel-Münzen)
  sharePct: number | null; // share of euro reserve; null for non-redeemable
  redeemable: boolean;
}

export interface TxSigner { address: string; name: string; avatarUrl: string | null }

export interface TxView {
  safeTxHash: string;
  kind: "auszahlung" | "mitglied_hinzu" | "mitglied_entfernt" | "schwelle" | "sonstige";
  title: string;
  confirmations: number;
  threshold: number;
  executed: boolean;
  signers: TxSigner[];
  date: string | null;            // executionDate || submissionDate
  transactionHash: string | null; // on-chain hash for Gnosisscan
  amount: string | null;          // formatted amount for transfers
  assetLabel: string | null;      // "xDAI" | "EURe" | "Röbel-Münzen"
  counterparty: { name: string; avatarUrl: string | null } | null;
}
