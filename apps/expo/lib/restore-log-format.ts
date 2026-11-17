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

/**
 * Removes anything that could identify the account or unlock it: tokens (JWT, Bearer), URL query
 * strings, addresses and keys (full, truncated with an ellipsis, split into groups, any case) and
 * runs of 12+ short lowercase words (a possible recovery phrase). Errs on removing.
 */
function scrub(message: string): string {
  return message
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '…')
    .replace(/Bearer\s+\S+/gi, 'Bearer …')
    .replace(/\?[^\s]*/g, '')
    .replace(/0x[0-9a-f]{4,}(?:…|\.{2,3})[0-9a-f]{0,}/gi, '0x…')
    .replace(/0x[0-9a-f]{8,}(?:[\s:-]+[0-9a-f]{4,})*/gi, '0x…')
    .replace(/[0-9a-f]{40,}/gi, '…')
    .replace(/\b(?:[a-z]{3,8}\s+){11,}[a-z]{3,8}\b/g, '…');
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
