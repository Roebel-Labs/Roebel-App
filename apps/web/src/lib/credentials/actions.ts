// Credential register actions: a desktop (dashboard, Studio, node) prepares an ordered list of
// register steps, an owner or admin of the org confirms on the phone (the phone encodes and sends
// the transaction itself), and the server learns the outcome from the receipt or, failing that,
// from the chain sync. The server never sends a register transaction on anyone's behalf.
//
// Summaries name the org and the type, never a person, email or address.
// Relative imports only: loaded by `npx tsx --test`.
import { randomUUID } from "node:crypto";
import {
  CREDENTIAL_REGISTRY_ABI,
  REGISTER_EVENTS,
  credentialTypeId,
  localIdFromUuid,
  parseSteps,
  stepsConfirmedBy,
  type ChainLog,
  type RegisterLog,
  type RegisterStep,
  type TypeConfigInput,
} from "@netizen-labs/credential-registry";
import { decodeEventLog, isAddress, type Address, type Hex } from "viem";
import type { Caller } from "./caller";
import { ACTION_TTL_MS } from "./config";
import { metadataUrl } from "./metadata";
import type { Notifier } from "./notify";
import { chainReadiness, membersMayBePublic, needsPrivateOnlyStep, orgContextFor, type NodeRegistryReader, type OrgContext } from "./rights";
import type { ActionRow, ActionStatus, ActionVia, CredentialStore, Kind, TypeRow } from "./store";
import { TYPE_TEMPLATES, isTemplateKey } from "./templates";

export type Fail = { ok: false; status: number; code: string; message: string };
export type Result<T> = { ok: true; data: T } | Fail;

export type ActionSummary = { title: string; lines: string[]; orgName: string | null; counts?: { app: number; link: number } };

export type ReceiptLog = ChainLog & { blockNumber?: bigint | null; logIndex?: number | null };

export type Deps = {
  store: CredentialStore;
  reader: NodeRegistryReader;
  /** null while the transaction is not mined (or unknown to the RPC). */
  receipt: (tx: Hex) => Promise<{ status: "success" | "reverted"; logs: ReceiptLog[] } | null>;
  notify: Notifier;
  now: () => number;
  registry: Address;
  /** Task 6 `applyConfirmedAction` bound to its SyncDeps: applies the receipt's register logs to the mirror. */
  applyConfirmed: (actionId: string, logs: readonly RegisterLog[]) => Promise<void>;
};

export type ActionView = {
  id: string;
  status: ActionStatus;
  summary: ActionSummary;
  via: ActionVia;
  preparedByMe: boolean;
  confirmedByMe: boolean;
  txHash: string | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
};

export type OrgListEntry = {
  accountId: string;
  name: string;
  avatarUrl: string | null;
  subType: string | null;
  role: "owner" | "admin";
  membersMayBePublic: boolean;
  onChain: "ready" | "org_not_registered" | "no_chain_authority";
};

export type TypeView = {
  typeId: Hex;
  name: string;
  kind: Kind | null;
  description: string | null;
  imageUrl: string | null;
  benefits: string[];
  template: string | null;
  publicClaim: boolean;
  supplyCap: number;
  claimStart: string | null;
  claimEnd: string | null;
  recognised: boolean;
  retired: boolean;
  chainStatus: TypeRow["chainStatus"];
};

// ── results ───────────────────────────────────────────────────────────────────

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });
const bad = (message: string) => fail(400, "BAD_REQUEST", message);

const NOT_FOUND_ORG = fail(404, "NOT_FOUND", "Organisation nicht gefunden.");
const FORBIDDEN = fail(403, "FORBIDDEN", "Dafür brauchst du die Rolle Inhaber:in oder Admin dieser Organisation.");
const ACTION_NOT_FOUND = fail(404, "NOT_FOUND", "Diese Aktion gibt es nicht.");
const ORG_NOT_ON_CHAIN = fail(409, "ORG_NOT_ON_CHAIN", "Diese Organisation ist noch nicht im öffentlichen Register eingetragen.");
const NO_CHAIN_AUTHORITY = fail(
  409,
  "NO_CHAIN_AUTHORITY",
  "Dein Konto ist für diese Organisation noch nicht im Register berechtigt. Öffne in der App Organisation → Einstellungen → Onchain-Organisation und gleiche die Rollen ab.",
);
const ACTION_EXPIRED = fail(409, "ACTION_EXPIRED", "Diese Bestätigung ist abgelaufen. Bitte bereite die Aktion neu vor.");
const ACTION_NOT_PENDING = fail(409, "ACTION_NOT_PENDING", "Diese Aktion wartet nicht mehr auf eine Bestätigung.");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ── org access ────────────────────────────────────────────────────────────────

