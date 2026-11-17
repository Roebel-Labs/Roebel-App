// The holder's side of the register (Röbel App): my invitations with their proofs, redeeming a
// claim-key link, accepting or declining, and the holdings check other projects use.
//
// mine / redeem / respond hand out proofs and claim signatures, so they are app only (a pairing
// session gets 403 in authenticateCaller). No view says whether an invitation was claimed publicly:
// that is the person's own transaction and only the chain (holdsMany) tells it.
// Never log tokens, claim keys or wallet addresses.
// Relative imports only: loaded by `npx tsx --test`.
import { createHash } from "node:crypto";
import { signClaim } from "@netizen-labs/credential-registry";
import type { Address, Hex } from "viem";
import type { Fail, Result } from "./actions";
import type { Caller } from "./caller";
import type { NodeRegistryReader } from "./rights";
import { openSecret } from "./secrets";
import type { AccountRow, BatchRow, CredentialStore, InvitationRow, TypeRow } from "./store";
import type { CredentialAction } from "../signed-request/message";

/** The actions of POST /api/credentials/me. holdings and present_resolve also accept a pairing session. */
export const ME_ACTIONS: readonly CredentialAction[] = ["mine", "redeem", "respond", "holdings", "present_create", "present_resolve"];

export const REDEEM_RATE_RULE = { name: "credentials-redeem-min", limit: 10, windowMs: 60_000 } as const;

const CHAIN_ID = 100;
const MAX_HOLDINGS_TYPES = 50;

export type HolderDeps = {
  store: CredentialStore;
  reader: Pick<NodeRegistryReader, "orgPrivateOnly" | "holdsMany">;
  registry: Address;
  now: () => number;
  /** Counts one redeem attempt for the wallet; false when the per-minute limit is reached. */
  takeRedeem?: (wallet: string) => Promise<boolean>;
};

export type InvitationView = {
  id: string;
  state: "invited" | "accepted" | "declined" | "revoked";
  type: {
    typeId: Hex;
    name: string;
    description: string | null;
    imageUrl: string | null;
    kind: "role" | "membership" | "badge";
    recognised: boolean;
    publicClaimAllowed: boolean;
    benefits: string[];
  };
  org: { accountId: string; name: string; avatarUrl: string | null } | null;
  validUntil: string | null;
  claim: {
    batchId: string;
    leaf: { kind: "account" | "claimKey"; typeId: Hex; subject: Address; validUntil: string; salt: Hex };
    proof: Hex[];
    claimSignature: Hex | null;
  };
};

export type Holding = { typeId: Hex; held: boolean; visibility: "public" | "private" | null; validUntil: string | null };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });

const LINK_INVALID = fail(404, "NOT_FOUND", "Dieser Link ist nicht gültig.");
const ALREADY_REDEEMED = fail(409, "ALREADY_REDEEMED", "Dieser Ausweis wurde bereits abgeholt.");
const REVOKED = fail(410, "REVOKED", "Dieser Ausweis wurde zurückgezogen.");
const RATE_LIMITED = fail(429, "RATE_LIMITED", "Zu viele Versuche. Bitte warte eine Minute.");
const INVITATION_NOT_FOUND = fail(404, "NOT_FOUND", "Diese Einladung gibt es nicht.");
const bad = (message: string) => fail(400, "BAD_REQUEST", message);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
const isoOfSeconds = (v: string): string | null => (v === "0" ? null : new Date(Number(v) * 1000).toISOString());
const expired = (validUntil: string, nowMs: number) => validUntil !== "0" && Number(validUntil) < Math.floor(nowMs / 1000);

/** A batch the chain knows (BatchAdded seen): its chain id is what the proof and claim refer to. */
const onChain = (b: BatchRow | null): b is BatchRow & { chainBatchId: string } =>
  !!b && b.chainBatchId !== null && (b.status === "onchain" || b.status === "revoked");

/** Per-request caches so a list of invitations costs one read per batch, type, org and org flag. */
function viewContext(d: HolderDeps) {
  const batches = new Map<string, Promise<BatchRow | null>>();
  const types = new Map<string, Promise<TypeRow | null>>();
  const accounts = new Map<string, Promise<AccountRow | null>>();
  const privateOnly = new Map<string, Promise<boolean>>();
  const memo = <T>(m: Map<string, Promise<T>>, k: string, f: () => Promise<T>) => {
    if (!m.has(k)) m.set(k, f());
    return m.get(k)!;
  };
  return {
    batch: (id: string) => memo(batches, id, () => d.store.getBatch(id)),
    type: (id: Hex) => memo(types, id.toLowerCase(), () => d.store.getType(id)),
    account: (id: string) => memo(accounts, id, () => d.store.getAccount(id)),
    // Read from the chain at request time: an org that was just opened is open right away.
    privateOnly: (orgId: Hex) => memo(privateOnly, orgId.toLowerCase(), () => d.reader.orgPrivateOnly(orgId)),
  };
}

