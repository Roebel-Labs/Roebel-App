// apps/web/src/lib/miniapp/credentialSource.ts
// The one place on the node that knows where credentials come from. Today: the three
// built-ins (`citizen`, `attester`, `guest`) read from the identity NFTs on Gnosis. The
// credential register plugs in here later (plan 2026-11-17-miniapp-2, Task 14), and only
// `getCredentialSource()` changes then.
//
// Kept free of `server-only` and path aliases so node:test can load it.
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { gnosis } from "viem/chains";
import { parseCredentialRef } from "@netizen-labs/miniapp-sdk/host";

/** A credential the account holds (only ever for refs that were asked about). */
export interface CredentialAnswer {
  type: string;
  kind: "builtin" | "role" | "membership" | "badge";
  org?: string;
  name: string;
  imageUrl?: string;
  validUntil: number | null;
  recognised: boolean;
  /** Holding is not on chain. Consent sheet only; never sent to a mini app. */
  private: boolean;
}

export interface CredentialTypeInfo {
  type: string;
  kind: CredentialAnswer["kind"];
  org?: string;
  orgName?: string;
  name: string;
  imageUrl?: string;
  recognised: boolean;
}

export interface CredentialSource {
  /**
   * Answers only for `refs`; an `org:` ref expands to every held type of that org; an
   * unknown ref contributes nothing. Rejects on a chain or store failure (never "not held").
   */
  held(wallet: string, refs: readonly string[]): Promise<CredentialAnswer[]>;
  /** null for a ref this source does not know. */
  describe(ref: string): Promise<CredentialTypeInfo | null>;
}

export interface BuiltinChain {
  isCitizen(address: string): Promise<boolean>;
  isAttester(address: string): Promise<boolean>;
}

type Builtin = "citizen" | "attester" | "guest";

const BUILTIN_NAMES: Record<Builtin, string> = {
  citizen: "Bürger:in",
  attester: "Bescheiniger:in",
  guest: "Gast",
};

function builtinOf(ref: string): Builtin | null {
  const p = parseCredentialRef(ref);
  return p?.kind === "builtin" ? p.name : null;
}

/** The built-in types: `guest` = holds no citizen credential (until the register's Guest type). */
export function builtinCredentialSource(chain: BuiltinChain): CredentialSource {
  return {
    async held(wallet, refs) {
      const asked: Builtin[] = [];
      for (const r of refs) {
        const b = builtinOf(r);
        if (b && !asked.includes(b)) asked.push(b);
      }
      if (asked.length === 0) return [];
      const needCitizen = asked.includes("citizen") || asked.includes("guest");
      const [citizen, attester] = await Promise.all([
        needCitizen ? chain.isCitizen(wallet) : Promise.resolve(false),
        asked.includes("attester") ? chain.isAttester(wallet) : Promise.resolve(false),
      ]);
      const holds: Record<Builtin, boolean> = { citizen, attester, guest: !citizen };
      return asked
        .filter((b) => holds[b])
        .map((b) => ({
          type: b,
          kind: "builtin" as const,
          name: BUILTIN_NAMES[b],
          validUntil: null,
          recognised: true,
          private: false,
        }));
    },
    async describe(ref) {
      const b = builtinOf(ref);
      return b ? { type: b, kind: "builtin", name: BUILTIN_NAMES[b], recognised: true } : null;
    },
  };
}

/**
 * Mirrors `CONTRACTS.citizenNFT` / `CONTRACTS.attesterNFT` in packages/blockchain/src/index.ts
 * (web does not depend on that package; a test keeps the two in sync).
 */
export const IDENTITY_NFT_ADDRESSES = {
  citizenNFT: "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5",
  attesterNFT: "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82",
} as const satisfies Record<string, Address>;

const DEFAULT_GNOSIS_RPC = "https://gnosis-rpc.publicnode.com";
const RPC_TIMEOUT_MS = 8_000;
const erc721Abi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

let cached: CredentialSource | null = null;

/** The node's credential source. Task 14 (credential register) changes only this function. */
export function getCredentialSource(): CredentialSource {
  if (cached) return cached;
  const client = createPublicClient({
    chain: gnosis,
    transport: http(process.env.GNOSIS_RPC_URL || DEFAULT_GNOSIS_RPC, {
      timeout: RPC_TIMEOUT_MS,
      retryCount: 1,
    }),
  });
  const holds = async (nft: Address, owner: string) =>
    (await client.readContract({
      address: nft,
      abi: erc721Abi,
      functionName: "balanceOf",
      args: [owner as Address],
    })) > 0n;
  cached = builtinCredentialSource({
    isCitizen: (a) => holds(IDENTITY_NFT_ADDRESSES.citizenNFT, a),
    isAttester: (a) => holds(IDENTITY_NFT_ADDRESSES.attesterNFT, a),
  });
  return cached;
}