async function orgFor(d: Deps, accountId: unknown, wallet: string): Promise<OrgContext | Fail> {
  if (typeof accountId !== "string") return NOT_FOUND_ORG;
  const o = await orgContextFor(d.store, accountId, wallet);
  if ("error" in o) return o.error === "FORBIDDEN" ? FORBIDDEN : NOT_FOUND_ORG;
  return o;
}

/** Owner/admin in the database AND allowed by the chain. */
async function readyOrgFor(d: Deps, accountId: unknown, wallet: string): Promise<OrgContext | Fail> {
  const o = await orgFor(d, accountId, wallet);
  if ("ok" in o) return o;
  const r = await chainReadiness(d.reader, o, wallet as Address);
  if (r === "org_not_registered") return ORG_NOT_ON_CHAIN;
  if (r === "no_chain_authority") return NO_CHAIN_AUTHORITY;
  return o;
}

const isFail = (v: unknown): v is Fail => typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;

/** The action if the caller may see it: an owner/admin of its org (or, for an org-less action, its preparer). 404 otherwise. */
async function actionFor(d: Deps, c: Caller, actionId: unknown): Promise<{ action: ActionRow; org: OrgContext | null } | Fail> {
  if (typeof actionId !== "string" || !UUID.test(actionId)) return ACTION_NOT_FOUND;
  const action = await d.store.getAction(actionId);
  if (!action) return ACTION_NOT_FOUND;
  if (action.accountId === null) {
    return action.preparedBy === c.wallet.toLowerCase() ? { action, org: null } : ACTION_NOT_FOUND;
  }
  const o = await orgContextFor(d.store, action.accountId, c.wallet);
  if ("error" in o) return ACTION_NOT_FOUND;
  return { action, org: o };
}

/** Marks an awaiting action whose time ran out as expired (compare-and-set) and returns the current row. */
async function expireIfDue(d: Deps, a: ActionRow): Promise<ActionRow> {
  if (a.status !== "awaiting_confirmation" || Date.parse(a.expiresAt) > d.now()) return a;
  await d.store.updateAction(a.id, { status: "expired" }, ["awaiting_confirmation"]);
  return (await d.store.getAction(a.id)) ?? { ...a, status: "expired" };
}

// ── prepare ───────────────────────────────────────────────────────────────────

export async function prepareAction(
  d: Deps,
  p: { org: OrgContext | null; wallet: string; via: ActionVia; steps: RegisterStep[]; summary: ActionSummary; batchIds?: string[] },
): Promise<{ actionId: string; expiresAt: string }> {
  const steps = parseSteps(JSON.parse(JSON.stringify(p.steps)));
  if (steps.length === 0) throw new Error("prepareAction: no steps");
  const id = randomUUID();
  const now = d.now();
  const expiresAt = new Date(now + ACTION_TTL_MS).toISOString();
  const wallet = p.wallet.toLowerCase();
  await d.store.insertAction({
    id,
    accountId: p.org?.accountId ?? null,
    steps,
    summary: { ...p.summary } as Record<string, unknown>,
    status: "awaiting_confirmation",
    preparedBy: wallet,
    preparedVia: p.via,
    confirmedBy: null,
    txHash: null,
    error: null,
    createdAt: new Date(now).toISOString(),
    expiresAt,
  });
  for (const batchId of p.batchIds ?? []) await d.store.updateBatch(batchId, { actionId: id });
  await d.notify.push({
    wallets: [wallet],
    type: "credential_action",
    title: p.summary.title,
    body: "Tippe, um in der App zu bestätigen.",
    data: { type: "credential_action", actionId: id },
  });
  return { actionId: id, expiresAt };
}

