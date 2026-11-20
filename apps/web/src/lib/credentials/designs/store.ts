/**
 * Storage for card designs (Ausweis-Designer): one working draft per type, immutable published
 * versions, and the org's image assets. Server-only.
 *
 * Tables: supabase/migrations/20261120cda_card_designs.sql (service role only). The production
 * implementation is store-supabase.ts; `InMemoryDesignStore` is for tests.
 *
 * Relative imports only: loaded by `npx tsx --test`.
 */
import type { CardDesign } from "@roebel/card-design";

export type DesignKind = "role" | "membership" | "badge";
export type VersionStatus = "pending" | "live" | "superseded" | "abandoned";
export type AssetKind = "logo" | "sticker" | "background" | "image";

export type DraftRow = {
  id: string;
  accountId: string;
  /** Set once the first publication prepared its createType; null = never in the register. */
  typeId: string | null;
  name: string;
  kind: DesignKind;
  template: string | null;
  design: CardDesign;
  revision: number;
  testSentAt: string | null;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
};

/** What the public design JSON says besides the design, frozen at publication. */
export type VersionMeta = {
  name: string;
  description: string;
  kind: DesignKind;
  organisation: string | null;
  aiGenerated: boolean;
};

export type VersionRow = {
  sha: string;
  draftId: string;
  typeId: string | null;
  version: number;
  design: CardDesign;
  meta: VersionMeta;
  previewPath: string;
  actionId: string | null;
  status: VersionStatus;
  createdBy: string;
  createdAt: string;
};

export type AssetRow = {
  sha: string;
  accountId: string;
  kind: AssetKind;
  storagePath: string;
  mime: string;
  width: number | null;
  height: number | null;
  ai: boolean;
  prompt: string | null;
  createdBy: string;
  createdAt: string;
};

export type DraftPatch = Partial<Pick<DraftRow, "typeId" | "name" | "kind" | "template" | "design" | "testSentAt" | "updatedBy">>;

export class DesignStoreError extends Error {
  constructor(readonly op: string, readonly code?: string) {
    super(`design store: ${op} failed${code ? ` (${code})` : ""}`);
  }
}

export interface DesignStore {
  getDraft(id: string): Promise<DraftRow | null>;
  listDrafts(accountId: string): Promise<DraftRow[]>;
  insertDraft(row: DraftRow): Promise<void>;
  /**
   * Compare-and-set on `revision` (bumped by one) when `expectRevision` is a number; `null` patches
   * without a check and without a bump (internal fields). null when the draft does not exist.
   */
  updateDraft(id: string, patch: DraftPatch, expectRevision: number | null): Promise<DraftRow | "conflict" | null>;
  deleteDraft(id: string): Promise<void>;
  insertVersion(row: VersionRow): Promise<void>;
  getVersion(sha: string): Promise<VersionRow | null>;
  /** Newest first. */
  versionsOf(draftId: string): Promise<VersionRow[]>;
  /** Compare-and-set when `ifStatus` is given; true when the row changed. */
  setVersionStatus(sha: string, status: VersionStatus, actionId?: string | null, ifStatus?: readonly VersionStatus[]): Promise<boolean>;
  /** Records the type a first publication created (known only after its createType was prepared). */
  setVersionType(sha: string, typeId: string): Promise<void>;
  /** The newest live version of a type. */
  liveVersionOfType(typeId: string): Promise<VersionRow | null>;
  versionByAction(actionId: string): Promise<VersionRow | null>;
  /** With `accountId` the asset of that org; without, any row with these bytes. */
  getAsset(sha: string, accountId?: string): Promise<AssetRow | null>;
  /** Idempotent per (account, sha). */
  insertAsset(row: AssetRow): Promise<void>;
  assetsOf(accountId: string): Promise<AssetRow[]>;
}

