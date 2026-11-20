// The live room's stage (TikTok / Instagram Live / eBay Live): this IS the room's screen layout now, not a
// Modal. Black, blurred poster wash, the video contained and centred, our own top bar (close → mini player,
// LIVE + running time, viewers, cast / mute / rotate / settings) and the room's `overlay` (chat + actions,
// built by the room) on top. Sheets are ordinary BottomDrawer modals rendered by the screen, so they open
// over the stage without leaving it.
//
// Rotation: while the room is focused the orientation is unlocked; turned to landscape the whole overlay
// and chrome go away and the video fills the screen (contain). A tap shows minimal controls (play/pause,
// mute, back to portrait) that auto-hide. Leaving the room locks the app back to portrait. The rotate
// button stays as a manual toggle.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler, Keyboard, Platform, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, type VideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useIsFocused } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import LiveIcon from '@/components/live/LiveIcon';
import { countdownParts, formatClock, type LiveShow } from '@/lib/live';
import FloatingReactions, { type FloatingReactionsHandle } from '../FloatingReactions';
import { F, VIDEO } from '../tokens';
import { CastButton } from './CastButton';
import { ChromeButton, formatTime, haptic, LiveInfo, pad, Spinner, ViewerPill } from './chrome';
import ScrubBar, { ProgressLine } from './ScrubBar';

/** What the room's overlay gets from the stage. */
export type FullscreenOverlayApi = {
  /** The viewer interacted: keeps the playback controls awake. */
  poke: () => void;
  /** Leave the room (the stream continues in the mini player while it plays). */
  close: () => void;
  /** Picture-in-picture, null where unsupported. */
  startPip: (() => void) | null;
  /** Top of the video box (px from the screen top) and its height, for laying out around it. */
  videoTop: number;
  videoHeight: number;
  /** While true the room overlay never fades out on its own (typing, menu open). */
  holdRoom: (held: boolean) => void;
};

const HIDE_MS = 3500;
/** Portrait: chat + actions fade out slowly after this long without interaction (a tap brings them back). */
const ROOM_IDLE_MS = 8000;
const ROOM_IDLE_FADE_MS = 1400;
/** After "back to portrait" from a manual landscape lock, auto-rotation comes back after this long. */
const MANUAL_PORTRAIT_HOLD_MS = 3000;

export type ReplayBar = {
  progress: number;
  buffered: number;
  scrubbing: boolean;
  currentTime: number;
  duration: number;
  onScrub: (f: number) => void;
  onRelease: (f: number) => void;
};

export type SeekFx = { side: 'back' | 'forward'; seconds: number; key: number };

type Props = {
  player: VideoPlayer;
  videoRef: React.RefObject<VideoView | null>;
  /** Mount the VideoView (false for a moment while the mini player hands over, and when there is no source). */
  attachVideo: boolean;
  /** There is a stream / replay source at all (pre-show and ended-without-replay have none). */
  hasVideo: boolean;
  show: LiveShow;
  viewers: number;
  isLive: boolean;
  isReplay: boolean;
  isPlaying: boolean;
  ended: boolean;
  muted: boolean;
  stalled: boolean;
  spinner: boolean;
  /** Poster over the video box until the first frame. */
  showPoster: boolean;
  canControlPlayback: boolean;
  behindLive: boolean;
  /** Keep the playback controls up (a sheet is open). */
  hold: boolean;
  replay: ReplayBar | null;
  seekFx: SeekFx | null;
  reactionsRef: React.Ref<FloatingReactionsHandle>;
  canPip: boolean;
  onStartPip: () => void;
  onSpawnHeart: () => void;
  onClose: () => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onJumpToLive: () => void;
  onSeek: (dir: 'back' | 'forward') => void;
  onOpenSettings: () => void;
  onOpenCast: () => void;
  /** Chat + actions (portrait only). */
  overlay?: (api: FullscreenOverlayApi) => React.ReactNode;
  /** Drawn over the video in both orientations, touches pass through (the Unterstützen alert). */
  videoLayer?: React.ReactNode;
  /** Sheets owned by the player (settings, cast). */
  children?: React.ReactNode;
};

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

