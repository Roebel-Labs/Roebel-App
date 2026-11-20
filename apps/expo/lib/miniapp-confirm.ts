/**
 * What the mini-app confirm sheet says.
 *
 * Every row is built from decoded calls and the labels a version-2 manifest declared
 * (`MiniApp.contracts`, matched with the SDK's one shared rule `findDeclaredCall`). Röbel's own
 * contracts are named by a fixed label; a plain transfer names the recipient through the
 * host-supplied `names` lookup. No row, warning or raw preview ever contains a wallet address:
 * an address the lookup cannot name becomes "Unbekanntes Konto" / "Unbekannter Vertrag".
 */
import { toFunctionSelector } from 'viem';
import { callRules, findDeclaredCall, type DeclaredContract } from '@netizen-labs/miniapp-sdk/host';
import {
  attesterNFTGnosisAddress,
  circlesHubAddress,
  citizenNFTGnosisAddress,
  orgRegistryGnosisAddress,
} from '@/constants/gnosis';
import { maciAddress } from '@/constants/thirdweb';
import type { WalletConfirmRequest } from '@/components/miniapp/WalletConfirmSheet';
import type { MiniApp } from '@/lib/miniapps';

export interface CallView {
  contract: string;
  action: string;
  amount?: string;
  declared: boolean;
}

/** Display name for an address (a person or an org), or null when unknown. */
export type NameLookup = (address: string) => string | null;

export type ConfirmApp = Pick<MiniApp, 'name' | 'contracts'> & { manifestVersion?: 1 | 2 };

/** Röbel's own contracts (lowercased address → label). A manifest may not declare these. */
export const KNOWN_CONTRACT_LABELS: Record<string, string> = Object.fromEntries(
  (
    [
      [circlesHubAddress, 'Röbel Münzen'],
      [citizenNFTGnosisAddress, 'Bürgerregister'],
      [attesterNFTGnosisAddress, 'Bescheiniger-Register'],
      [maciAddress, 'Abstimmung'],
      [orgRegistryGnosisAddress, 'Vereinsregister'],
    ] as const
  )
    .filter(([a]) => typeof a === 'string' && a.length > 0)
    .map(([a, label]) => [a.toLowerCase(), label]),
);

const WARNING_UNDECLARED = 'Diese Aktion hat die Mini-App nicht angemeldet. Bestätige nur, wenn du ihr vertraust.';
const WARNING_V1 = 'Prüfe genau, was du bestätigst.';

const ADDRESS_IN_TEXT = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;

function rulesOf(app: Pick<MiniApp, 'contracts'>) {
  return callRules((app.contracts ?? []) as DeclaredContract[], (sig) => toFunctionSelector(sig));
}

