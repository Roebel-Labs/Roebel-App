// Card design drafts (Ausweis-Designer): per-org working drafts that owners and admins edit from
// Studio and the app. Drafts need neither the register nor `credentials_enabled`: they sit behind
// their own switch (app_settings.credential_designer_enabled). Publishing lives in publish.ts.
// Relative imports only: loaded by `npx tsx --test`.
import { randomUUID } from "node:crypto";
import { TEMPLATES, designHash, isBuiltinAsset, validateDesign, type CardDesign } from "@roebel/card-design";
import type { Caller } from "../caller";
import { orgContextFor, type OrgContext } from "../rights";
import type { CredentialStore } from "../store";
import { designerEnabled, type DesignKind, type DesignStore, type DraftRow, type VersionRow } from "./store";

export type DesignFail = { ok: false; status: number; code: string; message: string; data?: unknown };
export type DesignResult<T> = { ok: true; data: T } | DesignFail;

export type DesignDeps = {
  store: DesignStore;
  credStore: CredentialStore;
  /** Reads app_settings.credential_designer_enabled. */
  settings: () => Promise<string | null>;
  now: () => number;
};

export type DesignOrg = { accountId: string; name: string; avatarUrl: string | null; role: "owner" | "admin" };

export type DraftView = {
  id: string;
  name: string;
  kind: DesignKind;
  template: string | null;
  typeId: string | null;
  revision: number;
  updatedAt: string;
  liveVersion: number | null;
  pendingVersion: number | null;
  hasUnpublishedChanges: boolean;
  testSentAt: string | null;
};

export type DraftWithDesign = DraftView & { design: CardDesign };

export const ok = <T>(data: T): DesignResult<T> => ({ ok: true, data });
export const fail = (status: number, code: string, message: string, data?: unknown): DesignFail =>
  data === undefined ? { ok: false, status, code, message } : { ok: false, status, code, message, data };
const bad = (message: string) => fail(400, "BAD_REQUEST", message);
export const isFail = (v: unknown): v is DesignFail => typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;

export const DESIGNER_OFF = fail(403, "DESIGNER_OFF", "Der Ausweis-Designer ist noch nicht freigeschaltet.");
export const FORBIDDEN = fail(403, "FORBIDDEN", "Dafür brauchst du die Rolle Inhaber:in oder Admin dieser Organisation.");
const NOT_FOUND_ORG = fail(404, "NOT_FOUND", "Organisation nicht gefunden.");
export const DRAFT_NOT_FOUND = fail(404, "NOT_FOUND", "Diesen Entwurf gibt es nicht.");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: readonly DesignKind[] = ["role", "membership", "badge"];

// ── access ────────────────────────────────────────────────────────────────────

/** The switch, then owner/admin of the org. */
export async function designOrgFor(d: DesignDeps, c: Caller, accountId: unknown): Promise<OrgContext | DesignFail> {
  if (!(await designerEnabled(d.settings))) return DESIGNER_OFF;
  if (typeof accountId !== "string") return NOT_FOUND_ORG;
  const o = await orgContextFor(d.credStore, accountId, c.wallet);
  if ("error" in o) return o.error === "FORBIDDEN" ? FORBIDDEN : NOT_FOUND_ORG;
  return o;
}

/** The draft when the caller is owner/admin of its org (404 for an unknown id, 403 for a foreign org). */
export async function draftFor(d: DesignDeps, c: Caller, draftId: unknown): Promise<{ draft: DraftRow; org: OrgContext } | DesignFail> {
  if (!(await designerEnabled(d.settings))) return DESIGNER_OFF;
  if (typeof draftId !== "string" || !UUID.test(draftId)) return DRAFT_NOT_FOUND;
  const draft = await d.store.getDraft(draftId);
  if (!draft) return DRAFT_NOT_FOUND;
  const o = await orgContextFor(d.credStore, draft.accountId, c.wallet);
  if ("error" in o) return o.error === "FORBIDDEN" ? FORBIDDEN : DRAFT_NOT_FOUND;
  return { draft, org: o };
}

// ── views ─────────────────────────────────────────────────────────────────────

/** Same design and same name as the live version = nothing to publish. */
export function sameAsVersion(draft: Pick<DraftRow, "design" | "name">, v: VersionRow): boolean {
  return designHash(draft.design) === designHash(v.design) && draft.name === v.meta.name;
}

export async function draftView(d: DesignDeps, draft: DraftRow): Promise<DraftView> {
  const versions = await d.store.versionsOf(draft.id);
  const live = versions.find((v) => v.status === "live") ?? null;
  const pending = versions.find((v) => v.status === "pending") ?? null;
  return {
    id: draft.id,
    name: draft.name,
    kind: draft.kind,
    template: draft.template,
    typeId: draft.typeId,
    revision: draft.revision,
    updatedAt: draft.updatedAt,
    liveVersion: live?.version ?? null,
    pendingVersion: pending?.version ?? null,
    hasUnpublishedChanges: live ? !sameAsVersion(draft, live) : true,
    testSentAt: draft.testSentAt,
  };
}

async function withDesign(d: DesignDeps, draft: DraftRow): Promise<DraftWithDesign> {
  return { ...(await draftView(d, draft)), design: draft.design };
}

