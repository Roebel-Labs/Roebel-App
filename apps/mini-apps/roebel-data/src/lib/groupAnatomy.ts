// The Röbel Münzen Circles v2 group structure — single typed source of truth for the
// Economy tab's "On-chain anatomy" section. Addresses are immutable for the life of the
// group (set at registerGroup), so they're static constants here; each was verified
// on-chain (Hub.mintPolicies / group.owner / group.BASE_TREASURY / NameRegistry).
//
// NOTE: the registered on-chain symbol is RTLR and CANNOT be changed in place (no setter
// exists on the Hub/NameRegistry/BaseGroup). Only the display profile (name + image) is
// mutable, via BaseGroup.updateMetadataDigest. We surface the friendly name "Röbel
// Münzen" alongside the real on-chain symbol so the section stays verifiable.
import { ROEBEL_GROUP, ROEBEL_VAULT, MINT_POLICY, GROUP_OWNER } from "./circles";

export type AnatomyRole = "group" | "token" | "policy" | "treasury" | "owner";

export interface AnatomyPart {
  role: AnatomyRole;
  title: string;
  address: `0x${string}`;
  /** Only set for the group token (the ERC-1155 id = uint256(group)). */
  tokenId?: string;
  /** Block-explorer deep link (Circles explorer for avatar/token, GnosisScan for contracts). */
  href: string;
  /** One-line technical description. */
  blurb: string;
}

/** Currency-level metadata. `symbol` is the registered on-chain symbol (immutable). */
export const GROUP_META = {
  name: "Röbel Münzen",
  symbol: "RTLR",
  group: ROEBEL_GROUP,
  // ERC-1155 group-token id = uint256(group address) as a decimal string.
  tokenId: BigInt(ROEBEL_GROUP).toString(),
} as const;

export const gnosisscan = (addr: string) => `https://gnosisscan.io/address/${addr}`;
export const circlesExplorer = (addr: string) =>
  `https://explorer.aboutcircles.com/avatar/${addr.toLowerCase()}`;

/** The five on-chain parts, in display order (group first = the hub). */
export const GROUP_ANATOMY: AnatomyPart[] = [
  {
    role: "group",
    title: "Group",
    address: ROEBEL_GROUP,
    href: circlesExplorer(ROEBEL_GROUP),
    blurb: "Circles v2 BaseGroup — the currency's root contract.",
  },
  {
    role: "token",
    title: "Token (RCRC)",
    address: ROEBEL_GROUP,
    tokenId: GROUP_META.tokenId,
    href: circlesExplorer(ROEBEL_GROUP),
    blurb: "ERC-1155 group token (symbol RTLR) — what members hold & spend.",
  },
  {
    role: "policy",
    title: "Mint policy",
    address: MINT_POLICY,
    href: gnosisscan(MINT_POLICY),
    blurb: "Governs who may mint the group token.",
  },
  {
    role: "treasury",
    title: "Treasury",
    address: ROEBEL_VAULT,
    href: gnosisscan(ROEBEL_VAULT),
    blurb: "BaseTreasury — locks members' personal CRC 1:1 as backing.",
  },
  {
    role: "owner",
    title: "Owner",
    address: GROUP_OWNER,
    href: gnosisscan(GROUP_OWNER),
    blurb: "3-of-5 Attester Safe that controls the group.",
  },
];
