import { decodeEventLog, encodeFunctionData, isAddress, isHex, type Address, type Hex } from "viem";
import { CREDENTIAL_REGISTRY_ABI } from "./abi";
import { credentialTypeId } from "./ids";
import { leafToTuple, type Leaf } from "./leaf";

/**
 * Register steps: one definition for the desktop (prepares), the phone (encodes and sends)
 * and the server (confirms from receipt logs). JSON-safe: no bigint.
 */
export type TypeConfigInput = {
  metadataURI: string;
  defaultValidity: number;
  claimStart: number;
  claimEnd: number;
  supplyCap: number;
  publicClaim: boolean;
};

export type RegisterStep =
  | { fn: "createType"; orgId: Hex; localId: Hex; kind: "role" | "membership" | "badge"; policy: "issuerBatch" | "selfClaim"; config: TypeConfigInput }
  | { fn: "updateType"; typeId: Hex; config: TypeConfigInput }
  | { fn: "retireType"; typeId: Hex }
  | { fn: "setDelegate"; typeId: Hex; delegate: Address; allowed: boolean }
  | { fn: "setOrgPrivateOnly"; orgId: Hex; privateOnly: boolean }
  | { fn: "addBatch"; typeId: Hex; root: Hex; count: number }
  | { fn: "revokeLeaves"; batchId: string; leaves: Hex[] }
  | { fn: "revokeBatch"; batchId: string };

export const MAX_STEPS = 20;

/** Index-aligned with `CredentialRegistry.Kind` / `ClaimPolicy`. */
const KIND_INDEX = { role: 0, membership: 1, badge: 2 } as const;
const POLICY_INDEX = { issuerBatch: 0, selfClaim: 1 } as const;

const fail = (msg: string): never => {
  throw new Error(`invalid register step: ${msg}`);
};
const obj = (v: unknown, what: string): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(`${what} is not an object`);
const bytes32 = (v: unknown, what: string): Hex =>
  typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as Hex) : fail(`${what} is not bytes32`);
const addr = (v: unknown, what: string): Address =>
  typeof v === "string" && isAddress(v, { strict: false }) ? (v as Address) : fail(`${what} is not an address`);
const bool = (v: unknown, what: string): boolean => (typeof v === "boolean" ? v : fail(`${what} is not a boolean`));
const uint = (v: unknown, what: string, max: number): number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max ? v : fail(`${what} is not a uint`);
const decimal = (v: unknown, what: string): string =>
  typeof v === "string" && /^(0|[1-9][0-9]{0,19})$/.test(v) && BigInt(v) < 2n ** 64n ? v : fail(`${what} is not a uint64 decimal string`);
const oneOf = <T extends string>(v: unknown, set: readonly T[], what: string): T =>
  typeof v === "string" && (set as readonly string[]).includes(v) ? (v as T) : fail(`${what} is not one of ${set.join("|")}`);

function parseConfig(raw: unknown): TypeConfigInput {
  const c = obj(raw, "config");
  return {
    metadataURI: typeof c.metadataURI === "string" ? c.metadataURI : fail("metadataURI is not a string"),
    defaultValidity: uint(c.defaultValidity, "defaultValidity", Number.MAX_SAFE_INTEGER),
    claimStart: uint(c.claimStart, "claimStart", Number.MAX_SAFE_INTEGER),
    claimEnd: uint(c.claimEnd, "claimEnd", Number.MAX_SAFE_INTEGER),
    supplyCap: uint(c.supplyCap, "supplyCap", 0xffffffff),
    publicClaim: bool(c.publicClaim, "publicClaim"),
  };
}