/** Where the request came from, for the action row. */
export function viaOf(c: Caller, hint?: unknown): ActionVia {
  if (c.via !== "chat_session") return "app";
  return hint === "studio" ? "studio" : "dashboard";
}

type TypeInput = {
  accountId: string;
  op: "create" | "update" | "retire";
  typeId?: Hex;
  template?: string;
  name?: string;
  description?: string;
  imageUrl?: string;
  benefits?: string[];
  kind?: Kind;
  publicClaim?: boolean;
  supplyCap?: number;
  claimStart?: string;
  claimEnd?: string;
  via?: ActionVia;
};

type Clean = {
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  benefits?: string[];
  kind?: Kind;
  publicClaim?: boolean;
  supplyCap?: number;
  claimStart?: string | null;
  claimEnd?: string | null;
};

function cleanTypeInput(p: TypeInput): Clean | Fail {
  const out: Clean = {};
  if (p.name !== undefined) {
    if (typeof p.name !== "string" || !p.name.trim() || p.name.trim().length > 80) return bad("Der Name muss 1 bis 80 Zeichen lang sein.");
    out.name = p.name.trim();
  }
  if (p.description !== undefined) {
    if (typeof p.description !== "string" || p.description.length > 1000) return bad("Die Beschreibung ist zu lang.");
    out.description = p.description.trim() || null;
  }
  if (p.imageUrl !== undefined) {
    if (typeof p.imageUrl !== "string" || (p.imageUrl !== "" && !/^https:\/\/\S+$/.test(p.imageUrl))) return bad("Das Bild braucht eine https-Adresse.");
    out.imageUrl = p.imageUrl || null;
  }
  if (p.benefits !== undefined) {
    if (!Array.isArray(p.benefits) || p.benefits.length > 10 || p.benefits.some((b) => typeof b !== "string" || b.length > 160)) {
      return bad("Höchstens 10 Vorteile mit je bis zu 160 Zeichen.");
    }
    out.benefits = p.benefits.map((b) => b.trim()).filter(Boolean);
  }
  if (p.kind !== undefined) {
    if (!["role", "membership", "badge"].includes(p.kind)) return bad("Unbekannte Ausweisart.");
    out.kind = p.kind;
  }
  if (p.publicClaim !== undefined) {
    if (typeof p.publicClaim !== "boolean") return bad("publicClaim muss wahr oder falsch sein.");
    out.publicClaim = p.publicClaim;
  }
  if (p.supplyCap !== undefined) {
    if (typeof p.supplyCap !== "number" || !Number.isSafeInteger(p.supplyCap) || p.supplyCap < 0 || p.supplyCap > 0xffffffff) return bad("Ungültige Höchstzahl.");
    out.supplyCap = p.supplyCap;
  }
  for (const key of ["claimStart", "claimEnd"] as const) {
    const v = p[key];
    if (v === undefined) continue;
    if (v === "" || v === null) {
      out[key] = null;
      continue;
    }
    if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return bad("Ungültiges Datum.");
    out[key] = new Date(Date.parse(v)).toISOString();
  }
  if (out.claimStart && out.claimEnd && Date.parse(out.claimEnd) <= Date.parse(out.claimStart)) return bad("Das Ende muss nach dem Beginn liegen.");
  return out;
}

const unixSeconds = (iso: string | null | undefined) => (iso ? Math.floor(Date.parse(iso) / 1000) : 0);

function configOf(t: Pick<TypeRow, "typeId" | "defaultValiditySeconds" | "claimStart" | "claimEnd" | "supplyCap" | "publicClaim">): TypeConfigInput {
  return {
    metadataURI: metadataUrl(t.typeId),
    defaultValidity: t.defaultValiditySeconds,
    claimStart: unixSeconds(t.claimStart),
    claimEnd: unixSeconds(t.claimEnd),
    supplyCap: t.supplyCap,
    publicClaim: t.publicClaim,
  };
}

