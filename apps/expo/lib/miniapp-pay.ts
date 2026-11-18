/**
 * `roebel.pay` — a mini app asks the person to send Röbel Münzen to an account that exists in
 * Röbel (a person or an org). Pure parts live here (checked by tests); the host wires the
 * name lookups, the balance read, the confirm sheet and the transfer.
 *
 * The memo is shown on the sheet and nowhere else: it is not written on chain, not logged and
 * not sent to anyone. The only telemetry is `track('pay', { amount })` in the host.
 */
import type { WalletConfirmRequest } from '@/components/miniapp/WalletConfirmSheet';

export const PAY_LIMITS = { maxAmount: 10_000, maxMemo: 80 } as const;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export interface PayRequest {
  to: string;
  amount: number;
  memo?: string;
}

const invalid = (message: string) => ({ code: 'invalid_params' as const, message });

/** Validates the app's params; throws `invalid_params` with a German message. */
export function parsePay(p: unknown): PayRequest {
  if (!p || typeof p !== 'object') throw invalid('Zahlung braucht Empfänger und Betrag.');
  const { to, amount, memo } = p as { to?: unknown; amount?: unknown; memo?: unknown };
  if (typeof to !== 'string' || !ADDRESS.test(to)) throw invalid('Der Empfänger ist keine gültige Adresse.');
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw invalid('Der Betrag muss größer als 0 sein.');
  }
  if (amount > PAY_LIMITS.maxAmount) throw invalid(`Höchstens ${PAY_LIMITS.maxAmount} Röbel Münzen pro Zahlung.`);
  if (Number(amount.toFixed(2)) !== amount) throw invalid('Der Betrag hat höchstens zwei Nachkommastellen.');
  if (memo !== undefined && typeof memo !== 'string') throw invalid('Der Verwendungszweck muss Text sein.');
  const text = memo?.trim() ?? '';
  if (text.length > PAY_LIMITS.maxMemo) {
    throw invalid(`Der Verwendungszweck hat höchstens ${PAY_LIMITS.maxMemo} Zeichen.`);
  }
  return text ? { to, amount, memo: text } : { to, amount };
}

/** A validated amount (at most 2 decimals) in 18-decimal token units, without float noise. */
export function talerUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 100)) * 10n ** 16n;
}

/** German display: whole numbers as they are, otherwise two decimals with a comma. */
function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace('.', ',');
}

export function buildPayConfirm(
  appName: string,
  p: { recipientName: string; amount: number; memo?: string },
): WalletConfirmRequest {
  const rows: WalletConfirmRequest['rows'] = [
    { label: 'An', value: p.recipientName },
    { label: 'Betrag', value: `${formatAmount(p.amount)} Röbel Münzen` },
  ];
  if (p.memo) rows.push({ label: 'Verwendungszweck', value: p.memo });
  return { kind: 'transaction', title: 'Röbel Münzen senden', appName, rows, cta: 'Bezahlen' };
}

export interface PayDeps {
  /** The sending account (the one the host signs with). */
  self: string;
  /** Display name of a person's account, null when unknown. */
  personName: (address: string) => Promise<string | null>;
  /** Display name of an org account (its Safe), null when unknown. */
  orgName: (address: string) => Promise<string | null>;
  /** Röbel Münzen balance of `self` in 18-decimal units. */
  balance: (address: string) => Promise<bigint>;
}

export interface PreparedPay extends PayRequest {
  units: bigint;
  recipientName: string;
}

/** Everything checked before the sheet: params, a known recipient, not yourself, enough balance. */
export async function preparePay(p: unknown, deps: PayDeps): Promise<PreparedPay> {
  const req = parsePay(p);
  if (req.to.toLowerCase() === deps.self.toLowerCase()) throw invalid('Du kannst dir nicht selbst Röbel Münzen senden.');
  const recipientName = (await deps.personName(req.to)) ?? (await deps.orgName(req.to));
  if (!recipientName) throw invalid('Der Empfänger ist in Röbel nicht bekannt.');
  const units = talerUnits(req.amount);
  let balance: bigint;
  try {
    balance = await deps.balance(deps.self);
  } catch {
    throw { code: 'internal', message: 'Das Guthaben ließ sich gerade nicht lesen.' };
  }
  if (balance < units) throw invalid('Dein Guthaben reicht dafür nicht.');
  return { ...req, units, recipientName };
}
