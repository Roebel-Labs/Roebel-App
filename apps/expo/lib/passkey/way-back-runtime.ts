/** Wires the way-back rule to the chain, SecureStore and the surface gate. */
import { isPasskeySurfaceAllowed } from './gate';
import { readGuardianState, recoveryStorage } from './guardians-runtime';
import { fastestWayBack, readWayBack, type AccountKind } from './way-back';
import { loadWordsPool } from './words-guardians';

export type WayBackCheck = { ok: boolean | null; kind: AccountKind; option: { label: string; route: string } };

/** `ok: true` = go on, `false` = show the sheet (with `option` as the primary button), `null` = read failed. */
export async function checkWayBack(account: unknown): Promise<WayBackCheck> {
  const r = await readWayBack(account, {
    readState: readGuardianState,
    loadPool: () => loadWordsPool(recoveryStorage),
  });
  // Only look at the gate when the sheet can show up.
  const wordsOpen = r.ok === false ? await isPasskeySurfaceAllowed('words').catch(() => false) : false;
  return { ok: r.ok, kind: r.kind, option: fastestWayBack(r.kind, wordsOpen) };
}
