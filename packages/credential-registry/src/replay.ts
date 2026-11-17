import type { Address, Hex } from "viem";
import type { RegisterEventName } from "./abi";

/**
 * Rebuild the credential register from CredentialRegistry events alone: no
 * database, no API. Mirrors the contract's `holds` rule in `isHoldingLive`.
 */

export interface RegisterLog {
  eventName: RegisterEventName;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
}

export type TypeKind = "role" | "membership" | "badge";
export type TypePolicy = "issuerBatch" | "selfClaim" | "external";

export interface TypeConfigEntry {
  metadataURI: string;
  defaultValidity: bigint;
  claimStart: bigint;
  claimEnd: bigint;
  supplyCap: number;
  publicClaim: boolean;
}

export interface TypeEntry {
  typeId: Hex;
  orgId: Hex;
  localId: Hex;
  kind: TypeKind;
  policy: TypePolicy;
  orgGeneration: bigint;
  /** The OrgRegistry the type is bound to (lowercase); null for COMMUNITY types. */
  orgRegistry: Address | null;
  recognised: boolean;
  retired: boolean;
  config: TypeConfigEntry;
  /** Lowercase addresses. */
  delegates: Set<Address>;
}

export interface BatchEntry {
  batchId: bigint;
  typeId: Hex;
  issuer: Address;
  root: Hex;
  count: number;
  revoked: boolean;
  revokedLeaves: Set<Hex>;
  blockNumber: bigint;
}

export interface HoldingEntry {
  typeId: Hex;
  account: Address;
  /** 0n = self-claimed. */
  batchId: bigint;
  leaf: Hex | null;
  validUntil: bigint;
}

export interface RegisterState {
  types: Map<Hex, TypeEntry>;
  batches: Map<bigint, BatchEntry>;
  /** Key `${typeId}:${account}`, lowercase. */
  holdings: Map<string, HoldingEntry>;
  privateOnlyOrgs: Set<Hex>;
  /** The current OrgRegistry (lowercase) from the last SourcesApplied; null before any. */
  orgRegistry: Address | null;
}

const KINDS: TypeKind[] = ["role", "membership", "badge"];
const POLICIES: TypePolicy[] = ["issuerBatch", "selfClaim", "external"];

const lc = <T extends string>(v: unknown) => String(v).toLowerCase() as T;
const isCommunity = (orgId: Hex) => /^0x0+$/.test(orgId);
export const holdingKey = (typeId: Hex, account: Address) => `${lc(typeId)}:${lc(account)}`;

export function toTypeConfig(raw: Record<string, unknown>): TypeConfigEntry {
  return {
    metadataURI: String(raw.metadataURI),
    defaultValidity: BigInt(raw.defaultValidity as bigint),
    claimStart: BigInt(raw.claimStart as bigint),
    claimEnd: BigInt(raw.claimEnd as bigint),
    supplyCap: Number(raw.supplyCap),
    publicClaim: Boolean(raw.publicClaim),
  };
}

