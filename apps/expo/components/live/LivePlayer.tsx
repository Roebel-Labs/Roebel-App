import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEvent, useEventListener } from 'expo';
import { isPictureInPictureSupported, useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { countdownParts, formatClock, formatViewers, type LiveShow } from '@/lib/live';
import FloatingReactions, { type FloatingReactionsHandle } from './FloatingReactions';
import PlayerSettingsSheet from './PlayerSettingsSheet';
import { F, VIDEO } from './tokens';

type Props = {
  show: LiveShow;
  width: number;
  topInset: number;
  viewers: number;
  onClose: () => void;
};

/** How long the player may stay not-playing while live before we call it "gleich zurück". */
const STALL_GRACE_MS = 8000;
const RETRY_EVERY_MS = 5000;
/** Controls fade out after this long while playing (YouTube: ~3 s). */
const CONTROLS_HIDE_MS = 3000;
/** Replay: double-tap seek step. */
const SEEK_STEP_S = 10;
/** Live: this much more latency than the best we have seen = "behind live". */
const BEHIND_LIVE_S = 10;
const YT_RED = '#FF0033';

function LiveDot() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withSequence(
      withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
    ), -1);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.liveDot, style]} />;
}

/** YouTube-style buffering ring: a white arc spinning on a faint track. */
function Spinner({ size = 44 }: { size?: number }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
  }, [r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  const ring = { width: size, height: size, borderRadius: size / 2, borderWidth: 3.5 };
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, ring, { borderColor: 'rgba(255,255,255,0.18)' }]} />
      <Animated.View
        style={[StyleSheet.absoluteFill, ring, { borderColor: 'transparent', borderTopColor: '#fff', borderRightColor: '#fff' }, style]}
      />
    </View>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

function Countdown({ startsAt }: { startsAt: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const parts = countdownParts(startsAt, now);
  if (!parts) return <Text style={styles.stateSub}>Wir starten in Kürze.</Text>;
  const clock = formatClock(startsAt);
  if (parts.d >= 1) {
    return <Text style={styles.stateSub}>{`Start in ${parts.d} ${parts.d === 1 ? 'Tag' : 'Tagen'}${clock ? ` · ${clock} Uhr` : ''}`}</Text>;
  }
  return (
    <View style={styles.countdownWrap}>
      <Text style={styles.countdown}>{parts.h > 0 ? `${parts.h}:${pad(parts.m)}:${pad(parts.s)}` : `${pad(parts.m)}:${pad(parts.s)}`}</Text>
      {clock ? <Text style={styles.stateSub}>{`Start um ${clock} Uhr`}</Text> : null}
    </View>
  );
}

function safely(fn: () => void) {
  try { fn(); } catch { /* player released or call unsupported on this runtime */ }
}

function readNumber(fn: () => number): number {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
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

function haptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

type RoundIconProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  size?: number;
};

function ChromeButton({ icon, label, onPress, size = 22 }: RoundIconProps) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.chromeBtn, pressed && styles.chromePressed]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={size} color="#fff" />
    </Pressable>
  );
}

type SeekFx = { side: 'back' | 'forward'; seconds: number; key: number };

/**
 * 16:9 native player with the pre-show, reconnect and end states and YouTube-style controls:
 * tap toggles the overlay (auto-hides while playing), big center play/pause, LIVE / live-edge jump,
 * replay scrubber with double-tap ±10 s, settings, PiP, fullscreen, mute. Floating reactions sit
 * above the video and below the controls. The video area is black in every app theme.
 */
