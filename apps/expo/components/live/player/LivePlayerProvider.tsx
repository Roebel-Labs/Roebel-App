// One app-wide expo-video player for the live room, so the stream keeps playing across navigation.
// The live room's <LivePlayer> attaches its VideoView to it while mounted (registerRoom); when the
// room goes away while the stream plays, the floating mini player takes the video over. Closing the
// mini player stops and releases the player (createVideoPlayer players are never auto-released).
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import MiniLivePlayer from './MiniLivePlayer';

export type LiveSession = {
  slug: string;
  title: string;
  posterUrl: string | null;
  isLive: boolean;
};

type Ctx = {
  /** The shared player (created on first use, recreated after stop()). */
  acquire: () => VideoPlayer;
  /** A live room mounted: hides the mini player. Returns the unregister for unmount. */
  registerRoom: () => () => void;
  /** What is playing (for the mini player's title / reopen link). */
  setSession: (s: LiveSession | null) => void;
  /** The uri last loaded into the shared player (null after stop). */
  loadedUri: () => string | null;
  markLoaded: (uri: string | null) => void;
  /** Stop + release + hide the mini player. */
  stop: () => void;
};

const LivePlayerContext = createContext<Ctx | null>(null);

function safely(fn: () => void) {
  try { fn(); } catch { /* released / unsupported */ }
}

function readPlaying(p: VideoPlayer): boolean {
  try { return p.playing || p.status === 'loading'; } catch { return false; }
}

export function LivePlayerProvider({ children }: { children: React.ReactNode }) {
  const playerRef = useRef<VideoPlayer | null>(null);
  const loadedRef = useRef<string | null>(null);
  const roomsRef = useRef(0);
  const sessionRef = useRef<LiveSession | null>(null);
  const [mini, setMini] = useState<{ player: VideoPlayer; session: LiveSession } | null>(null);

  const stop = useCallback(() => {
    const p = playerRef.current;
    playerRef.current = null;
    loadedRef.current = null;
    sessionRef.current = null;
    setMini(null);
    if (!p) return;
    safely(() => p.pause());
    // Let the mini player's VideoView + event listeners unmount before the native object goes.
    setTimeout(() => safely(() => p.release()), 400);
  }, []);

  const acquire = useCallback(() => {
    if (playerRef.current) return playerRef.current;
    const p = createVideoPlayer(null);
    safely(() => { p.staysActiveInBackground = true; });
    safely(() => { p.showNowPlayingNotification = true; });
    safely(() => { p.loop = false; });
    safely(() => { p.timeUpdateEventInterval = 0.5; });
    safely(() => { p.allowsExternalPlayback = true; });
    playerRef.current = p;
    return p;
  }, []);

  const registerRoom = useCallback(() => {
    roomsRef.current += 1;
    setMini(null);
    return () => {
      roomsRef.current = Math.max(0, roomsRef.current - 1);
      // Deferred: a room replacing a room (or a dev re-mount) registers again in the same tick.
      setTimeout(() => {
        if (roomsRef.current > 0) return;
        const p = playerRef.current;
        const s = sessionRef.current;
        if (p && s && readPlaying(p)) setMini({ player: p, session: s });
        else stop();
      }, 0);
    };
  }, [stop]);

  const setSession = useCallback((s: LiveSession | null) => { sessionRef.current = s; }, []);
  const loadedUri = useCallback(() => loadedRef.current, []);
  const markLoaded = useCallback((uri: string | null) => { loadedRef.current = uri; }, []);

  const value = useMemo<Ctx>(
    () => ({ acquire, registerRoom, setSession, loadedUri, markLoaded, stop }),
    [acquire, registerRoom, setSession, loadedUri, markLoaded, stop],
  );

  return (
    <LivePlayerContext.Provider value={value}>
      {children}
      {mini ? <MiniLivePlayer player={mini.player} session={mini.session} onClose={stop} /> : null}
    </LivePlayerContext.Provider>
  );
}

export function useLivePlayerHost(): Ctx {
  const ctx = useContext(LivePlayerContext);
  if (!ctx) throw new Error('useLivePlayerHost must be used inside <LivePlayerProvider>');
  return ctx;
}
