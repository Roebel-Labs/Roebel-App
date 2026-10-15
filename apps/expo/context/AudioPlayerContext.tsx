/**
 * App-wide player for Hören (short stories, audiobooks, podcasts).
 *
 * One expo-audio player lives at the root so playback survives navigation:
 * the series page, the full-screen player and the mini player all drive the
 * same instance.
 *
 * Three contexts so 4×/s status ticks never re-render screens that only need
 * the actions:
 *  - AudioPlayerContext  — current track + actions (changes on user action)
 *  - AudioStatusContext  — playing / currentTime / duration (ticks 4×/s)
 *  - AudioProgressContext — saved resume positions (changes every few seconds)
 *
 * Foreground only: the build strips `audio` from UIBackgroundModes
 * (plugins/withRemoveAudioBackgroundMode), so playback stops when the app is
 * backgrounded. Background + lock-screen controls need a native build.
 */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AudioEpisode, AudioShowWithEpisodes } from '@/lib/audio-content';

// ─── Defensive expo-audio load (mirrors components/news/ArticleListenRow.tsx) ──
type AudioPlayerLike = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void | Promise<void>;
  replace: (source: unknown) => void;
  setPlaybackRate?: (rate: number, quality?: string) => void;
  playbackRate?: number;
} | null;
type AudioStatusLike = {
  playing?: boolean;
  currentTime?: number;
  duration?: number;
  didJustFinish?: boolean;
  isLoaded?: boolean;
  isBuffering?: boolean;
};
type UseAudioPlayerFn = (source: unknown, options?: { updateInterval?: number }) => AudioPlayerLike;
type UseAudioPlayerStatusFn = (player: AudioPlayerLike) => AudioStatusLike;
type SetAudioModeFn = (mode: Record<string, unknown>) => Promise<void>;

let useAudioPlayer: UseAudioPlayerFn = () => null;
let useAudioPlayerStatus: UseAudioPlayerStatusFn = () => ({});
let setAudioModeAsync: SetAudioModeFn = async () => {};
export let audioPlaybackAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-audio');
  if (mod?.useAudioPlayer && mod?.useAudioPlayerStatus) {
    useAudioPlayer = mod.useAudioPlayer as UseAudioPlayerFn;
    useAudioPlayerStatus = mod.useAudioPlayerStatus as UseAudioPlayerStatusFn;
    audioPlaybackAvailable = true;
  }
  if (mod?.setAudioModeAsync) setAudioModeAsync = mod.setAudioModeAsync as SetAudioModeFn;
} catch (err) {
  console.warn('[AudioPlayer] expo-audio native module unavailable — Hören disabled.', err);
}

// ─── Types ──────────────────────────────────────────────────
export type AudioTrack = { episode: AudioEpisode; show: AudioShowWithEpisodes };
export type SleepTimer = { kind: 'minutes'; endsAt: number; minutes: number } | { kind: 'episode' } | null;
export type SavedProgress = { position: number; duration: number; finished: boolean; updatedAt: number };

export const PLAYBACK_RATES = [0.8, 1, 1.1, 1.2, 1.5, 1.75, 2] as const;
export const SKIP_BACK_SECONDS = 15;
export const SKIP_FORWARD_SECONDS = 30;

type PlayerContextValue = {
  available: boolean;
  track: AudioTrack | null;
  rate: number;
  sleepTimer: SleepTimer;
  /** Loads (or resumes) an episode. Resumes from the saved position unless `startAt` is given. */
  playEpisode: (episode: AudioEpisode, show: AudioShowWithEpisodes, opts?: { startAt?: number }) => void;
  toggle: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  skip: (deltaSeconds: number) => void;
  setRate: (rate: number) => void;
  setSleepTimer: (timer: { minutes: number } | 'episode' | null) => void;
  /** Stops playback and hides the mini player. */
  close: () => void;
};

type StatusContextValue = {
  playing: boolean;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  isBuffering: boolean;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);
const StatusContext = createContext<StatusContextValue>({
  playing: false,
  currentTime: 0,
  duration: 0,
  isLoaded: false,
  isBuffering: false,
});
const ProgressContext = createContext<Record<string, SavedProgress>>({});

