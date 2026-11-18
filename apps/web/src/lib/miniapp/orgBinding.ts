// apps/web/src/lib/miniapp/orgBinding.ts
// The org binding of a mini app: a version-2 manifest names an org (`org`), the org's owner
// or admin confirms. Pure — no `server-only`, no `@/` alias (loaded by node:test).

export type OrgBinding = "none" | "requested" | "confirmed" | "rejected";

export const ORG_BINDINGS: readonly OrgBinding[] = ["none", "requested", "confirmed", "rejected"];

export function isOrgBinding(v: unknown): v is OrgBinding {
  return typeof v === "string" && (ORG_BINDINGS as readonly string[]).includes(v);
}

/**
 * The binding after a manifest write: no org → 'none'; the same org as before → unchanged;
 * a different org → 'requested' (an earlier confirmation never carries over to another org).
 */
export function nextBinding(prev: { orgAccountId: string | null; binding: OrgBinding }, nextOrg: string | null): OrgBinding {
  if (!nextOrg) return "none";
  if (prev.orgAccountId && prev.orgAccountId.toLowerCase() === nextOrg.toLowerCase()) return prev.binding;
  return "requested";
}

/**
 * The binding columns to add to a mini_apps write whose patch came from manifestStoreFields.
 * Empty when the binding does not change (or the patch has no `org_account_id`, i.e. the
 * write is not a manifest write); otherwise the new status with the old decision cleared.
 * `prev` is the stored row, or null for a new app.
 */
export function bindingPatch(
  prev: { org_account_id?: string | null; org_binding?: string | null } | null,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  if (!("org_account_id" in patch)) return {};
  const nextOrg = typeof patch.org_account_id === "string" ? patch.org_account_id : null;
  const prevBinding = prev?.org_binding;
  const before: { orgAccountId: string | null; binding: OrgBinding } = {
    orgAccountId: prev?.org_account_id ?? null,
    binding: isOrgBinding(prevBinding) ? prevBinding : "none",
  };
  const next = nextBinding(before, nextOrg);
  if (next === before.binding) return {};
  return { org_binding: next, org_binding_decided_at: null, org_binding_decided_by: null };
}