export async function prepareTypeAction(d: Deps, c: Caller, p: TypeInput): Promise<Result<{ actionId: string; typeId: Hex }>> {
  if (!p || !["create", "update", "retire"].includes(p.op)) return bad("Unbekannte Aktion.");
  const clean = cleanTypeInput(p);
  if (isFail(clean)) return clean;
  const org = await readyOrgFor(d, p.accountId, c.wallet);
  if (isFail(org)) return org;
  const via = p.via ?? viaOf(c);

  if (p.op === "create") {
    if (p.template !== undefined && !isTemplateKey(p.template)) return bad("Unbekannte Vorlage.");
    const tpl = p.template !== undefined && isTemplateKey(p.template) ? TYPE_TEMPLATES[p.template] : null;
    const name = clean.name ?? tpl?.name;
    const kind = clean.kind ?? tpl?.kind;
    if (!name || !kind) return bad("Name und Art des Ausweises fehlen.");

    const localUuid = randomUUID();
    const localId = localIdFromUuid(localUuid);
    const typeId = credentialTypeId(org.orgId, localId).toLowerCase() as Hex;
    const row: TypeRow = {
      typeId,
      registry: d.registry.toLowerCase(),
      accountId: org.accountId,
      orgId: org.orgId.toLowerCase() as Hex,
      localUuid,
      localId,
      kind,
      policy: "issuer_batch",
      name,
      description: clean.description !== undefined ? clean.description : tpl?.description ?? null,
      imageUrl: clean.imageUrl ?? null,
      benefits: clean.benefits ?? [...(tpl?.benefits ?? [])],
      template: p.template ?? null,
      defaultValiditySeconds: tpl?.defaultValiditySeconds ?? 0,
      claimStart: clean.claimStart ?? null,
      claimEnd: clean.claimEnd ?? null,
      supplyCap: clean.supplyCap ?? 0,
      // The org-wide "members may be public" switch is enforced on chain (orgPrivateOnly), so the
      // type keeps what was asked and opening the org later needs no type edit.
      publicClaim: clean.publicClaim ?? true,
      recognised: false,
      retired: false,
      chainStatus: "draft",
      eventId: null,
      createdBy: c.wallet.toLowerCase(),
      createdAt: new Date(d.now()).toISOString(),
    };

    const steps: RegisterStep[] = [];
    if (kind === "membership" && needsPrivateOnlyStep(org, await d.reader.orgPrivateOnly(org.orgId))) {
      steps.push({ fn: "setOrgPrivateOnly", orgId: org.orgId, privateOnly: true });
    }
    steps.push({ fn: "createType", orgId: org.orgId, localId, kind, policy: "issuerBatch", config: configOf(row) });

    await d.store.upsertType(row);
    const lines = [`Art: ${KIND_LABEL[kind]}`];
    if (steps.length > 1) lines.push("Mitglieder dieser Organisation sind nur privat sichtbar.");
    const { actionId } = await prepareAction(d, { org, wallet: c.wallet, via, steps, summary: { title: `Ausweis „${name}“ anlegen`, lines, orgName: org.name } });
    return ok({ actionId, typeId });
  }

  if (typeof p.typeId !== "string" || !BYTES32.test(p.typeId)) return bad("typeId fehlt.");
  const t = await d.store.getType(p.typeId);
  if (!t || t.accountId !== org.accountId) return fail(404, "NOT_FOUND", "Diesen Ausweis gibt es nicht.");
  if (t.chainStatus !== "onchain") return fail(409, "TYPE_NOT_ON_CHAIN", "Dieser Ausweis ist noch nicht im Register.");
  if (t.retired) return fail(409, "TYPE_RETIRED", "Dieser Ausweis wird nicht mehr ausgegeben.");

  if (p.op === "retire") {
    const { actionId } = await prepareAction(d, {
      org,
      wallet: c.wallet,
      via,
      steps: [{ fn: "retireType", typeId: t.typeId }],
      summary: { title: `Ausweis „${t.name}“ nicht mehr ausgeben`, lines: ["Bestehende Ausweise bleiben gültig."], orgName: org.name },
    });
    return ok({ actionId, typeId: t.typeId });
  }

  if (clean.kind !== undefined && clean.kind !== t.kind) return bad("Die Art eines Ausweises lässt sich nicht ändern.");
  // Card text and art are served by the node: they change now, without a transaction.
  const display: Partial<TypeRow> = {};
  if (clean.name !== undefined) display.name = clean.name;
  if (clean.description !== undefined) display.description = clean.description;
  if (clean.imageUrl !== undefined) display.imageUrl = clean.imageUrl;
  if (clean.benefits !== undefined) display.benefits = clean.benefits;
  if (Object.keys(display).length > 0) await d.store.updateType(t.typeId, display);
  // The on-chain config lands in the row through the sync (TypeConfigured).
  const config = configOf({
    typeId: t.typeId,
    defaultValiditySeconds: t.defaultValiditySeconds,
    claimStart: clean.claimStart !== undefined ? clean.claimStart : t.claimStart,
    claimEnd: clean.claimEnd !== undefined ? clean.claimEnd : t.claimEnd,
    supplyCap: clean.supplyCap ?? t.supplyCap,
    publicClaim: clean.publicClaim ?? t.publicClaim,
  });
  const { actionId } = await prepareAction(d, {
    org,
    wallet: c.wallet,
    via,
    steps: [{ fn: "updateType", typeId: t.typeId, config }],
    summary: { title: `Ausweis „${display.name ?? t.name}“ ändern`, lines: [], orgName: org.name },
  });
  return ok({ actionId, typeId: t.typeId });
}