/** The designer switch (app_settings.credential_designer_enabled): only 'true' opens; errors keep it closed. */
export async function designerEnabled(read: () => Promise<string | null>): Promise<boolean> {
  try {
    const v = await read();
    return typeof v === "string" && v.trim() === "true";
  } catch {
    return false;
  }
}

const clone = <T>(v: T): T => (v === null || v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export class InMemoryDesignStore implements DesignStore {
  readonly drafts = new Map<string, DraftRow>();
  readonly versions = new Map<string, VersionRow>();
  readonly assets = new Map<string, AssetRow>();
  private clock = 0;

  private stamp(): string {
    // Strictly increasing so ordering by updatedAt is deterministic in tests.
    this.clock += 1;
    return new Date(Date.UTC(2026, 10, 20) + this.clock).toISOString();
  }

  async getDraft(id: string) {
    return clone(this.drafts.get(id) ?? null);
  }
  async listDrafts(accountId: string) {
    return [...this.drafts.values()].filter((d) => d.accountId === accountId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone);
  }
  async insertDraft(row: DraftRow) {
    if (this.drafts.has(row.id)) throw new DesignStoreError("insertDraft", "23505");
    if (row.typeId && [...this.drafts.values()].some((d) => d.typeId === row.typeId)) throw new DesignStoreError("insertDraft", "23505");
    this.drafts.set(row.id, clone(row));
  }
  async updateDraft(id: string, patch: DraftPatch, expectRevision: number | null) {
    const cur = this.drafts.get(id);
    if (!cur) return null;
    if (expectRevision !== null && cur.revision !== expectRevision) return "conflict" as const;
    const next: DraftRow = { ...cur, ...clone(patch), updatedAt: this.stamp() };
    if (expectRevision !== null) next.revision = cur.revision + 1;
    this.drafts.set(id, next);
    return clone(next);
  }
  async deleteDraft(id: string) {
    this.drafts.delete(id);
    for (const [sha, v] of this.versions) if (v.draftId === id) this.versions.delete(sha);
  }
  async insertVersion(row: VersionRow) {
    if (this.versions.has(row.sha)) throw new DesignStoreError("insertVersion", "23505");
    if ([...this.versions.values()].some((v) => v.draftId === row.draftId && v.version === row.version)) {
      throw new DesignStoreError("insertVersion: duplicate version", "23505");
    }
    this.versions.set(row.sha, clone(row));
  }
  async getVersion(sha: string) {
    return clone(this.versions.get(sha) ?? null);
  }
  async versionsOf(draftId: string) {
    return [...this.versions.values()].filter((v) => v.draftId === draftId).sort((a, b) => b.version - a.version).map(clone);
  }
  async setVersionStatus(sha: string, status: VersionStatus, actionId?: string | null, ifStatus?: readonly VersionStatus[]) {
    const v = this.versions.get(sha);
    if (!v) return false;
    if (ifStatus && !ifStatus.includes(v.status)) return false;
    v.status = status;
    if (actionId !== undefined) v.actionId = actionId;
    return true;
  }
  async setVersionType(sha: string, typeId: string) {
    const v = this.versions.get(sha);
    if (v) v.typeId = typeId;
  }
  async liveVersionOfType(typeId: string) {
    const live = [...this.versions.values()].filter((v) => v.typeId === typeId && v.status === "live").sort((a, b) => b.version - a.version);
    return clone(live[0] ?? null);
  }
  async versionByAction(actionId: string) {
    return clone([...this.versions.values()].find((v) => v.actionId === actionId) ?? null);
  }
  async getAsset(sha: string, accountId?: string) {
    const hit = [...this.assets.values()].find((a) => a.sha === sha && (accountId === undefined || a.accountId === accountId));
    return clone(hit ?? null);
  }
  async insertAsset(row: AssetRow) {
    const key = `${row.accountId}:${row.sha}`;
    if (!this.assets.has(key)) this.assets.set(key, clone(row));
  }
  async assetsOf(accountId: string) {
    return [...this.assets.values()].filter((a) => a.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }
}
