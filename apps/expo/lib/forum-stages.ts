import type { ForumStage } from './types/feed';

/** UI labels for the NSP-12 stage vocabulary. */
export const STAGE_LABELS: Record<ForumStage, string> = {
  idee: 'Idee',
  entwurf: 'Entwurf',
  diskussion: 'Diskussion',
  meinungsbild: 'Meinungsbild',
  beschlussvorlage: 'Beschlussvorlage',
  beschlossen: 'Beschlossen',
  abgelehnt: 'Abgelehnt',
  umgesetzt: 'Umgesetzt',
  ruhend: 'Ruhend',
  zurueckgezogen: 'Zurückgezogen',
};

/** The four steps the stepper draws for a Bürgerrat recommendation. */
export const STEPPER_STAGES: readonly ForumStage[] = [
  'diskussion',
  'beschlussvorlage',
  'beschlossen',
  'umgesetzt',
];

export const TERMINAL_STAGES: readonly ForumStage[] = ['abgelehnt', 'ruhend', 'zurueckgezogen'];

/** Stages that are not steps themselves: the index of the last step they sit after. */
const BETWEEN_STEPS: Partial<Record<ForumStage, number>> = {
  idee: -1,
  entwurf: -1,
  meinungsbild: 0,
};

export type StepperState =
  | { kind: 'steps'; current: number }
  | { kind: 'terminal'; stage: ForumStage }
  | { kind: 'none' };

export function stepperState(stage: ForumStage | null | undefined): StepperState {
  if (!stage) return { kind: 'none' };
  if (TERMINAL_STAGES.includes(stage)) return { kind: 'terminal', stage };
  const idx = STEPPER_STAGES.indexOf(stage);
  if (idx >= 0) return { kind: 'steps', current: idx };
  return { kind: 'steps', current: BETWEEN_STEPS[stage] ?? -1 };
}

/** dd.mm.yyyy in the device's local time. */
export function formatStageDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
