// Test-send and publication of card designs. "Testen" pushes the draft to the creator's (and the
// co-admins') phones and writes nothing to the register. "Veröffentlichen" freezes the draft into
// an immutable, content-addressed version, renders its public preview and prepares the register
// change through the existing type_prepare flow (createType the first time, updateType after),
// which an owner or admin confirms on the phone. The version goes live only when that action is
// confirmed (lifecycle.ts).
// Relative imports only: loaded by `npx tsx --test`.
import { createHash } from "node:crypto";
import { canonicalJson, isBuiltinAsset, type CardDesign } from "@roebel/card-design";
import type { Hex } from "viem";
import { prepareTypeAction, viaOf, type Deps } from "../actions";
import type { Caller } from "../caller";
import type { Notifier } from "../notify";
import { isTemplateKey, TYPE_TEMPLATES } from "../templates";
import { assetBytes, type AssetDeps } from "./assets";
import { assetIdsOf, draftFor, fail, isFail, ok, sameAsVersion, type DesignResult } from "./drafts";
import { reconcilePending } from "./lifecycle";
import { designUrl } from "./public";
import type { AssetLoader } from "./render";
import type { VersionMeta, VersionRow } from "./store";

export { abandonDesignVersion, promoteDesignVersion, promoteDesignVersionBySha } from "./lifecycle";

export type PublishDeps = AssetDeps & {
  notify: Notifier;
  /** The register wiring (credentialDeps()); null when the register is not configured on this node. */
  register: Deps | null;
  /** Preview renderer; defaults to render.ts renderPreview (CanvasKit). */
  render?: (design: CardDesign, images: AssetLoader) => Promise<Uint8Array>;
};

export const designTestLink = (draftId: string) => `roebel://org/credentials/design-test?draft=${draftId}`;
export const previewPath = (accountId: string, sha: string) => `credential-designs/${accountId}/previews/${sha}.png`;

const NOT_CONFIGURED = fail(503, "NOT_CONFIGURED", "Das Ausweis-Register ist auf diesem Knoten nicht eingerichtet.");
const ALREADY_PENDING = fail(409, "ALREADY_PENDING", "Eine Veröffentlichung wartet schon auf Bestätigung.");
const NO_CHANGES = fail(409, "NO_CHANGES", "Keine Änderungen seit der letzten Veröffentlichung.");

/** design_test_send: the draft appears on the caller's and the co-admins' phones. No register write. */
export async function sendTest(d: PublishDeps, c: Caller, p: { draftId: string }): Promise<DesignResult<{ sentAt: string }>> {
  const found = await draftFor(d, c, p?.draftId);
  if (isFail(found)) return found;
  const sentAt = new Date(d.now()).toISOString();
  await d.store.updateDraft(found.draft.id, { testSentAt: sentAt }, null);
  const admins = (await d.credStore.ownersOf(found.draft.accountId)).filter((o) => o.role === "owner" || o.role === "admin").map((o) => o.wallet.toLowerCase());
  const wallets = [...new Set([c.wallet.toLowerCase(), ...admins])];
  await d.notify.push({
    wallets,
    type: "design_test",
    title: `Entwurf zum Testen: ${found.draft.name}`,
    body: "Tippe, um den Entwurf auf deinem Handy anzusehen. Nur für dich sichtbar.",
    data: { type: "design_test", draftId: found.draft.id, url: designTestLink(found.draft.id) },
  });
  return ok({ sentAt });
}

/** sha256 of the frozen version: draft, number, public text and design (unique per draft and version). */
export function versionSha(draftId: string, version: number, meta: VersionMeta, design: CardDesign): string {
  return createHash("sha256").update(canonicalJson({ draftId, version, meta, design })).digest("hex");
}

/** design_publish: freezes the draft into version n and prepares its register change. */
export async function publishDraft(d: PublishDeps, c: Caller, p: { draftId: string }): Promise<DesignResult<{ actionId: string; version: number; sha: string }>> {
  const found = await draftFor(d, c, p?.draftId);
  if (isFail(found)) return found;
  if (!d.register) return NOT_CONFIGURED;
  const { org } = found;

  const versions: VersionRow[] = [];
  for (const v of await d.store.versionsOf(found.draft.id)) versions.push(await reconcilePending(d.store, d.credStore, v, d.now()));
  if (versions.some((v) => v.status === "pending")) return ALREADY_PENDING;
  // Reconciling may have handed a first publication back to plain draft (typeId cleared).
  const draft = (await d.store.getDraft(found.draft.id)) ?? found.draft;
  const live = versions.find((v) => v.status === "live") ?? null;
  if (live && sameAsVersion(draft, live)) return NO_CHANGES;

  const design = draft.design;
  const type = draft.typeId ? await d.credStore.getType(draft.typeId as Hex) : null;
  const assets = assetIdsOf(design).filter((id) => !isBuiltinAsset(id));
  let aiGenerated = design.layers.some((l) => l.ai === true);
  for (const id of assets) if ((await d.store.getAsset(id, org.accountId))?.ai) aiGenerated = true;
  const meta: VersionMeta = {
    name: draft.name,
    description: type?.description ?? (draft.template && isTemplateKey(draft.template) ? TYPE_TEMPLATES[draft.template].description : ""),
    kind: draft.kind,
    organisation: org.name,
    aiGenerated,
  };
  const version = versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
  const sha = versionSha(draft.id, version, meta, design);

  const render = d.render ?? (await import("./render")).renderPreview;
  const png = await render(design, (id) => assetBytes(d, org.accountId, id));
  const path = previewPath(org.accountId, sha);
  await d.storage.put(path, png, "image/png");
  await d.store.insertVersion({
    sha,
    draftId: draft.id,
    typeId: draft.typeId,
    version,
    design,
    meta,
    previewPath: path,
    actionId: null,
    status: "pending",
    createdBy: c.wallet.toLowerCase(),
    createdAt: new Date(d.now()).toISOString(),
  });

  const via = viaOf(c, c.payload.client);
  const metadataURI = designUrl(sha);
  let r: Awaited<ReturnType<typeof prepareTypeAction>>;
  try {
    r = draft.typeId
    ? await prepareTypeAction(d.register, c, { accountId: org.accountId, op: "update", typeId: draft.typeId as Hex, metadataURI, via })
    : await prepareTypeAction(d.register, c, {
        accountId: org.accountId,
        op: "create",
        name: draft.name,
        kind: draft.kind,
        ...(draft.template && isTemplateKey(draft.template) ? { template: draft.template } : {}),
        metadataURI,
        via,
      });
  } catch (err) {
    // A failed prepare (RPC, store) must not leave a pending version that blocks every later publish.
    await d.store.setVersionStatus(sha, "abandoned", undefined, ["pending"]);
    throw err;
  }
  if (!r.ok || r.data.actionId === null) {
    await d.store.setVersionStatus(sha, "abandoned", undefined, ["pending"]);
    return r.ok ? NO_CHANGES : r;
  }
  // typeId first: a crash between the writes then leaves a version the chain sync can still match.
  if (!draft.typeId) {
    await d.store.setVersionType(sha, r.data.typeId);
    await d.store.updateDraft(draft.id, { typeId: r.data.typeId }, null);
  }
  await d.store.setVersionStatus(sha, "pending", r.data.actionId);
  return ok({ actionId: r.data.actionId, version, sha });
}
