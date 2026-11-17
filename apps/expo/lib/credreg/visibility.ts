/**
 * Switching one of your own credentials from public to private: one `renounce` on the register
 * (sponsored, one confirmation). The proof stays valid; the earlier public record stays in the
 * register's history. Public again is `makePublic` (accept flow).
 */
import type { Account } from 'thirdweb/wallets';
import { renounceCall } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import { sendOrgCalls } from '@/lib/org-safe/send';
import { REGISTRY } from './chain';
import { credentialsConfigured } from './gate';

type Send = (account: Account, calls: readonly { to: `0x${string}`; data: Hex }[]) => Promise<void>;

export type VisibilityResult = { ok: true } | { ok: false; message: string };

const FAILED = 'Das hat nicht geklappt. Bitte versuche es noch einmal.';

export async function makePrivate(
  account: Account,
  card: { typeId?: Hex; state: 'valid' | 'expired' },
  deps: { send: Send } = { send: sendOrgCalls },
): Promise<VisibilityResult> {
  if (!card.typeId || !credentialsConfigured()) return { ok: false, message: FAILED };
  if (card.state === 'expired') return { ok: false, message: 'Dieser Ausweis ist abgelaufen.' };
  try {
    await deps.send(account, [renounceCall(REGISTRY, card.typeId)]);
    return { ok: true };
  } catch {
    // The error may carry addresses or call data: never shown.
    return { ok: false, message: FAILED };
  }
}
