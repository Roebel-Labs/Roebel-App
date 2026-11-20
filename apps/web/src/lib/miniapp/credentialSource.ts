// apps/web/src/lib/miniapp/credentialSource.ts
// The one place on the node that knows where credentials come from: the three built-ins
// (`citizen`, `attester`, `guest`) read from the identity NFTs on Gnosis, and, when the node is
// configured for it, the credential register (`type:` and `org:` refs) through its `holdings`
// answer and type directory.
//
// Kept free of `server-only` and path aliases so node:test can load it.
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { RESERVED_TYPE_IDS } from "@netizen-labs/credential-registry";
import { gnosis } from "viem/chains";
import { parseCredentialRef } from "@netizen-labs/miniapp-sdk/host";
import { BUILTIN_CREDENTIAL_NAMES } from "./identityReview";
import { registryConfig } from "../credentials/config";

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

const BUILTIN_NAMES: Record<Builtin, string> = BUILTIN_CREDENTIAL_NAMES;

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

export interface RegisterHolding {
  typeId: Hex;
  held: boolean;
  visibility: "public" | "private" | null;
  /** Unix seconds; null = no expiry. */
  validUntil: number | null;
}

export interface RegisterDirectoryEntry {
  typeId: Hex;
  /** null for a type without a kind; answered as "badge". */
  kind: "role" | "membership" | "badge" | null;
  name: string;
  imageUrl: string | null;
  orgName: string | null;
  orgAccountId: string | null;
  recognised: boolean;
}

export interface RegisterSourceDeps {
  builtin: CredentialSource;
  /** The register's one answer for public and private holdings. Rejects on failure. */
  holdings(wallet: string, typeIds: Hex[]): Promise<RegisterHolding[]>;
  /** On-chain, not retired types. */
  directory(): Promise<RegisterDirectoryEntry[]>;
}

const RESERVED = new Set(Object.values(RESERVED_TYPE_IDS).map((t) => t.toLowerCase()));

/** Directory entries this source answers for (reserved ids stay with the built-in source). */
async function registerEntries(deps: RegisterSourceDeps): Promise<RegisterDirectoryEntry[]> {
  return (await deps.directory())
    .map((e) => ({ ...e, typeId: e.typeId.toLowerCase() as Hex, orgAccountId: e.orgAccountId?.toLowerCase() ?? null }))
    .filter((e) => !RESERVED.has(e.typeId));
}

/**
 * Built-ins from `deps.builtin`; `type:` and `org:` refs from the credential register. The
 * register's `visibility` is passed through as `private` and never re-decided here (the org
 * switch "Mitglieder dürfen öffentlich sichtbar sein" has one owner: `holdings`).
 */
export function registerCredentialSource(deps: RegisterSourceDeps): CredentialSource {
  return {
    async held(wallet, refs) {
      const parsed = refs.map((r) => parseCredentialRef(r)).filter((p) => p !== null);
      const wantsRegister = parsed.some((p) => p.kind !== "builtin");
      if (!wantsRegister) return deps.builtin.held(wallet, refs);
      const entries = await registerEntries(deps);
      const byId = new Map(entries.map((e) => [e.typeId, e]));
      const ids: Hex[] = [];
      const add = (id: string) => {
        if (byId.has(id as Hex) && !ids.includes(id as Hex)) ids.push(id as Hex);
      };
      for (const p of parsed) {
        if (p.kind === "type") add(p.typeId);
        else if (p.kind === "org") for (const e of entries) if (e.orgAccountId === p.org) add(e.typeId);
      }
      const [builtin, holdings] = await Promise.all([
        deps.builtin.held(wallet, refs),
        ids.length > 0 ? deps.holdings(wallet, ids) : Promise.resolve([] as RegisterHolding[]),
      ]);
      const heldById = new Map(holdings.map((h) => [h.typeId.toLowerCase(), h]));
      const answers: CredentialAnswer[] = [...builtin];
      for (const id of ids) {
        const h = heldById.get(id);
        const e = byId.get(id)!;
        if (!h?.held) continue;
        answers.push({
          type: `type:${id}`,
          kind: e.kind ?? "badge",
          ...(e.orgAccountId ? { org: e.orgAccountId } : {}),
          name: e.name,
          ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}),
          validUntil: h.validUntil,
          recognised: e.recognised,
          private: h.visibility === "private",
        });
      }
      return answers;
    },
    async describe(ref) {
      const p = parseCredentialRef(ref);
      if (!p) return null;
      if (p.kind === "builtin") return deps.builtin.describe(ref);
      const entries = await registerEntries(deps);
      if (p.kind === "type") {
        const e = entries.find((x) => x.typeId === p.typeId);
        if (!e) return null;
        return {
          type: `type:${e.typeId}`,
          kind: e.kind ?? "badge",
          ...(e.orgAccountId ? { org: e.orgAccountId } : {}),
          ...(e.orgName ? { orgName: e.orgName } : {}),
          name: e.name,
          ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}),
          recognised: e.recognised,
        };
      }
      // `org:` — any type of that org: named after the org.
      const ofOrg = entries.filter((x) => x.orgAccountId === p.org);
      if (ofOrg.length === 0) return null;
      const orgName = ofOrg.find((x) => x.orgName)?.orgName ?? null;
      return {
        type: ref.toLowerCase(),
        kind: ofOrg[0].kind ?? "badge",
        org: p.org,
        ...(orgName ? { orgName } : {}),
        name: orgName ?? ofOrg[0].name,
        recognised: ofOrg.some((x) => x.recognised),
      };
    },
  };
}

