// Routine helpers for the chat UI (spec §5 phase 2). Mirrors formatSchedule in
// apps/web/src/lib/chat/schedule.ts — keep the labels identical.
import type { RoutineSchedule } from './api';

const WEEKDAY_PLURAL = ['Sonntags', 'Montags', 'Dienstags', 'Mittwochs', 'Donnerstags', 'Freitags', 'Samstags'];

/** "Sonntags · 08:41" / "Täglich · 07:30". */
export function formatSchedule(schedule: RoutineSchedule): string {
  const hh = String(schedule.hour).padStart(2, '0');
  const mm = String(schedule.minute).padStart(2, '0');
  const day = schedule.kind === 'weekly' ? WEEKDAY_PLURAL[schedule.weekday ?? 0] ?? 'Wöchentlich' : 'Täglich';
  return `${day} · ${hh}:${mm}`;
}
