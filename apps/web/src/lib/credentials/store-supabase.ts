/**
 * Supabase (service role) implementation of CredentialStore. Server-only.
 *
 * Tables (supabase/migrations/20261117cra_credential_register.sql, NOT applied by agents):
 *   credential_types, credential_actions, credential_batches, credential_invitations,
 *   credential_delegates, credential_presentations, credential_sync_state
 * all RLS-on with no policies and no anon/authenticated grants, so only the service role reaches
 * them. Reads `accounts` / `account_owners`; the only write outside credential_* is
 * `accounts.credentials_members_public` (mirrored from OrgPrivateOnlySet by the sync).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Hex } from "viem";
import {
  assertInvitationFilter,
  CredentialStoreError,
  type AccountRow,
  type ActionRow,
  type ActionStatus,
  type BatchRow,
  type BatchStatus,
  type CredentialStore,
  type DelegateRow,
  type EventRow,
  type AttendanceRow,
  type InvitationFilter,
  type InvitationGuard,
  type InvitationRow,
  type NewBatch,
  type NewInvitation,
  type OwnerRole,
  type PresentationRow,
  type SyncState,
  type TypeFilter,
  type TypeRow,
  type UserRow,
} from "./store";

export const CREDENTIAL_TABLES = {
  types: "credential_types",
  actions: "credential_actions",
  batches: "credential_batches",
  invitations: "credential_invitations",
  delegates: "credential_delegates",
  presentations: "credential_presentations",
  sync: "credential_sync_state",
} as const;
const T = CREDENTIAL_TABLES;

type Result = { data?: unknown; error: { code?: string; message?: string } | null };
type Row = Record<string, any>;

function check(op: string, r: Result): void {
  if (r.error) throw new CredentialStoreError(op, r.error.code);
}
const lc = <T extends string | null | undefined>(v: T): T => (typeof v === "string" ? (v.toLowerCase() as T) : v);
const dec = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

// ── row mapping ───────────────────────────────────────────────────────────────

const ACCOUNT_COLS = "id, account_type, name, sub_type, avatar_url, credentials_members_public";
const toAccount = (r: Row): AccountRow => ({
  id: r.id,
  accountType: r.account_type,
  name: r.name ?? "",
  subType: r.sub_type ?? null,
  avatarUrl: r.avatar_url ?? null,
  membersPublicColumn: r.credentials_members_public ?? null,
});

const toUser = (r: Row): UserRow => ({
  wallet: String(r.wallet_address).toLowerCase(),
  displayName: r.display_name || r.username || "",
  avatarUrl: r.profile_picture_url ?? null,
});

const toType = (r: Row): TypeRow => ({
  typeId: r.type_id,
  registry: r.registry,
  accountId: r.account_id ?? null,
  orgId: r.org_id,
  localUuid: r.local_uuid ?? null,
  localId: r.local_id,
  kind: r.kind ?? null,
  policy: r.policy ?? null,
  name: r.name,
  description: r.description ?? null,
  imageUrl: r.image_url ?? null,
  benefits: Array.isArray(r.benefits) ? r.benefits.map(String) : [],
  template: r.template ?? null,
  defaultValiditySeconds: Number(r.default_validity_seconds ?? 0),
  claimStart: r.claim_start ?? null,
  claimEnd: r.claim_end ?? null,
  supplyCap: Number(r.supply_cap ?? 0),
  publicClaim: r.public_claim !== false,
  recognised: r.recognised === true,
  retired: r.retired === true,
  chainStatus: r.chain_status,
  eventId: r.event_id ?? null,
  createdBy: r.created_by,
  createdAt: r.created_at,
  // Only once migration 20261117crb added the columns; absent keys are never written back.
  ...(r.auto_badges !== undefined ? { autoBadges: r.auto_badges === true } : {}),
  ...(r.last_auto_at !== undefined ? { lastAutoAt: r.last_auto_at ?? null } : {}),
});
const TYPE_FIELDS: Record<keyof TypeRow, string> = {
  typeId: "type_id", registry: "registry", accountId: "account_id", orgId: "org_id", localUuid: "local_uuid",
  localId: "local_id", kind: "kind", policy: "policy", name: "name", description: "description", imageUrl: "image_url",
  benefits: "benefits", template: "template", defaultValiditySeconds: "default_validity_seconds",
  claimStart: "claim_start", claimEnd: "claim_end", supplyCap: "supply_cap", publicClaim: "public_claim",
  recognised: "recognised", retired: "retired", chainStatus: "chain_status", eventId: "event_id",
  createdBy: "created_by", createdAt: "created_at", autoBadges: "auto_badges", lastAutoAt: "last_auto_at",
};

const toAction = (r: Row): ActionRow => ({
  id: r.id,
  accountId: r.account_id ?? null,
  steps: r.steps ?? [],
  summary: r.summary ?? {},
  status: r.status,
  preparedBy: r.prepared_by,
  preparedVia: r.prepared_via,
  confirmedBy: r.confirmed_by ?? null,
  txHash: r.tx_hash ?? null,
  error: r.error ?? null,
  preparedBlock: dec(r.prepared_block),
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});
const ACTION_FIELDS: Record<keyof ActionRow, string> = {
  id: "id", accountId: "account_id", steps: "steps", summary: "summary", status: "status", preparedBy: "prepared_by",
  preparedVia: "prepared_via", confirmedBy: "confirmed_by", txHash: "tx_hash", error: "error",
  preparedBlock: "prepared_block", createdAt: "created_at", expiresAt: "expires_at",
};

const toBatch = (r: Row): BatchRow => ({
  id: r.id,
  actionId: r.action_id ?? null,
  typeId: r.type_id,
  root: r.root,
  count: Number(r.count),
  chainBatchId: dec(r.chain_batch_id),
  status: r.status,
  source: r.source,
  createdAt: r.created_at,
});
const BATCH_FIELDS: Record<keyof BatchRow, string> = {
  id: "id", actionId: "action_id", typeId: "type_id", root: "root", count: "count", chainBatchId: "chain_batch_id",
  status: "status", source: "source", createdAt: "created_at",
};

const toInvitation = (r: Row): InvitationRow => ({
  id: r.id,
  batchId: r.batch_id,
  typeId: r.type_id,
  leafKind: r.leaf_kind,
  subject: r.subject,
  validUntil: dec(r.valid_until) ?? "0",
  salt: r.salt,
  leafHash: r.leaf_hash,
  proof: Array.isArray(r.proof) ? r.proof : [],
  claimKeyEnc: r.claim_key_enc ?? null,
  tokenHash: r.token_hash ?? null,
  tokenEnc: r.token_enc ?? null,
  recipientWallet: r.recipient_wallet ?? null,
  displayName: r.display_name ?? null,
  contactEmail: r.contact_email ?? null,
  emailSentAt: r.email_sent_at ?? null,
  mailAttempts: Number(r.mail_attempts ?? 0),
  status: r.status,
  claimedOnchain: r.claimed_onchain === true,
  invitedAt: r.invited_at ?? null,
  respondedAt: r.responded_at ?? null,
  createdAt: r.created_at,
});
const INVITATION_FIELDS: Record<keyof InvitationRow, string> = {
  id: "id", batchId: "batch_id", typeId: "type_id", leafKind: "leaf_kind", subject: "subject", validUntil: "valid_until",
  salt: "salt", leafHash: "leaf_hash", proof: "proof", claimKeyEnc: "claim_key_enc", tokenHash: "token_hash",
  tokenEnc: "token_enc", recipientWallet: "recipient_wallet", displayName: "display_name", contactEmail: "contact_email",
  emailSentAt: "email_sent_at", mailAttempts: "mail_attempts", status: "status", claimedOnchain: "claimed_onchain", invitedAt: "invited_at",
  respondedAt: "responded_at", createdAt: "created_at",
};

/** Values that are lowercase hex / wallets in every table. */
const LOWERCASE_COLUMNS = new Set([
  "type_id", "org_id", "local_id", "registry", "root", "leaf_hash", "subject", "recipient_wallet", "delegate", "created_by",
  "prepared_by", "confirmed_by", "tx_hash",
]);