// ── actions ───────────────────────────────────────────────────────────────────

/** design_orgs: the caller's owner/admin orgs, from the database only (works without the register). */
export async function listDesignOrgs(d: DesignDeps, c: Caller): Promise<DesignResult<DesignOrg[]>> {
  if (!(await designerEnabled(d.settings))) return DESIGNER_OFF;
  const roles = (await d.credStore.rolesForWallet(c.wallet)).filter((r) => r.role === "owner" || r.role === "admin");
  const roleOf = new Map(roles.map((r) => [r.accountId, r.role as "owner" | "admin"]));
  const accounts = await d.credStore.getAccounts([...roleOf.keys()]);
  return ok(
    accounts
      .filter((a) => a.accountType === "organisation")
      .map((a) => ({ accountId: a.id, name: a.name, avatarUrl: a.avatarUrl, role: roleOf.get(a.id)! }))
      .sort((x, y) => x.name.localeCompare(y.name, "de")),
  );
}

export async function listDrafts(d: DesignDeps, c: Caller, p: { accountId: string }): Promise<DesignResult<DraftView[]>> {
  const org = await designOrgFor(d, c, p?.accountId);
  if (isFail(org)) return org;
  const out: DraftView[] = [];
  for (const draft of await d.store.listDrafts(org.accountId)) out.push(await draftView(d, draft));
  return ok(out);
}

export async function getDraft(d: DesignDeps, c: Caller, p: { draftId: string }): Promise<DesignResult<DraftWithDesign>> {
  const found = await draftFor(d, c, p?.draftId);
  if (isFail(found)) return found;
  return ok(await withDesign(d, found.draft));
}

/** Asset ids a design references (background and image layers). */
export function assetIdsOf(design: CardDesign): string[] {
  const ids = new Set<string>();
  if (design.background.kind === "image") ids.add(design.background.assetId);
  for (const l of design.layers) if (l.type === "image") ids.add(l.assetId);
  return [...ids];
}

export type SaveDraftInput = {
  accountId: string;
  draftId?: string;
  baseRevision?: number;
  name: string;
  kind: DesignKind;
  template?: string | null;
  design: unknown;
};

export async function saveDraft(d: DesignDeps, c: Caller, p: SaveDraftInput): Promise<DesignResult<DraftWithDesign>> {
  const org = await designOrgFor(d, c, p?.accountId);
  if (isFail(org)) return org;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (name.length < 2 || name.length > 60) return bad("Der Name muss 2 bis 60 Zeichen lang sein.");
  if (!KINDS.includes(p.kind)) return bad("Unbekannte Ausweisart.");
  const template = p.template === undefined || p.template === null || p.template === "" ? null : p.template;
  if (template !== null && !TEMPLATES.some((t) => t.id === template)) return bad("Unbekannte Vorlage.");
  const v = validateDesign(p.design);
  if (!v.ok) return fail(400, "INVALID_DESIGN", "Die Gestaltung ist ungültig.", { errors: v.errors });
  const design = v.design;
  for (const id of assetIdsOf(design)) {
    if (isBuiltinAsset(id)) continue;
    if (!(await d.store.getAsset(id, org.accountId))) return bad("Ein Bild gehört nicht zu dieser Organisation.");
  }
  const wallet = c.wallet.toLowerCase();

  if (p.draftId === undefined || p.draftId === null) {
    const nowIso = new Date(d.now()).toISOString();
    const row: DraftRow = {
      id: randomUUID(),
      accountId: org.accountId,
      typeId: null,
      name,
      kind: p.kind,
      template,
      design,
      revision: 1,
      testSentAt: null,
      updatedBy: wallet,
      updatedAt: nowIso,
      createdAt: nowIso,
    };
    await d.store.insertDraft(row);
    return ok(await withDesign(d, row));
  }

  const found = await draftFor(d, c, p.draftId);
  if (isFail(found)) return found;
  if (found.draft.accountId !== org.accountId) return DRAFT_NOT_FOUND;
  if (typeof p.baseRevision !== "number" || !Number.isSafeInteger(p.baseRevision)) return bad("baseRevision fehlt.");
  if (found.draft.typeId !== null && p.kind !== found.draft.kind) return bad("Die Art eines Ausweises lässt sich nicht ändern.");
  const r = await d.store.updateDraft(found.draft.id, { name, kind: p.kind, template, design, updatedBy: wallet }, p.baseRevision);
  if (r === null) return DRAFT_NOT_FOUND;
  if (r === "conflict") {
    const current = await d.store.getDraft(found.draft.id);
    return fail(409, "DRAFT_CONFLICT", "Der Entwurf wurde inzwischen geändert.", current ? await withDesign(d, current) : undefined);
  }
  return ok(await withDesign(d, r));
}

export async function deleteDraft(d: DesignDeps, c: Caller, p: { draftId: string }): Promise<DesignResult<null>> {
  const found = await draftFor(d, c, p?.draftId);
  if (isFail(found)) return found;
  if (found.draft.typeId !== null) return fail(409, "DRAFT_PUBLISHED", "Veröffentlichte Ausweise lassen sich nicht löschen, nur stilllegen.");
  await d.store.deleteDraft(found.draft.id);
  return ok(null);
}
