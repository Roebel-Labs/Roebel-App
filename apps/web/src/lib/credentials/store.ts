/**
 * Storage for the credential register mirror. Server-only.
 *
 * Tables: supabase/migrations/20261117cra_credential_register.sql (credential_* plus
 * accounts.credentials_members_public), and the existing `accounts` / `account_owners` for org
 * names and rights. The production implementation is store-supabase.ts (service role);
 * `InMemoryCredentialStore` is for tests.
 *
 * Conventions: hex ids (type ids, roots, leaf hashes, org ids, wallets) are lowercase; uint64
 * values (`validUntil`, `chainBatchId`) are decimal strings so rows stay JSON-safe like the
 * register steps; timestamps are ISO strings.
 *
 * Relative imports only: loaded by `npx tsx --test`.
 */
import type { Hex } from "viem";
import type { RegisterStep } from "@netizen-labs/credential-registry";

export type Kind = "role" | "membership" | "badge";
export type Policy = "issuer_batch" | "self_claim" | "external";
export type OwnerRole = "owner" | "admin" | "member";

export class CredentialStoreError extends Error {
  constructor(readonly op: string, readonly code?: string) {
    super(`credential store: ${op} failed${code ? ` (${code})` : ""}`);
  }
}

export type AccountRow = {
  id: string;
  accountType: "personal" | "organisation" | string;
  name: string;
  subType: string | null;
  avatarUrl: string | null;
  /** accounts.credentials_members_public: null = never set on chain. */
  membersPublicColumn: boolean | null;
};

export type TypeRow = {
  typeId: Hex;
  registry: string;
  /** null = community type. */
  accountId: string | null;
  orgId: Hex;
  localUuid: string | null;
  localId: Hex;
  /** null only for a minimal row the sync inserted for a type created outside the node. */
  kind: Kind | null;
  policy: Policy | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  benefits: string[];
  template: string | null;
  defaultValiditySeconds: number;
  claimStart: string | null;
  claimEnd: string | null;
  supplyCap: number;
  publicClaim: boolean;
  recognised: boolean;
  retired: boolean;
  chainStatus: "draft" | "onchain";
  eventId: string | null;
  createdBy: string;
  createdAt: string;
};

export type ActionStatus = "awaiting_confirmation" | "submitted" | "done" | "failed" | "cancelled" | "expired";
export type ActionVia = "app" | "dashboard" | "studio" | "node";

export type ActionRow = {
  id: string;
  accountId: string | null;
  steps: RegisterStep[];
  /** ActionSummary (actions.ts); never a name, email or address. */
  summary: Record<string, unknown>;
  status: ActionStatus;
  preparedBy: string;
  preparedVia: ActionVia;
  confirmedBy: string | null;
  txHash: string | null;
  error: string | null;
  /** Decimal chain head at prepare time; a receipt must come from a later block. */
  preparedBlock: string | null;
  createdAt: string;
  expiresAt: string;
};

export type BatchStatus = "prepared" | "onchain" | "revoked" | "cancelled";
export type BatchSource = "people" | "member_list" | "event" | "node_delegate";

export type BatchRow = {
  id: string;
  actionId: string | null;
  typeId: Hex;
  root: Hex;
  count: number;
  /** Decimal uint64, set by the sync from BatchAdded. */
  chainBatchId: string | null;
  status: BatchStatus;
  source: BatchSource;
  createdAt: string;
};

export type InvitationStatus = "prepared" | "invited" | "accepted" | "declined" | "revoked";
export type LeafKind = "account" | "claim_key";

export type InvitationRow = {
  id: string;
  batchId: string;
  typeId: Hex;
  leafKind: LeafKind;
  /** Wallet (account leaf) or claim-key address (claim-key leaf), lowercase. */
  subject: string;
  /** Decimal uint64 unix seconds, "0" = no expiry. */
  validUntil: string;
  salt: Hex;
  leafHash: Hex;
  proof: Hex[];
  claimKeyEnc: string | null;
  tokenHash: string | null;
  tokenEnc: string | null;
  recipientWallet: string | null;
  displayName: string | null;
  contactEmail: string | null;
  emailSentAt: string | null;
  status: InvitationStatus;
  claimedOnchain: boolean;
  invitedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
};