export function replayRegisterEvents(logs: readonly RegisterLog[]): RegisterState {
  const ordered = [...logs].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
  const state: RegisterState = {
    types: new Map(),
    batches: new Map(),
    holdings: new Map(),
    privateOnlyOrgs: new Set(),
    orgRegistry: null,
  };

  for (const { eventName, args: a, blockNumber } of ordered) {
    switch (eventName) {
      case "TypeCreated": {
        const typeId = lc<Hex>(a.typeId);
        const orgId = lc<Hex>(a.orgId);
        state.types.set(typeId, {
          typeId,
          orgId,
          localId: lc<Hex>(a.localId),
          kind: KINDS[Number(a.kind)],
          policy: POLICIES[Number(a.policy)],
          orgGeneration: BigInt(a.orgGeneration as bigint),
          // createType binds an org type to the registry current at that moment.
          orgRegistry: isCommunity(orgId) ? null : state.orgRegistry,
          recognised: false,
          retired: false,
          config: { metadataURI: "", defaultValidity: 0n, claimStart: 0n, claimEnd: 0n, supplyCap: 0, publicClaim: false },
          delegates: new Set(),
        });
        break;
      }
      case "TypeConfigured": {
        const t = state.types.get(lc<Hex>(a.typeId));
        if (t) t.config = toTypeConfig(a.config as Record<string, unknown>);
        break;
      }
      case "TypeRetired": {
        const t = state.types.get(lc<Hex>(a.typeId));
        if (t) t.retired = true;
        break;
      }
      case "TypeRebound": {
        const t = state.types.get(lc<Hex>(a.typeId));
        if (t) {
          t.orgRegistry = lc<Address>(a.orgRegistry);
          t.orgGeneration = BigInt(a.orgGeneration as bigint);
        }
        break;
      }
      case "SourcesApplied":
        state.orgRegistry = lc<Address>(a.orgRegistry);
        break;
      case "TypeRecognised": {
        const t = state.types.get(lc<Hex>(a.typeId));
        if (t) t.recognised = Boolean(a.recognised);
        break;
      }
      case "DelegateSet": {
        const t = state.types.get(lc<Hex>(a.typeId));
        if (!t) break;
        const d = lc<Address>(a.delegate);
        if (a.allowed) t.delegates.add(d);
        else t.delegates.delete(d);
        break;
      }
      case "OrgPrivateOnlySet": {
        const org = lc<Hex>(a.orgId);
        if (a.privateOnly) state.privateOnlyOrgs.add(org);
        else state.privateOnlyOrgs.delete(org);
        break;
      }
      case "BatchAdded": {
        const batchId = BigInt(a.batchId as bigint);
        state.batches.set(batchId, {
          batchId,
          typeId: lc<Hex>(a.typeId),
          issuer: lc<Address>(a.issuer),
          root: lc<Hex>(a.root),
          count: Number(a.count),
          revoked: false,
          revokedLeaves: new Set(),
          blockNumber,
        });
        break;
      }
      case "BatchRevoked": {
        // The contract burns nothing here: the holding stays, it just stops counting.
        const b = state.batches.get(BigInt(a.batchId as bigint));
        if (b) b.revoked = true;
        break;
      }
      case "LeafRevoked": {
        const batchId = BigInt(a.batchId as bigint);
        const leaf = lc<Hex>(a.leaf);
        state.batches.get(batchId)?.revokedLeaves.add(leaf);
        // The contract burns the bound account's holding only if it is this leaf
        // in this batch; a leaf identifies at most one holding at a time.
        for (const [k, h] of state.holdings) if (h.batchId === batchId && h.leaf === leaf) state.holdings.delete(k);
        break;
      }
      case "Claimed": {
        const typeId = lc<Hex>(a.typeId);
        const account = lc<Address>(a.account);
        state.holdings.set(holdingKey(typeId, account), {
          typeId,
          account,
          batchId: BigInt(a.batchId as bigint),
          leaf: lc<Hex>(a.leaf),
          validUntil: BigInt(a.validUntil as bigint),
        });
        break;
      }
      case "SelfClaimed": {
        const typeId = lc<Hex>(a.typeId);
        const account = lc<Address>(a.account);
        state.holdings.set(holdingKey(typeId, account), {
          typeId,
          account,
          batchId: 0n,
          leaf: null,
          validUntil: BigInt(a.validUntil as bigint),
        });
        break;
      }
      case "Renounced":
      case "Pruned":
        state.holdings.delete(holdingKey(lc<Hex>(a.typeId), lc<Address>(a.account)));
        break;
      default:
        // TransferSingle, SourcesProposed/Cancelled: no register state.
        break;
    }
  }
  return state;
}

/**
 * Mirrors `CredentialRegistry.holds` for non-external types: type exists, not
 * retired, (org type) bound to the current OrgRegistry and the org alive there
 * at the type's generation, holding not expired, and (for a
 * batch holding) neither the batch nor the leaf revoked. `orgPrivateOnly` is
 * not part of `holds`; it only limits new claims.
 */
export function isHoldingLive(
  state: RegisterState,
  h: HoldingEntry,
  ctx: { nowSec: bigint; orgAlive: (orgId: Hex, generation: bigint) => boolean },
): boolean {
  const t = state.types.get(lc<Hex>(h.typeId));
  if (!t || t.retired) return false;
  if (!isCommunity(t.orgId)) {
    // After an OrgRegistry swap a type counts again only once rebound (TypeRebound).
    if (t.orgRegistry !== state.orgRegistry) return false;
    if (!ctx.orgAlive(t.orgId, t.orgGeneration)) return false;
  }
  if (h.validUntil !== 0n && ctx.nowSec > h.validUntil) return false;
  if (h.batchId === 0n) return true;
  const b = state.batches.get(h.batchId);
  if (!b || b.revoked) return false;
  return h.leaf === null || !b.revokedLeaves.has(lc<Hex>(h.leaf));
}
