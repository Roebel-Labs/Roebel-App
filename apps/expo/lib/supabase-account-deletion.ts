import Constants from 'expo-constants';
import type { Account } from 'thirdweb/wallets';

type Extra = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
const extra = (Constants.expoConfig?.extra ?? (Constants.manifest as any)?.extra) as
  | Extra
  | undefined;

const SUPABASE_URL = extra?.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = extra?.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export type DeleteAccountErrorCode =
  | 'BAD_REQUEST'
  | 'NO_WALLET'
  | 'BAD_SIGNATURE'
  | 'STALE_MESSAGE'
  | 'USER_NOT_FOUND'
  | 'DELETE_FAILED'
  | 'INTERNAL'
  | 'NETWORK';

export class DeleteAccountError extends Error {
  code: DeleteAccountErrorCode;
  constructor(code: DeleteAccountErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Calls the delete-user-account Edge Function with a wallet-signed message
 * proving control of the wallet. The server purges the user row, all
 * solely-owned org accounts, and every user-scoped row.
 */
export async function deleteUserAccount(account: Account): Promise<void> {
  if (!account?.address) {
    throw new DeleteAccountError('NO_WALLET', 'No active wallet');
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new DeleteAccountError('INTERNAL', 'Supabase is not configured');
  }

  const wallet = account.address;
  const issuedAt = Math.floor(Date.now() / 1000);
  const message = `delete-account:${wallet.toLowerCase()}:${issuedAt}`;
  const signature = await account.signMessage({ message });

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/delete-user-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ wallet, message, signature }),
    });
  } catch (err) {
    throw new DeleteAccountError('NETWORK', (err as Error)?.message ?? 'Network error');
  }

  let payload: { ok?: boolean; code?: DeleteAccountErrorCode; error?: string } | null = null;
  try {
    payload = await response.json();
  } catch {
    // fall through
  }

  if (!response.ok || !payload?.ok) {
    throw new DeleteAccountError(
      payload?.code ?? 'INTERNAL',
      payload?.error ?? `Account deletion failed (HTTP ${response.status})`,
    );
  }
}
