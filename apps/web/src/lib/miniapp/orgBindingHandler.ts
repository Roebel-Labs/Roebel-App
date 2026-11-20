// apps/web/src/lib/miniapp/orgBindingHandler.ts
// Pure request handler for POST /api/mini-apps/org-binding (org_binding_list /
// org_binding_decide, scope roebel-miniapp-v1). Dependencies are injected so node:test can
// load it (no `server-only`, no `@/` alias). Only an owner or admin of the org may list or
// decide; the stored decider is the role, never the wallet.
import type { VerifyFail, VerifyOk } from "../signed-request/verify";
import { isOrgBinding, type OrgBinding } from "./orgBinding";

type HeaderBag = { get(name: string): string | null };
export type OrgBindingAction = "org_binding_list" | "org_binding_decide";
export type OrgBindingDecision = "confirm" | "reject" | "remove";

/** A row as the list query returns it (extra columns are dropped, never passed on). */
export interface OrgBindingAppRow {
  id: string;
  slug: string;
  name: string;
  icon_url: string | null;
  org_binding: string;
}

export interface OrgBindingItem {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  binding: OrgBinding;
}

export interface OrgBindingDeps {
  verify: (body: unknown, headers: HeaderBag | null) => Promise<VerifyOk<OrgBindingAction> | VerifyFail>;
  /** The wallet's role in the org (account_owners), or null. */
  roleOf(account: string, wallet: string): Promise<string | null>;
  /** Live or pending apps that name this org with a binding other than 'none'. */
  listApps(account: string): Promise<OrgBindingAppRow[]>;
  getApp(ref: string): Promise<{ id: string; org_account_id: string | null; org_binding: string } | null>;
  setBinding(id: string, binding: OrgBinding, by: string): Promise<void>;
}

export interface OrgBindingResult {
  status: number;
  json: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISIONS: Record<OrgBindingDecision, OrgBinding> = { confirm: "confirmed", reject: "rejected", remove: "rejected" };

const fail = (status: number, code: string, message?: string): OrgBindingResult => ({
  status,
  json: { ok: false, code, ...(message ? { message } : {}) },
});

async function managerRole(deps: OrgBindingDeps, account: string, wallet: string): Promise<"owner" | "admin" | null> {
  const role = await deps.roleOf(account, wallet);
  return role === "owner" || role === "admin" ? role : null;
}

export async function handleOrgBinding(body: unknown, headers: HeaderBag | null, deps: OrgBindingDeps): Promise<OrgBindingResult> {
  const v = await deps.verify(body, headers);
  if (!v.ok) return fail(v.status, v.code, v.message);

  if (v.action === "org_binding_list") {
    const account = typeof v.payload.account === "string" ? v.payload.account.trim().toLowerCase() : "";
    if (!UUID_RE.test(account)) return fail(400, "invalid_params", "account fehlt.");
    if (!(await managerRole(deps, account, v.wallet))) return fail(403, "forbidden");
    const rows = await deps.listApps(account);
    const apps: OrgBindingItem[] = rows
      .filter((r) => isOrgBinding(r.org_binding) && r.org_binding !== "none")
      .map((r) => ({ id: r.id, slug: r.slug, name: r.name, iconUrl: r.icon_url ?? null, binding: r.org_binding as OrgBinding }));
    return { status: 200, json: { apps } };
  }

  if (v.action === "org_binding_decide") {
    const ref = typeof v.payload.app === "string" ? v.payload.app.trim() : "";
    const decision = v.payload.decision;
    if (!ref) return fail(400, "invalid_params", "app fehlt.");
    if (typeof decision !== "string" || !(decision in DECISIONS)) {
      return fail(400, "invalid_params", "decision muss confirm, reject oder remove sein.");
    }
    const app = await deps.getApp(ref);
    if (!app) return fail(404, "not_found");
    if (!app.org_account_id || app.org_binding === "none") {
      return fail(400, "invalid_params", "Diese Mini-App nennt keinen Verein.");
    }
    const role = await managerRole(deps, app.org_account_id, v.wallet);
    if (!role) return fail(403, "forbidden");
    if (decision === "remove" && app.org_binding !== "confirmed") {
      return fail(409, "conflict", "Nur eine bestätigte Zuordnung kann getrennt werden.");
    }
    const binding = DECISIONS[decision as OrgBindingDecision];
    await deps.setBinding(app.id, binding, role);
    return { status: 200, json: { binding } };
  }

  return fail(400, "invalid_params");
}
