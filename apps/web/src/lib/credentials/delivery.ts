// Invitation delivery for the credential register, run once a batch is on chain: a push for app
// accounts, one e-mail for contacts with an address (the address is erased right after), nothing
// for the rest (they get the link page, a QR code or a printed letter). Plus the `letters` route
// action, which opens the link tokens of a batch for printing.
//
// Exactly once per invitation: each one is taken with a compare-and-set prepared → invited before
// anything is sent, so the sync and a recovery sweep running together never send twice. A failed
// mail hands the invitation back (invited → prepared, address kept) so the next sweep retries it.
//
// Privacy: for an org whose members may not be public, push and mail name neither org nor type.
// Never logs a token, an address or a wallet.
// Relative imports only: loaded by `npx tsx --test`.
import type { Fail, Result } from "./actions";
import type { Caller } from "./caller";
import { publicBaseUrl } from "./config";
import type { Notifier } from "./notify";
import { membersMayBePublic, orgContextFor } from "./rights";
import { openSecret } from "./secrets";
import type { CredentialStore, InvitationRow, TypeRow } from "./store";
import type { Mailer, OutgoingMail } from "../passkey/email-mailer";

export type DeliveryDeps = {
  store: CredentialStore;
  notify: Notifier;
  /** null when no mail provider is configured: contacts with an address stay prepared until one is. */
  mailer: Mailer | null;
  now: () => number;
};

export type LetterRow = { displayName: string; url: string };
export type LetterContext = { orgName: string; typeName: string };
export type RenderLetters = (rows: LetterRow[], ctx: LetterContext) => Promise<Buffer>;

const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The public link of a claim-key invitation. Universal links are claimed on www only. */
export function inviteUrl(token: string, env: Record<string, string | undefined> = process.env): string {
  const base = publicBaseUrl(env).replace(/^https?:\/\/roebel\.app$/i, "https://www.roebel.app");
  return `${base}/invite/ausweis/${encodeURIComponent(token)}`;
}

/**
 * A name from an uploaded list, made safe to print: no control or bidi-override characters, one
 * line, at most 120 characters. Leading = + - @ stay as they are: PDF and plain-text mail do not
 * evaluate anything, and the register has no CSV export.
 */
