/**
 * Turns one on-device restore report (lib/wallet-restore.ts) into readable German text for the
 * Settings → Anmelde-Protokoll screen, used by the store-build update test (spec 5.9,
 * docs/STORE_BUILD_UPDATE_TEST.md).
 *
 * Pure. The output never contains a wallet address, a key or a URL query string: error messages
 * are scrubbed before they are cut to ERROR_MAX characters.
 */
import type { RestoreReport } from './wallet-restore';

export const ERROR_MAX = 120;

const OWNER_LABELS: Record<NonNullable<RestoreReport['owner']>, string> = {
  passkey: 'Passkey',
  words: '12 Wörter',
  thirdweb: 'Google, Apple oder E-Mail',
};

const OUTCOME_LABELS: Record<RestoreReport['outcome'], string> = {
  restored: 'wiederhergestellt',
  'restored-late': 'später wiederhergestellt',
  failed: 'fehlgeschlagen',
  'no-session': 'keine Anmeldung gespeichert',
  cancelled: 'abgebrochen',
};

/** Removes URL query strings and anything hex-shaped of address length or longer (addresses, keys). */
function scrub(message: string): string {
  return message
    .replace(/\?[^\s]*/g, '')
    .replace(/0x[0-9a-fA-F]{40,}/g, '0x…')
    .replace(/\b[0-9a-fA-F]{40,}\b/g, '…');
}

function formatDate(at: unknown): string {
  const d = typeof at === 'string' ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('de-DE') : 'Datum unbekannt';
}

export function formatRestoreReport(r: RestoreReport): { title: string; lines: string[] } {
  const owner = OWNER_LABELS[r.owner as keyof typeof OWNER_LABELS] ?? OWNER_LABELS.thirdweb;
  const outcome = OUTCOME_LABELS[r.outcome] ?? String(r.outcome);
  const title = `${formatDate(r.at)} · ${owner} · ${outcome}`;

  const lines: string[] = [];
  if (r.appVersion) lines.push(`App-Version ${r.appVersion}`);
  if (typeof r.embeddedLaunch === 'boolean') lines.push(r.embeddedLaunch ? 'Store-Version' : 'Update');
  if (typeof r.attempts === 'number') lines.push(`Versuche: ${r.attempts}`);
  for (const e of Array.isArray(r.errors) ? r.errors : []) {
    lines.push(scrub(String(e)).trim().slice(0, ERROR_MAX));
  }
  return { title, lines };
}