// ─── Orientation helpers (native only; failures are harmless) ───
function lockPortrait() {
  if (Platform.OS === 'web') return;
  void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
}
function lockLandscape() {
  // iOS: the app's Info.plist is portrait-only, and a landscape-only lock has no common orientation with it →
  // UIKit throws (app crash). iOS rotates via the native fullscreen player instead (see `rotate`).
  if (Platform.OS !== 'android') return;
  void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
}
/** Follow the device. iOS: an explicit mask (the Info.plist default is portrait-only); Android: hand back to the system (respects auto-rotate). */
function allowRotation() {
  if (Platform.OS === 'web') return;
  // iOS stays portrait (Info.plist is portrait-only; landscape = native fullscreen player via the rotate button).
  if (Platform.OS !== 'android') return;
  void ScreenOrientation.unlockAsync().catch(() => undefined);
}

export default function ImmersiveFullscreen(props: Props) {
  const {
    player, videoRef, attachVideo, hasVideo, show, viewers, isLive, isReplay, isPlaying, ended, muted, stalled, spinner,
    showPoster, canControlPlayback, behindLive, hold, replay, seekFx, reactionsRef, canPip, onStartPip, onSpawnHeart,
    onClose, onTogglePlay, onToggleMute, onJumpToLive, onSeek, onOpenSettings, onOpenCast, overlay, videoLayer, children,
  } = props;
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = W > H;

  // ─── Rotation: free while focused, portrait again when leaving ───
  const focused = useIsFocused();
  /** 'landscape' while the rotate button holds landscape; 'portrait' briefly after leaving it by button. */
  const [manual, setManual] = useState<'landscape' | 'portrait' | null>(null);
  const manualTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!focused) { lockPortrait(); return; }
    if (manual === 'landscape') lockLandscape();
    else if (manual === 'portrait') lockPortrait();
    else allowRotation();
  }, [focused, manual]);
  useEffect(() => () => {
    if (manualTimer.current) clearTimeout(manualTimer.current);
    lockPortrait();
  }, []);

  const toPortrait = useCallback(() => {
    haptic();
    setManual('portrait');
    if (manualTimer.current) clearTimeout(manualTimer.current);
    manualTimer.current = setTimeout(() => setManual(null), MANUAL_PORTRAIT_HOLD_MS);
  }, []);
  const toLandscape = useCallback(() => {
    haptic();
    if (manualTimer.current) clearTimeout(manualTimer.current);
    Keyboard.dismiss();
    setManual('landscape');
  }, []);
  const rotate = useCallback(() => {
    if (Platform.OS === 'ios') {
      // The native player rotates freely in its own fullscreen, independent of the app's portrait-only setting.
      haptic();
      void videoRef.current?.enterFullscreen?.().catch(() => undefined);
      return;
    }
    if (landscape) toPortrait(); else toLandscape();
  }, [landscape, toPortrait, toLandscape, videoRef]);

  // Android back in landscape: back to portrait first, not out of the room.
  useEffect(() => {
    if (!landscape || !focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { toPortrait(); return true; });
    return () => sub.remove();
  }, [landscape, focused, toPortrait]);

  // Turning the phone hides the keyboard (the composer is not shown in landscape).
  useEffect(() => { if (landscape) Keyboard.dismiss(); }, [landscape]);

  // ─── Video geometry: 16:9 contained. Portrait: centred, nudged up a little to leave room for the chat. ───
  const vw = Math.min(W, (H * 16) / 9);
  const vh = Math.round((vw * 9) / 16);
  const centredTop = Math.round((H - vh) / 2);
  const videoTop = landscape
    ? Math.max(0, centredTop)
    : Math.max(insets.top + 84, centredTop - Math.round(H * 0.06));
  const videoLeft = Math.round((W - vw) / 2);

  // ─── Playback controls auto-hide (portrait: centre controls + scrubber; landscape: everything) ───
  const [shown, setShown] = useState(true);
  const [pokeNonce, setPokeNonce] = useState(0);
  const holdOpen = stalled || !attachVideo || hold || (replay?.scrubbing ?? false) || !isPlaying;
  const controlsVisible = shown || holdOpen;
  useEffect(() => {
    if (!shown || holdOpen) return;
    const t = setTimeout(() => setShown(false), HIDE_MS);
    return () => clearTimeout(t);
  }, [shown, holdOpen, pokeNonce]);
  const poke = useCallback(() => { setShown(true); setPokeNonce((n) => n + 1); }, []);
  // Entering landscape: show the minimal controls once, then they fade.
  useEffect(() => { poke(); }, [landscape, poke]);

  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withTiming(controlsVisible ? 1 : 0, { duration: controlsVisible ? 160 : 320 });
  }, [controlsVisible, opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // ─── Portrait "clean view": a tap on the video / empty space hides chat, actions and the top bar; the next
  // tap brings everything back (Max, 2026-11-06). No auto-return: it stays clean until tapped again. ───
  const [clean, setClean] = useState(false);
  // 'idle' = faded out on its own after ROOM_IDLE_MS (slow fade); 'tap' = the viewer tapped it away (quick).
  const cleanBy = useRef<'tap' | 'idle'>('tap');
  const cleanOpacity = useSharedValue(1);
  useEffect(() => {
    const duration = clean ? (cleanBy.current === 'idle' ? ROOM_IDLE_FADE_MS : 220) : 180;
    cleanOpacity.value = withTiming(clean ? 0 : 1, { duration });
  }, [clean, cleanOpacity]);
  const [roomHeld, setRoomHeld] = useState(false);
  const holdRoom = useCallback((held: boolean) => setRoomHeld(held), []);
  useEffect(() => {
    if (landscape || clean || roomHeld || hold) return;
    const t = setTimeout(() => { cleanBy.current = 'idle'; setClean(true); }, ROOM_IDLE_MS);
    return () => clearTimeout(t);
  }, [landscape, clean, roomHeld, hold, pokeNonce]);
  const cleanStyle = useAnimatedStyle(() => ({ opacity: cleanOpacity.value }));
  // Rotating back to portrait always shows the room again.
  useEffect(() => { if (!landscape) setClean(false); }, [landscape]);

  // ─── Gestures (JS thread, no worklets) ───
  const tapGesture = useMemo(() => {
    const single = Gesture.Tap().runOnJS(true).maxDuration(300).onEnd((_e, ok) => {
      if (!ok) return;
      // With the keyboard up, the first tap only closes the keyboard.
      if (Keyboard.isVisible()) { Keyboard.dismiss(); return; }
      if (!landscape) {
        if (clean) poke(); else setShown(false);
        cleanBy.current = 'tap';
        setClean(!clean);
        return;
      }
      if (controlsVisible && !holdOpen) setShown(false);
      else poke();
    });
    const double = Gesture.Tap().runOnJS(true).numberOfTaps(2).maxDelay(260).onEnd((e, ok) => {
      if (!ok) return;
      if (isReplay) onSeek(e.x < W / 2 ? 'back' : 'forward');
      else if (isLive) onSpawnHeart();
    });
    return Gesture.Exclusive(double, single);
  }, [controlsVisible, holdOpen, poke, isReplay, isLive, onSeek, onSpawnHeart, W, landscape, clean]);

  const api = useMemo<FullscreenOverlayApi>(
    () => ({ poke, close: onClose, startPip: canPip ? onStartPip : null, videoTop, videoHeight: vh, holdRoom }),
    [poke, onClose, canPip, onStartPip, videoTop, vh, holdRoom],
  );
  const poster = show.poster_url;
  const playControls = canControlPlayback && !spinner;

  const centreControls = playControls ? (
    <View style={[styles.center, { top: videoTop, height: vh }]} pointerEvents="box-none">
      {isReplay ? (
        <Pressable onPress={() => { poke(); onSeek('back'); }} hitSlop={10} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="10 Sekunden zurück">
          <LiveIcon name="play-back" size={22} color="#fff" />
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => { poke(); onTogglePlay(); }}
        style={({ pressed }) => [styles.playBtn, pressed && styles.pressedDisc]}
        accessibilityRole="button"
        accessibilityLabel={ended ? 'Erneut abspielen' : isPlaying ? 'Pause' : 'Abspielen'}
      >
        <LiveIcon name={ended ? 'refresh' : isPlaying ? 'pause' : 'play'} size={34} color="#fff" style={!isPlaying && !ended ? styles.playNudge : null} />
      </Pressable>
      {isReplay ? (
        <Pressable onPress={() => { poke(); onSeek('forward'); }} hitSlop={10} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="10 Sekunden vor">
          <LiveIcon name="play-forward" size={22} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const scrubber = replay ? (
    <View style={[styles.scrubAt, { top: videoTop + vh - 20, left: videoLeft }]}>
      <ScrubBar
        width={vw}
        progress={replay.progress}
        buffered={replay.buffered}
        active={replay.scrubbing}
        onScrub={replay.onScrub}
        onRelease={(f) => { replay.onRelease(f); poke(); }}
      />
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <StatusBar hidden={landscape} barStyle="light-content" backgroundColor="transparent" translucent animated />
      {/* Background wash: the poster blurred and dimmed, fading to black. */}
      {poster && !landscape ? (
        <Image source={{ uri: poster }} style={[StyleSheet.absoluteFill, styles.wash]} contentFit="cover" blurRadius={40} />
      ) : null}
      {!landscape ? (
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(10,12,16,0.82)', '#000']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      <View style={[styles.videoBox, { top: videoTop, width: vw, height: vh, left: videoLeft }]}>
        {attachVideo ? (
          <VideoView
            ref={videoRef}
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={false}
            allowsPictureInPicture
            startsPictureInPictureAutomatically
          />
        ) : null}
        {showPoster && poster ? (
          <Animated.View exiting={FadeOut.duration(300)} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            <View style={[StyleSheet.absoluteFill, styles.posterDim]} />
          </Animated.View>
        ) : null}
        {show.status === 'scheduled' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.state} pointerEvents="none">
            <Text style={styles.stateKicker}>GLEICH GEHT'S LOS</Text>
            <Countdown startsAt={show.starts_at} />
          </Animated.View>
        ) : stalled ? (
          <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut} style={[styles.state, styles.stateDim]} pointerEvents="none">
            <Spinner size={36} />
            <Text style={styles.stateTitle}>Die Übertragung ist gleich zurück</Text>
            <Text style={styles.stateSub}>Kurze Pause auf der Fläche. Bleib dran.</Text>
          </Animated.View>
        ) : show.status === 'ended' && !isReplay ? (
          <Animated.View entering={FadeIn} style={[styles.state, styles.stateDim]} pointerEvents="none">
            <Text style={styles.stateKicker}>DAS WAR'S</Text>
            <Text style={styles.stateTitle}>Danke fürs Zuschauen!</Text>
            <Text style={styles.stateSub}>Die Aufzeichnung folgt in Kürze.</Text>
          </Animated.View>
        ) : spinner ? (
          <View style={styles.state} pointerEvents="none"><Spinner /></View>
        ) : null}
        {seekFx ? (
          <Animated.View
            key={`${seekFx.side}-${seekFx.key}`}
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(260)}
            pointerEvents="none"
            style={[styles.ripple, seekFx.side === 'back' ? styles.rippleLeft : styles.rippleRight, { width: vw * 0.42 }]}
          >
            <LiveIcon name={seekFx.side === 'back' ? 'play-back' : 'play-forward'} size={22} color="#fff" />
            <Text style={styles.rippleText}>{`${seekFx.seconds} Sekunden`}</Text>
          </Animated.View>
        ) : null}
        {isReplay && !controlsVisible ? <ProgressLine progress={replay?.progress ?? 0} /> : null}
        {videoLayer}
      </View>

      {/* Tap catcher (whole screen, below overlay + controls). */}
      <GestureDetector gesture={tapGesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} accessibilityLabel="Steuerung ein- oder ausblenden" />
      </GestureDetector>

      <View
        style={[
          styles.reactions,
          landscape
            ? { right: Math.max(insets.right, 8), bottom: 24, height: Math.round(H * 0.8) }
            : { right: Math.max(insets.right, 6), bottom: Math.round(H * 0.48), height: Math.round(H * 0.4) },
        ]}
        pointerEvents="none"
      >
        <FloatingReactions ref={reactionsRef} height={landscape ? Math.round(H * 0.8) : Math.round(H * 0.4)} />
      </View>

      {landscape ? (
        // ─── Landscape: video only; a tap shows minimal controls that fade again ───
        <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents={controlsVisible ? 'box-none' : 'none'}>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} style={styles.bottomShade} pointerEvents="none" />
          {centreControls}
          {scrubber}
          <View
            style={[styles.landBar, { left: Math.max(insets.left, 16), right: Math.max(insets.right, 12), bottom: replay ? 22 : 10 }]}
            pointerEvents="box-none"
          >
            <View style={styles.landMeta} pointerEvents="box-none">
              {isLive ? (
                <LiveInfo show={show} viewers={viewers} behind={behindLive} onJumpToLive={onJumpToLive} />
              ) : isReplay && replay ? (
                <Text style={styles.timeText}>{`${formatTime(replay.currentTime)} / ${formatTime(replay.duration)}`}</Text>
              ) : null}
            </View>
            {hasVideo ? (
              <ChromeButton icon={muted ? 'volume-mute' : 'volume-high'} label={muted ? 'Ton an' : 'Ton aus'} onPress={() => { poke(); onToggleMute(); }} size={20} disc />
            ) : null}
            <ChromeButton icon="contract-outline" label="Hochformat" onPress={toPortrait} size={20} disc />
          </View>
        </Animated.View>
      ) : (
        <>
          {/* Room overlay (chat + actions): visible in portrait unless the viewer tapped into the clean view. */}
          {overlay ? (
            <Animated.View style={[StyleSheet.absoluteFill, cleanStyle]} pointerEvents={clean ? 'none' : 'box-none'}>
              {overlay(api)}
            </Animated.View>
          ) : null}

          {/* Playback controls over the video (fade). */}
          <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents={controlsVisible ? 'box-none' : 'none'}>
            {centreControls}
            {scrubber}
          </Animated.View>

          {/* Top bar (portrait; hidden with the clean view). */}
          <Animated.View style={[StyleSheet.absoluteFill, cleanStyle]} pointerEvents={clean ? 'none' : 'box-none'}>
          <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={[styles.topShade, { height: insets.top + 96 }]} pointerEvents="none" />
          <View
            style={[styles.topBar, { paddingTop: Math.max(insets.top, 10), paddingLeft: Math.max(insets.left, 8), paddingRight: Math.max(insets.right, 8) }]}
            pointerEvents="box-none"
          >
            <View style={styles.topRow} pointerEvents="box-none">
              <ChromeButton icon="chevron-down" label="Live verlassen" onPress={onClose} size={24} disc />
              <View style={styles.meta} pointerEvents="box-none">
                {isLive ? (
                  <LiveInfo show={show} viewers={viewers} behind={behindLive} onJumpToLive={onJumpToLive} />
                ) : isReplay && replay ? (
                  <Text style={styles.timeText}>{`${formatTime(replay.currentTime)} / ${formatTime(replay.duration)}`}</Text>
                ) : (
                  <View style={styles.infoRow}>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>{show.status === 'scheduled' ? 'BALD LIVE' : 'BEENDET'}</Text>
                    </View>
                    <ViewerPill viewers={viewers} />
                  </View>
                )}
              </View>
              {hasVideo ? <CastButton onOpenSheet={() => { poke(); onOpenCast(); }} disc /> : null}
              {hasVideo ? (
                <ChromeButton icon={muted ? 'volume-mute' : 'volume-high'} label={muted ? 'Ton an' : 'Ton aus'} onPress={() => { poke(); onToggleMute(); }} size={18} disc />
              ) : null}
              {hasVideo && Platform.OS !== 'web' ? (
                <ChromeButton icon="phone-landscape-outline" label="Querformat" onPress={rotate} size={19} disc />
              ) : null}
              {hasVideo ? (
                <ChromeButton icon="settings-outline" label="Einstellungen" onPress={() => { poke(); onOpenSettings(); }} size={19} disc />
              ) : null}
            </View>
            <View style={styles.titleRow} pointerEvents="none">
              <Text style={styles.title} numberOfLines={1}>{show.title}</Text>
              {show.is_test === true ? (
                <View style={styles.testPill} accessibilityLabel="Testlauf">
                  <Text style={styles.testPillText}>TESTLAUF</Text>
                </View>
              ) : null}
            </View>
          </View>
          </Animated.View>
        </>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  wash: { opacity: 0.45 },
  videoBox: { position: 'absolute', backgroundColor: '#000', overflow: 'hidden' },
  posterDim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  reactions: { position: 'absolute', width: 80 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, gap: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 6, minWidth: 0 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, height: 24, borderRadius: 6, justifyContent: 'center' },
  statusPillText: { color: '#fff', fontSize: 11, fontFamily: F.semiBold, letterSpacing: 0.8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, marginTop: 2 },
  title: { flexShrink: 1, color: '#fff', fontSize: 15, fontFamily: F.semiBold },
  testPill: { backgroundColor: VIDEO.gold, paddingHorizontal: 7, height: 20, borderRadius: 5, justifyContent: 'center' },
  testPillText: { color: '#1B1B1B', fontSize: 10, fontFamily: F.bold, letterSpacing: 1 },
  timeText: { color: '#fff', fontSize: 12, fontFamily: F.semiBold, fontVariant: ['tabular-nums'] },
  center: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 44 },
  playBtn: { width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  pressedDisc: { backgroundColor: 'rgba(255,255,255,0.14)' },
  playNudge: { marginLeft: 4 },
  skipBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  scrubAt: { position: 'absolute' },
  landBar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  landMeta: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  state: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 32 },
  stateDim: { backgroundColor: 'rgba(12,13,15,0.72)' },
  stateKicker: { color: VIDEO.accent, fontSize: 12, fontFamily: F.bold, letterSpacing: 1.6 },
  stateTitle: { color: VIDEO.text, fontSize: 18, fontFamily: F.heading, textAlign: 'center', marginTop: 4 },
  stateSub: { color: VIDEO.textSecondary, fontSize: 13, fontFamily: F.medium, textAlign: 'center' },
  countdownWrap: { alignItems: 'center', gap: 2 },
  countdown: { color: VIDEO.text, fontSize: 40, fontFamily: F.heading, fontVariant: ['tabular-nums'], letterSpacing: 1 },
  ripple: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  rippleLeft: { left: 0, borderTopRightRadius: 9999, borderBottomRightRadius: 9999 },
  rippleRight: { right: 0, borderTopLeftRadius: 9999, borderBottomLeftRadius: 9999 },
  rippleText: { color: '#fff', fontSize: 12, fontFamily: F.semiBold },
});
