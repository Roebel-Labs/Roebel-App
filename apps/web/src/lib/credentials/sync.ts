/**
 * Chain → mirror sync for the credential register. The chain is the truth; these handlers write
 * what the register events say into the mirror tables. Every handler is idempotent: replaying
 * the same logs (a re-run window, or the cron and a phone's receipt racing) changes nothing more.
 * Invitations are delivered exactly once, guarded by the batch's compare-and-set prepared → onchain.
 *
 * Relative imports only: loaded by `npx tsx --test`.
 */
import type { Address, Hex } from "viem";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import type { RegisterLog } from "@netizen-labs/credential-registry";
import type { ActionStatus, BatchRow, CredentialStore, Kind, Policy, TypeRow } from "./store";
import type { Notifier } from "./notify";

export type SyncDeps = {
  store: CredentialStore;
  getLogs(from: bigint, to: bigint): Promise<RegisterLog[]>;
  head(): Promise<bigint>;
  registry: Address;
  deployBlock: bigint;
  /** Task 7 `deliverInvitations` bound to its deps. Called once per batch that reached the chain. */
  deliver(batchRowId: string): Promise<void>;
  notify: Notifier;
};

const DEFAULT_MAX_BLOCKS = 20_000n;
/** Blocks left below head so a short reorg does not leave applied logs behind. */
const CONFIRMATIONS = 3n;

const KINDS: Kind[] = ["role", "membership", "badge"];
const POLICIES: Policy[] = ["issuer_batch", "self_claim", "external"];
/** Everything but done: the chain shows the steps happened, so the action is done whatever the node thought. */
const NOT_DONE: readonly ActionStatus[] = ["awaiting_confirmation", "submitted", "failed", "expired", "cancelled"];

export const VISIBILITY_PUSH = {
  title: "Ausweis",
  body: "Diese Organisation zeigt ihre Mitglieder nicht mehr öffentlich. Du kannst deinen Ausweis privat machen.",
} as const;

const lc = <T extends string>(v: unknown) => String(v).toLowerCase() as T;
const dec = (v: unknown) => BigInt(v as bigint).toString();
const isoOrNull = (unixSec: unknown) => {
  const s = BigInt(unixSec as bigint);
  return s === 0n ? null : new Date(Number(s) * 1000).toISOString();
};

function ordered(logs: readonly RegisterLog[]): RegisterLog[] {
  return [...logs].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
}

async function accountForOrg(store: CredentialStore, orgId: Hex): Promise<string | null> {
  if (/^0x0+$/.test(orgId)) return null;
  for (const id of await store.listOrganisationAccountIds()) {
    if (orgIdFromUuid(id).toLowerCase() === orgId) return id;
  }
  return null;
}

// ── handlers ──────────────────────────────────────────────────────────────────

async function onTypeCreated(d: SyncDeps, a: Record<string, unknown>): Promise<void> {
  const typeId = lc<Hex>(a.typeId);
  if (await d.store.updateType(typeId, { chainStatus: "onchain" })) return;
  const orgId = lc<Hex>(a.orgId);
  const row: TypeRow = {
    typeId,
    registry: d.registry.toLowerCase(),
    accountId: await accountForOrg(d.store, orgId),
    orgId,
    localUuid: null,
    localId: lc<Hex>(a.localId),
    kind: KINDS[Number(a.kind)] ?? null,
    policy: POLICIES[Number(a.policy)] ?? null,
    name: "",
    description: null,
    imageUrl: null,
    benefits: [],
    template: null,
    defaultValiditySeconds: 0,
    claimStart: null,
    claimEnd: null,
    supplyCap: 0,
    publicClaim: false,
    recognised: false,
    retired: false,
    chainStatus: "onchain",
    eventId: null,
    createdBy: "chain",
    createdAt: new Date().toISOString(),
  };
  await d.store.upsertType(row);
}

async function onTypeConfigured(d: SyncDeps, a: Record<string, unknown>): Promise<void> {
  const c = a.config as Record<string, unknown>;
  await d.store.updateType(lc<Hex>(a.typeId), {
    defaultValiditySeconds: Number(BigInt(c.defaultValidity as bigint)),
    claimStart: isoOrNull(c.claimStart),
    claimEnd: isoOrNull(c.claimEnd),
    supplyCap: Number(c.supplyCap),
    publicClaim: Boolean(c.publicClaim),
  });
}

