import type { ChatPart } from './types';

type ApprovalPart = Extract<ChatPart, { type: 'approval' }>;

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const ONE = 10n ** 18n;
/** Mirrors the server cap (harness packs/money.ts MAX_TRANSFER). */
export const MAX_CHAT_TRANSFER = 100n * ONE;

export type TransferPlan =
  | { ok: true; to: string; amount: bigint; toName: string; amountLabel: string }
  | { ok: false; error: string };

/**
 * Validates a money approval card's signRequest before the device signs. `parse` is the app's
 * parseTalerAmount (injected so this stays pure). The wallet is only returned for signing,
 * never for display.
 */
export function planMuenzenTransfer(
  part: ApprovalPart,
  parse: (input: string) => bigint,
  available?: bigint,
): TransferPlan {
  const req = part.signRequest;
  if (!req || req.kind !== 'muenzen_transfer' || !req.toWallet || !WALLET_RE.test(req.toWallet)) {
    return { ok: false, error: 'Diese Überweisung ist unvollständig. Bitte frag den Bot erneut.' };
  }
  let amount: bigint;
  try {
    amount = parse(req.amount);
  } catch {
    amount = 0n;
  }
  if (amount <= 0n) return { ok: false, error: 'Der Betrag ist ungültig.' };
  if (amount > MAX_CHAT_TRANSFER) return { ok: false, error: 'Über den Chat gehen höchstens 100 Röbel Münzen.' };
  if (available !== undefined && amount > available) return { ok: false, error: 'Nicht genug Röbel Münzen.' };
  return { ok: true, to: req.toWallet, amount, toName: req.toName, amountLabel: req.amount };
}

/** German, wallet-free error text for a failed on-device transfer (also sent to /complete). */
export function transferErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/reject|denied|cancel|abgebrochen/i.test(raw)) return 'Auf dem Gerät abgebrochen.';
  if (/insufficient|balance|nicht genug/i.test(raw)) return 'Nicht genug Röbel Münzen.';
  if (/Gnosis-Konto/i.test(raw)) return 'Dein Konto ist noch nicht bereit. Versuch es gleich noch einmal.';
  return 'Die Überweisung ist fehlgeschlagen.';
}
