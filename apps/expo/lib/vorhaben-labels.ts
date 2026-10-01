// Pure labels and small decisions for the proposal lifecycle UI (German copy).
export type Stage = 'abstimmung' | 'auszaehlung' | 'angenommen' | 'abgelehnt' | 'in_umsetzung' | 'umgesetzt';
export type TaskStatus = 'offen' | 'vergeben' | 'in_arbeit' | 'eingereicht' | 'abgenommen' | 'ausgezahlt' | 'abgebrochen';
export type LineStatus = 'geplant' | 'sendend' | 'vorgeschlagen' | 'gesendet' | 'bestaetigt' | 'unklar' | 'fehlgeschlagen';
export type Asset = 'EURe' | 'EURC' | 'MUENZEN' | 'XDAI';

export const STAGE_STEPS: Stage[] = ['abstimmung', 'auszaehlung', 'angenommen', 'in_umsetzung', 'umgesetzt'];
export const STAGE_LABELS: Record<Stage, string> = {
  abstimmung: 'Abstimmung', auszaehlung: 'Auszählung', angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt', in_umsetzung: 'In Umsetzung', umgesetzt: 'Umgesetzt',
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
  if (asset === 'EURe' || asset === 'EURC') return `${de(n, 2, 2)} €`;
  if (asset === 'MUENZEN') return `${de(n, 0, 2)} Röbel Münzen`;
  return `${de(n, 0, 4)} xDAI`;
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