// The events table has no end-date column today, so endDate stays null (badgeWindow uses `date`).
const EVENT_COLS = "id, title, date, time, end_time, image_url, account_id, status, max_attendees";
const toEvent = (r: Row): EventRow => ({
  id: r.id,
  title: r.title ?? "",
  date: String(r.date ?? ""),
  endDate: null,
  imageUrl: r.image_url ?? null,
  accountId: r.account_id ?? null,
  time: r.time ?? null,
  endTime: r.end_time ?? null,
  status: r.status ?? null,
  maxAttendees: typeof r.max_attendees === "number" ? r.max_attendees : null,
});
/** PostgREST returns at most 1000 rows per request. */
const PAGE = 1000;

function toColumns<R>(patch: Partial<R>, fields: Record<keyof R, string>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const col = fields[k as keyof R];
    if (!col) continue;
    out[col] = typeof v === "string" && LOWERCASE_COLUMNS.has(col) ? v.toLowerCase() : v;
  }
  return out;
}

export class SupabaseCredentialStore implements CredentialStore {
  constructor(private readonly db: SupabaseClient) {}

  // ── accounts ────────────────────────────────────────────────────────────────
  async getAccount(accountId: string) {
    const r = await this.db.from("accounts").select(ACCOUNT_COLS).eq("id", accountId).maybeSingle();
    check("getAccount", r);
    return r.data ? toAccount(r.data as Row) : null;
  }
  async getAccounts(accountIds: readonly string[]) {
    if (accountIds.length === 0) return [];
    const r = await this.db.from("accounts").select(ACCOUNT_COLS).in("id", [...accountIds]);
    check("getAccounts", r);
    return ((r.data ?? []) as Row[]).map(toAccount);
  }
  async listOrganisationAccountIds() {
    const r = await this.db.from("accounts").select("id").eq("account_type", "organisation");
    check("listOrganisationAccountIds", r);
    return ((r.data ?? []) as Row[]).map((x) => x.id as string);
  }
  async roleOf(accountId: string, wallet: string) {
    const r = await this.db
      .from("account_owners")
      .select("role")
      .eq("account_id", accountId)
      .eq("wallet_address", wallet.toLowerCase())
      .maybeSingle();
    check("roleOf", r);
    return ((r.data as Row | null)?.role as OwnerRole | undefined) ?? null;
  }
  async rolesForWallet(wallet: string) {
    const r = await this.db.from("account_owners").select("account_id, role").eq("wallet_address", wallet.toLowerCase());
    check("rolesForWallet", r);
    return ((r.data ?? []) as Row[]).map((x) => ({ accountId: x.account_id as string, role: x.role as OwnerRole }));
  }
  async ownersOf(accountId: string) {
    const r = await this.db.from("account_owners").select("wallet_address, role").eq("account_id", accountId);
    check("ownersOf", r);
    return ((r.data ?? []) as Row[]).map((x) => ({ wallet: String(x.wallet_address).toLowerCase(), role: x.role as OwnerRole }));
  }
  async setMembersPublic(accountId: string, value: boolean | null, opts: { unlessAlready?: boolean } = {}) {
    let q = this.db.from("accounts").update({ credentials_members_public: value }).eq("id", accountId);
    // "is distinct from value": null or the other boolean.
    if (opts.unlessAlready && value !== null) q = q.or(`credentials_members_public.is.null,credentials_members_public.eq.${!value}`);
    else if (opts.unlessAlready) q = q.not("credentials_members_public", "is", null);
    const r = await q.select("id");
    check("setMembersPublic", r);
    return ((r.data ?? []) as Row[]).length > 0;
  }