/** What the batch builder hands to `insertBatchWithInvitations`. */
export type NewInvitation = Omit<InvitationRow, "createdAt" | "status" | "claimedOnchain" | "invitedAt" | "respondedAt" | "emailSentAt" | "batchId"> &
  Partial<Pick<InvitationRow, "status">>;
export type NewBatch = Omit<BatchRow, "createdAt" | "chainBatchId" | "status"> & Partial<Pick<BatchRow, "status">>;

/** An app user (public.users) as the people search shows it. */
export type UserRow = {
  wallet: string;
  /** display_name, else username. */
  displayName: string;
  avatarUrl: string | null;
  /** In-memory store only: the username, when it differs from the display name. */
  username?: string | null;
};

export type DelegateRow = { typeId: Hex; delegate: string; label: string | null; active: boolean };
export type PresentationRow = { codeHash: string; payload: Record<string, unknown>; expiresAt: string };
export type SyncState = { registry: string; lastBlock: bigint };

export type TypeFilter = { accountId?: string | null; chainStatus?: TypeRow["chainStatus"]; includeRetired?: boolean; typeIds?: readonly Hex[] };
export type InvitationFilter = {
  batchId?: string;
  typeId?: Hex;
  recipientWallet?: string;
  leafHash?: Hex;
  statuses?: readonly InvitationStatus[];
};
/** Compare-and-set guards for updates; the update applies only when every given guard matches. */
export type InvitationGuard = { recipientWalletIsNull?: boolean; statuses?: readonly InvitationStatus[] };

export interface CredentialStore {
  // accounts / account_owners (read; one mirror write from the sync)
  getAccount(accountId: string): Promise<AccountRow | null>;
  getAccounts(accountIds: readonly string[]): Promise<AccountRow[]>;
  /** Every organisation account id (the sync matches OrgPrivateOnlySet by orgIdFromUuid). */
  listOrganisationAccountIds(): Promise<string[]>;
  roleOf(accountId: string, wallet: string): Promise<OwnerRole | null>;
  /** Orgs where the wallet has any account_owners row. */
  rolesForWallet(wallet: string): Promise<{ accountId: string; role: OwnerRole }[]>;
  /** Every account_owners row of the org (all roles). */
  ownersOf(accountId: string): Promise<{ wallet: string; role: OwnerRole }[]>;
  /**
   * With `unlessAlready`, a compare-and-set: applies only while the column is not already `value`
   * (null counts as different). Returns whether the row changed.
   */
  setMembersPublic(accountId: string, value: boolean | null, opts?: { unlessAlready?: boolean }): Promise<boolean>;

  // users (read): the member invite screen's name search, and names for account recipients
  /** Users whose shown name (display_name, else username) contains `query`, case-insensitive; at most `limit`. */
  searchUsers(query: string, limit: number): Promise<UserRow[]>;
  usersByWallets(wallets: readonly string[]): Promise<UserRow[]>;

  // credential_types
  getType(typeId: Hex): Promise<TypeRow | null>;
  listTypes(filter?: TypeFilter): Promise<TypeRow[]>;
  upsertType(row: TypeRow): Promise<void>;
  updateType(typeId: Hex, patch: Partial<Omit<TypeRow, "typeId">>): Promise<boolean>;

  // credential_actions
  insertAction(row: ActionRow): Promise<void>;
  getAction(id: string): Promise<ActionRow | null>;
  /** The action that already holds this transaction hash (unique), or null. */
  getActionByTxHash(txHash: string): Promise<ActionRow | null>;
  /** With `ifStatus`, applies only while the action is in one of those states. */
  updateAction(id: string, patch: Partial<Omit<ActionRow, "id">>, ifStatus?: readonly ActionStatus[]): Promise<boolean>;
  listActions(filter: { accountId?: string; statuses?: readonly ActionStatus[] }): Promise<ActionRow[]>;

