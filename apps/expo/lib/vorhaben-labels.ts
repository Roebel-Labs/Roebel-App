// Pure labels and small decisions for the proposal lifecycle UI (German copy).
export type Stage = 'abstimmung' | 'auszaehlung' | 'angenommen' | 'abgelehnt' | 'in_umsetzung' | 'umgesetzt';
export type TaskStatus = 'offen' | 'vergeben' | 'in_arbeit' | 'eingereicht' | 'abgenommen' | 'ausgezahlt' | 'abgebrochen';
export type LineStatus = 'geplant' | 'sendend' | 'vorgeschlagen' | 'gesendet' | 'bestaetigt' | 'unklar' | 'fehlgeschlagen';
export type Asset = 'EURe' | 'EURC' | 'MUENZEN' | 'XDAI';

export const STAGE_STEPS: Stage[] = ['abstimmung', 'auszaehlung', 'angenommen', 'in_umsetzung', 'umgesetzt'];
export const STAGE_LABELS: Record<Stage, string> = {
  abstimmung: 'Bürgerabstimmung', auszaehlung: 'Auszählung', angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt', in_umsetzung: 'In Umsetzung', umgesetzt: 'Umgesetzt',
};
// Stepper labels with German soft hyphens (U+00AD) at syllable breaks, so narrow
// steps wrap as "Bürger-|abstimmung" instead of mid-syllable or not at all.
// Invisible unless the line actually breaks there.
const SHY = '\u00AD';
export const STAGE_STEPPER_LABELS: Record<Stage, string> = {
  abstimmung: ['Bür', 'ger', 'ab', 'stim', 'mung'].join(SHY),
  auszaehlung: ['Aus', 'zäh', 'lung'].join(SHY),
  angenommen: ['An', 'ge', 'nom', 'men'].join(SHY),
  abgelehnt: ['Ab', 'ge', 'lehnt'].join(SHY),
  in_umsetzung: `In ${['Um', 'set', 'zung'].join(SHY)}`,
  umgesetzt: ['Um', 'ge', 'setzt'].join(SHY),
};
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  offen: 'Offen', vergeben: 'Vergeben', in_arbeit: 'In Arbeit', eingereicht: 'Wartet auf Abnahme',
  abgenommen: 'Abgenommen', ausgezahlt: 'Ausgezahlt', abgebrochen: 'Abgebrochen',
};
export const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  geplant: 'Geplant', sendend: 'Wird gesendet', vorgeschlagen: 'Wartet auf Freigabe', gesendet: 'Gesendet',
  bestaetigt: 'Bestätigt', unklar: 'Wird geprüft', fehlgeschlagen: 'Fehlgeschlagen',
};
export const ROLE_LABELS = { empfaenger: 'Empfänger', aufgabe: 'Aufgabe', wahlhelfer: 'Wahlhelfer:in', plattform: 'Plattform' } as const;

const de = (n: number, min: number, max: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });

export function formatAmount(amount: string | number, asset: Asset): string {
  const n = Number(amount);
  if (asset === 'MUENZEN') return `${de(n, 0, 2)} Röbel Münzen`;
  // EURe, EURC and xDAI all count as euros for the Gemeinschaftskasse (1 xDAI = 1 €); the UI only says €.
  return `${de(n, 2, 2)} €`;
}

export function nextStepFor(task: { status: TaskStatus; assignee_wallet: string | null }, wallet: string): string | null {
  if (!task.assignee_wallet || task.assignee_wallet.toLowerCase() !== wallet.toLowerCase()) return null;
  switch (task.status) {
    case 'vergeben': return 'Aufgabe starten';
    case 'in_arbeit': return 'Fortschritt melden';
    case 'eingereicht': return 'Wartet auf Abnahme';
    case 'abgenommen': return 'Auszahlung läuft';
    default: return null;
  }
}

