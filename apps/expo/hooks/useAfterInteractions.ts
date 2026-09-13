import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

/**
 * False on the first render, true once the initial interactions/animations
 * have settled (with a short safety timeout for platforms where
 * InteractionManager never fires). Used to keep below-the-fold sections off
 * the first frame so the visible top of a screen paints first.
 */
export function useAfterInteractions(maxWaitMs = 400): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    const handle = InteractionManager.runAfterInteractions(finish);
    const timeout = setTimeout(finish, maxWaitMs);
    return () => {
      done = true;
      handle.cancel();
      clearTimeout(timeout);
    };
  }, [maxWaitMs]);

  return ready;
}