  // credential_batches + credential_invitations
  insertBatchWithInvitations(batch: NewBatch, invitations: readonly NewInvitation[]): Promise<void>;
  getBatch(id: string): Promise<BatchRow | null>;
  /** The live batch (status not cancelled) with this root. */
  getBatchByRoot(root: Hex): Promise<BatchRow | null>;
  getBatchByChainId(chainBatchId: string): Promise<BatchRow | null>;
  listBatches(filter: { typeId?: Hex; actionId?: string; statuses?: readonly BatchStatus[] }): Promise<BatchRow[]>;
  /** With `ifStatus`, a compare-and-set: false when the batch was not in one of those states. */
  updateBatch(id: string, patch: Partial<Omit<BatchRow, "id">>, ifStatus?: readonly BatchStatus[]): Promise<boolean>;

  getInvitation(id: string): Promise<InvitationRow | null>;
  listInvitations(filter: InvitationFilter): Promise<InvitationRow[]>;
  updateInvitation(id: string, patch: Partial<Omit<InvitationRow, "id">>, guard?: InvitationGuard): Promise<boolean>;
  /** Bulk update of every invitation matching the filter; returns how many changed. */
  updateInvitations(filter: InvitationFilter, patch: Partial<Omit<InvitationRow, "id">>): Promise<number>;
  findInvitationByTokenHash(tokenHash: string): Promise<InvitationRow | null>;
  invitationsForWallet(wallet: string): Promise<InvitationRow[]>;

  // credential_delegates
  setDelegate(row: DelegateRow): Promise<void>;
  listDelegates(typeId: Hex): Promise<DelegateRow[]>;

  // credential_presentations
  putPresentation(row: PresentationRow): Promise<void>;
  /** The row if present and not expired (an expired row is deleted and reads as null). */
  getPresentation(codeHash: string, nowMs?: number): Promise<PresentationRow | null>;
  /** Reads and deletes in one go; null when absent or expired. */
  takePresentation(codeHash: string, nowMs?: number): Promise<PresentationRow | null>;
  deletePresentation(codeHash: string): Promise<void>;

  // credential_sync_state
  syncCursor(): Promise<SyncState | null>;
  setSyncCursor(state: SyncState): Promise<void>;
}

const lc = <T extends string | null | undefined>(v: T): T => (typeof v === "string" ? (v.toLowerCase() as T) : v);
const nowIso = () => new Date().toISOString();
const clone = <T>(v: T): T => structuredClone(v);

function matchesInvitation(i: InvitationRow, f: InvitationFilter): boolean {
  if (f.batchId !== undefined && i.batchId !== f.batchId) return false;
  if (f.typeId !== undefined && i.typeId !== lc(f.typeId)) return false;
  if (f.recipientWallet !== undefined && i.recipientWallet !== lc(f.recipientWallet)) return false;
  if (f.leafHash !== undefined && i.leafHash !== lc(f.leafHash)) return false;
  if (f.statuses && !f.statuses.includes(i.status)) return false;
  return true;
}

/** An empty filter would match every invitation of every org: refuse it. */
export function assertInvitationFilter(f: InvitationFilter, op: string): void {
  const any =
    f.batchId !== undefined || f.typeId !== undefined || f.recipientWallet !== undefined || f.leafHash !== undefined || f.statuses !== undefined;
  if (!any) throw new CredentialStoreError(op, "EMPTY_FILTER");
}

function normaliseInvitationPatch(patch: Partial<InvitationRow>): Partial<InvitationRow> {
  const p = { ...patch };
  if (p.recipientWallet !== undefined) p.recipientWallet = lc(p.recipientWallet);
  if (p.subject !== undefined) p.subject = lc(p.subject);
  return p;
}