  // ── users ───────────────────────────────────────────────────────────────────
  // Same query as the member invite screen (lib/supabase-member-management.ts searchUsersForInvite),
  // with the service role and the LIKE wildcards in the query escaped.
  // Matches the shown name: display_name or username (two queries, so the query text never enters
  // a PostgREST or-filter), merged by wallet, at most `limit`.
  async searchUsers(query: string, limit: number) {
    const escaped = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const byWallet = new Map<string, UserRow>();
    for (const column of ["display_name", "username"] as const) {
      const r = await this.db
        .from("users")
        .select("wallet_address, display_name, username, profile_picture_url")
        .not(column, "is", null)
        .ilike(column, `%${escaped}%`)
        .limit(limit);
      check("searchUsers", r);
      for (const u of ((r.data ?? []) as Row[]).map(toUser)) if (u.displayName && !byWallet.has(u.wallet)) byWallet.set(u.wallet, u);
    }
    return [...byWallet.values()].slice(0, limit);
  }
  async usersByWallets(wallets: readonly string[]) {
    const out: UserRow[] = [];
    const list = [...new Set(wallets.map((w) => w.toLowerCase()))];
    for (let i = 0; i < list.length; i += 200) {
      const r = await this.db.from("users").select("wallet_address, display_name, username, profile_picture_url").in("wallet_address", list.slice(i, i + 200));
      check("usersByWallets", r);
      out.push(...((r.data ?? []) as Row[]).filter((x) => x.display_name || x.username).map(toUser));
    }
    return out;
  }