export function timeLeft(untilIso: string, nowMs: number): string {
  const ms = new Date(untilIso).getTime() - nowMs;
  if (ms <= 0) return 'abgelaufen';
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return days === 1 ? 'noch 1 Tag' : `noch ${days} Tage`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return hours === 1 ? 'noch 1 Stunde' : `noch ${hours} Stunden`;
}

export type BoardTab = 'offen' | 'in_arbeit' | 'erledigt';
export function boardTabFor(status: TaskStatus): BoardTab {
  if (status === 'offen') return 'offen';
  if (status === 'ausgezahlt' || status === 'abgebrochen') return 'erledigt';
  return 'in_arbeit';
}

export function progressOf(statuses: TaskStatus[]): { done: number; total: number } {
  return { done: statuses.filter((s) => s === 'ausgezahlt' || s === 'abgebrochen').length, total: statuses.length };
}

/** "5,50" → "5.50"; null when not a positive amount with at most 2 decimals (server max 9.999.999,99). */
export function parseEuroInput(raw: string): string | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s) || Number(s) <= 0) return null;
  return s;
}

export type ChipTone = 'neutral' | 'info' | 'warning' | 'success' | 'error';
const TASK_TONES: Record<TaskStatus, ChipTone> = {
  offen: 'info', vergeben: 'neutral', in_arbeit: 'neutral', eingereicht: 'warning',
  abgenommen: 'success', ausgezahlt: 'success', abgebrochen: 'error',
};
export function taskTone(status: TaskStatus): ChipTone {
  return TASK_TONES[status] ?? 'neutral';
}

export const FINAL_TASK_STATUSES: TaskStatus[] = ['abgenommen', 'ausgezahlt', 'abgebrochen'];

/** Subtitle for a contract line: what the money is for. */
export function contractPurpose(
  line: { role: keyof typeof ROLE_LABELS; referenceId: string },
  taskTitles: Map<string, string>,
  beneficiary: string,
): string {
  switch (line.role) {
    case 'aufgabe': return taskTitles.get(line.referenceId) || 'Aufgabe';
    case 'wahlhelfer': return 'Bestätigung der Auszählung';
    case 'empfaenger': return beneficiary || 'Empfänger';
    case 'plattform': return 'Plattformanteil';
  }
}

/** Shown for a payout_record_* request that timed out or had no connection (the server is idempotent per line). */
export const PAYOUT_NETWORK_ERROR =
  'Keine Verbindung oder Zeitüberschreitung. Bitte erneut versuchen – bereits Eingetragenes wird nicht doppelt gezählt.';

/** German error for a payout recording; never the raw fetch/abort text of the client. */
export function payoutErrorText(r: { code: string; message: string }): string {
  if (r.code === 'NETWORK_ERROR') return PAYOUT_NETWORK_ERROR;
  if (r.code === 'BAD_RESPONSE') return 'Unerwartete Antwort vom Server. Bitte erneut versuchen.';
  if (r.code === 'SIGN_FAILED') return r.message.startsWith('Signatur') ? r.message : 'Die Signatur ist fehlgeschlagen. Bitte versuche es erneut.';
  return r.message || 'Eintragen fehlgeschlagen. Bitte erneut versuchen.';
}

/**
 * Small proof line under a recorded payout: what the Gemeinschaftskasse really sent and how. The line
 * itself keeps its promised amount ("5,00 €"). null when there is nothing beyond the promise to show.
 */
export function paidProofText(line: {
  amount: string; asset: Asset; paidAsset?: 'EURe' | 'XDAI' | null; paidAmount?: string | null; paymentMethod?: string | null;
}): string | null {
  const parts: string[] = [];
  // Only a different euro amount is worth a note (e.g. a card top-up larger than the budget); the asset never shows.
  if (line.paidAmount && Number(line.paidAmount) !== Number(line.amount)) {
    const n = Number(line.paidAmount);
    parts.push(`bezahlt: ${de(n, 2, 2)} €`);
  }
  if (line.paymentMethod === 'card') parts.push('per Karte');
  return parts.length ? parts.join(' · ') : null;
}