export class InMemoryCredentialStore implements CredentialStore {
  readonly accounts = new Map<string, AccountRow>();
  readonly owners: { accountId: string; wallet: string; role: OwnerRole }[] = [];
  readonly users: UserRow[] = [];
  readonly types = new Map<string, TypeRow>();
  readonly actions = new Map<string, ActionRow>();
  readonly batches = new Map<string, BatchRow>();
  readonly invitations = new Map<string, InvitationRow>();
  readonly delegates = new Map<string, DelegateRow>();
  readonly presentations = new Map<string, PresentationRow>();
  cursor: SyncState | null = null;

  // ── test seeding ────────────────────────────────────────────────────────────
  seedAccount(a: AccountRow): void {
    this.accounts.set(a.id, { ...a });
  }
  seedOwner(accountId: string, wallet: string, role: OwnerRole): void {
    this.owners.push({ accountId, wallet: wallet.toLowerCase(), role });
  }
  seedUser(u: UserRow): void {
    this.users.push({ ...u, wallet: u.wallet.toLowerCase() });
  }

  // ── accounts ────────────────────────────────────────────────────────────────
  async getAccount(accountId: string) {
    const a = this.accounts.get(accountId);
    return a ? { ...a } : null;
  }
  async getAccounts(accountIds: readonly string[]) {
    return accountIds.flatMap((id) => (this.accounts.has(id) ? [{ ...this.accounts.get(id)! }] : []));
  }
  async listOrganisationAccountIds() {
    return [...this.accounts.values()].filter((a) => a.accountType === "organisation").map((a) => a.id);
  }
  async roleOf(accountId: string, wallet: string) {
    return this.owners.find((o) => o.accountId === accountId && o.wallet === wallet.toLowerCase())?.role ?? null;
  }
  async rolesForWallet(wallet: string) {
    return this.owners.filter((o) => o.wallet === wallet.toLowerCase()).map((o) => ({ accountId: o.accountId, role: o.role }));
  }
  async ownersOf(accountId: string) {
    return this.owners.filter((o) => o.accountId === accountId).map((o) => ({ wallet: o.wallet, role: o.role }));
  }
  async setMembersPublic(accountId: string, value: boolean | null, opts: { unlessAlready?: boolean } = {}) {
    const a = this.accounts.get(accountId);
    if (!a) return false;
    if (opts.unlessAlready && a.membersPublicColumn === value) return false;
    a.membersPublicColumn = value;
    return true;
  }

