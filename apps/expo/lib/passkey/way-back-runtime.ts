/**
 * Wires the way-back rule to the chain, SecureStore and the surface gate. Loaded only by
 * way-back.ts `checkWayBack`, and only for a passkey session on an independent identity: it pulls
 * in guardians-runtime (native passkey modules), which a thirdweb login must never load.
 */
import { isPasskeySurfaceAllowed } from './gate';
import { readGuardianState, recoveryStorage } from './guardians-runtime';
import type { WayBackRuntime } from './way-back';
import { loadWordsPool } from './words-guardians';
import { phraseStore } from './phrase-store-runtime';

export const wayBackRuntime: WayBackRuntime = {
  readState: readGuardianState,
  loadPool: () => loadWordsPool(recoveryStorage),
  wordsSurfaceOpen: () => isPasskeySurfaceAllowed('words'),
  phraseConfirmed: () => phraseStore.isConfirmed(),
  backupFileExported: () => phraseStore.isBackupExported(),
};
