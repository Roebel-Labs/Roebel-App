// Invitation delivery for the credential register, run once a batch is on chain: a push for app
// accounts, one e-mail for contacts with an address (the address is erased right after), nothing
// for the rest (they get the link page, a QR code or a printed letter). Plus the `letters` route
// action, which opens the link tokens of a batch for printing.
//
// Exactly once per invitation: each one is taken with a compare-and-set prepared → invited before
// anything is sent, so the sync and a recovery sweep running together never send twice. A failed
// mail hands the invitation back (invited → prepared, address kept) so the next sweep retries it.
//
// Every mail invitation reaches a terminal state: after MAX_MAIL_ATTEMPTS started sends, or right
// away when no mailer is configured, it falls back to link-only (invited, address erased) so the
// organiser can print a letter. A sender that died between the take and the send (or before the
// erase) leaves an invited row with its address; `recoverInterruptedMails` hands it back after
// INTERRUPTED_MAIL_AFTER_MS. At most MAX_MAILS_PER_RUN mails per run keep the cron in its time.
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
  /** null when no mail provider is configured: contacts with an address fall back to link-only. */
  mailer: Mailer | null;
  now: () => number;
  /**
   * Mails this run may still start, shared by every deliverInvitations call that gets the same
   * object (one cron run). Without it each call gets its own MAX_MAILS_PER_RUN.
   */
  mailBudget?: { left: number };
};

/** Started sends before a mail invitation falls back to link-only. */
export const MAX_MAIL_ATTEMPTS = 3;
/** Mails per run (one cron run, or one call without a shared budget); the rest wait for the next run. */
export const MAX_MAILS_PER_RUN = 50;
/** A mail taken this long ago and neither sent nor erased counts as interrupted. */
export const INTERRUPTED_MAIL_AFTER_MS = 10 * 60_000;

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

/** Article forms per noun: der Ausweis (masc.), das Abzeichen (neut.). */
function words(type: TypeRow) {
  return type.kind === "badge"
    ? { noun: "Abzeichen", a: "ein Abzeichen", the: "das Abzeichen", it: "es" }
    : { noun: "Ausweis", a: "einen Ausweis", the: "den Ausweis", it: "ihn" };
}

export const CLOSED_ORG_PUSH_BODY = "Du hast einen Ausweis erhalten. Öffne die App, um ihn anzusehen.";

export function invitePush(type: TypeRow, orgName: string | null, membersMayBePublic: boolean): { title: string; body: string } {
  const title = type.kind === "badge" ? "Neues Abzeichen" : "Neuer Ausweis";
  if (!membersMayBePublic) return { title, body: CLOSED_ORG_PUSH_BODY };
  return { title, body: orgName ? `${orgName}: ${type.name}` : type.name };
}

export function inviteMail(p: { to: string; type: TypeRow; orgName: string | null; membersMayBePublic: boolean; url: string }): OutgoingMail {
  const w = words(p.type);
  const open = p.membersMayBePublic;
  const intro = !open
    ? `Du hast ${w.a} in der Röbel App erhalten.`
    : p.orgName
      ? `${p.orgName} hat dir ${w.a} ausgestellt: ${p.type.name}.`
      : `Du hast ${w.a} erhalten: ${p.type.name}.`;
  return {
    to: p.to,
    // A closed org's mail names neither org nor type, like its push.
    subject: open ? `Dein ${w.noun}: ${p.type.name}` : `Dein ${w.noun}`,
    text: [
      "Hallo,",
      "",
      intro,
      "",
      `So holst du ${w.it} ab: Öffne diesen Link auf deinem Telefon.`,
      p.url,
      "",
      `Der Link ist persönlich. Wer ihn hat, kann ${w.the} abholen – bitte gib ihn nicht weiter.`,
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
  budget: { left: number },
): Promise<"pushed" | "mailed" | "linkOnly" | "pushFailed" | "skipped"> {
  const nowIso = new Date(d.now()).toISOString();

  if (i.leafKind === "claim_key" && i.contactEmail) {
    if (!d.mailer) {
      // No provider: link-only right away, the address is not kept for a mail that never comes.
      const taken = await d.store.updateInvitation(i.id, { status: "invited", invitedAt: nowIso, contactEmail: null }, { statuses: ["prepared"] });
      if (taken) console.warn("[credentials/delivery] no mailer configured, link only", i.id);
      return taken ? "linkOnly" : "skipped";
    }
    if (budget.left <= 0) return "skipped"; // stays prepared for the next run
    // Take it first: whoever wins the compare-and-set is the only one who mails. The attempt is
    // counted with the take, so a sender that dies here still uses one up.
    const attempts = i.mailAttempts + 1;
    if (!(await d.store.updateInvitation(i.id, { status: "invited", invitedAt: nowIso, mailAttempts: attempts }, { statuses: ["prepared"] }))) {
      return "skipped";
    }
    budget.left--;
    try {
      if (!i.tokenEnc) throw new Error("claim-key invitation without a link token");
      const url = inviteUrl(openSecret(i.tokenEnc, `invitation:${i.id}:token`));
      await d.mailer.send(inviteMail({ to: i.contactEmail, type: ctx.type, orgName: ctx.orgName, membersMayBePublic: ctx.open, url }));
    } catch (err) {
      // Never log the address.
      console.error("[credentials/delivery] mail failed", i.id, attempts, err instanceof Error ? err.name : "error");
      if (attempts >= MAX_MAIL_ATTEMPTS) {
        // Terminal: link-only, the organiser can print a letter.
        await d.store.updateInvitation(i.id, { contactEmail: null }, { statuses: ["invited"] });
        return "linkOnly";
      }
      // Hand it back with the address so the next sweep retries.
      await d.store.updateInvitation(i.id, { status: "prepared", invitedAt: null }, { statuses: ["invited"] });
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
  // Privacy fails closed: a type without an org, or whose account row is gone, names nothing.
  const ctx = { type, orgName: account?.name || null, open: account ? membersMayBePublic(account) : false };
  const budget = d.mailBudget ?? { left: MAX_MAILS_PER_RUN };

  const pending = await d.store.listInvitations({ batchId: batch.id, statuses: ["prepared"] });
  for (const i of pending) {
    const r = await sendOne(d, i, ctx, budget);
    if (r === "pushed") out.pushed++;
    else if (r === "mailed") out.mailed++;
    else if (r === "linkOnly") out.linkOnly++;
  }
  return out;
}

/**
 * Recovery for mails whose sender died between the take and the send, or before the erase: rows
 * taken more than INTERRUPTED_MAIL_AFTER_MS ago go back to prepared (the take already counted the
 * attempt), or to link-only once their attempts are used up. Returns how many rows changed.
 * Run by the sweep before it looks for batches with prepared invitations.
 */
export async function recoverInterruptedMails(store: CredentialStore, nowMs: number): Promise<number> {
  const rows = await store.interruptedMailInvitations(new Date(nowMs - INTERRUPTED_MAIL_AFTER_MS).toISOString());
  let changed = 0;
  for (const i of rows) {
    const patch = i.mailAttempts >= MAX_MAIL_ATTEMPTS ? { contactEmail: null } : { status: "prepared" as const, invitedAt: null };
    if (await store.updateInvitation(i.id, patch, { statuses: ["invited"] })) changed++;
  }
  return changed;
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