const LivePlayer = forwardRef<FloatingReactionsHandle, Props>(function LivePlayer({ show, width, topInset, viewers, onClose }, reactionsRef) {
  const height = Math.round((width * 9) / 16);
  const isLive = show.status === 'live';
  const isReplay = show.status === 'ended' && !!show.replay_url;
  const source = isLive ? show.hls_url : isReplay ? show.replay_url : null;

  const player = useVideoPlayer(null, (p) => {
    safely(() => { p.staysActiveInBackground = true; });
    safely(() => { p.showNowPlayingNotification = true; });
    safely(() => { p.loop = false; });
    safely(() => { p.timeUpdateEventInterval = 0.5; });
  });
  const viewRef = useRef<VideoView>(null);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted });
  const { playbackRate } = useEvent(player, 'playbackRateChange', { playbackRate: 1 });
  const { videoTrack } = useEvent(player, 'videoTrackChange', { videoTrack: null });
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });

  const [reloadNonce, setReloadNonce] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  const lastLoadAt = useRef(0);

  // Live edge: the lowest latency seen since the last (re)load is "live"; well above it = behind.
  const [minOffset, setMinOffset] = useState<number | null>(null);
  const [pausedOnLive, setPausedOnLive] = useState(false);

  useEventListener(player, 'sourceLoad', (e) => {
    setLoadedDuration(Number.isFinite(e.duration) ? e.duration : 0);
    const hs = Array.from(new Set((e.availableVideoTracks ?? []).map((t) => t.size?.height).filter((h): h is number => !!h && h > 0)));
    setHeights(hs.sort((a, b) => b - a));
  });
  useEventListener(player, 'playToEnd', () => setEnded(true));

  useEffect(() => {
    if (!source) {
      safely(() => player.pause());
      return;
    }
    lastLoadAt.current = Date.now();
    setMinOffset(null);
    setEnded(false);
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

  // ─── Controls visibility ───
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [shown, setShown] = useState(true);
  const [pokeNonce, setPokeNonce] = useState(0);
  const showVideo = !!source;
  // No video (pre-show, ended, reconnecting): the chrome is all there is, keep it up.
  const holdOpen = !showVideo || stalled;
  const visible = shown || holdOpen;
  const autoHide = isPlaying && scrub == null && !settingsOpen;
  useEffect(() => {
    if (!shown || !autoHide) return;
    const t = setTimeout(() => setShown(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(t);
  }, [shown, autoHide, pokeNonce]);
  const poke = useCallback(() => { setShown(true); setPokeNonce((n) => n + 1); }, []);

  const controlsOpacity = useSharedValue(1);
  useEffect(() => {
    controlsOpacity.value = withTiming(visible ? 1 : 0, { duration: visible ? 140 : 260 });
  }, [visible, controlsOpacity]);
  const controlsStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));

  // ─── Actions ───
  const toggleControls = useCallback(() => {
    if (visible && !holdOpen) setShown(false);
    else poke();
  }, [visible, holdOpen, poke]);

  const togglePlay = useCallback(() => {
    haptic();
    poke();
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
  }, [ended, isPlaying, isLive, player, poke]);

  const jumpToLive = useCallback(() => {
    haptic();
    poke();
    setPausedOnLive(false);
    setUserPaused(false);
    // Reloading the HLS source always lands on the live edge (seeking past the seekable end is
    // platform-dependent in expo-video), and the stall/retry logic already covers a reload.
    setReloadNonce((n) => n + 1);
  }, [poke]);

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
    poke();
    safely(() => { player.muted = !player.muted; });
  }, [player, poke]);

  const enterFullscreen = useCallback(() => {
    void viewRef.current?.enterFullscreen().catch(() => undefined);
  }, []);
  const startPip = useCallback(() => {
    void viewRef.current?.startPictureInPicture().catch(() => undefined);
  }, []);
  const [canPip] = useState(pipSupported);

  const setRate = useCallback((r: number) => {
    safely(() => { player.playbackRate = r; });
  }, [player]);

  // ─── Gestures (plain JS callbacks via runOnJS(true): no worklets here) ───
  const tapGesture = useMemo(() => {
    const single = Gesture.Tap().runOnJS(true).maxDuration(300).onEnd((_e, ok) => { if (ok) toggleControls(); });
    if (!isReplay) return single;
    const double = Gesture.Tap().runOnJS(true).numberOfTaps(2).maxDelay(260).onEnd((e, ok) => {
      if (!ok) return;
      seek(e.x < width / 2 ? 'back' : 'forward');
    });
    return Gesture.Exclusive(double, single);
  }, [isReplay, toggleControls, seek, width]);

  // Replay scrubber
  const duration = Math.max(loadedDuration, isReplay ? readNumber(() => player.duration) : 0);
  // The scrub track spans the full video width, so x / width is the position.
  const scrubGesture = useMemo(() => {
    const fraction = (x: number) => Math.min(1, Math.max(0, x / Math.max(1, width)));
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .hitSlop({ top: 14, bottom: 14 })
      .onBegin((e) => {
        setScrub(fraction(e.x));
        setShown(true);
      })
      .onUpdate((e) => setScrub(fraction(e.x)))
      .onFinalize((e) => {
        const f = fraction(e.x);
        setScrub(null);
        if (duration > 0) {
          safely(() => { player.currentTime = f * duration; });
          setEnded(false);
        }
        setPokeNonce((n) => n + 1);
      });
  }, [player, duration, width]);

  const showPoster = !showVideo || (!hasPlayed && !stalled);
  const poster = show.poster_url;
  const loadingFirst = showVideo && !hasPlayed && !stalled;
  const buffering = showVideo && hasPlayed && !stalled && !userPaused && status === 'loading';
  const canControlPlayback = showVideo && !stalled && hasPlayed;
  const currentTime = scrub != null ? scrub * duration : time.currentTime;
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const buffered = duration > 0 ? Math.min(1, Math.max(0, time.bufferedPosition / duration)) : 0;
  const currentHeight = videoTrack?.size?.height ?? null;

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      <View style={{ width, height, backgroundColor: '#000', overflow: 'hidden' }}>
        {showVideo ? (
          <VideoView
            ref={viewRef}
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={false}
            allowsPictureInPicture
            startsPictureInPictureAutomatically
            onFullscreenExit={() => safely(() => player.play())}
          />
        ) : null}

        {showPoster && poster ? (
          <Animated.View exiting={FadeOut.duration(300)} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
          </Animated.View>
        ) : null}

        {/* State layers */}
        {show.status === 'scheduled' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stateLayer} pointerEvents="none">
            <Text style={styles.stateKicker}>GLEICH GEHT'S LOS</Text>
            <Countdown startsAt={show.starts_at} />
          </Animated.View>
        ) : null}
        {isLive && (stalled || !show.hls_url) ? (
          <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut} style={[styles.stateLayer, styles.stateDim]} pointerEvents="none">
            <Spinner size={36} />
            <Text style={styles.stateTitle}>Die Übertragung ist gleich zurück</Text>
            <Text style={styles.stateSub}>Kurze Pause auf der Fläche. Bleib dran.</Text>
          </Animated.View>
        ) : null}
        {loadingFirst || buffering ? (
          <View style={styles.stateLayer} pointerEvents="none"><Spinner /></View>
        ) : null}
        {show.status === 'ended' && !isReplay ? (
          <Animated.View entering={FadeIn} style={[styles.stateLayer, styles.stateDim]} pointerEvents="none">
            <Text style={styles.stateKicker}>DAS WAR'S</Text>
            <Text style={styles.stateTitle}>Danke fürs Zuschauen!</Text>
            <Text style={styles.stateSub}>Die Aufzeichnung folgt in Kürze.</Text>
          </Animated.View>
        ) : null}

        {/* Tap catcher: below the controls, so buttons never toggle the overlay. */}
        <GestureDetector gesture={tapGesture}>
          <View style={StyleSheet.absoluteFill} collapsable={false} accessibilityLabel="Steuerung ein- oder ausblenden" />
        </GestureDetector>

        {/* Double-tap seek ripple (replay) */}
        {seekFx ? (
          <Animated.View
            key={`${seekFx.side}-${seekFx.key}`}
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(260)}
            pointerEvents="none"
            style={[styles.ripple, seekFx.side === 'back' ? styles.rippleLeft : styles.rippleRight, { height: height * 1.4, width: width * 0.62, top: -height * 0.2 }]}
          >
            <View style={[styles.rippleContent, seekFx.side === 'back' ? { left: width * 0.14 } : { right: width * 0.14 }]}>
              <Ionicons name={seekFx.side === 'back' ? 'play-back' : 'play-forward'} size={22} color="#fff" />
              <Text style={styles.rippleText}>{`${seekFx.seconds} Sekunden`}</Text>
            </View>
          </Animated.View>
        ) : null}

        <FloatingReactions ref={reactionsRef} height={height} />

        {/* Controls overlay */}
        <Animated.View style={[StyleSheet.absoluteFill, controlsStyle]} pointerEvents={visible ? 'box-none' : 'none'}>
          <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={styles.topShade} pointerEvents="none" />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} style={styles.bottomShade} pointerEvents="none" />

          <View style={styles.topBar} pointerEvents="box-none">
            <ChromeButton icon="chevron-down" label="Schließen" onPress={onClose} size={24} />
            <Text style={styles.title} numberOfLines={1}>{show.title}</Text>
            {viewers > 0 ? (
              <View style={styles.viewerPill} pointerEvents="none">
                <Ionicons name="eye-outline" size={13} color="#fff" />
                <Text style={styles.viewerText}>{formatViewers(viewers)}</Text>
              </View>
            ) : null}
            {showVideo ? (
              <ChromeButton icon={muted ? 'volume-mute' : 'volume-high'} label={muted ? 'Ton an' : 'Ton aus'} onPress={toggleMute} size={20} />
            ) : null}
          </View>

          {canControlPlayback && !buffering ? (
            <View style={styles.center} pointerEvents="box-none">
              {isReplay ? (
                <Pressable onPress={() => { poke(); seek('back'); }} hitSlop={10} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="10 Sekunden zurück">
                  <Ionicons name="play-back" size={22} color="#fff" />
                  <Text style={styles.skipText}>10</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={togglePlay}
                style={({ pressed }) => [styles.playBtn, pressed && styles.chromePressed]}
                accessibilityRole="button"
                accessibilityLabel={ended ? 'Erneut abspielen' : isPlaying ? 'Pause' : 'Abspielen'}
              >
                <Ionicons name={ended ? 'refresh' : isPlaying ? 'pause' : 'play'} size={34} color="#fff" style={!isPlaying && !ended ? styles.playIconNudge : null} />
              </Pressable>
              {isReplay ? (
                <Pressable onPress={() => { poke(); seek('forward'); }} hitSlop={10} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="10 Sekunden vor">
                  <Ionicons name="play-forward" size={22} color="#fff" />
                  <Text style={styles.skipText}>10</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.bottomBar, isReplay && styles.bottomBarReplay]} pointerEvents="box-none">
            <View style={styles.bottomLeft} pointerEvents="box-none">
              {isLive ? (
                <Pressable
                  onPress={behindLive ? jumpToLive : undefined}
                  disabled={!behindLive}
                  hitSlop={8}
                  style={styles.liveIndicator}
                  accessibilityRole="button"
                  accessibilityLabel={behindLive ? 'Zum Live-Bild springen' : 'Live'}
                >
                  {behindLive ? <View style={[styles.liveDot, styles.liveDotBehind]} /> : <LiveDot />}
                  <Text style={[styles.liveText, behindLive && styles.liveTextBehind]}>LIVE</Text>
                </Pressable>
              ) : isReplay ? (
                <Text style={styles.timeText}>
                  {`${formatTime(currentTime)} / `}
                  <Text style={styles.timeTotal}>{formatTime(duration)}</Text>
                </Text>
              ) : (
                <View style={styles.mutedPill}>
                  <Text style={styles.mutedPillText}>{show.status === 'scheduled' ? 'BALD LIVE' : 'BEENDET'}</Text>
                </View>
              )}
              {show.is_test === true ? (
                <View style={styles.testPill} accessibilityLabel="Testlauf">
                  <Text style={styles.testPillText}>TESTLAUF</Text>
                </View>
              ) : null}
            </View>
            {showVideo ? (
              <View style={styles.bottomRight}>
                <ChromeButton icon="settings-outline" label="Einstellungen" onPress={() => { poke(); setSettingsOpen(true); }} size={20} />
                {canPip ? <ChromeButton icon="albums-outline" label="Bild-in-Bild" onPress={startPip} size={19} /> : null}
                <ChromeButton icon="expand" label="Vollbild" onPress={enterFullscreen} size={20} />
              </View>
            ) : null}
          </View>

          {isReplay ? (
            <GestureDetector gesture={scrubGesture}>
              <View style={styles.scrubHit} collapsable={false} accessibilityRole="adjustable" accessibilityLabel="Wiedergabeposition">
                <View style={[styles.scrubTrack, scrub != null && styles.scrubTrackActive]}>
                  <View style={[styles.scrubBuffered, { width: `${buffered * 100}%` }]} />
                  <View style={[styles.scrubFill, { width: `${progress * 100}%` }]} />
                </View>
                <View style={[styles.scrubThumb, scrub != null && styles.scrubThumbActive, { left: `${progress * 100}%` }]} pointerEvents="none" />
              </View>
            </GestureDetector>
          ) : null}
        </Animated.View>

        {/* Replay: thin progress line while the controls are hidden (YouTube). */}
        {isReplay && !visible ? (
          <View style={styles.miniTrack} pointerEvents="none">
            <View style={[styles.scrubFill, { width: `${progress * 100}%` }]} />
          </View>
        ) : null}
      </View>

      <PlayerSettingsSheet
        visible={settingsOpen}
        onClose={() => { setSettingsOpen(false); poke(); }}
        currentHeight={currentHeight}
        availableHeights={heights}
        showSpeed={isReplay}
        rate={playbackRate}
        onRate={setRate}
      />
    </View>
  );
});

export default LivePlayer;

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#000' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 76 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 84 },
  topBar: {
    position: 'absolute', top: 6, left: 4, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  title: { flex: 1, color: '#fff', fontSize: 15, fontFamily: F.semiBold, marginRight: 4 },
  chromeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chromePressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, height: 24, borderRadius: 12,
  },
  viewerText: { color: '#fff', fontSize: 12, fontFamily: F.semiBold, fontVariant: ['tabular-nums'] },
  center: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 44,
  },
  playBtn: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  playIconNudge: { marginLeft: 4 },
  skipBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  skipText: { position: 'absolute', bottom: 3, color: '#fff', fontSize: 9, fontFamily: F.bold },
  bottomBar: {
    position: 'absolute', left: 12, right: 4, bottom: 2, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  bottomBarReplay: { bottom: 14 },
  bottomLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  bottomRight: { flexDirection: 'row', alignItems: 'center' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: YT_RED },
  liveDotBehind: { backgroundColor: 'rgba(255,255,255,0.55)' },
  liveText: { color: '#fff', fontSize: 13, fontFamily: F.bold, letterSpacing: 0.6 },
  liveTextBehind: { color: 'rgba(255,255,255,0.7)' },
  timeText: { color: '#fff', fontSize: 12, fontFamily: F.semiBold, fontVariant: ['tabular-nums'] },
  timeTotal: { color: 'rgba(255,255,255,0.7)' },
  mutedPill: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, height: 24, borderRadius: 6, justifyContent: 'center' },
  mutedPillText: { color: '#fff', fontSize: 11, fontFamily: F.semiBold, letterSpacing: 0.8 },
  testPill: { backgroundColor: VIDEO.gold, paddingHorizontal: 8, height: 22, borderRadius: 6, justifyContent: 'center' },
  testPillText: { color: '#1B1B1B', fontSize: 11, fontFamily: F.bold, letterSpacing: 1 },
  scrubHit: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 20, justifyContent: 'flex-end' },
  scrubTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  scrubTrackActive: { height: 5 },
  scrubBuffered: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.45)' },
  scrubFill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: YT_RED },
  scrubThumb: {
    position: 'absolute', bottom: -4.5, width: 12, height: 12, marginLeft: -6, borderRadius: 6, backgroundColor: YT_RED,
  },
  scrubThumbActive: { bottom: -6.5, width: 18, height: 18, marginLeft: -9, borderRadius: 9 },
  miniTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  ripple: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  rippleLeft: { left: 0, borderTopRightRadius: 9999, borderBottomRightRadius: 9999 },
  rippleRight: { right: 0, borderTopLeftRadius: 9999, borderBottomLeftRadius: 9999 },
  rippleContent: { position: 'absolute', alignItems: 'center', gap: 4 },
  rippleText: { color: '#fff', fontSize: 12, fontFamily: F.semiBold },
  stateLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 32 },
  stateDim: { backgroundColor: 'rgba(12,13,15,0.72)' },
  stateKicker: { color: VIDEO.accent, fontSize: 12, fontFamily: F.bold, letterSpacing: 1.6 },
  stateTitle: { color: VIDEO.text, fontSize: 18, fontFamily: F.heading, textAlign: 'center', marginTop: 4 },
  stateSub: { color: VIDEO.textSecondary, fontSize: 13, fontFamily: F.medium, textAlign: 'center' },
  countdownWrap: { alignItems: 'center', gap: 2 },
  countdown: { color: VIDEO.text, fontSize: 40, fontFamily: F.heading, fontVariant: ['tabular-nums'], letterSpacing: 1 },
});
