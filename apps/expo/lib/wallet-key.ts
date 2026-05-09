// Reconstructs the EOA private key behind the Thirdweb in-app wallet.
//
// The in-app wallet splits the EOA private key into three Shamir shares
// (auth share on Thirdweb's backend, device share in expo-secure-store,
// optional recovery share). Two of three shares can rebuild the key.
//
// These helpers are NOT in Thirdweb's public exports map. The sentinel
// `thirdweb-internal/*` specifiers below are aliased to the real files in
// `apps/expo/metro.config.js`. Re-validate these three paths on every
// thirdweb upgrade:
//   - wallets/in-app/native/helpers/wallet/retrieval.js
//   - wallets/in-app/core/authentication/client-scoped-storage.js
//   - utils/storage/nativeStorage.js
//
// Pinned for thirdweb@5.119.3.
import { client } from '@/constants/thirdweb';
// @ts-ignore - resolved by metro.config.js to thirdweb's internal file
import { ClientScopedStorage } from 'thirdweb-internal/client-scoped-storage';
// @ts-ignore
import { nativeLocalStorage } from 'thirdweb-internal/native-storage';
// @ts-ignore
import { getShares, getWalletPrivateKeyFromShares } from 'thirdweb-internal/retrieval';

export async function reconstructEoaPrivateKey(): Promise<`0x${string}`> {
  const storage = new ClientScopedStorage({
    clientId: client.clientId,
    storage: nativeLocalStorage,
  });

  const { authShare, deviceShare } = await getShares({
    client,
    authShare: { toRetrieve: true },
    deviceShare: { toRetrieve: true },
    recoveryShare: { toRetrieve: false },
    storage,
  });

  if (!authShare || !deviceShare) {
    throw new Error('MISSING_SHARES');
  }

  const pk = await getWalletPrivateKeyFromShares([authShare, deviceShare]);
  return (pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`;
}