  // ── users ───────────────────────────────────────────────────────────────────
  async searchUsers(query: string, limit: number) {
    const q = query.toLowerCase();
    // Same fields as the Supabase store: display name or username.
    return this.users
      .filter((u) => u.displayName.toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q))
      .slice(0, limit)
      .map(({ wallet, displayName, avatarUrl }) => ({ wallet, displayName, avatarUrl }));
  }
  async usersByWallets(wallets: readonly string[]) {
    const set = new Set(wallets.map((w) => w.toLowerCase()));
    return this.users.filter((u) => set.has(u.wallet)).map(({ wallet, displayName, avatarUrl }) => ({ wallet, displayName, avatarUrl }));
  }

  // ── types ───────────────────────────────────────────────────────────────────
  async getType(typeId: Hex) {
    const t = this.types.get(typeId.toLowerCase());
    return t ? clone(t) : null;
  }
  async listTypes(filter: TypeFilter = {}) {
    const ids = filter.typeIds?.map((t) => t.toLowerCase());
    return [...this.types.values()]
      .filter((t) => filter.accountId === undefined || t.accountId === filter.accountId)
      .filter((t) => !filter.chainStatus || t.chainStatus === filter.chainStatus)
      .filter((t) => filter.includeRetired !== false || !t.retired)
      .filter((t) => !ids || ids.includes(t.typeId))
      .map(clone);
  }
  async upsertType(row: TypeRow) {
    const typeId = row.typeId.toLowerCase() as Hex;
    this.types.set(typeId, clone({ ...row, typeId, orgId: lc(row.orgId), localId: lc(row.localId) }));
  }
  async updateType(typeId: Hex, patch: Partial<Omit<TypeRow, "typeId">>) {
    const t = this.types.get(typeId.toLowerCase());
    if (!t) return false;
    Object.assign(t, clone(patch));
    return true;
  }

  // ── actions ─────────────────────────────────────────────────────────────────
  async insertAction(row: ActionRow) {
    if (this.actions.has(row.id)) throw new CredentialStoreError("insertAction", "23505");
    this.actions.set(row.id, clone(row));
  }
  async getAction(id: string) {
    const a = this.actions.get(id);
    return a ? clone(a) : null;
  }
  async getActionByTxHash(txHash: string) {
    const a = [...this.actions.values()].find((x) => x.txHash !== null && x.txHash === txHash.toLowerCase());
    return a ? clone(a) : null;
  }
  async updateAction(id: string, patch: Partial<Omit<ActionRow, "id">>, ifStatus?: readonly ActionStatus[]) {
    const a = this.actions.get(id);
    if (!a || (ifStatus && !ifStatus.includes(a.status))) return false;
    const p = { ...patch };
    if (typeof p.txHash === "string") {
      p.txHash = p.txHash.toLowerCase();
      if ([...this.actions.values()].some((x) => x.id !== id && x.txHash === p.txHash)) throw new CredentialStoreError("updateAction", "23505");
    }
    Object.assign(a, clone(p));
    return true;
  }
  async listActions(filter: { accountId?: string; statuses?: readonly ActionStatus[] }) {
    return [...this.actions.values()]
      .filter((a) => filter.accountId === undefined || a.accountId === filter.accountId)
      .filter((a) => !filter.statuses || filter.statuses.includes(a.status))
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
      .map(clone);
  }

  // ── batches + invitations ───────────────────────────────────────────────────
  async insertBatchWithInvitations(batch: NewBatch, invitations: readonly NewInvitation[]) {
    const root = batch.root.toLowerCase() as Hex;
    if (this.batches.has(batch.id)) throw new CredentialStoreError("insertBatchWithInvitations", "23505");
    if ([...this.batches.values()].some((b) => b.root === root && b.status !== "cancelled")) {
      throw new CredentialStoreError("insertBatchWithInvitations", "23505");
    }
    const ids = new Set<string>();
    for (const i of invitations) {
      if (this.invitations.has(i.id) || ids.has(i.id)) throw new CredentialStoreError("insertBatchWithInvitations", "23505");
      if (i.tokenHash && [...this.invitations.values()].some((x) => x.tokenHash === i.tokenHash)) {
        throw new CredentialStoreError("insertBatchWithInvitations", "23505");
      }
      ids.add(i.id);
    }
    const createdAt = nowIso();
    this.batches.set(batch.id, { ...batch, root, typeId: lc(batch.typeId), status: batch.status ?? "prepared", chainBatchId: null, createdAt });
    for (const i of invitations) {
      this.invitations.set(i.id, clone({
        ...i,
        batchId: batch.id,
        typeId: lc(i.typeId),
        subject: lc(i.subject),
        leafHash: lc(i.leafHash),
        recipientWallet: lc(i.recipientWallet),
        status: i.status ?? "prepared",
        claimedOnchain: false,
        invitedAt: null,
        respondedAt: null,
        emailSentAt: null,
        createdAt,
      }));
    }
  }
  async getBatch(id: string) {
    const b = this.batches.get(id);
    return b ? { ...b } : null;
  }
  async getBatchByRoot(root: Hex) {
    const b = [...this.batches.values()].find((x) => x.root === root.toLowerCase() && x.status !== "cancelled");
    return b ? { ...b } : null;
  }
  async getBatchByChainId(chainBatchId: string) {
    const b = [...this.batches.values()].find((x) => x.chainBatchId === chainBatchId);
    return b ? { ...b } : null;
  }
  async listBatches(filter: { typeId?: Hex; actionId?: string; statuses?: readonly BatchStatus[] }) {
    return [...this.batches.values()]
      .filter((b) => filter.typeId === undefined || b.typeId === filter.typeId.toLowerCase())
      .filter((b) => filter.actionId === undefined || b.actionId === filter.actionId)
      .filter((b) => !filter.statuses || filter.statuses.includes(b.status))
      .map((b) => ({ ...b }));
  }
  async updateBatch(id: string, patch: Partial<Omit<BatchRow, "id">>, ifStatus?: readonly BatchStatus[]) {
    const b = this.batches.get(id);
    if (!b || (ifStatus && !ifStatus.includes(b.status))) return false;
    Object.assign(b, patch);
    return true;
  }

  async getInvitation(id: string) {
    const i = this.invitations.get(id);
    return i ? clone(i) : null;
  }
  async listInvitations(filter: InvitationFilter) {
    assertInvitationFilter(filter, "listInvitations");
    return [...this.invitations.values()].filter((i) => matchesInvitation(i, filter)).map(clone);
  }
  async updateInvitation(id: string, patch: Partial<Omit<InvitationRow, "id">>, guard: InvitationGuard = {}) {
    const i = this.invitations.get(id);
    if (!i) return false;
    if (guard.recipientWalletIsNull && i.recipientWallet !== null) return false;
    if (guard.statuses && !guard.statuses.includes(i.status)) return false;
    Object.assign(i, clone(normaliseInvitationPatch(patch)));
    return true;
  }
  async updateInvitations(filter: InvitationFilter, patch: Partial<Omit<InvitationRow, "id">>) {
    assertInvitationFilter(filter, "updateInvitations");
    let n = 0;
    for (const i of this.invitations.values()) {
      if (!matchesInvitation(i, filter)) continue;
      Object.assign(i, clone(normaliseInvitationPatch(patch)));
      n++;
    }
    return n;
  }
  async findInvitationByTokenHash(tokenHash: string) {
    const i = [...this.invitations.values()].find((x) => x.tokenHash === tokenHash);
    return i ? clone(i) : null;
  }
  async invitationsForWallet(wallet: string) {
    return this.listInvitations({ recipientWallet: wallet });
  }

  // ── delegates ───────────────────────────────────────────────────────────────
  async setDelegate(row: DelegateRow) {
    const r = { ...row, typeId: lc(row.typeId), delegate: row.delegate.toLowerCase() };
    this.delegates.set(`${r.typeId}:${r.delegate}`, r);
  }
  async listDelegates(typeId: Hex) {
    return [...this.delegates.values()].filter((d) => d.typeId === typeId.toLowerCase()).map((d) => ({ ...d }));
  }

  // ── presentations ───────────────────────────────────────────────────────────
  async putPresentation(row: PresentationRow) {
    this.presentations.set(row.codeHash, clone(row));
  }
  async getPresentation(codeHash: string, nowMs = Date.now()) {
    const p = this.presentations.get(codeHash);
    if (!p) return null;
    if (Date.parse(p.expiresAt) <= nowMs) {
      this.presentations.delete(codeHash);
      return null;
    }
    return clone(p);
  }
  async takePresentation(codeHash: string, nowMs = Date.now()) {
    const p = await this.getPresentation(codeHash, nowMs);
    this.presentations.delete(codeHash);
    return p;
  }
  async deletePresentation(codeHash: string) {
    this.presentations.delete(codeHash);
  }

  // ── sync state ──────────────────────────────────────────────────────────────
  async syncCursor() {
    return this.cursor ? { ...this.cursor } : null;
  }
  async setSyncCursor(state: SyncState) {
    this.cursor = { registry: state.registry.toLowerCase(), lastBlock: state.lastBlock };
  }
}