type ViewContext = ReturnType<typeof viewContext>;

async function claimSignatureFor(d: HolderDeps, inv: InvitationRow, chainBatchId: string, wallet: string): Promise<Hex | null> {
  if (inv.leafKind !== "claim_key" || !inv.claimKeyEnc || inv.status === "revoked") return null;
  // The claim key never leaves this function; only the signature for this account does.
  const key = openSecret(inv.claimKeyEnc, `invitation:${inv.id}:claim_key`) as Hex;
  return signClaim(key, { chainId: CHAIN_ID, registry: d.registry, batchId: BigInt(chainBatchId), leaf: inv.leafHash, account: wallet as Address });
}

async function toView(d: HolderDeps, ctx: ViewContext, inv: InvitationRow, batch: BatchRow & { chainBatchId: string }, wallet: string): Promise<InvitationView | null> {
  if (inv.status === "prepared") return null;
  const type = await ctx.type(inv.typeId);
  if (!type || !type.kind) return null;
  const account = type.accountId ? await ctx.account(type.accountId) : null;
  const privateOnly = type.kind === "membership" ? await ctx.privateOnly(type.orgId) : false;
  const revoked = inv.status === "revoked" || batch.status === "revoked";
  return {
    id: inv.id,
    state: revoked ? "revoked" : inv.status,
    type: {
      typeId: type.typeId,
      name: type.name,
      description: type.description,
      imageUrl: type.imageUrl,
      kind: type.kind,
      recognised: type.recognised,
      publicClaimAllowed: type.publicClaim && !privateOnly,
      benefits: type.benefits,
    },
    org: account ? { accountId: account.id, name: account.name, avatarUrl: account.avatarUrl } : null,
    validUntil: isoOfSeconds(inv.validUntil),
    claim: {
      batchId: batch.chainBatchId,
      leaf: {
        kind: inv.leafKind === "claim_key" ? "claimKey" : "account",
        typeId: inv.typeId,
        subject: inv.subject as Address,
        validUntil: inv.validUntil,
        salt: inv.salt,
      },
      proof: inv.proof,
      claimSignature: revoked ? null : await claimSignatureFor(d, inv, batch.chainBatchId, wallet),
    },
  };
}

/** Every invitation bound to the caller whose batch is on chain. */
export async function mine(d: HolderDeps, c: Caller): Promise<Result<InvitationView[]>> {
  const wallet = c.wallet.toLowerCase();
  const ctx = viewContext(d);
  const rows = await d.store.invitationsForWallet(wallet);
  const views: InvitationView[] = [];
  for (const inv of rows) {
    if (inv.recipientWallet !== wallet) continue;
    const batch = await ctx.batch(inv.batchId);
    if (!onChain(batch)) continue;
    const v = await toView(d, ctx, inv, batch, wallet);
    if (v) views.push(v);
  }
  return ok(views);
}

/** Binds a claim-key link to the first signed-in account that redeems it. */
export async function redeem(d: HolderDeps, c: Caller, p: { token: string }): Promise<Result<InvitationView>> {
  const wallet = c.wallet.toLowerCase();
  if (d.takeRedeem && !(await d.takeRedeem(wallet))) return RATE_LIMITED;
  const token = p?.token;
  if (typeof token !== "string" || !TOKEN.test(token)) return LINK_INVALID;
  const found = await d.store.findInvitationByTokenHash(sha256Hex(token));
  if (!found || found.leafKind !== "claim_key") return LINK_INVALID;
  const batch = await d.store.getBatch(found.batchId);
  if (found.status === "revoked" || batch?.status === "revoked") return REVOKED;
  if (!onChain(batch)) return LINK_INVALID;

  let inv = found;
  if (inv.recipientWallet === null) {
    const won = await d.store.updateInvitation(
      inv.id,
      { recipientWallet: wallet },
      { recipientWalletIsNull: true, statuses: ["prepared", "invited", "accepted", "declined"] },
    );
    const fresh = await d.store.getInvitation(inv.id);
    if (!fresh) return LINK_INVALID;
    if (!won && fresh.status === "revoked") return REVOKED;
    inv = fresh;
  }
  if (inv.recipientWallet !== wallet) return ALREADY_REDEEMED;

  if (inv.status === "prepared") {
    // The batch is on chain but delivery has not run yet: the link reached its person anyway, so the
    // invitation is delivered (mine / respond agree) and no mail is needed any more.
    await d.store.updateInvitation(inv.id, { status: "invited", invitedAt: new Date(d.now()).toISOString(), contactEmail: null }, { statuses: ["prepared"] });
    const fresh = await d.store.getInvitation(inv.id);
    if (!fresh) return LINK_INVALID;
    if (fresh.status === "revoked") return REVOKED;
    inv = fresh;
  }

  const view = await toView(d, viewContext(d), inv, batch, wallet);
  if (!view) return LINK_INVALID;
  return ok(view);
}