function toBigIntSafe(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === 'string' && v.length) {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/** Format a wei amount as a short xDAI number ("1", "0.25"). */
export function formatWei(wei: bigint): string {
  if (wei === 0n) return '0';
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
  if (whole === 0n && !frac) return '< 0.0001';
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Replace every address in free text by its name, else a neutral word. */
function redactAddresses(text: string, names: NameLookup): string {
  return text.replace(ADDRESS_IN_TEXT, (a) => names(a) ?? KNOWN_CONTRACT_LABELS[a.toLowerCase()] ?? 'ein Konto');
}

/** Decode a hex payload as UTF-8 text when it is readable; otherwise return it unchanged. */
export function decodeUtf8Maybe(hexOrText: unknown): string {
  if (typeof hexOrText !== 'string') return String(hexOrText ?? '');
  if (!/^0x([0-9a-fA-F]{2})*$/.test(hexOrText)) return hexOrText;
  try {
    const escaped = (hexOrText.slice(2).match(/.{2}/g) ?? []).map((b) => `%${b}`).join('');
    const decoded = decodeURIComponent(escaped);
    // Readable: printable characters plus tab and line breaks only.
    if (!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(decoded)) return decoded;
  } catch {
    /* not UTF-8 */
  }
  return hexOrText;
}

export function describeCall(
  app: Pick<MiniApp, 'contracts'>,
  call: { to?: string; data?: string; value?: string },
  names: NameLookup,
): CallView {
  const value = toBigIntSafe(call.value);
  const amount = value > 0n ? { amount: formatWei(value) } : {};
  const hasData = typeof call.data === 'string' && call.data !== '0x' && call.data !== '';

  const match = findDeclaredCall(rulesOf(app), call.to, call.data);
  if (match) return { contract: match.label, action: match.name, ...amount, declared: true };

  const known = call.to ? KNOWN_CONTRACT_LABELS[call.to.toLowerCase()] : undefined;
  if (known) return { contract: known, action: 'Vertrags-Aufruf', ...amount, declared: false };

  if (!hasData) {
    return {
      contract: (call.to && names(call.to)) || 'Unbekanntes Konto',
      action: 'Überweisung',
      ...amount,
      declared: false,
    };
  }
  return { contract: 'Unbekannter Vertrag', action: 'Unbekannte Funktion', ...amount, declared: false };
}

export function buildTransactionConfirm(
  app: ConfirmApp,
  calls: { to?: string; data?: string; value?: string }[],
  names: NameLookup,
): WalletConfirmRequest {
  const views = calls.map((c) => describeCall(app, c, names));
  const many = views.length > 1;
  const rows: WalletConfirmRequest['rows'] = [];
  views.forEach((v, i) => {
    const p = many ? `${i + 1}. ` : '';
    rows.push({ label: `${p}Vertrag`, value: v.contract });
    rows.push({ label: `${p}Aktion`, value: v.action });
    if (v.amount) rows.push({ label: `${p}Betrag`, value: `${v.amount} xDAI` });
  });
  const anyUndeclared = views.some((v) => !v.declared);
  const warning = anyUndeclared ? (app.manifestVersion === 2 ? WARNING_UNDECLARED : WARNING_V1) : undefined;
  return {
    kind: 'transaction',
    title: many ? `${views.length} Aktionen bestätigen` : 'Transaktion bestätigen',
    appName: app.name,
    rows,
    ...(warning ? { warning } : {}),
    cta: views.some((v) => v.amount) ? 'Bezahlen' : 'Bestätigen',
  };
}

/** `eth_signTypedData*`: params are `[address, typedData]` (string or object). */
export function buildTypedDataConfirm(app: ConfirmApp, params: unknown[], names: NameLookup): WalletConfirmRequest {
  const typed = params[1] ?? params[0];
  let obj: { primaryType?: unknown; domain?: { name?: unknown; verifyingContract?: unknown } } | null = null;
  try {
    obj = typeof typed === 'string' ? JSON.parse(typed) : (typed as typeof obj);
  } catch {
    obj = null;
  }
  const rows: WalletConfirmRequest['rows'] = [
    { label: 'Inhalt', value: typeof obj?.primaryType === 'string' ? obj.primaryType : 'Strukturierte Daten' },
  ];
  const vc = obj?.domain?.verifyingContract;
  let forLabel: string | null = null;
  if (typeof vc === 'string') {
    const rule = rulesOf(app).find((r) => r.address === vc.toLowerCase());
    forLabel = rule?.label ?? KNOWN_CONTRACT_LABELS[vc.toLowerCase()] ?? null;
  }
  if (!forLabel && typeof obj?.domain?.name === 'string' && obj.domain.name.trim()) {
    forLabel = redactAddresses(obj.domain.name.trim(), names);
  }
  if (forLabel) rows.push({ label: 'Für', value: forLabel });

  let raw: string | undefined;
  try {
    raw = typeof typed === 'string' ? typed : JSON.stringify(typed, null, 2);
  } catch {
    raw = undefined;
  }
  return {
    kind: 'typed_data',
    title: 'Daten signieren',
    appName: app.name,
    rows,
    raw: raw ? redactAddresses(raw, names) : undefined,
    warning: typeof vc === 'string' && !forLabel ? WARNING_V1 : undefined,
  };
}

/** `personal_sign` / `eth_sign`: the decoded text, addresses replaced by names. */
export function buildMessageConfirm(app: ConfirmApp, message: unknown, names: NameLookup): WalletConfirmRequest {
  return {
    kind: 'personal_sign',
    title: 'Nachricht signieren',
    appName: app.name,
    rows: [{ label: 'Nachricht', value: redactAddresses(decodeUtf8Maybe(message), names) }],
  };
}