function parseStep(raw: unknown): RegisterStep {
  const s = obj(raw, "step");
  switch (s.fn) {
    case "createType":
      return {
        fn: "createType",
        orgId: bytes32(s.orgId, "orgId"),
        localId: bytes32(s.localId, "localId"),
        kind: oneOf(s.kind, ["role", "membership", "badge"] as const, "kind"),
        policy: oneOf(s.policy, ["issuerBatch", "selfClaim"] as const, "policy"),
        config: parseConfig(s.config),
      };
    case "updateType":
      return { fn: "updateType", typeId: bytes32(s.typeId, "typeId"), config: parseConfig(s.config) };
    case "retireType":
      return { fn: "retireType", typeId: bytes32(s.typeId, "typeId") };
    case "setDelegate":
      return { fn: "setDelegate", typeId: bytes32(s.typeId, "typeId"), delegate: addr(s.delegate, "delegate"), allowed: bool(s.allowed, "allowed") };
    case "setOrgPrivateOnly":
      return { fn: "setOrgPrivateOnly", orgId: bytes32(s.orgId, "orgId"), privateOnly: bool(s.privateOnly, "privateOnly") };
    case "addBatch":
      return { fn: "addBatch", typeId: bytes32(s.typeId, "typeId"), root: bytes32(s.root, "root"), count: uint(s.count, "count", 0xffffffff) };
    case "revokeLeaves": {
      if (!Array.isArray(s.leaves)) fail("leaves is not an array");
      return { fn: "revokeLeaves", batchId: decimal(s.batchId, "batchId"), leaves: (s.leaves as unknown[]).map((l) => bytes32(l, "leaf")) };
    }
    case "revokeBatch":
      return { fn: "revokeBatch", batchId: decimal(s.batchId, "batchId") };
    default:
      return fail(`unknown fn ${String(s.fn)}`);
  }
}

/** Validates untrusted JSON. Throws on an unknown fn, a missing/mistyped field, bad hex or more than 20 steps. */
export function parseSteps(raw: unknown): RegisterStep[] {
  if (!Array.isArray(raw)) fail("steps is not an array");
  if ((raw as unknown[]).length > MAX_STEPS) fail(`more than ${MAX_STEPS} steps`);
  return (raw as unknown[]).map(parseStep);
}

const cfgArg = (c: TypeConfigInput) => ({
  metadataURI: c.metadataURI,
  defaultValidity: BigInt(c.defaultValidity),
  claimStart: BigInt(c.claimStart),
  claimEnd: BigInt(c.claimEnd),
  supplyCap: c.supplyCap,
  publicClaim: c.publicClaim,
});

function encodeStep(step: RegisterStep): Hex {
  const abi = CREDENTIAL_REGISTRY_ABI;
  switch (step.fn) {
    case "createType":
      return encodeFunctionData({ abi, functionName: "createType", args: [step.orgId, step.localId, KIND_INDEX[step.kind], POLICY_INDEX[step.policy], cfgArg(step.config)] });
    case "updateType":
      return encodeFunctionData({ abi, functionName: "updateType", args: [step.typeId, cfgArg(step.config)] });
    case "retireType":
      return encodeFunctionData({ abi, functionName: "retireType", args: [step.typeId] });
    case "setDelegate":
      return encodeFunctionData({ abi, functionName: "setDelegate", args: [step.typeId, step.delegate, step.allowed] });
    case "setOrgPrivateOnly":
      return encodeFunctionData({ abi, functionName: "setOrgPrivateOnly", args: [step.orgId, step.privateOnly] });
    case "addBatch":
      return encodeFunctionData({ abi, functionName: "addBatch", args: [step.typeId, step.root, step.count] });
    case "revokeLeaves":
      return encodeFunctionData({ abi, functionName: "revokeLeaves", args: [BigInt(step.batchId), step.leaves] });
    case "revokeBatch":
      return encodeFunctionData({ abi, functionName: "revokeBatch", args: [BigInt(step.batchId)] });
  }
}

export function encodeSteps(steps: readonly RegisterStep[], registry: Address): { to: Address; data: Hex }[] {
  return steps.map((s) => ({ to: registry, data: encodeStep(s) }));
}

/** `claimSignature` is only for claim-key leaves; an account leaf passes `0x`. */
export function claimCall(
  registry: Address,
  p: { batchId: bigint; leaf: Leaf; proof: readonly Hex[]; claimSignature?: Hex },
): { to: Address; data: Hex } {
  return {
    to: registry,
    data: encodeFunctionData({
      abi: CREDENTIAL_REGISTRY_ABI,
      functionName: "claim",
      args: [p.batchId, leafToTuple(p.leaf), [...p.proof], p.claimSignature ?? "0x"],
    }),
  };
}

export function selfClaimCall(registry: Address, typeId: Hex): { to: Address; data: Hex } {
  return { to: registry, data: encodeFunctionData({ abi: CREDENTIAL_REGISTRY_ABI, functionName: "selfClaim", args: [typeId] }) };
}

export function renounceCall(registry: Address, typeId: Hex): { to: Address; data: Hex } {
  return { to: registry, data: encodeFunctionData({ abi: CREDENTIAL_REGISTRY_ABI, functionName: "renounce", args: [typeId] }) };
}

export type ChainLog = { address: Address; topics: readonly Hex[]; data: Hex };

