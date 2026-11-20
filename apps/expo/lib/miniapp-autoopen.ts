/**
 * Mini apps opened from the home-screen widget (roebel://mini-app/<slug>?open=1) skip the
 * store page and launch the host directly — but only once the Röbel account has
 * reconnected, so identity grant + user token resolve for the right account on a cold start.
 */
import type { OpenDecision } from './miniapp-open';

export type WalletStatus = 'connecting' | 'connected' | 'disconnected' | 'unknown';

/** How long a cold start waits for the wallet before opening anyway (logged-out path). */
export const AUTO_OPEN_WALLET_TIMEOUT_MS = 6000;

export function shouldAutoOpen(p: {
  openParam: string | string[] | undefined;
  decision: OpenDecision;
  walletStatus: WalletStatus;
  timedOut: boolean;
}): boolean {
  if (p.openParam !== '1' || p.decision !== 'open') return false;
  if (p.walletStatus === 'connected' || p.walletStatus === 'disconnected') return true;
  return p.timedOut;
}
