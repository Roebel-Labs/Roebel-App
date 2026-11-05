// Immersive fullscreen (TikTok / Instagram Live / eBay Live), not the native fullscreen: black,
// blurred poster wash, the video contained and centred, our own top bar (close, title, LIVE + running
// time, viewers, cast / share / mute / rotate / settings) and the room's `overlay` (chat + actions,
// built by the room) on top. Controls + overlay fade out after 4 s without interaction; a tap toggles
// them, double-tap = ❤️ (live) or ±10 s (replay). Rotation via expo-screen-orientation.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, type VideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { LiveShow } from '@/lib/live';
import FloatingReactions, { type FloatingReactionsHandle } from '../FloatingReactions';
import { F, VIDEO } from '../tokens';
import { CastButton } from './CastButton';
import { ChromeButton, formatTime, haptic, LiveInfo, shareShow, Spinner, ViewerPill } from './chrome';
import ScrubBar from './ScrubBar';

export type FullscreenOverlayApi = { controlsVisible: boolean; poke: () => void; exit: () => void };

const HIDE_MS = 4000;

export type ReplayBar = {
  progress: number;
  buffered: number;
  scrubbing: boolean;
  currentTime: number;
  duration: number;
  onScrub: (f: number) => void;
  onRelease: (f: number) => void;
};

type Props = {
  visible: boolean;
  player: VideoPlayer;
  /** Mount the VideoView (false for a frame while the inline view detaches, and when there is no source). */
  attachVideo: boolean;
  show: LiveShow;
  viewers: number;
  isLive: boolean;
  isReplay: boolean;
  isPlaying: boolean;
  ended: boolean;
  muted: boolean;
  stalled: boolean;
  spinner: boolean;
  canControlPlayback: boolean;
  behindLive: boolean;
  /** Keep the controls up (a sheet is open). */
  hold: boolean;
  replay: ReplayBar | null;
  reactionsRef: React.Ref<FloatingReactionsHandle>;
  onSpawnHeart: () => void;
  onExit: () => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onJumpToLive: () => void;
  onSeek: (dir: 'back' | 'forward') => void;
  onOpenSettings: () => void;
  onOpenCast: () => void;
  overlay?: (api: FullscreenOverlayApi) => React.ReactNode;
  /** Sheets (settings, cast) rendered inside this modal's tree so they stack above it. */
  children?: React.ReactNode;
};

function lockOrientation(landscape: boolean) {
  if (Platform.OS === 'web') return;
  void ScreenOrientation.lockAsync(
    landscape ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP,
  ).catch(() => undefined);
}