type Decoded = { name: string; args: Record<string, unknown> };

function decodeRegistryLogs(registry: Address, logs: readonly ChainLog[]): Decoded[] {
  const out: Decoded[] = [];
  for (const l of logs) {
    if (l.address.toLowerCase() !== registry.toLowerCase()) continue;
    try {
      const d = decodeEventLog({ abi: CREDENTIAL_REGISTRY_ABI, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      out.push({ name: d.eventName as string, args: (d.args ?? {}) as Record<string, unknown> });
    } catch {
      /* not a register event */
    }
  }
  return out;
}

const eqHex = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

/** The config a `TypeConfigured` event carries equals the step's (an earlier or other update does not confirm). */
function sameConfig(raw: unknown, c: TypeConfigInput): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const e = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "bigint" || typeof v === "number" ? BigInt(v) : null);
  return (
    e.metadataURI === c.metadataURI &&
    n(e.defaultValidity) === BigInt(c.defaultValidity) &&
    n(e.claimStart) === BigInt(c.claimStart) &&
    n(e.claimEnd) === BigInt(c.claimEnd) &&
    n(e.supplyCap) === BigInt(c.supplyCap) &&
    e.publicClaim === c.publicClaim
  );
}

/**
 * Matches the steps, in order, against the registry's own logs (other addresses and
 * unrelated register events are skipped). Returns the chain batch id per `addBatch` root.
 *
 * `revokeLeaves` rule: the contract emits `LeafRevoked` only for newly revoked leaves, so
 * the steps alone cannot say how many events to expect. The step is confirmed when at least
 * one `LeafRevoked` for its batch and one of its leaves is found; the run of consecutive
 * such events (leaves within the step, each once) is consumed. A `LeafRevoked` for a leaf
 * outside the step is never consumed. A step whose leaves were all already revoked emits
 * nothing and therefore reports as unconfirmed.
 */
export function stepsConfirmedBy(
  steps: readonly RegisterStep[],
  registry: Address,
  logs: readonly ChainLog[],
): { ok: true; batchIds: Record<string, bigint> } | { ok: false; missing: number } {
  const events = decodeRegistryLogs(registry, logs);
  const batchIds: Record<string, bigint> = {};
  let cur = 0;

  const find = (pred: (e: Decoded) => boolean): number => {
    for (let i = cur; i < events.length; i++) if (pred(events[i])) return i;
    return -1;
  };

  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    let hit = -1;
    switch (step.fn) {
      case "createType": {
        const id = credentialTypeId(step.orgId, step.localId);
        hit = find((e) => e.name === "TypeCreated" && eqHex(e.args.typeId, id));
        break;
      }
      case "updateType":
        hit = find((e) => e.name === "TypeConfigured" && eqHex(e.args.typeId, step.typeId) && sameConfig(e.args.config, step.config));
        break;
      case "retireType":
        hit = find((e) => e.name === "TypeRetired" && eqHex(e.args.typeId, step.typeId));
        break;
      case "setDelegate":
        hit = find((e) => e.name === "DelegateSet" && eqHex(e.args.typeId, step.typeId) && eqHex(e.args.delegate, step.delegate) && e.args.allowed === step.allowed);
        break;
      case "setOrgPrivateOnly":
        hit = find((e) => e.name === "OrgPrivateOnlySet" && eqHex(e.args.orgId, step.orgId) && e.args.privateOnly === step.privateOnly);
        break;
      case "addBatch":
        hit = find((e) => e.name === "BatchAdded" && eqHex(e.args.typeId, step.typeId) && eqHex(e.args.root, step.root));
        if (hit >= 0) batchIds[step.root] = events[hit].args.batchId as bigint;
        break;
      case "revokeBatch":
        hit = find((e) => e.name === "BatchRevoked" && String(e.args.batchId) === step.batchId);
        break;
      case "revokeLeaves": {
        const pending = new Set(step.leaves.map((l) => l.toLowerCase()));
        const mine = (e: Decoded) => e.name === "LeafRevoked" && String(e.args.batchId) === step.batchId && pending.has((e.args.leaf as string).toLowerCase());
        hit = find(mine);
        if (hit >= 0) {
          let end = hit;
          while (end < events.length && mine(events[end])) {
            pending.delete((events[end].args.leaf as string).toLowerCase());
            end++;
          }
          cur = end;
          continue;
        }
        break;
      }
    }
    if (hit < 0) return { ok: false, missing: si };
    cur = hit + 1;
  }
  return { ok: true, batchIds };
}
