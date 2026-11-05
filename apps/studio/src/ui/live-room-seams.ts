// Studio side of the Live-Raum seams (src/live-room/seams.ts): on-air state, destination hand-over and
// phone guests as external sources. Streams stay in media/external.ts; ShowState only gets {id, kind, label}.

import { useEffect } from 'react';
import { configureLiveRoomSeams } from '../live-room/seams';
import { externalMedia } from '../media/external';
import type { Action } from '../state/reducer';
import { fromLiveRoomDestination } from './settings/destinations';
import type { OnAir } from './engine';

/** "On air" for the app means: a stream really goes out. A local-only recording does not make the app LIVE. */
export function broadcasting(onAir: Pick<OnAir, 'get'>): boolean {
  const s = onAir.get();
  return s.phase === 'on' && s.status?.recordOnly !== true;
}

export function useLiveRoomStudioSeams(dispatch: (a: Action) => void, onAir: OnAir) {
  useEffect(() => {
    configureLiveRoomSeams({
      onAir: { get: () => broadcasting(onAir), subscribe: (cb) => onAir.subscribe(cb) },
      addDestination: (d) => dispatch({ type: 'addDestination', ...fromLiveRoomDestination(d) }),
      registerExternalSource: (id, label, stream) => {
        externalMedia.set(id, stream);
        dispatch({ type: 'addExternalSource', id, label });
      },
      unregisterExternalSource: (id) => {
        externalMedia.delete(id);
        dispatch({ type: 'removeExternalSource', id });
      },
    });
    return () =>
      configureLiveRoomSeams({
        onAir: undefined,
        addDestination: undefined,
        registerExternalSource: undefined,
        unregisterExternalSource: undefined,
      });
  }, [dispatch, onAir]);
}
