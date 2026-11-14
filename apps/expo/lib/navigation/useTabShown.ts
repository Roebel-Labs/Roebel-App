import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { NATIVE_TABS } from './tabBar';

/**
 * With the system tab bar (iOS) all three sections are created at launch.
 * A section that is not the landing one can use this to stay an empty
 * placeholder until the user first opens it, so launch does not pay for
 * screens nobody is looking at. Always true on Android and web, where the
 * sections are stack screens that only exist while shown.
 */
export function useTabShown(): boolean {
  const [shown, setShown] = useState(!NATIVE_TABS);
  useFocusEffect(
    useCallback(() => {
      setShown(true);
    }, []),
  );
  return shown;
}