const KIND_LABEL: Record<Kind, string> = { role: "Amt", membership: "Mitgliedschaft", badge: "Abzeichen" };

export async function prepareDelegateAction(
  d: Deps,
  c: Caller,
  p: { accountId: string; typeId: Hex; delegate: Address; allowed: boolean; label?: string; via?: ActionVia },
): Promise<Result<{ actionId: string }>> {
  if (typeof p.typeId !== "string" || !BYTES32.test(p.typeId)) return bad("typeId fehlt.");
  if (typeof p.delegate !== "string" || !isAddress(p.delegate, { strict: false }) || p.delegate.toLowerCase() === ZERO_ADDRESS) return bad("Ungültige ausstellende Stelle.");
  if (typeof p.allowed !== "boolean") return bad("allowed muss wahr oder falsch sein.");
  if (p.label !== undefined && (typeof p.label !== "string" || p.label.length > 80)) return bad("Die Bezeichnung ist zu lang.");
  const org = await readyOrgFor(d, p.accountId, c.wallet);
  if (isFail(org)) return org;
  const t = await d.store.getType(p.typeId);
  if (!t || t.accountId !== org.accountId) return fail(404, "NOT_FOUND", "Diesen Ausweis gibt es nicht.");
  if (t.chainStatus !== "onchain") return fail(409, "TYPE_NOT_ON_CHAIN", "Dieser Ausweis ist noch nicht im Register.");

  const delegate = p.delegate.toLowerCase() as Address;
  const label = p.label?.trim() || null;
  if (label !== null) {
    // Only the label is ours; `active` follows the chain (DelegateSet, via the sync).
    const existing = (await d.store.listDelegates(t.typeId)).find((x) => x.delegate === delegate);
    await d.store.setDelegate({ typeId: t.typeId, delegate, label, active: existing?.active ?? false });
  }
  const { actionId } = await prepareAction(d, {
    org,
    wallet: c.wallet,
    via: p.via ?? viaOf(c),
    steps: [{ fn: "setDelegate", typeId: t.typeId, delegate, allowed: p.allowed }],
    summary: {
      title: p.allowed ? `Ausstellende Stelle für „${t.name}“ zulassen` : `Ausstellende Stelle für „${t.name}“ entfernen`,
      lines: label ? [label] : [],
      orgName: org.name,
    },
  });
  return ok({ actionId });
}

/** One setOrgPrivateOnly(orgId, !membersPublic) step. */
export async function prepareMembersPublicAction(
  d: Deps,
  c: Caller,
  p: { accountId: string; membersPublic: boolean; via?: ActionVia },
): Promise<Result<{ actionId: string }>> {
  if (typeof p.membersPublic !== "boolean") return bad("membersPublic muss wahr oder falsch sein.");
  const org = await readyOrgFor(d, p.accountId, c.wallet);
  if (isFail(org)) return org;
  const { actionId } = await prepareAction(d, {
    org,
    wallet: c.wallet,
    via: p.via ?? viaOf(c),
    steps: [{ fn: "setOrgPrivateOnly", orgId: org.orgId, privateOnly: !p.membersPublic }],
    summary: {
      title: p.membersPublic ? "Mitglieder dürfen öffentlich sichtbar sein" : "Mitglieder nur noch privat",
      lines: p.membersPublic
        ? ["Mitglieder können ihren Ausweis selbst öffentlich zeigen."]
        : ["Neue Mitgliedsausweise werden nur privat abgeholt. Frühere öffentliche Einträge bleiben in der Chain-Historie."],
      orgName: org.name,
    },
  });
  return ok({ actionId });
}

