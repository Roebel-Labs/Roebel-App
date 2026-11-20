/**
 * Supabase (service role) implementation of DesignStore. Server-only.
 *
 * Tables (supabase/migrations/20261120cda_card_designs.sql, NOT applied by agents):
 *   credential_design_drafts, credential_design_versions, credential_design_assets
 * all RLS-on with no policies and no anon/authenticated grants.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DesignStoreError,
  type AssetRow,
  type DesignStore,
  type DraftPatch,
  type DraftRow,
  type VersionRow,
  type VersionStatus,
} from "./store";

export const DESIGN_TABLES = {
  drafts: "credential_design_drafts",
  versions: "credential_design_versions",
  assets: "credential_design_assets",
} as const;
const T = DESIGN_TABLES;

type Res = { data?: unknown; error: { code?: string; message?: string } | null };
type Row = Record<string, any>;

function check(op: string, r: Res): void {
  if (r.error) throw new DesignStoreError(op, r.error.code);
}

const toDraft = (r: Row): DraftRow => ({
  id: r.id,
  accountId: r.account_id,
  typeId: r.type_id ?? null,
  name: r.name,
  kind: r.kind,
  template: r.template ?? null,
  design: r.design,
  revision: Number(r.revision),
  testSentAt: r.test_sent_at ?? null,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
  createdAt: r.created_at,
});

const draftPatchCols = (p: DraftPatch): Row => {
  const out: Row = {};
  if (p.typeId !== undefined) out.type_id = p.typeId;
  if (p.name !== undefined) out.name = p.name;
  if (p.kind !== undefined) out.kind = p.kind;
  if (p.template !== undefined) out.template = p.template;
  if (p.design !== undefined) out.design = p.design;
  if (p.testSentAt !== undefined) out.test_sent_at = p.testSentAt;
  if (p.updatedBy !== undefined) out.updated_by = p.updatedBy;
  return out;
};

const toVersion = (r: Row): VersionRow => ({
  sha: r.sha,
  draftId: r.draft_id,
  typeId: r.type_id ?? null,
  version: Number(r.version),
  design: r.design,
  meta: r.meta,
  previewPath: r.preview_path,
  actionId: r.action_id ?? null,
  status: r.status,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const toAsset = (r: Row): AssetRow => ({
  sha: r.sha,
  accountId: r.account_id,
  kind: r.kind,
  storagePath: r.storage_path,
  mime: r.mime,
  width: r.width ?? null,
  height: r.height ?? null,
  ai: Boolean(r.ai),
  prompt: r.prompt ?? null,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export function supabaseDesignStore(db: SupabaseClient): DesignStore {
  return {
    async getDraft(id) {
      const r = await db.from(T.drafts).select("*").eq("id", id).maybeSingle();
      check("getDraft", r);
      return r.data ? toDraft(r.data) : null;
    },
    async listDrafts(accountId) {
      const r = await db.from(T.drafts).select("*").eq("account_id", accountId).order("updated_at", { ascending: false });
      check("listDrafts", r);
      return ((r.data ?? []) as Row[]).map(toDraft);
    },
    async insertDraft(row) {
      const r = await db.from(T.drafts).insert({
        id: row.id,
        account_id: row.accountId,
        type_id: row.typeId,
        name: row.name,
        kind: row.kind,
        template: row.template,
        design: row.design,
        revision: row.revision,
        test_sent_at: row.testSentAt,
        updated_by: row.updatedBy,
        updated_at: row.updatedAt,
        created_at: row.createdAt,
      });
      check("insertDraft", r);
    },
    async updateDraft(id, patch, expectRevision) {
      const cols: Row = { ...draftPatchCols(patch), updated_at: new Date().toISOString() };
      let q = db.from(T.drafts).update(expectRevision !== null ? { ...cols, revision: expectRevision + 1 } : cols).eq("id", id);
      if (expectRevision !== null) q = q.eq("revision", expectRevision);
      const r = await q.select("*");
      check("updateDraft", r);
      const rows = (r.data ?? []) as Row[];
      if (rows.length > 0) return toDraft(rows[0]);
      const exists = await db.from(T.drafts).select("id").eq("id", id).maybeSingle();
      check("updateDraft:exists", exists);
      return exists.data ? "conflict" : null;
    },
    async deleteDraft(id) {
      check("deleteDraft", await db.from(T.drafts).delete().eq("id", id));
    },
    async insertVersion(row) {
      const r = await db.from(T.versions).insert({
        sha: row.sha,
        draft_id: row.draftId,
        type_id: row.typeId,
        version: row.version,
        design: row.design,
        meta: row.meta,
        preview_path: row.previewPath,
        action_id: row.actionId,
        status: row.status,
        created_by: row.createdBy,
        created_at: row.createdAt,
      });
      check("insertVersion", r);
    },
    async getVersion(sha) {
      const r = await db.from(T.versions).select("*").eq("sha", sha).maybeSingle();
      check("getVersion", r);
      return r.data ? toVersion(r.data) : null;
    },
    async versionsOf(draftId) {
      const r = await db.from(T.versions).select("*").eq("draft_id", draftId).order("version", { ascending: false });
      check("versionsOf", r);
      return ((r.data ?? []) as Row[]).map(toVersion);
    },
    async setVersionStatus(sha, status: VersionStatus, actionId, ifStatus) {
      const cols: Row = { status };
      if (actionId !== undefined) cols.action_id = actionId;
      let q = db.from(T.versions).update(cols).eq("sha", sha);
      if (ifStatus) q = q.in("status", [...ifStatus]);
      const r = await q.select("sha");
      check("setVersionStatus", r);
      return ((r.data ?? []) as Row[]).length > 0;
    },
    async setVersionType(sha, typeId) {
      check("setVersionType", await db.from(T.versions).update({ type_id: typeId }).eq("sha", sha));
    },
    async liveVersionOfType(typeId) {
      const r = await db.from(T.versions).select("*").eq("type_id", typeId).eq("status", "live").order("version", { ascending: false }).limit(1);
      check("liveVersionOfType", r);
      const rows = (r.data ?? []) as Row[];
      return rows[0] ? toVersion(rows[0]) : null;
    },
    async versionByAction(actionId) {
      const r = await db.from(T.versions).select("*").eq("action_id", actionId).limit(1);
      check("versionByAction", r);
      const rows = (r.data ?? []) as Row[];
      return rows[0] ? toVersion(rows[0]) : null;
    },
    async getAsset(sha, accountId) {
      let q = db.from(T.assets).select("*").eq("sha", sha);
      if (accountId !== undefined) q = q.eq("account_id", accountId);
      const r = await q.limit(1);
      check("getAsset", r);
      const rows = (r.data ?? []) as Row[];
      return rows[0] ? toAsset(rows[0]) : null;
    },
    async insertAsset(row) {
      const r = await db.from(T.assets).upsert(
        {
          sha: row.sha,
          account_id: row.accountId,
          kind: row.kind,
          storage_path: row.storagePath,
          mime: row.mime,
          width: row.width,
          height: row.height,
          ai: row.ai,
          prompt: row.prompt,
          created_by: row.createdBy,
          created_at: row.createdAt,
        },
        { onConflict: "account_id,sha", ignoreDuplicates: true },
      );
      check("insertAsset", r);
    },
    async assetsOf(accountId) {
      const r = await db.from(T.assets).select("*").eq("account_id", accountId).order("created_at", { ascending: false });
      check("assetsOf", r);
      return ((r.data ?? []) as Row[]).map(toAsset);
    },
  };
}