  // ── types ───────────────────────────────────────────────────────────────────
  async getType(typeId: Hex) {
    const r = await this.db.from(T.types).select("*").eq("type_id", typeId.toLowerCase()).maybeSingle();
    check("getType", r);
    return r.data ? toType(r.data as Row) : null;
  }
  async listTypes(filter: TypeFilter = {}) {
    let q = this.db.from(T.types).select("*");
    if (filter.accountId === null) q = q.is("account_id", null);
    else if (filter.accountId !== undefined) q = q.eq("account_id", filter.accountId);
    if (filter.chainStatus) q = q.eq("chain_status", filter.chainStatus);
    if (filter.includeRetired === false) q = q.eq("retired", false);
    if (filter.typeIds) q = q.in("type_id", filter.typeIds.map((t) => t.toLowerCase()));
    const r = await q.order("created_at", { ascending: true });
    check("listTypes", r);
    return ((r.data ?? []) as Row[]).map(toType);
  }
  async upsertType(row: TypeRow) {
    check("upsertType", await this.db.from(T.types).upsert(toColumns(row, TYPE_FIELDS), { onConflict: "type_id" }));
  }
  async updateType(typeId: Hex, patch: Partial<Omit<TypeRow, "typeId">>) {
    const r = await this.db.from(T.types).update(toColumns(patch, TYPE_FIELDS)).eq("type_id", typeId.toLowerCase()).select("type_id");
    check("updateType", r);
    return ((r.data ?? []) as Row[]).length > 0;
  }
  async claimAutoRun(typeId: Hex, beforeIso: string, nowIso: string) {
    const r = await this.db
      .from(T.types)
      .update({ last_auto_at: nowIso })
      .eq("type_id", typeId.toLowerCase())
      .or(`last_auto_at.is.null,last_auto_at.lt."${beforeIso}"`)
      .select("type_id");
    check("claimAutoRun", r);
    return ((r.data ?? []) as Row[]).length > 0;
  }

  // ── actions ─────────────────────────────────────────────────────────────────
  async insertAction(row: ActionRow) {
    check("insertAction", await this.db.from(T.actions).insert(toColumns(row, ACTION_FIELDS)));
  }
  async getAction(id: string) {
    const r = await this.db.from(T.actions).select("*").eq("id", id).maybeSingle();
    check("getAction", r);
    return r.data ? toAction(r.data as Row) : null;
  }
  async getActionByTxHash(txHash: string) {
    const r = await this.db.from(T.actions).select("*").eq("tx_hash", txHash.toLowerCase()).maybeSingle();
    check("getActionByTxHash", r);
    return r.data ? toAction(r.data as Row) : null;
  }
  async updateAction(id: string, patch: Partial<Omit<ActionRow, "id">>, ifStatus?: readonly ActionStatus[]) {
    let q = this.db.from(T.actions).update(toColumns(patch, ACTION_FIELDS)).eq("id", id);
    if (ifStatus) q = q.in("status", [...ifStatus]);
    const r = await q.select("id");
    check("updateAction", r);
    return ((r.data ?? []) as Row[]).length > 0;
  }
  async listActions(filter: { accountId?: string; statuses?: readonly ActionStatus[] }) {
    let q = this.db.from(T.actions).select("*");
    if (filter.accountId !== undefined) q = q.eq("account_id", filter.accountId);
    if (filter.statuses) q = q.in("status", [...filter.statuses]);
    const r = await q.order("created_at", { ascending: false }).limit(500);
    check("listActions", r);
    return ((r.data ?? []) as Row[]).map(toAction);
  }

