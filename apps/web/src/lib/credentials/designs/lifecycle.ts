// How a published design version follows its register action: pending → live when the action is
// confirmed (the receipt path or the chain sync), pending → abandoned when it is cancelled, expires
// or fails. A version the chain later shows as configured is promoted even if it was given up
// here (the chain is the truth). Kept free of rendering and of actions.ts so both the action and
// sync code can call it.
// Relative imports only: loaded by `npx tsx --test`.
import type { Hex } from "viem";
import type { CredentialStore } from "../store";
import { designImageUrl } from "./public";
import type { DesignStore, VersionRow } from "./store";

async function promote(store: DesignStore, credStore: CredentialStore, v: VersionRow): Promise<void> {
  if (v.status === "live" || v.status === "superseded") return;
  if (!(await store.setVersionStatus(v.sha, "live", undefined, ["pending", "abandoned"]))) return;
  for (const other of await store.versionsOf(v.draftId)) {
    if (other.sha !== v.sha && other.status === "live" && other.version < v.version) await store.setVersionStatus(other.sha, "superseded", undefined, ["live"]);
  }
  // A later version already live wins: this one goes straight to superseded.
  const newer = (await store.versionsOf(v.draftId)).find((o) => o.status === "live" && o.version > v.version);
  if (newer) {
    await store.setVersionStatus(v.sha, "superseded", undefined, ["live"]);
    return;
  }
  const draft = await store.getDraft(v.draftId);
  if (draft && draft.typeId === null && v.typeId) await store.updateDraft(draft.id, { typeId: v.typeId }, null);
  if (!v.typeId) return;
  const type = await credStore.getType(v.typeId as Hex);
  if (!type) return;
  // Older app builds keep showing a picture: the type's image becomes the version's preview.
  // A recognised office keeps its name (recognition was given for it).
  const patch: { imageUrl: string; name?: string } = { imageUrl: designImageUrl(v.sha) };
  if (!type.recognised && v.meta.name && v.meta.name !== type.name) patch.name = v.meta.name;
  await credStore.updateType(type.typeId, patch);
}

/** The register action of a published version was confirmed: the version goes live. Idempotent. */
export async function promoteDesignVersion(store: DesignStore, credStore: CredentialStore, actionId: string): Promise<void> {
  const v = await store.versionByAction(actionId);
  if (v) await promote(store, credStore, v);
}

/** The chain configured a type with a design URL (sync path, TypeConfigured): that version goes live. */
export async function promoteDesignVersionBySha(store: DesignStore, credStore: CredentialStore, sha: string, typeId: string): Promise<void> {
  const v = await store.getVersion(sha);
  if (v && (v.typeId === null || v.typeId === typeId.toLowerCase())) await promote(store, credStore, { ...v, typeId: v.typeId ?? typeId.toLowerCase() });
}

/** The action was cancelled, expired or failed: the version is given up, the previous one stays live. */
export async function abandonDesignVersion(store: DesignStore, actionId: string): Promise<void> {
  const v = await store.versionByAction(actionId);
  if (!v || !(await store.setVersionStatus(v.sha, "abandoned", undefined, ["pending"]))) return;
  // A first publication that never reached the register: the draft becomes a plain draft again,
  // so the next publication prepares a fresh createType.
  const versions = await store.versionsOf(v.draftId);
  if (versions.some((o) => o.status === "live" || o.status === "superseded")) return;
  const draft = await store.getDraft(v.draftId);
  if (draft && draft.typeId !== null && draft.typeId === v.typeId) await store.updateDraft(draft.id, { typeId: null }, null);
}

/** sha of a design URL (…/api/credentials/designs/<sha>), or null. */
export function designShaOfUri(uri: string): string | null {
  const m = /\/api\/credentials\/designs\/([0-9a-f]{64})$/.exec(uri);
  return m ? m[1] : null;
}

/**
 * Settles a pending version from its action's current state (an action that expired while nobody
 * looked, or one the sync marked done). Returns the version as it is now.
 */
export async function reconcilePending(store: DesignStore, credStore: CredentialStore, v: VersionRow, nowMs: number): Promise<VersionRow> {
  if (v.status !== "pending" || !v.actionId) return v;
  const a = await credStore.getAction(v.actionId);
  if (!a) return v;
  if (a.status === "done") await promoteDesignVersion(store, credStore, v.actionId);
  else if (a.status === "cancelled" || a.status === "expired" || a.status === "failed" || (a.status === "awaiting_confirmation" && Date.parse(a.expiresAt) <= nowMs)) {
    await abandonDesignVersion(store, v.actionId);
  } else return v;
  return (await store.getVersion(v.sha)) ?? v;
}
