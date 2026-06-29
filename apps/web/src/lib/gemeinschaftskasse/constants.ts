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
  "function approveHash(bytes32 hashToApprove)",
  "function approvedHashes(address owner, bytes32 hash) view returns (uint256)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
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

export type TxCategory =
  | "auszahlung"
  | "mitglied_hinzu"
  | "mitglied_entfernt"
  | "schwelle"
  | "circles"
  | "sonstige";

/** Lifecycle state derived server-side; the client adds a transient
 *  "wird_ausgefuehrt" while an execution is in flight. */
export type TxStatus = "wartet" | "bereit" | "ausgefuehrt" | "fehlgeschlagen";

/** One Safe owner's relationship to a specific transaction. */
export interface TxOwnerState {
  address: string;
  name: string;
  avatarUrl: string | null;
  signed: boolean;
  via: "signatur" | "onchain" | null; // how they approved; null = still pending
}

export interface TxView {
  safeTxHash: string;
  category: TxCategory;
  icon: string;                   // emoji glyph for the category
  title: string;                  // "Auszahlung — 12,50 € an Guido"
  description: string;            // one plain-language line on what it does
  status: TxStatus;
  confirmations: number;
  threshold: number;
  executed: boolean;
  signers: TxSigner[];            // owners who have signed/approved
  owners: TxOwnerState[];         // full owner set with signed flags
  date: string | null;            // executionDate || submissionDate
  transactionHash: string | null; // on-chain hash for Gnosisscan
  amount: string | null;          // formatted amount for transfers
  assetLabel: string | null;      // "xDAI" | "EURe" | "Röbel-Münzen"
  counterparty: { name: string; avatarUrl: string | null } | null;
  to: string;                     // raw target contract/recipient
  rawData: string | null;         // raw calldata, for the detail view
}

/** Minimal Circles BaseGroup ABI — enough to name the group-admin calls that
 *  otherwise look like a "Röbel-Münzen" payout (same contract address). */
export const BASEGROUP_ABI = parseAbi([
  "function updateMetadataDigest(bytes32 _metadataDigest)",
  "function trust(address _trustReceiver, uint96 _expiry)",
  "function setService(address _service)",
  "function setMintHandler(address _mintHandler)",
  "function setRedemptionHandler(address _redemptionHandler)",
  "function registerShortName()",
]);