  // ── batches + invitations ───────────────────────────────────────────────────
  async insertBatchWithInvitations(batch: NewBatch, invitations: readonly NewInvitation[]) {
    // PostgREST has no multi-table transaction: insert the batch, then the invitations in
    // chunks; on any invitation failure delete the batch (invitations cascade) and rethrow.
    check("insertBatch", await this.db.from(T.batches).insert({ ...toColumns(batch, BATCH_FIELDS), status: batch.status ?? "prepared" }));
    try {
      const rows = invitations.map((i) => ({
        ...toColumns(i, INVITATION_FIELDS),
        batch_id: batch.id,
        status: i.status ?? "prepared",
      }));
      for (let k = 0; k < rows.length; k += 500) {
        check("insertInvitations", await this.db.from(T.invitations).insert(rows.slice(k, k + 500)));
      }
    } catch (e) {
      await this.db.from(T.batches).delete().eq("id", batch.id);
      throw e;
    }
  }
  async getBatch(id: string) {
    const r = await this.db.from(T.batches).select("*").eq("id", id).maybeSingle();
    check("getBatch", r);
    return r.data ? toBatch(r.data as Row) : null;
  }
  async getBatchByRoot(root: Hex) {
    const r = await this.db.from(T.batches).select("*").eq("root", root.toLowerCase()).neq("status", "cancelled").maybeSingle();
    check("getBatchByRoot", r);
    return r.data ? toBatch(r.data as Row) : null;
  }
  async getBatchByChainId(chainBatchId: string) {
    const r = await this.db.from(T.batches).select("*").eq("chain_batch_id", chainBatchId).maybeSingle();
    check("getBatchByChainId", r);
    return r.data ? toBatch(r.data as Row) : null;
  }
  async listBatches(filter: { typeId?: Hex; actionId?: string; statuses?: readonly BatchStatus[] }) {
    let q = this.db.from(T.batches).select("*");
    if (filter.typeId !== undefined) q = q.eq("type_id", filter.typeId.toLowerCase());
    if (filter.actionId !== undefined) q = q.eq("action_id", filter.actionId);
    if (filter.statuses) q = q.in("status", [...filter.statuses]);
    const r = await q.order("created_at", { ascending: true });
    check("listBatches", r);
    return ((r.data ?? []) as Row[]).map(toBatch);
  }
  async updateBatch(id: string, patch: Partial<Omit<BatchRow, "id">>, ifStatus?: readonly BatchStatus[]) {
    let q = this.db.from(T.batches).update(toColumns(patch, BATCH_FIELDS)).eq("id", id);
    if (ifStatus) q = q.in("status", [...ifStatus]);
    const r = await q.select("id");
    check("updateBatch", r);
    return ((r.data ?? []) as Row[]).length > 0;
  }

  private filterInvitations(q: any, f: InvitationFilter, op: string): any {
    assertInvitationFilter(f, op);
    let out = q;
    if (f.batchId !== undefined) out = out.eq("batch_id", f.batchId);
    if (f.typeId !== undefined) out = out.eq("type_id", f.typeId.toLowerCase());
    if (f.recipientWallet !== undefined) out = out.eq("recipient_wallet", f.recipientWallet.toLowerCase());
    if (f.leafHash !== undefined) out = out.eq("leaf_hash", f.leafHash.toLowerCase());
    if (f.statuses) out = out.in("status", [...f.statuses]);
    return out;
  }