/** The prepared (or, when the desktop cancelled after the phone had sent, cancelled) batch with this root and type. */
async function batchForRoot(d: SyncDeps, typeId: Hex, root: Hex): Promise<BatchRow | null> {
  const live = await d.store.getBatchByRoot(root);
  if (live) return live.typeId === typeId ? live : null;
  const cancelled = await d.store.listBatches({ typeId, statuses: ["cancelled"] });
  return cancelled.find((b) => b.root === root) ?? null;
}

async function onBatchAdded(d: SyncDeps, a: Record<string, unknown>): Promise<void> {
  const typeId = lc<Hex>(a.typeId);
  const batch = await batchForRoot(d, typeId, lc<Hex>(a.root));
  if (!batch) return; // a batch the node did not prepare
  // The compare-and-set is the exactly-once guard: only the call that moves the batch delivers.
  const moved = await d.store.updateBatch(batch.id, { status: "onchain", chainBatchId: dec(a.batchId) }, ["prepared", "cancelled"]);
  if (batch.actionId) await d.store.updateAction(batch.actionId, { status: "done", error: null }, NOT_DONE);
  if (!moved) return;
  try {
    await d.deliver(batch.id);
  } catch (err) {
    // Not rethrown: the batch is on chain either way, and a replay would not deliver again.
    console.error("[credentials/sync] delivery failed", batch.id, err instanceof Error ? err.message : err);
  }
}

async function onClaimed(d: SyncDeps, a: Record<string, unknown>): Promise<void> {
  const typeId = lc<Hex>(a.typeId);
  const account = lc<string>(a.account);
  const hits = await d.store.listInvitations({ leafHash: lc<Hex>(a.leaf), typeId });
  for (const i of hits) {
    await d.store.updateInvitation(i.id, {
      claimedOnchain: true,
      status: "accepted",
      recipientWallet: account,
      respondedAt: i.respondedAt ?? new Date().toISOString(),
    });
  }
}

async function onUnheld(d: SyncDeps, a: Record<string, unknown>): Promise<void> {
  await d.store.updateInvitations({ typeId: lc<Hex>(a.typeId), recipientWallet: lc<string>(a.account) }, { claimedOnchain: false });
}

async function onLeafRevoked(d: SyncDeps, a: Record<string, unknown>): Promise<void> {
  const batch = await d.store.getBatchByChainId(dec(a.batchId));
  if (!batch) return;
  await d.store.updateInvitations({ batchId: batch.id, leafHash: lc<Hex>(a.leaf) }, { status: "revoked" });
}

async function onBatchRevoked(d: SyncDeps, a: Record<string, unknown>): Promise<void> {
  const batch = await d.store.getBatchByChainId(dec(a.batchId));
  if (!batch) return;
  await d.store.updateBatch(batch.id, { status: "revoked" });
  await d.store.updateInvitations({ batchId: batch.id }, { status: "revoked" });
}

async function onDelegateSet(d: SyncDeps, a: Record<string, unknown>): Promise<void> {
  const typeId = lc<Hex>(a.typeId);
  const delegate = lc<string>(a.delegate);
  const existing = (await d.store.listDelegates(typeId)).find((x) => x.delegate === delegate);
  await d.store.setDelegate({ typeId, delegate, label: existing?.label ?? null, active: Boolean(a.allowed) });
}

async function onOrgPrivateOnlySet(d: SyncDeps, a: Record<string, unknown>): Promise<void> {
  const accountId = await accountForOrg(d.store, lc<Hex>(a.orgId));
  if (!accountId) return;
  const privateOnly = Boolean(a.privateOnly);
  // Compare-and-set: only the call that actually closes the org pushes.
  const changed = await d.store.setMembersPublic(accountId, !privateOnly, { unlessAlready: true });
  if (!changed || !privateOnly) return;
  const types = (await d.store.listTypes({ accountId })).filter((t) => t.kind === "membership");
  for (const t of types) {
    const holders = (await d.store.listInvitations({ typeId: t.typeId }))
      .filter((i) => i.claimedOnchain && i.recipientWallet)
      .map((i) => i.recipientWallet as string);
    const wallets = [...new Set(holders)];
    if (wallets.length === 0) continue;
    // Names neither org nor type: the push itself must not reveal a membership.
    await d.notify.push({ wallets, type: "credential_visibility", title: VISIBILITY_PUSH.title, body: VISIBILITY_PUSH.body, data: { type: "credential_visibility", typeId: t.typeId } });
  }
}

