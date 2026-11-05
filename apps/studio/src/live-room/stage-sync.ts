// Pure decision: should a change of the studio's current Tabelle row move the app's "Jetzt auf der Fläche"?

export type StageDecision = { kind: 'none' } | { kind: 'unmapped'; rowId: string } | { kind: 'send'; rowId: string; itemId: string };

export function decideOnStage(input: {
  auto: boolean;
  connected: boolean;
  currentRowId: string | null;
  /** The row this decision was last made for; the same row never triggers twice. */
  lastHandledRowId: string | null;
  appCurrentItemId: string | null;
  resolveItem: (rowId: string) => string | null;
}): StageDecision {
  const { auto, connected, currentRowId, lastHandledRowId, appCurrentItemId, resolveItem } = input;
  if (!auto || !connected || currentRowId === null || currentRowId === lastHandledRowId) return { kind: 'none' };
  const itemId = resolveItem(currentRowId);
  if (!itemId) return { kind: 'unmapped', rowId: currentRowId };
  if (itemId === appCurrentItemId) return { kind: 'none' };
  return { kind: 'send', rowId: currentRowId, itemId };
}

/** The studio's live-ness → the app show status it implies (`null` = leave the app alone). */
export function followOnAir(prevOn: boolean | null, on: boolean, appStatus: string | null): 'live' | 'ask-end' | null {
  if (prevOn === on) return null;
  if (on) return appStatus === 'live' ? null : 'live';
  // Turning off never ends the app show by itself (a restart would kill the replay); the operator confirms.
  return prevOn === true && appStatus === 'live' ? 'ask-end' : null;
}