export default function ImmersiveFullscreen(props: Props) {
  const {
    visible, player, attachVideo, show, viewers, isLive, isReplay, isPlaying, ended, muted, stalled, spinner,
    canControlPlayback, behindLive, hold, replay, reactionsRef, onSpawnHeart, onExit, onTogglePlay, onToggleMute,
    onJumpToLive, onSeek, onOpenSettings, onOpenCast, overlay, children,
  } = props;
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [landscape, setLandscape] = useState(false);

  // Contain 16:9 inside the screen.
  const vw = Math.min(W, (H * 16) / 9);
  const vh = Math.round((vw * 9) / 16);
  const videoTop = Math.max(0, Math.round((H - vh) / 2));

  // ─── Controls auto-hide ───
  const [shown, setShown] = useState(true);
  const [pokeNonce, setPokeNonce] = useState(0);
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const a = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => { a.remove(); b.remove(); };
  }, [visible]);
  const holdOpen = stalled || !attachVideo || hold || keyboardUp || (replay?.scrubbing ?? false);
  const controlsVisible = shown || holdOpen;
  useEffect(() => {
    if (!visible || !shown || holdOpen || !isPlaying) return;
    const t = setTimeout(() => setShown(false), HIDE_MS);
    return () => clearTimeout(t);
  }, [visible, shown, holdOpen, isPlaying, pokeNonce]);
  const poke = useCallback(() => { setShown(true); setPokeNonce((n) => n + 1); }, []);
  useEffect(() => { if (visible) poke(); }, [visible, poke]);

  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withTiming(controlsVisible ? 1 : 0, { duration: controlsVisible ? 160 : 320 });
  }, [controlsVisible, opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const exit = useCallback(() => {
    if (landscape) { setLandscape(false); lockOrientation(false); }
    onExit();
  }, [landscape, onExit]);

  // Leaving fullscreen by any path → back to the app's portrait lock.
  useEffect(() => {
    if (!visible && landscape) { setLandscape(false); lockOrientation(false); }
  }, [visible, landscape]);
  useEffect(() => () => lockOrientation(false), []);

  const rotate = useCallback(() => {
    haptic();
    poke();
    setLandscape((cur) => { lockOrientation(!cur); return !cur; });
  }, [poke]);

  // ─── Gestures (JS thread) ───
  const tapGesture = useMemo(() => {
    const single = Gesture.Tap().runOnJS(true).maxDuration(300).onEnd((_e, ok) => {
      if (!ok) return;
      if (controlsVisible && !holdOpen) setShown(false);
      else poke();
    });
    const double = Gesture.Tap().runOnJS(true).numberOfTaps(2).maxDelay(260).onEnd((e, ok) => {
      if (!ok) return;
      if (isReplay) onSeek(e.x < W / 2 ? 'back' : 'forward');
      else onSpawnHeart();
    });
    return Gesture.Exclusive(double, single);
  }, [controlsVisible, holdOpen, poke, isReplay, onSeek, onSpawnHeart, W]);

  const api = useMemo<FullscreenOverlayApi>(() => ({ controlsVisible, poke, exit }), [controlsVisible, poke, exit]);
  const poster = show.poster_url;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={exit}
    >
      <GestureHandlerRootView style={styles.root}>
        <StatusBar hidden animated />
        {/* Background wash: the poster blurred and dimmed, fading to black. */}
        {poster ? (
          <Image source={{ uri: poster }} style={[StyleSheet.absoluteFill, { opacity: 0.45 }]} contentFit="cover" blurRadius={40} />
        ) : null}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(10,12,16,0.82)', '#000']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={[styles.videoBox, { top: videoTop, width: vw, height: vh, left: (W - vw) / 2 }]}>
          {attachVideo ? (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              nativeControls={false}
              allowsPictureInPicture
              startsPictureInPictureAutomatically
            />
          ) : null}
          {stalled ? (
            <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut} style={[styles.state, styles.stateDim]} pointerEvents="none">
              <Spinner size={36} />
              <Text style={styles.stateTitle}>Die Übertragung ist gleich zurück</Text>
              <Text style={styles.stateSub}>Kurze Pause auf der Fläche. Bleib dran.</Text>
            </Animated.View>
          ) : spinner ? (
            <View style={styles.state} pointerEvents="none"><Spinner /></View>
          ) : null}
        </View>

        {/* Tap catcher (whole screen, below overlay + controls). */}
        <GestureDetector gesture={tapGesture}>
          <View style={StyleSheet.absoluteFill} collapsable={false} accessibilityLabel="Steuerung ein- oder ausblenden" />
        </GestureDetector>

        <View style={[styles.reactions, { bottom: Math.round(H * 0.22), height: Math.round(H * 0.5) }]} pointerEvents="none">
          <FloatingReactions ref={reactionsRef} height={Math.round(H * 0.5)} />
        </View>

        {/* Room overlay (chat + actions). It fades itself from api.controlsVisible (it may keep a focused
            composer up), so no opacity wrapper here. */}
        {overlay ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {overlay(api)}
          </View>
        ) : null}

        {/* Own controls. */}
        <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents={controlsVisible ? 'box-none' : 'none'}>
          <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={[styles.topShade, { height: insets.top + 110 }]} pointerEvents="none" />
          <View
            style={[styles.topBar, { paddingTop: Math.max(insets.top, 10), paddingLeft: Math.max(insets.left, 8), paddingRight: Math.max(insets.right, 8) }]}
            pointerEvents="box-none"
          >
            <View style={styles.topRow} pointerEvents="box-none">
              <ChromeButton icon="close" label="Vollbild schließen" onPress={() => { haptic(); exit(); }} size={22} disc />
              <View style={styles.meta} pointerEvents="box-none">
                {isLive ? (
                  <LiveInfo show={show} viewers={viewers} behind={behindLive} onJumpToLive={onJumpToLive} />
                ) : isReplay && replay ? (
                  <Text style={styles.timeText}>{`${formatTime(replay.currentTime)} / ${formatTime(replay.duration)}`}</Text>
                ) : (
                  <ViewerPill viewers={viewers} />
                )}
              </View>
              <CastButton onOpenSheet={() => { poke(); onOpenCast(); }} disc />
              <ChromeButton icon="share-outline" label="Teilen" onPress={() => { haptic(); poke(); void shareShow(show); }} size={19} disc />
              <ChromeButton icon={muted ? 'volume-mute' : 'volume-high'} label={muted ? 'Ton an' : 'Ton aus'} onPress={() => { poke(); onToggleMute(); }} size={18} disc />
              {Platform.OS !== 'web' ? (
                <ChromeButton icon="phone-landscape-outline" label={landscape ? 'Hochformat' : 'Querformat'} onPress={rotate} size={19} disc />
              ) : null}
              <ChromeButton icon="settings-outline" label="Einstellungen" onPress={() => { poke(); onOpenSettings(); }} size={19} disc />
            </View>
            <Text style={styles.title} numberOfLines={1}>{show.title}</Text>
          </View>

          {canControlPlayback && !spinner ? (
            <View style={[styles.center, { top: videoTop, height: vh }]} pointerEvents="box-none">
              {isReplay ? (
                <Pressable onPress={() => { poke(); onSeek('back'); }} hitSlop={10} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="10 Sekunden zurück">
                  <Ionicons name="play-back" size={22} color="#fff" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => { poke(); onTogglePlay(); }}
                style={({ pressed }) => [styles.playBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}
                accessibilityRole="button"
                accessibilityLabel={ended ? 'Erneut abspielen' : isPlaying ? 'Pause' : 'Abspielen'}
              >
                <Ionicons name={ended ? 'refresh' : isPlaying ? 'pause' : 'play'} size={34} color="#fff" style={!isPlaying && !ended ? { marginLeft: 4 } : null} />
              </Pressable>
              {isReplay ? (
                <Pressable onPress={() => { poke(); onSeek('forward'); }} hitSlop={10} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="10 Sekunden vor">
                  <Ionicons name="play-forward" size={22} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {replay ? (
            <View style={{ position: 'absolute', top: videoTop + vh - 20, left: (W - vw) / 2 }}>
              <ScrubBar
                width={vw}
                progress={replay.progress}
                buffered={replay.buffered}
                active={replay.scrubbing}
                onScrub={replay.onScrub}
                onRelease={(f) => { replay.onRelease(f); poke(); }}
              />
            </View>
          ) : null}
        </Animated.View>

        {children}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  videoBox: { position: 'absolute', backgroundColor: '#000', overflow: 'hidden' },
  reactions: { position: 'absolute', right: 0, width: 90 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, gap: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 6, minWidth: 0 },
  title: { color: '#fff', fontSize: 15, fontFamily: F.semiBold, paddingHorizontal: 8, marginTop: 2 },
  timeText: { color: '#fff', fontSize: 12, fontFamily: F.semiBold, fontVariant: ['tabular-nums'] },
  center: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 44 },
  playBtn: { width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  skipBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  state: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 32 },
  stateDim: { backgroundColor: 'rgba(12,13,15,0.72)' },
  stateTitle: { color: VIDEO.text, fontSize: 18, fontFamily: F.heading, textAlign: 'center', marginTop: 4 },
  stateSub: { color: VIDEO.textSecondary, fontSize: 13, fontFamily: F.medium, textAlign: 'center' },
});
