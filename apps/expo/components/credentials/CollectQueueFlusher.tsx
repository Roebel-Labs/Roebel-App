/**
 * Sends event QR scans that were queued offline (lib/credreg/collect-queue.ts) once the device is
 * back online or the app returns to the foreground. Renders nothing; mounted once in app/_layout.
 * The queue only fills while the credentials gate is open, so with the gate closed this reads one
 * empty AsyncStorage key and stops. Never throws, never logs addresses.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { claimReward } from '@/lib/rewards-claim';
import { flushCollectQueue, readCollectQueue } from '@/lib/credreg/collect-queue';

export default function CollectQueueFlusher() {
  const { gnosisAccount } = useGnosisWallet();
  const address = gnosisAccount?.address ?? null;

  useEffect(() => {
    if (!address) return;
    const flush = () => {
      void readCollectQueue(address)
        .then((q) => (q.length > 0 ? flushCollectQueue(address, { claim: claimReward }) : null))
        .catch(() => undefined);
    };
    flush();
    let wasOnline: boolean | null = null;
    const unsubNet = NetInfo.addEventListener((st) => {
      const online = st.isConnected !== false;
      if (online && wasOnline === false) flush();
      wasOnline = online;
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') flush();
    });
    return () => {
      unsubNet();
      sub.remove();
    };
  }, [address]);

  return null;
}