  async getInvitation(id: string) {
    const r = await this.db.from(T.invitations).select("*").eq("id", id).maybeSingle();
    check("getInvitation", r);
    return r.data ? toInvitation(r.data as Row) : null;
  }
  async listInvitations(filter: InvitationFilter) {
    const out: InvitationRow[] = [];
    // Batches hold up to 2000 rows; page past PostgREST's default row cap.
    for (let from = 0; ; from += 1000) {
      const r = await this.filterInvitations(this.db.from(T.invitations).select("*"), filter, "listInvitations")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + 999);
      check("listInvitations", r);
      const rows = (r.data ?? []) as Row[];
      out.push(...rows.map(toInvitation));
      if (rows.length < 1000) return out;
    }
  }
  async updateInvitation(id: string, patch: Partial<Omit<InvitationRow, "id">>, guard: InvitationGuard = {}) {
    let q = this.db.from(T.invitations).update(toColumns(patch, INVITATION_FIELDS)).eq("id", id);
    if (guard.recipientWalletIsNull) q = q.is("recipient_wallet", null);
    if (guard.statuses) q = q.in("status", [...guard.statuses]);
    const r = await q.select("id");
    check("updateInvitation", r);
    return ((r.data ?? []) as Row[]).length > 0;
  }
  async updateInvitations(filter: InvitationFilter, patch: Partial<Omit<InvitationRow, "id">>) {
    const r = await this.filterInvitations(this.db.from(T.invitations).update(toColumns(patch, INVITATION_FIELDS)), filter, "updateInvitations").select("id");
    check("updateInvitations", r);
    return ((r.data ?? []) as Row[]).length;
  }
  async findInvitationByTokenHash(tokenHash: string) {
    const r = await this.db.from(T.invitations).select("*").eq("token_hash", tokenHash).maybeSingle();
    check("findInvitationByTokenHash", r);
    return r.data ? toInvitation(r.data as Row) : null;
  }
  async onchainBatchesWithPreparedInvitations() {
    // Inner embed: only batches with at least one prepared invitation (one FK, no ambiguity).
    const r = await this.db
      .from(T.batches)
      .select(`id, ${T.invitations}!inner(id)`)
      .eq("status", "onchain")
      .eq(`${T.invitations}.status`, "prepared")
      .limit(1, { referencedTable: T.invitations })
      .order("created_at", { ascending: true })
      .limit(200);
    check("onchainBatchesWithPreparedInvitations", r);
    return ((r.data ?? []) as Row[]).map((b) => String(b.id));
  }
  async interruptedMailInvitations(beforeIso: string) {
    const r = await this.db
      .from(T.invitations)
      .select("*")
      .eq("leaf_kind", "claim_key")
      .eq("status", "invited")
      .not("contact_email", "is", null)
      .is("email_sent_at", null)
      .lt("invited_at", beforeIso)
      .order("invited_at", { ascending: true })
      .limit(200);
    check("interruptedMailInvitations", r);
    return ((r.data ?? []) as Row[]).map(toInvitation);
  }
  async invitationsForWallet(wallet: string) {
    return this.listInvitations({ recipientWallet: wallet });
  }

  // ── delegates ───────────────────────────────────────────────────────────────
  async setDelegate(row: DelegateRow) {
    check(
      "setDelegate",
      await this.db.from(T.delegates).upsert(
        { type_id: row.typeId.toLowerCase(), delegate: row.delegate.toLowerCase(), label: row.label, active: row.active },
        { onConflict: "type_id,delegate" },
      ),
    );
  }
  async listDelegates(typeId: Hex) {
    const r = await this.db.from(T.delegates).select("type_id, delegate, label, active").eq("type_id", typeId.toLowerCase());
    check("listDelegates", r);
    return ((r.data ?? []) as Row[]).map((x) => ({ typeId: x.type_id, delegate: x.delegate, label: x.label ?? null, active: x.active === true }));
  }

  // ── presentations ───────────────────────────────────────────────────────────
  async putPresentation(row: PresentationRow) {
    check(
      "putPresentation",
      await this.db.from(T.presentations).upsert({ code_hash: row.codeHash, payload: row.payload, expires_at: row.expiresAt }, { onConflict: "code_hash" }),
    );
  }
  async getPresentation(codeHash: string, nowMs = Date.now()) {
    const r = await this.db.from(T.presentations).select("code_hash, payload, expires_at").eq("code_hash", codeHash).maybeSingle();
    check("getPresentation", r);
    const row = r.data as Row | null;
    if (!row) return null;
    if (Date.parse(row.expires_at) <= nowMs) {
      await this.deletePresentation(codeHash);
      return null;
    }
    return { codeHash: row.code_hash, payload: row.payload ?? {}, expiresAt: row.expires_at };
  }
  async takePresentation(codeHash: string, nowMs = Date.now()) {
    // DELETE … RETURNING: two concurrent resolves cannot both get the row.
    const r = await this.db.from(T.presentations).delete().eq("code_hash", codeHash).select("code_hash, payload, expires_at");
    check("takePresentation", r);
    const row = ((r.data ?? []) as Row[])[0];
    if (!row || Date.parse(row.expires_at) <= nowMs) return null;
    return { codeHash: row.code_hash, payload: row.payload ?? {}, expiresAt: row.expires_at };
  }
  async deletePresentation(codeHash: string) {
    check("deletePresentation", await this.db.from(T.presentations).delete().eq("code_hash", codeHash));
  }
  async purgeExpiredPresentations(nowMs = Date.now()) {
    const r = await this.db.from(T.presentations).delete().lt("expires_at", new Date(nowMs).toISOString()).select("code_hash");
    check("purgeExpiredPresentations", r);
    return (r.data ?? []).length;
  }

  // ── sync state ──────────────────────────────────────────────────────────────
  async syncCursor(): Promise<SyncState | null> {
    const r = await this.db.from(T.sync).select("registry, last_block").eq("id", true).maybeSingle();
    check("syncCursor", r);
    const row = r.data as Row | null;
    return row ? { registry: row.registry, lastBlock: BigInt(row.last_block) } : null;
  }
  // ── events ──────────────────────────────────────────────────────────────────
  async getEvent(eventId: string): Promise<EventRow | null> {
    const r = await this.db.from("events").select(EVENT_COLS).eq("id", eventId).maybeSingle();
    check("getEvent", r);
    return r.data ? toEvent(r.data as Row) : null;
  }
  async listEventsForAccount(accountId: string): Promise<EventRow[]> {
    const r = await this.db.from("events").select(EVENT_COLS).eq("account_id", accountId).order("date", { ascending: false }).limit(200);
    check("listEventsForAccount", r);
    return ((r.data ?? []) as Row[]).map(toEvent);
  }
  async ticketsForEvent(eventId: string): Promise<AttendanceRow[]> {
    const out: AttendanceRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const r = await this.db.from("tickets").select("holder_wallet, status").eq("event_id", eventId).order("id").range(from, from + PAGE - 1);
      check("ticketsForEvent", r);
      const rows = (r.data ?? []) as Row[];
      out.push(...rows.map((x) => ({ wallet: String(x.holder_wallet ?? ""), status: String(x.status ?? "") })));
      if (rows.length < PAGE) return out;
    }
  }
  async attendClaimsForEvent(eventId: string): Promise<AttendanceRow[]> {
    const re = await this.db.from("reward_events").select("id").eq("event_id", eventId);
    check("attendClaimsForEvent", re);
    const refs = ((re.data ?? []) as Row[]).map((x) => String(x.id));
    if (refs.length === 0) return [];
    const out: AttendanceRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const r = await this.db
        .from("reward_claims")
        .select("wallet, status")
        .eq("action", "event_attend")
        .in("reference_id", refs)
        .order("id")
        .range(from, from + PAGE - 1);
      check("attendClaimsForEvent", r);
      const rows = (r.data ?? []) as Row[];
      out.push(...rows.map((x) => ({ wallet: String(x.wallet ?? ""), status: String(x.status ?? "") })));
      if (rows.length < PAGE) return out;
    }
  }

  async rewardEventIdFor(eventId: string): Promise<string | null> {
    const r = await this.db.from("reward_events").select("id").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    check("rewardEventIdFor", r);
    return r.data ? String((r.data as Row).id) : null;
  }
  async createRewardEvent(x: { eventId: string; label: string; startsAt: string | null; createdBy: string; maxRewards: number | null }): Promise<string> {
    // Same row the org dashboard's QR panel inserts (apps/web/src/app/actions/org-events.ts createEventQr).
    const r = await this.db
      .from("reward_events")
      .insert({ label: x.label, event_id: x.eventId, starts_at: x.startsAt, active: true, created_by: x.createdBy, max_rewards: x.maxRewards })
      .select("id")
      .single();
    check("createRewardEvent", r);
    return String((r.data as Row).id);
  }

  async setSyncCursor(state: SyncState) {
    check(
      "setSyncCursor",
      await this.db
        .from(T.sync)
        .upsert({ id: true, registry: state.registry.toLowerCase(), last_block: state.lastBlock.toString() }, { onConflict: "id" }),
    );
  }
}

export function supabaseCredentialStore(admin: SupabaseClient): CredentialStore {
  return new SupabaseCredentialStore(admin);
}
