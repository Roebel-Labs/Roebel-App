/**
 * Identity gating for version-2 mini apps (MiniAppHost).
 *
 * - The gate: identity-bearing bridge calls (`context.get`, `wallet.*`, `auth.*`, `credentials.*`)
 *   wait until the consent decision is made (or the state could not be loaded). Everything else
 *   is answered at once. Version-1 apps and the dev preview start with a settled gate.
 * - `walletAllowed`: version 1 always has the wallet; version 2 only with the address grant.
 */
import type { MiniApp } from './miniapps';
import type { IdentityState } from './miniapp-identity';

export interface IdentityGate {
  settled: Promise<void>;
  /** Resolve the gate; later calls do nothing. */
  settle(): void;
  isSettled(): boolean;
}

export function createIdentityGate(): IdentityGate {
  let done = false;
  let resolve!: () => void;
  const settled = new Promise<void>((r) => {
    resolve = r;
  });
  return {
    settled,
    settle() {
      if (done) return;
      done = true;
      resolve();
    },
    isSettled: () => done,
  };
}

export function walletAllowed(app: Pick<MiniApp, 'manifestVersion'>, state: IdentityState | null): boolean {
  if (app.manifestVersion !== 2) return true;
  return state?.granted.address === true;
}

/**
 * A reward result as the app may see it: without the wallet (version 2, no address grant) the
 * on-chain `txRef` is dropped, since a lookup of the tx hash would reveal the recipient wallet.
 */
export function rewardForApp<T extends { txRef?: string }>(
  app: Pick<MiniApp, 'manifestVersion'>,
  state: IdentityState | null,
  res: T,
): T {
  if (walletAllowed(app, state) || !('txRef' in res)) return res;
  const { txRef: _txRef, ...rest } = res;
  return rest as T;
}

/** The error a signing call gets when the address is not shared with a version-2 app. */
export const ADDRESS_NOT_GRANTED = {
  code: 'unauthorized',
  message: 'Die Kontoadresse ist für diese Mini-App nicht freigegeben.',
} as const;
