/**
 * Read-only ABI fragments for the community contracts on Gnosis. Copied (not imported) so the
 * package has no workspace dependency: identity NFTs from apps/web/src/lib/verification-contracts.ts,
 * the OrgRegistry views from packages/org-registry/src/abi.ts, the CredentialRegistry `holds` view.
 */

const balanceOf = {
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
} as const;

export const CITIZEN_NFT_ABI = [
  balanceOf,
  {
    type: "function",
    name: "hasCitizenNFT",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const ATTESTER_NFT_ABI = [
  balanceOf,
  {
    type: "function",
    name: "hasAttesterNFT",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const ORG_REGISTRY_ABI = [
  {
    type: "function",
    name: "isNostrKeyAuthorized",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "bytes32" },
      { name: "pubkey", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [{ name: "orgId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "roleOf",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "isOrgOwner",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "orgIdOfSafe",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getOrg",
    stateMutability: "view",
    inputs: [{ name: "orgId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "safe", type: "address" },
          { name: "generation", type: "uint64" },
          { name: "registeredAt", type: "uint64" },
          { name: "metadataURI", type: "string" },
        ],
      },
    ],
  },
] as const;

/** The `holds` view of the CredentialRegistry (from packages/credential-registry/src/abi.ts). */
export const CREDENTIAL_REGISTRY_ABI = [
  {
    type: "function",
    name: "holds",
    stateMutability: "view",
    inputs: [
      { name: "typeId", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const ABIS = {
  citizenNft: CITIZEN_NFT_ABI,
  attesterNft: ATTESTER_NFT_ABI,
  orgRegistry: ORG_REGISTRY_ABI,
  credentialRegistry: CREDENTIAL_REGISTRY_ABI,
} as const;