const DIRECTORY_TTL_MS = 5 * 60_000;
/** `holdings` accepts at most this many type ids per call. */
const HOLDINGS_CHUNK = 50;

let cachedBuiltin: CredentialSource | null = null;
let cachedRegister: CredentialSource | null = null;

/** The built-in source on the node's Gnosis RPC. */
export function builtinSource(): CredentialSource {
  if (cachedBuiltin) return cachedBuiltin;
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
  cachedBuiltin = builtinCredentialSource({
    isCitizen: (a) => holds(IDENTITY_NFT_ADDRESSES.citizenNFT, a),
    isAttester: (a) => holds(IDENTITY_NFT_ADDRESSES.attesterNFT, a),
  });
  return cachedBuiltin;
}

/**
 * The register source wired to the node's credential runtime. The runtime (Supabase admin
 * client, `@/` imports) is loaded on first use only, so this module stays loadable by node:test.
 */
function wiredRegisterSource(): CredentialSource {
  let directory: { at: number; entries: Promise<RegisterDirectoryEntry[]> } | null = null;
  const runtime = async () => {
    const [{ credentialDeps }, { holdings }, { typeDirectory }] = await Promise.all([
      import("../credentials/runtime"),
      import("../credentials/holder"),
      import("../credentials/metadata"),
    ]);
    const d = credentialDeps();
    if (!d) throw new Error("credential register is not configured");
    return { d, holdings, typeDirectory };
  };
  return registerCredentialSource({
    builtin: builtinSource(),
    async holdings(wallet, typeIds) {
      const { d, holdings } = await runtime();
      // The identity and token routes already authenticated this wallet.
      const caller = { ok: true as const, wallet: wallet.toLowerCase(), via: "passkey_session" as const, action: "holdings" as const, payload: {} };
      const out: RegisterHolding[] = [];
      for (let i = 0; i < typeIds.length; i += HOLDINGS_CHUNK) {
        const r = await holdings(d, caller, { typeIds: typeIds.slice(i, i + HOLDINGS_CHUNK) });
        if (!r.ok) throw new Error(`credential holdings failed: ${r.code}`);
        for (const h of r.data) {
          const ms = h.validUntil ? Date.parse(h.validUntil) : NaN;
          out.push({ typeId: h.typeId, held: h.held, visibility: h.visibility, validUntil: Number.isFinite(ms) ? Math.floor(ms / 1000) : null });
        }
      }
      return out;
    },
    async directory() {
      if (!directory || Date.now() - directory.at > DIRECTORY_TTL_MS) {
        const at = Date.now();
        const entries = runtime().then(({ d, typeDirectory }) => typeDirectory(d.store));
        directory = { at, entries };
        entries.catch(() => {
          if (directory?.at === at) directory = null;
        });
      }
      return directory.entries;
    },
  });
}

/** The node's credential source: the register when it is configured, else the built-ins. */
export function getCredentialSource(env: Record<string, string | undefined> = process.env): CredentialSource {
  if (!registryConfig(env)) return builtinSource();
  return (cachedRegister ??= wiredRegisterSource());
}
