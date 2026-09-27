/**
 * The OrgRegistry surface readers need — views plus every event a directory
 * is rebuilt from. Hand-written `as const` for viem's type inference; the test
 * suite checks it against the compiled artifact whenever that is present.
 */
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
  {
    type: "event",
    name: "OrgRegistered",
    inputs: [
      { name: "orgId", type: "bytes32", indexed: true },
      { name: "safe", type: "address", indexed: true },
      { name: "requestId", type: "uint256", indexed: true },
      { name: "generation", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "OrgRevoked",
    inputs: [
      { name: "orgId", type: "bytes32", indexed: true },
      { name: "safe", type: "address", indexed: true },
      { name: "requestId", type: "uint256", indexed: true },
      { name: "generation", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SafeRotated",
    inputs: [
      { name: "orgId", type: "bytes32", indexed: true },
      { name: "previous", type: "address", indexed: true },
      { name: "next", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "MetadataURIChanged",
    inputs: [
      { name: "orgId", type: "bytes32", indexed: true },
      { name: "metadataURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "NostrKeySet",
    inputs: [
      { name: "orgId", type: "bytes32", indexed: true },
      { name: "pubkey", type: "bytes32", indexed: true },
      { name: "authorized", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoleSet",
    inputs: [
      { name: "orgId", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "role", type: "uint8", indexed: false },
    ],
  },
] as const;

/** Events that change the directory, in the order replay must apply them. */
export const DIRECTORY_EVENTS = [
  "OrgRegistered",
  "OrgRevoked",
  "SafeRotated",
  "MetadataURIChanged",
  "NostrKeySet",
  "RoleSet",
] as const;
export type DirectoryEventName = (typeof DIRECTORY_EVENTS)[number];