const PROGRESS_KEY = 'audio-progress:v1';
const RATE_KEY = 'audio-rate:v1';
const SAVE_EVERY_MS = 5000;
// Closer than this to the end counts as "gehört" and the next play starts over.
const FINISHED_MARGIN_SECONDS = 20;

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  const [track, setTrack] = useState<AudioTrack | null>(null);
  const [rate, setRateState] = useState(1);
  const [sleepTimer, setSleepTimerState] = useState<SleepTimer>(null);
  const [progress, setProgress] = useState<Record<string, SavedProgress>>({});

  // Mirrors for callbacks that must not re-create on every change. Synced in
  // a layout effect: the React Compiler forbids ref writes during render.
  const progressRef = useRef(progress);
  const trackRef = useRef(track);
  const rateRef = useRef(rate);
  useLayoutEffect(() => {
    progressRef.current = progress;
    trackRef.current = track;
    rateRef.current = rate;
  }, [progress, track, rate]);
  // Resume position for the source just loaded; applied once it reports a duration.
  const pendingSeek = useRef<{ episodeId: string; at: number } | null>(null);
  const lastSaveAt = useRef(0);
  const audioModeSet = useRef(false);

  // Restore saved positions + preferred speed once.
  useEffect(() => {
    AsyncStorage.multiGet([PROGRESS_KEY, RATE_KEY])
      .then(([[, p], [, r]]) => {
        if (p) setProgress(JSON.parse(p) as Record<string, SavedProgress>);
        const parsedRate = r ? Number(r) : NaN;
        if (Number.isFinite(parsedRate) && parsedRate > 0) setRateState(parsedRate);
      })
      .catch(() => {});
  }, []);

  const persistProgress = useCallback((episodeId: string, position: number, duration: number) => {
    if (!episodeId || duration <= 0) return;
    const finished = position >= duration - FINISHED_MARGIN_SECONDS;
    const next = {
      ...progressRef.current,
      [episodeId]: { position: finished ? 0 : position, duration, finished, updatedAt: Date.now() },
    };
    progressRef.current = next;
    setProgress(next);
    AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const currentTime = status.currentTime ?? 0;
  const duration =
    status.duration && status.duration > 0 ? status.duration : Number(track?.episode.duration_seconds ?? 0);
  const playing = Boolean(status.playing);

  // Seek to the resume position once the new source is loaded. `isLoaded`
  // can stay true across replace(), so key on the reported duration too.
  const loadedDuration = status.duration ?? 0;
  useEffect(() => {
    const pending = pendingSeek.current;
    if (!pending || !player || !status.isLoaded || loadedDuration <= 0) return;
    if (pending.episodeId !== track?.episode.id) return;
    pendingSeek.current = null;
    player.setPlaybackRate?.(rateRef.current, 'high');
    if (pending.at > 0) void player.seekTo(pending.at);
  }, [status.isLoaded, loadedDuration, player, track]);

  // Save the position every few seconds while playing.
  useEffect(() => {
    if (!track || !playing) return;
    const now = Date.now();
    if (now - lastSaveAt.current < SAVE_EVERY_MS) return;
    lastSaveAt.current = now;
    persistProgress(track.episode.id, currentTime, duration);
  }, [track, playing, currentTime, duration, persistProgress]);

  const loadEpisode = useCallback(
    (episode: AudioEpisode, show: AudioShowWithEpisodes, startAt: number | undefined, autoplay: boolean) => {
      if (!player || !episode.audio_url) return;
      const saved = progressRef.current[episode.id];
      const resumeAt = startAt ?? (saved && !saved.finished ? saved.position : 0);
      pendingSeek.current = { episodeId: episode.id, at: Math.max(0, resumeAt - 2) }; // 2 s of context on resume
      setTrack({ episode, show });
      player.replace({ uri: episode.audio_url });
      player.setPlaybackRate?.(rateRef.current, 'high');
      if (autoplay) player.play();
    },
    [player],
  );

  const playEpisode = useCallback<PlayerContextValue['playEpisode']>(
    (episode, show, opts) => {
      if (!player) return;
      if (!audioModeSet.current) {
        audioModeSet.current = true;
        setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      }
      const current = trackRef.current;
      if (current?.episode.id === episode.id) {
        // Same episode: refresh the track object (transcript may have arrived) and seek/resume.
        setTrack({ episode, show });
        if (opts?.startAt !== undefined) void player.seekTo(opts.startAt);
        player.play();
        return;
      }
      if (current) persistProgress(current.episode.id, currentTime, duration);
      loadEpisode(episode, show, opts?.startAt, true);
    },
    [player, currentTime, duration, loadEpisode, persistProgress],
  );

  // End of episode: mark as heard, honour the sleep timer, else continue with the next one.
  useEffect(() => {
    if (!status.didJustFinish || !track || !player) return;
    persistProgress(track.episode.id, duration, duration);
    if (sleepTimer?.kind === 'episode') {
      // Reacting to the native end-of-file event, not deriving state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSleepTimerState(null);
      player.pause();
      return;
    }
    const episodes = track.show.episodes;
    const index = episodes.findIndex((e) => e.id === track.episode.id);
    const next = index >= 0 ? episodes[index + 1] : undefined;
    if (next?.audio_url && track.show.kind !== 'podcast') {
      loadEpisode(next, track.show, 0, true);
    } else {
      player.pause();
      void player.seekTo(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.didJustFinish]);

  // Minute sleep timer.
  useEffect(() => {
    if (sleepTimer?.kind !== 'minutes' || !player) return;
    const remaining = sleepTimer.endsAt - Date.now();
    const id = setTimeout(
      () => {
        player.pause();
        setSleepTimerState(null);
      },
      Math.max(0, remaining),
    );
    return () => clearTimeout(id);
  }, [sleepTimer, player]);

  const toggle = useCallback(() => {
    if (!player || !trackRef.current) return;
    if (status.playing) {
      player.pause();
      persistProgress(trackRef.current.episode.id, currentTime, duration);
    } else {
      // Replay from the start after the end.
      if (duration > 0 && currentTime >= duration - 0.5) void player.seekTo(0);
      player.play();
    }
  }, [player, status.playing, currentTime, duration, persistProgress]);

  const pause = useCallback(() => {
    if (!player || !trackRef.current) return;
    player.pause();
    persistProgress(trackRef.current.episode.id, currentTime, duration);
  }, [player, currentTime, duration, persistProgress]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!player) return;
      const clamped = Math.max(0, duration > 0 ? Math.min(seconds, duration - 0.25) : seconds);
      void player.seekTo(clamped);
    },
    [player, duration],
  );

  const skip = useCallback((delta: number) => seekTo(currentTime + delta), [seekTo, currentTime]);

  const setRate = useCallback(
    (next: number) => {
      setRateState(next);
      player?.setPlaybackRate?.(next, 'high');
      AsyncStorage.setItem(RATE_KEY, String(next)).catch(() => {});
    },
    [player],
  );

  const setSleepTimer = useCallback<PlayerContextValue['setSleepTimer']>((timer) => {
    if (timer === null) setSleepTimerState(null);
    else if (timer === 'episode') setSleepTimerState({ kind: 'episode' });
    else setSleepTimerState({ kind: 'minutes', minutes: timer.minutes, endsAt: Date.now() + timer.minutes * 60_000 });
  }, []);

  const close = useCallback(() => {
    const current = trackRef.current;
    if (current) persistProgress(current.episode.id, currentTime, duration);
    player?.pause();
    setSleepTimerState(null);
    setTrack(null);
  }, [player, currentTime, duration, persistProgress]);

  // The actions close over currentTime, so they change every tick. Expose
  // stable wrappers that call the latest version, so controls-only consumers
  // (series page, explore rail) don't re-render 4×/s.
  const latest = useRef({ toggle, pause, seekTo, skip, close, playEpisode });
  useLayoutEffect(() => {
    latest.current = { toggle, pause, seekTo, skip, close, playEpisode };
  });
  const stableActions = useMemo(
    () => ({
      toggle: () => latest.current.toggle(),
      pause: () => latest.current.pause(),
      seekTo: (s: number) => latest.current.seekTo(s),
      skip: (d: number) => latest.current.skip(d),
      close: () => latest.current.close(),
      playEpisode: (...args: Parameters<PlayerContextValue['playEpisode']>) => latest.current.playEpisode(...args),
    }),
    [],
  );

  const playerValue = useMemo<PlayerContextValue>(
    () => ({
      available: audioPlaybackAvailable && Boolean(player),
      track,
      rate,
      sleepTimer,
      setRate,
      setSleepTimer,
      ...stableActions,
    }),
    [player, track, rate, sleepTimer, setRate, setSleepTimer, stableActions],
  );

  const statusValue = useMemo<StatusContextValue>(
    () => ({
      playing,
      currentTime,
      duration,
      isLoaded: Boolean(status.isLoaded),
      isBuffering: Boolean(status.isBuffering),
    }),
    [playing, currentTime, duration, status.isLoaded, status.isBuffering],
  );

  return (
    <PlayerContext.Provider value={playerValue}>
      <ProgressContext.Provider value={progress}>
        <StatusContext.Provider value={statusValue}>{children}</StatusContext.Provider>
      </ProgressContext.Provider>
    </PlayerContext.Provider>
  );
}

export function useAudioPlayerControls(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('useAudioPlayerControls must be used inside AudioPlayerProvider');
  return ctx;
}

export function useAudioPlaybackStatus(): StatusContextValue {
  return useContext(StatusContext);
}

export function useSavedAudioProgress(): Record<string, SavedProgress> {
  return useContext(ProgressContext);
}