// ── read ──────────────────────────────────────────────────────────────────────

export async function listOrgs(d: Deps, c: Caller): Promise<Result<OrgListEntry[]>> {
  const roles = (await d.store.rolesForWallet(c.wallet)).filter((r) => r.role === "owner" || r.role === "admin");
  const accounts = await d.store.getAccounts([...new Set(roles.map((r) => r.accountId))]);
  const out: OrgListEntry[] = [];
  for (const a of accounts) {
    if (a.accountType !== "organisation") continue;
    const o = await orgContextFor(d.store, a.id, c.wallet);
    if ("error" in o) continue;
    out.push({
      accountId: a.id,
      name: a.name,
      avatarUrl: a.avatarUrl,
      subType: a.subType,
      role: o.role,
      membersMayBePublic: membersMayBePublic(o),
      onChain: await chainReadiness(d.reader, o, c.wallet as Address),
    });
  }
  return ok(out.sort((x, y) => x.name.localeCompare(y.name, "de")));
}

export async function listTypesForOrg(d: Deps, c: Caller, accountId: string): Promise<Result<TypeView[]>> {
  const org = await orgFor(d, accountId, c.wallet);
  if (isFail(org)) return org;
  const rows = await d.store.listTypes({ accountId: org.accountId });
  return ok(
    rows
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
      .map((t) => ({
        typeId: t.typeId,
        name: t.name,
        kind: t.kind,
        description: t.description,
        imageUrl: t.imageUrl,
        benefits: t.benefits,
        template: t.template,
        publicClaim: t.publicClaim,
        supplyCap: t.supplyCap,
        claimStart: t.claimStart,
        claimEnd: t.claimEnd,
        recognised: t.recognised,
        retired: t.retired,
        chainStatus: t.chainStatus,
      })),
  );
}

export async function getActionForPhone(
  d: Deps,
  c: Caller,
  actionId: string,
): Promise<Result<{ id: string; status: string; steps: RegisterStep[]; summary: ActionSummary; registry: Address; expiresAt: string }>> {
  const found = await actionFor(d, c, actionId);
  if (isFail(found)) return found;
  if (found.org) {
    const r = await chainReadiness(d.reader, found.org, c.wallet as Address);
    if (r === "org_not_registered") return ORG_NOT_ON_CHAIN;
    if (r === "no_chain_authority") return NO_CHAIN_AUTHORITY;
  }
  const a = await expireIfDue(d, found.action);
  return ok({ id: a.id, status: a.status, steps: a.steps, summary: a.summary as ActionSummary, registry: d.registry, expiresAt: a.expiresAt });
}

export async function listActions(d: Deps, c: Caller, accountId: string): Promise<Result<ActionView[]>> {
  const org = await orgFor(d, accountId, c.wallet);
  if (isFail(org)) return org;
  const me = c.wallet.toLowerCase();
  const rows = await d.store.listActions({ accountId: org.accountId });
  const out: ActionView[] = [];
  for (const row of rows) {
    const a = await expireIfDue(d, row);
    out.push({
      id: a.id,
      status: a.status,
      summary: a.summary as ActionSummary,
      via: a.preparedVia,
      preparedByMe: a.preparedBy === me,
      confirmedByMe: a.confirmedBy === me,
      txHash: a.txHash,
      error: a.error,
      createdAt: a.createdAt,
      expiresAt: a.expiresAt,
    });
  }
  return ok(out);
}

// ── confirm / cancel ──────────────────────────────────────────────────────────