async function applyOne(d: SyncDeps, l: RegisterLog): Promise<boolean> {
  const a = l.args;
  switch (l.eventName) {
    case "TypeCreated":
      await onTypeCreated(d, a);
      return true;
    case "TypeConfigured":
      await onTypeConfigured(d, a);
      return true;
    case "TypeRetired":
      await d.store.updateType(lc<Hex>(a.typeId), { retired: true });
      return true;
    case "TypeRecognised":
      // Also emitted with false by updateType and rebindType.
      await d.store.updateType(lc<Hex>(a.typeId), { recognised: Boolean(a.recognised) });
      return true;
    case "TypeRebound":
      // Types are keyed by typeId; recognition changes arrive as TypeRecognised.
      return true;
    case "BatchAdded":
      await onBatchAdded(d, a);
      return true;
    case "Claimed":
      await onClaimed(d, a);
      return true;
    case "Renounced":
    case "Pruned":
      await onUnheld(d, a);
      return true;
    case "LeafRevoked":
      await onLeafRevoked(d, a);
      return true;
    case "BatchRevoked":
      await onBatchRevoked(d, a);
      return true;
    case "DelegateSet":
      await onDelegateSet(d, a);
      return true;
    case "OrgPrivateOnlySet":
      await onOrgPrivateOnlySet(d, a);
      return true;
    default:
      // SelfClaimed (no invitation), Sources*, TransferSingle: nothing to mirror.
      return false;
  }
}

// ── entry points ──────────────────────────────────────────────────────────────

/** Applies register logs in chain order. Idempotent. `applied` counts logs a handler took. */
export async function applyRegisterLogs(d: SyncDeps, logs: readonly RegisterLog[]): Promise<{ applied: number }> {
  let applied = 0;
  for (const l of ordered(logs)) if (await applyOne(d, l)) applied++;
  return { applied };
}

/**
 * The receipt path (recordSubmitted): the same handlers, then the action → done. Safe to run
 * concurrently with itself and with the cron sync.
 */
export async function applyConfirmedAction(d: SyncDeps, actionId: string, logs: readonly RegisterLog[]): Promise<void> {
  await applyRegisterLogs(d, logs);
  await d.store.updateAction(actionId, { status: "done", error: null }, NOT_DONE);
}

/**
 * One cron pass: from the stored cursor (or the deploy block) up to head − 3, at most `maxBlocks`.
 * The cursor advances only after every log of the window was applied.
 */
export async function syncRegister(
  d: SyncDeps,
  opts: { maxBlocks?: bigint } = {},
): Promise<{ from: bigint; to: bigint; applied: number } | { skipped: "registry_mismatch" | "not_configured" }> {
  if (!d.registry || !/^0x[0-9a-fA-F]{40}$/.test(d.registry)) return { skipped: "not_configured" };
  const registry = d.registry.toLowerCase();
  const cursor = await d.store.syncCursor();
  if (cursor && cursor.registry.toLowerCase() !== registry) return { skipped: "registry_mismatch" };

  const maxBlocks = opts.maxBlocks && opts.maxBlocks > 0n ? opts.maxBlocks : DEFAULT_MAX_BLOCKS;
  const from = cursor ? cursor.lastBlock + 1n : d.deployBlock;
  const safeHead = (await d.head()) - CONFIRMATIONS;
  const cap = from + maxBlocks - 1n;
  const to = safeHead < cap ? safeHead : cap;
  if (to < from) return { from, to, applied: 0 };

  const logs = await d.getLogs(from, to);
  const { applied } = await applyRegisterLogs(d, logs);
  await d.store.setSyncCursor({ registry, lastBlock: to });
  return { from, to, applied };
}