/** Records accept / decline. Visibility is not taken: claiming publicly is the person's own transaction. */
export async function respond(d: HolderDeps, c: Caller, p: { invitationId: string; decision: "accept" | "decline" }): Promise<Result<null>> {
  const wallet = c.wallet.toLowerCase();
  if (!p || typeof p !== "object") return bad("invitationId and decision are required");
  const extra = Object.keys(p).filter((k) => k !== "invitationId" && k !== "decision");
  if (extra.length > 0) return bad("unexpected field");
  if (p.decision !== "accept" && p.decision !== "decline") return bad("decision must be accept or decline");
  if (typeof p.invitationId !== "string" || !UUID.test(p.invitationId)) return INVITATION_NOT_FOUND;
  const inv = await d.store.getInvitation(p.invitationId);
  if (!inv || inv.recipientWallet !== wallet || inv.status === "prepared") return INVITATION_NOT_FOUND;
  const batch = await d.store.getBatch(inv.batchId);
  if (inv.status === "revoked" || batch?.status === "revoked") return REVOKED;
  if (!onChain(batch)) return INVITATION_NOT_FOUND;
  const changed = await d.store.updateInvitation(
    inv.id,
    { status: p.decision === "accept" ? "accepted" : "declined", respondedAt: new Date(d.now()).toISOString() },
    { statuses: ["invited", "accepted", "declined"] },
  );
  return changed ? ok(null) : REVOKED;
}

/**
 * Per type: public when the chain says the caller holds it (Citizen, Attester and Guest included);
 * otherwise private when the caller accepted a live, unexpired invitation of an on-chain batch.
 */
export async function holdings(d: HolderDeps, c: Caller, p: { typeIds: Hex[] }): Promise<Result<Holding[]>> {
  const wallet = c.wallet.toLowerCase();
  const ids = p?.typeIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_HOLDINGS_TYPES || !ids.every((t) => typeof t === "string" && BYTES32.test(t))) {
    return bad(`typeIds must be 1 to ${MAX_HOLDINGS_TYPES} bytes32 values`);
  }
  const typeIds = ids.map((t) => t.toLowerCase() as Hex);
  const held = await d.reader.holdsMany(typeIds, wallet as Address);
  const nowMs = d.now();
  const accepted = (await d.store.invitationsForWallet(wallet)).filter(
    (i) => i.recipientWallet === wallet && i.status === "accepted" && !expired(i.validUntil, nowMs),
  );
  const batches = new Map<string, BatchRow | null>();
  const out: Holding[] = [];
  for (let k = 0; k < typeIds.length; k++) {
    const typeId = typeIds[k];
    if (held[k]) {
      out.push({ typeId, held: true, visibility: "public", validUntil: null });
      continue;
    }
    let best: InvitationRow | null = null;
    for (const i of accepted) {
      if (i.typeId !== typeId) continue;
      if (!batches.has(i.batchId)) batches.set(i.batchId, await d.store.getBatch(i.batchId));
      const b = batches.get(i.batchId)!;
      if (!b || b.status !== "onchain" || b.chainBatchId === null) continue;
      // Prefer the invitation that lasts longest ("0" = no expiry).
      if (!best || i.validUntil === "0" || (best.validUntil !== "0" && Number(i.validUntil) > Number(best.validUntil))) best = i;
    }
    out.push(best ? { typeId, held: true, visibility: "private", validUntil: isoOfSeconds(best.validUntil) } : { typeId, held: false, visibility: null, validUntil: null });
  }
  return ok(out);
}