/** Receipt logs of the register, decoded into the shape the sync handlers take. */
export function registerLogsFromReceipt(registry: Address, logs: readonly ReceiptLog[]): RegisterLog[] {
  const out: RegisterLog[] = [];
  logs.forEach((l, i) => {
    if (l.address.toLowerCase() !== registry.toLowerCase()) return;
    try {
      const ev = decodeEventLog({ abi: CREDENTIAL_REGISTRY_ABI, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      if (!(REGISTER_EVENTS as readonly string[]).includes(ev.eventName as string)) return;
      out.push({
        eventName: ev.eventName as RegisterLog["eventName"],
        args: (ev.args ?? {}) as Record<string, unknown>,
        blockNumber: l.blockNumber ?? 0n,
        logIndex: l.logIndex ?? i,
      });
    } catch {
      /* not a register event */
    }
  });
  return out;
}

/** App only. Stores the hash and settles the action from the receipt when it is there. */
export async function recordSubmitted(d: Deps, c: Caller, p: { actionId: string; txHash: Hex }): Promise<Result<{ status: "done" | "submitted" }>> {
  if (c.via === "chat_session") return fail(403, "APP_ONLY", "Das geht nur in der Röbel App.");
  if (typeof p.txHash !== "string" || !BYTES32.test(p.txHash)) return bad("txHash fehlt.");
  const txHash = p.txHash.toLowerCase() as Hex;
  const found = await actionFor(d, c, p.actionId);
  if (isFail(found)) return found;
  let a = await expireIfDue(d, found.action);
  if (a.status === "done") return ok({ status: "done" });
  if (a.status === "expired") return ACTION_EXPIRED;
  if (a.status !== "awaiting_confirmation" && a.status !== "submitted") return ACTION_NOT_PENDING;

  const marked = await d.store.updateAction(a.id, { status: "submitted", txHash, confirmedBy: c.wallet.toLowerCase(), error: null }, ["awaiting_confirmation", "submitted"]);
  if (!marked) {
    const now = await d.store.getAction(a.id);
    return now?.status === "done" ? ok({ status: "done" }) : ACTION_NOT_PENDING;
  }
  a = { ...a, status: "submitted", txHash };

  let receipt: Awaited<ReturnType<Deps["receipt"]>>;
  try {
    receipt = await d.receipt(txHash);
  } catch (err) {
    console.error("[credentials/actions] receipt lookup failed", err instanceof Error ? err.message : err);
    receipt = null;
  }
  if (!receipt) return ok({ status: "submitted" });

  if (receipt.status === "reverted") {
    await d.store.updateAction(a.id, { status: "failed", error: "transaction reverted" }, ["submitted"]);
    return fail(422, "TX_REVERTED", "Die Transaktion wurde abgelehnt. Es wurde nichts geändert.");
  }

  const confirmed = stepsConfirmedBy(a.steps, d.registry, receipt.logs);
  if (!confirmed.ok) {
    // A revokeLeaves step whose leaves were all revoked already emits nothing: re-check and re-prepare.
    const recheck = a.steps[confirmed.missing]?.fn === "revokeLeaves";
    await d.store.updateAction(a.id, { status: "failed", error: `${recheck ? "recheck needed" : "receipt does not confirm"} step ${confirmed.missing}` }, ["submitted"]);
    return recheck
      ? fail(409, "RECHECK_NEEDED", "Einige Ausweise waren schon widerrufen. Bitte prüfe die Liste und bereite den Widerruf neu vor.")
      : fail(409, "TX_MISMATCH", "Die Transaktion passt nicht zu dieser Aktion.");
  }

  await d.applyConfirmed(a.id, registerLogsFromReceipt(d.registry, receipt.logs));
  await d.store.updateAction(a.id, { status: "done", error: null }, ["submitted"]);
  return ok({ status: "done" });
}

export async function cancelAction(d: Deps, c: Caller, actionId: string): Promise<Result<null>> {
  const found = await actionFor(d, c, actionId);
  if (isFail(found)) return found;
  const a = await expireIfDue(d, found.action);
  if (a.status === "expired") return ACTION_EXPIRED;
  if (!(await d.store.updateAction(a.id, { status: "cancelled" }, ["awaiting_confirmation"]))) return ACTION_NOT_PENDING;
  // Free the roots of batches that will now never be sent.
  for (const b of await d.store.listBatches({ actionId: a.id, statuses: ["prepared"] })) {
    await d.store.updateBatch(b.id, { status: "cancelled" }, ["prepared"]);
  }
  return ok(null);
}
