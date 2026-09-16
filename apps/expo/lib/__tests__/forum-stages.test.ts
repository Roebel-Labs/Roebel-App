import { STAGE_LABELS, STEPPER_STAGES, formatStageDate, stepperState } from '../forum-stages';

describe('stepperState', () => {
  it('maps the four stepper stages to their index', () => {
    expect(stepperState('diskussion')).toEqual({ kind: 'steps', current: 0 });
    expect(stepperState('beschlussvorlage')).toEqual({ kind: 'steps', current: 1 });
    expect(stepperState('umgesetzt')).toEqual({ kind: 'steps', current: 3 });
  });
  it('places pre-stepper stages before the first step and meinungsbild after diskussion', () => {
    expect(stepperState('idee')).toEqual({ kind: 'steps', current: -1 });
    expect(stepperState('entwurf')).toEqual({ kind: 'steps', current: -1 });
    expect(stepperState('meinungsbild')).toEqual({ kind: 'steps', current: 0 });
  });
  it('renders terminal stages as a badge and null as nothing', () => {
    expect(stepperState('abgelehnt')).toEqual({ kind: 'terminal', stage: 'abgelehnt' });
    expect(stepperState('ruhend')).toEqual({ kind: 'terminal', stage: 'ruhend' });
    expect(stepperState(null)).toEqual({ kind: 'none' });
  });
  it('has a German label for every stage and the stepper order is fixed', () => {
    expect(STEPPER_STAGES).toEqual(['diskussion', 'beschlussvorlage', 'beschlossen', 'umgesetzt']);
    expect(STAGE_LABELS.zurueckgezogen).toBe('Zurückgezogen');
    expect(Object.keys(STAGE_LABELS)).toHaveLength(10);
  });
});

describe('formatStageDate', () => {
  it('formats dd.mm.yyyy', () => {
    expect(formatStageDate('2026-09-15T16:00:00Z')).toBe('15.09.2026');
  });
});
