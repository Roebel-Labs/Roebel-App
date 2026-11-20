import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEvent, useEventListener } from 'expo';
import { isPictureInPictureSupported, type VideoPlayer, type VideoView } from 'expo-video';
import type { LiveShow } from '@/lib/live';
import type { FloatingReactionsHandle } from './FloatingReactions';
import PlayerSettingsSheet from './PlayerSettingsSheet';
import { CastSheet } from './player/CastButton';
import { haptic, safely } from './player/chrome';
import ImmersiveFullscreen, { type FullscreenOverlayApi, type ReplayBar, type SeekFx } from './player/ImmersiveFullscreen';
import { useLivePlayerHost } from './player/LivePlayerProvider';

export type { FullscreenOverlayApi } from './player/ImmersiveFullscreen';

type Props = {
  show: LiveShow;
  viewers: number;
  onClose: () => void;
  /**
   * The room's chat + actions over the stage (portrait only; landscape shows the video alone).
   * `poke()` = the viewer interacted → keeps the playback controls awake; `close()` leaves the room.
   */
  overlay?: (api: FullscreenOverlayApi) => React.ReactNode;
  /** Drawn over the video box in both orientations, touches pass through (the Unterstützen alert). */
  videoLayer?: React.ReactNode;
  /** Keep the playback controls up (a room sheet is open). */
  hold?: boolean;
  /** Called by the close chevron before onClose. Leaving the room while the stream plays always minimizes it into the mini player. */
  onMinimize?: () => void;
  /** Double-tap on a live stream: the ❤️ is spawned locally either way; wire this to send the reaction. */
  onDoubleTapReact?: () => void;
};

/** How long the player may stay not-playing while live before we call it "gleich zurück". */
const STALL_GRACE_MS = 8000;
const RETRY_EVERY_MS = 5000;
/** Replay: double-tap seek step. */
const SEEK_STEP_S = 10;
/** Live: this much more latency than the best we have seen = "behind live". */
const BEHIND_LIVE_S = 10;
/** Wait before attaching our VideoView, so the mini player's view (one view per player) is gone first. */
const VIEW_SWAP_MS = 80;

