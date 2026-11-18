// apps/web/src/lib/miniapp/identityReview.ts
// What a version-2 manifest asks to know about a person, laid out for the admin review and
// the reviewer Playground. Pure and client-safe: no server imports, no chain access.
import type { Credential, MiniAppIdentityRequest } from "@netizen-labs/miniapp-sdk";
import type { ConsentKey, HostHandlers } from "@netizen-labs/miniapp-sdk/host";

/** Display names of the built-in credential types (shared with credentialSource.ts). */
export const BUILTIN_CREDENTIAL_NAMES: Record<"citizen" | "attester" | "guest", string> = {
  citizen: "Bürger:in",
  attester: "Bescheiniger:in",
  guest: "Gast",
};

export interface IdentityReviewItem {
  key: ConsentKey;
  label: string;
  /** The developer's reason from the manifest (credentials only). */
  reason?: string;
  /** Not requested by the live version. */
  isNew: boolean;
  /** Needs the reviewer's explicit confirmation (address, every credential). */
  sensitive: boolean;
}

type MaybeIdentity = MiniAppIdentityRequest | null | undefined;

function builtinName(ref: string): string | null {
  return Object.prototype.hasOwnProperty.call(BUILTIN_CREDENTIAL_NAMES, ref)
    ? BUILTIN_CREDENTIAL_NAMES[ref as keyof typeof BUILTIN_CREDENTIAL_NAMES]
    : null;
}

function keysOf(identity: MaybeIdentity): Set<string> {
  const s = new Set<string>();
  if (!identity) return s;
  if (identity.profile) s.add("profile");
  if (identity.address) s.add("address");
  for (const c of identity.credentials ?? []) s.add(`cred:${c.type}`);
  return s;
}

/**
 * One row per requested item of `next`, marked new against `live`. `describe` names register
 * types; without it (or when it returns null) a non-built-in ref shows as "<ref> (unbekannter Typ)".
 */
export function identityReviewItems(
  live: MaybeIdentity,
  next: MaybeIdentity,
  describe?: (ref: string) => string | null | undefined,
): IdentityReviewItem[] {
  if (!next) return [];
  const before = keysOf(live);
  const items: IdentityReviewItem[] = [];
  if (next.profile) {
    items.push({ key: "profile", label: "Name und Bild", isNew: !before.has("profile"), sensitive: false });
  }
  if (next.address) {
    items.push({ key: "address", label: "Kontoadresse", isNew: !before.has("address"), sensitive: true });
  }
  for (const c of next.credentials ?? []) {
    const key: ConsentKey = `cred:${c.type}`;
    const label = describe?.(c.type) ?? builtinName(c.type) ?? `${c.type} (unbekannter Typ)`;
    items.push({ key, label, reason: c.reason, isNew: !before.has(key), sensitive: true });
  }
  return items;
}

/** Approving needs the reviewer's explicit confirmation when the address or any credential is requested. */
export function needsIdentityReview(next: MaybeIdentity): boolean {
  return !!next && (next.address === true || (next.credentials ?? []).length > 0);
}

/** The `identity` section of a stored manifest (`{ miniapp: {...} }` or flat); null when absent. */
export function identityFromManifest(raw: unknown): MiniAppIdentityRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const m = (r.miniapp && typeof r.miniapp === "object" ? r.miniapp : r) as Record<string, unknown>;
  const id = m.identity;
  return id && typeof id === "object" && !Array.isArray(id) ? (id as MiniAppIdentityRequest) : null;
}

/** Reviewer Playground: the built-in credentials the toggles grant, limited to what the manifest requests. */
export function previewCredentials(
  identity: MaybeIdentity,
  toggles: { citizen: boolean; attester: boolean },
): Credential[] {
  const requested = new Set((identity?.credentials ?? []).map((c) => c.type));
  return (["citizen", "attester"] as const)
    .filter((t) => toggles[t] && requested.has(t))
    .map((t) => ({ type: t, kind: "builtin" as const, name: BUILTIN_CREDENTIAL_NAMES[t], validUntil: null, recognised: true }));
}

/** The review route's refusal when an approval lacks the identity confirmation. */
export const IDENTITY_REVIEW_MESSAGE =
  "Bitte bestätige, dass die angefragten Daten zu dem passen, was die App tut.";

/**
 * Playground (version 2): without "Adresse freigeben" the app gets no wallet, like in the Röbel
 * app (no account, signing calls refused). With the address shared, the real handlers stay.
 */
export function previewWalletOverrides(addressShared: boolean): Partial<HostHandlers> {
  if (addressShared) return {};
  return {
    walletGetAccount: () => null,
    walletRequest: () => {
      throw { code: "unauthorized", message: "Die Kontoadresse ist für diese Mini-App nicht freigegeben." };
    },
  };
}
