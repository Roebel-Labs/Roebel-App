// apps/expo/lib/query-client.ts
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

// Pause queries while offline and refetch on reconnect — critical for flaky
// rural connections: a request fired mid-dead-zone retries when signal returns.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected))
);

// RN has no window focus; app foregrounding is the equivalent signal.
AppState.addEventListener('change', (status) =>
  focusManager.setFocused(status === 'active')
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Must exceed the persister maxAge or restored queries get GC'd.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 2,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'roebel-query-cache',
  throttleTime: 2_000,
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // New app version = new cache namespace (data shapes may have changed).
  buster: Constants.expoConfig?.version ?? '0',
  dehydrateOptions: {
    // Only queries that opt in via meta.persist land on disk — keeps the
    // AsyncStorage entry small and avoids persisting sensitive/ephemeral data.
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && query.meta?.persist === true,
  },
};