function readNumber(fn: () => number): number {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function readBool(fn: () => boolean): boolean {
  try { return fn(); } catch { return false; }
}

function pipSupported(): boolean {
  try { return isPictureInPictureSupported(); } catch { return false; }
}

async function loadSource(player: VideoPlayer, uri: string, show: LiveShow) {
  const source = {
    uri,
    contentType: 'auto' as const,
    metadata: { title: show.title, artist: 'Röbel App · Live', artwork: show.poster_url ?? undefined },
  };
  try {
    if (typeof player.replaceAsync === 'function') await player.replaceAsync(source);
    else player.replace(source);
    player.play();
  } catch { /* the retry loop picks it up */ }
}

/**
 * The live room's player on the app-wide shared expo-video player (LivePlayerProvider), rendered as the
 * room's full-screen stage (ImmersiveFullscreen): pre-show countdown, reconnect ("gleich zurück") and end
 * states, play/pause, LIVE / live-edge jump, replay scrubber with double-tap ±10 s, cast / settings / mute,
 * automatic PiP, background audio. Leaving the room while the stream plays hands the video to the mini player.
 */
const LivePlayer = forwardRef<FloatingReactionsHandle, Props>(function LivePlayer(
  { show, viewers, onClose, overlay, videoLayer, hold = false, onMinimize, onDoubleTapReact },
  reactionsRef,
) {
  const isLive = show.status === 'live';
  const isReplay = show.status === 'ended' && !!show.replay_url;
  const source = isLive ? show.hls_url : isReplay ? show.replay_url : null;

  const host = useLivePlayerHost();
  const [player] = useState<VideoPlayer>(() => host.acquire());
  // Coming back from the mini player: the same stream is already loaded (and playing) → do not reload.
  const [resumed] = useState(() => !!source && host.loadedUri() === source);
  const skipFirstLoad = useRef(resumed);

  const viewRef = useRef<VideoView>(null);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted });
  const { playbackRate } = useEvent(player, 'playbackRateChange', { playbackRate: readNumber(() => player.playbackRate) || 1 });
  const { videoTrack } = useEvent(player, 'videoTrackChange', { videoTrack: null });
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });

  const [reloadNonce, setReloadNonce] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(() => resumed && readBool(() => player.playing || player.status === 'readyToPlay'));
  const [userPaused, setUserPaused] = useState(() => resumed && readBool(() => !player.playing && player.status === 'readyToPlay'));
  const [ended, setEnded] = useState(false);
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  const lastLoadAt = useRef(0);

  // Live edge: the lowest latency seen since the last (re)load is "live"; well above it = behind.
  const [minOffset, setMinOffset] = useState<number | null>(null);
  const [pausedOnLive, setPausedOnLive] = useState(false);

  // ─── Shared player: register the room (hides the mini player), then attach our one VideoView ───
  const [attached, setAttached] = useState(false);
  useEffect(() => {
    const unregister = host.registerRoom();
    const t = setTimeout(() => setAttached(true), VIEW_SWAP_MS);
    return () => {
      clearTimeout(t);
      unregister();
    };
  }, [host]);

  useEffect(() => {
    host.setSession(source ? { slug: show.slug, title: show.title, posterUrl: show.poster_url, isLive } : null);
  }, [host, source, show.slug, show.title, show.poster_url, isLive]);

  useEventListener(player, 'sourceLoad', (e) => {
    setLoadedDuration(Number.isFinite(e.duration) ? e.duration : 0);
    const hs = Array.from(new Set((e.availableVideoTracks ?? []).map((t) => t.size?.height).filter((h): h is number => !!h && h > 0)));
    setHeights(hs.sort((a, b) => b - a));
  });
  useEventListener(player, 'playToEnd', () => setEnded(true));

  useEffect(() => {
    if (!source) {
      safely(() => player.pause());
      host.markLoaded(null);
      return;
    }
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    lastLoadAt.current = Date.now();
    setMinOffset(null);
    setEnded(false);
    host.markLoaded(source);
    void loadSource(player, source, show);
    // show is read for the now-playing metadata only; reload on source / retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, source, reloadNonce]);

  useEffect(() => {
    if (isPlaying) { setHasPlayed(true); setUserPaused(false); setEnded(false); }
  }, [isPlaying]);

  const offset = time.currentOffsetFromLive;
  useEffect(() => {
    if (!isLive || !isPlaying || typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0) return;
    setMinOffset((cur) => (cur == null || offset < cur ? offset : cur));
  }, [isLive, isPlaying, offset]);
  const behindByLatency = isLive && typeof offset === 'number' && minOffset != null && offset - minOffset > BEHIND_LIVE_S;
  const behindLive = isLive && (pausedOnLive || behindByLatency);

  // Live: not playing for a while (input offline, break, network) → calm reconnect state.
  // A pause the viewer chose is not a stall.
  const healthy = status === 'readyToPlay' && (isPlaying || userPaused);
  useEffect(() => {
    if (!isLive || !source || healthy) { setStalled(false); return; }
    const t = setTimeout(() => setStalled(true), status === 'error' ? 0 : STALL_GRACE_MS);
    return () => clearTimeout(t);
  }, [isLive, source, healthy, status]);

  // While stalled: reload every 5 s (a load still in progress gets 12 s before it is restarted).
  useEffect(() => {
    if (!stalled) return;
    const t = setInterval(() => {
      if (status === 'loading' && Date.now() - lastLoadAt.current < 12000) return;
      if (status === 'readyToPlay' && !isPlaying) { safely(() => player.play()); return; }
      setReloadNonce((n) => n + 1);
    }, RETRY_EVERY_MS);
    return () => clearInterval(t);
  }, [stalled, status, isPlaying, player]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const showVideo = !!source;

  // ─── Reactions ───
  const stageReactions = useRef<FloatingReactionsHandle>(null);
  useImperativeHandle(reactionsRef, () => ({
    spawn: (emoji: string, own?: boolean) => { stageReactions.current?.spawn(emoji, own); },
  }), []);

  // ─── Actions ───
  const togglePlay = useCallback(() => {
    haptic();
    if (ended) {
      setEnded(false);
      safely(() => player.replay());
      return;
    }
    if (isPlaying) {
      safely(() => player.pause());
      setUserPaused(true);
      if (isLive) setPausedOnLive(true);
    } else {
      setUserPaused(false);
      safely(() => player.play());
    }
  }, [ended, isPlaying, isLive, player]);

  const jumpToLive = useCallback(() => {
    haptic();
    setPausedOnLive(false);
    setUserPaused(false);
    // Reloading the HLS source always lands on the live edge (seeking past the seekable end is
    // platform-dependent in expo-video), and the stall/retry logic already covers a reload.
    setReloadNonce((n) => n + 1);
  }, []);

  const [seekFx, setSeekFx] = useState<SeekFx | null>(null);
  useEffect(() => {
    if (!seekFx) return;
    const t = setTimeout(() => setSeekFx(null), 700);
    return () => clearTimeout(t);
  }, [seekFx]);
  const seek = useCallback((direction: 'back' | 'forward') => {
    haptic();
    safely(() => player.seekBy(direction === 'back' ? -SEEK_STEP_S : SEEK_STEP_S));
    setEnded(false);
    setSeekFx((cur) => ({
      side: direction,
      seconds: cur && cur.side === direction ? cur.seconds + SEEK_STEP_S : SEEK_STEP_S,
      key: cur && cur.side === direction ? cur.key : Date.now(),
    }));
  }, [player]);

  const toggleMute = useCallback(() => {
    haptic();
    safely(() => { player.muted = !player.muted; });
  }, [player]);

  const startPip = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    void view.startPictureInPicture().catch(() => undefined);
  }, []);
  const [canPip] = useState(pipSupported);

  const setRate = useCallback((r: number) => {
    safely(() => { player.playbackRate = r; });
  }, [player]);

  const close = useCallback(() => {
    haptic();
    if (onMinimize) onMinimize();
    onClose();
  }, [onMinimize, onClose]);

  const spawnHeart = useCallback(() => {
    haptic();
    const r = stageReactions.current;
    if (r) r.spawn('❤️', true);
    if (onDoubleTapReact) onDoubleTapReact();
  }, [onDoubleTapReact]);

  // Replay scrubber
  const duration = Math.max(loadedDuration, isReplay ? readNumber(() => player.duration) : 0);
  const onScrub = useCallback((f: number) => { setScrub(f); }, []);
  const onScrubRelease = useCallback((f: number) => {
    setScrub(null);
    if (duration > 0) {
      safely(() => { player.currentTime = f * duration; });
      setEnded(false);
    }
  }, [player, duration]);

  const showPoster = !showVideo || (!hasPlayed && !stalled);
  const loadingFirst = showVideo && !hasPlayed && !stalled;
  const buffering = showVideo && hasPlayed && !stalled && !userPaused && status === 'loading';
  const canControlPlayback = showVideo && !stalled && hasPlayed;
  const currentTime = scrub != null ? scrub * duration : time.currentTime;
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const buffered = duration > 0 ? Math.min(1, Math.max(0, time.bufferedPosition / duration)) : 0;
  const currentHeight = videoTrack?.size?.height ?? null;

  const replayBar: ReplayBar | null = isReplay
    ? { progress, buffered, scrubbing: scrub != null, currentTime, duration, onScrub, onRelease: onScrubRelease }
    : null;

  return (
    <ImmersiveFullscreen
      player={player}
      videoRef={viewRef}
      attachVideo={showVideo && attached}
      hasVideo={showVideo}
      show={show}
      viewers={viewers}
      isLive={isLive}
      isReplay={isReplay}
      isPlaying={isPlaying}
      ended={ended}
      muted={muted}
      stalled={isLive && (stalled || !show.hls_url)}
      spinner={loadingFirst || buffering}
      showPoster={showPoster}
      canControlPlayback={canControlPlayback}
      behindLive={behindLive}
      hold={hold || settingsOpen || castOpen}
      replay={replayBar}
      seekFx={seekFx}
      reactionsRef={stageReactions}
      canPip={canPip}
      onStartPip={startPip}
      onSpawnHeart={spawnHeart}
      onClose={close}
      onTogglePlay={togglePlay}
      onToggleMute={toggleMute}
      onJumpToLive={jumpToLive}
      onSeek={seek}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenCast={() => setCastOpen(true)}
      overlay={overlay}
      videoLayer={videoLayer}
    >
      <PlayerSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentHeight={currentHeight}
        availableHeights={heights}
        showSpeed={isReplay}
        rate={playbackRate}
        onRate={setRate}
      />
      <CastSheet visible={castOpen} onClose={() => setCastOpen(false)} show={show} />
    </ImmersiveFullscreen>
  );
});

export default LivePlayer;