export function printableName(name: string | null | undefined): string {
  const clean = (name ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return clean || "Ohne Namen";
}

const noun = (type: TypeRow) => (type.kind === "badge" ? "Abzeichen" : "Ausweis");

export const CLOSED_ORG_PUSH_BODY = "Du hast einen Ausweis erhalten. Öffne die App, um ihn anzusehen.";

export function invitePush(type: TypeRow, orgName: string | null, membersMayBePublic: boolean): { title: string; body: string } {
  const title = type.kind === "badge" ? "Neues Abzeichen" : "Neuer Ausweis";
  if (!membersMayBePublic) return { title, body: CLOSED_ORG_PUSH_BODY };
  return { title, body: orgName ? `${orgName}: ${type.name}` : type.name };
}

export function inviteMail(p: { to: string; type: TypeRow; orgName: string | null; membersMayBePublic: boolean; url: string }): OutgoingMail {
  const what = noun(p.type);
  const open = p.membersMayBePublic;
  const intro = !open
    ? `Du hast einen ${what} in der Röbel App erhalten.`
    : p.orgName
      ? `${p.orgName} hat dir einen ${what} ausgestellt: ${p.type.name}.`
      : `Du hast einen ${what} erhalten: ${p.type.name}.`;
  return {
    to: p.to,
    // A closed org's mail names neither org nor type, like its push.
    subject: open ? `Dein ${what}: ${p.type.name}` : `Dein ${what}`,
    text: [
      "Hallo,",
      "",
      intro,
      "",
      "So holst du ihn ab: Öffne diesen Link auf deinem Telefon.",
      p.url,
      "",
      "Der Link ist persönlich. Wer ihn hat, kann den Ausweis abholen – bitte gib ihn nicht weiter.",
      "",
      "Ist die Röbel App noch nicht installiert, führt dich der Link zum Herunterladen.",
      "",
      "Deine E-Mail-Adresse haben wir nur für diese eine Nachricht verwendet und danach gelöscht.",
      "",
      "Deine Röbel App",
    ].join("\n"),
  };
}

async function sendOne(
  d: DeliveryDeps,
  i: InvitationRow,
  ctx: { type: TypeRow; orgName: string | null; open: boolean },
): Promise<"pushed" | "mailed" | "linkOnly" | "pushFailed" | "skipped"> {
  const nowIso = new Date(d.now()).toISOString();

  if (i.leafKind === "claim_key" && i.contactEmail) {
    if (!d.mailer) return "skipped"; // stays prepared until a mailer is configured
    // Take it first: whoever wins the compare-and-set is the only one who mails.
    if (!(await d.store.updateInvitation(i.id, { status: "invited", invitedAt: nowIso }, { statuses: ["prepared"] }))) return "skipped";
    try {
      if (!i.tokenEnc) throw new Error("claim-key invitation without a link token");
      const url = inviteUrl(openSecret(i.tokenEnc, `invitation:${i.id}:token`));
      await d.mailer.send(inviteMail({ to: i.contactEmail, type: ctx.type, orgName: ctx.orgName, membersMayBePublic: ctx.open, url }));
    } catch (err) {
      // Hand it back with the address so the next sweep retries; never log the address.
      await d.store.updateInvitation(i.id, { status: "prepared", invitedAt: null }, { statuses: ["invited"] });
      console.error("[credentials/delivery] mail failed", i.id, err instanceof Error ? err.name : "error");
      return "skipped";
    }
    await d.store.updateInvitation(i.id, { contactEmail: null, emailSentAt: nowIso });
    return "mailed";
  }

  if (!(await d.store.updateInvitation(i.id, { status: "invited", invitedAt: nowIso }, { statuses: ["prepared"] }))) return "skipped";
  if (i.leafKind === "account" && i.recipientWallet) {
    const { title, body } = invitePush(ctx.type, ctx.orgName, ctx.open);
    try {
      await d.notify.push({ wallets: [i.recipientWallet], type: "credential_invite", title, body, data: { type: "credential_invite", invitationId: i.id } });
      return "pushed";
    } catch (err) {
      // Best effort: the invitation is in the app's list either way.
      console.error("[credentials/delivery] push failed", i.id, err instanceof Error ? err.message : "error");
      return "pushFailed";
    }
  }
  return "linkOnly";
}

/** Sends every `prepared` invitation of an on-chain batch. Safe to call again and concurrently. */
export async function deliverInvitations(d: DeliveryDeps, batchRowId: string): Promise<{ pushed: number; mailed: number; linkOnly: number }> {
  const out = { pushed: 0, mailed: 0, linkOnly: 0 };
  const batch = await d.store.getBatch(batchRowId);
  if (!batch || batch.status !== "onchain") return out;
  const type = await d.store.getType(batch.typeId);
  if (!type) return out;
  const account = type.accountId ? await d.store.getAccount(type.accountId) : null;
  const ctx = { type, orgName: account?.name || null, open: account ? membersMayBePublic(account) : true };

  const pending = await d.store.listInvitations({ batchId: batch.id, statuses: ["prepared"] });
  for (const i of pending) {
    const r = await sendOne(d, i, ctx);
    if (r === "pushed") out.pushed++;
    else if (r === "mailed") out.mailed++;
    else if (r === "linkOnly") out.linkOnly++;
  }
  return out;
}

/** The `letters` route action: a PDF with one page per open link of the batch. Owner or admin. */
export async function prepareLetters(
  d: { store: CredentialStore; now: () => number },
  c: Caller,
  p: { accountId: string; batchId: string },
  render: RenderLetters,
): Promise<Result<Buffer>> {
  const o = await orgContextFor(d.store, p?.accountId, c.wallet);
  if ("error" in o) {
    return o.error === "FORBIDDEN"
      ? fail(403, "FORBIDDEN", "Dafür brauchst du die Rolle Inhaber:in oder Admin dieser Organisation.")
      : fail(404, "NOT_FOUND", "Organisation nicht gefunden.");
  }
  if (typeof p.batchId !== "string" || !UUID.test(p.batchId)) return fail(400, "BAD_REQUEST", "batchId fehlt.");
  const batch = await d.store.getBatch(p.batchId);
  const type = batch ? await d.store.getType(batch.typeId) : null;
  if (!batch || !type || type.accountId !== o.accountId) return fail(404, "NOT_FOUND", "Diese Ausgabe gibt es nicht.");
  if (batch.status !== "onchain") return fail(409, "BATCH_NOT_ON_CHAIN", "Diese Ausgabe ist noch nicht bestätigt.");

  const nowSec = BigInt(Math.floor(d.now() / 1000));
  const open = (await d.store.listInvitations({ batchId: batch.id, statuses: ["invited"] })).filter((i) => {
    const v = BigInt(i.validUntil);
    return i.leafKind === "claim_key" && i.tokenEnc !== null && i.recipientWallet === null && (v === 0n || v >= nowSec);
  });
  if (open.length === 0) return fail(409, "NO_OPEN_LINKS", "In dieser Ausgabe gibt es keine offenen Links.");
  const rows = open.map((i) => ({ displayName: printableName(i.displayName), url: inviteUrl(openSecret(i.tokenEnc as string, `invitation:${i.id}:token`)) }));
  return { ok: true, data: await render(rows, { orgName: o.name, typeName: type.name }) };
}
