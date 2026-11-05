import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import Animated, {
  Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { countdownParts, formatClock, formatViewers, type LiveShow } from '@/lib/live';
import FloatingReactions, { type FloatingReactionsHandle } from './FloatingReactions';
import { F, LIVE } from './tokens';

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

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
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

/** 16:9 native player with the pre-show, reconnect and end states and the on-video chrome. */
const LivePlayer = forwardRef<FloatingReactionsHandle, Props>(function LivePlayer({ show, width, topInset, viewers, onClose }, reactionsRef) {
  const height = Math.round((width * 9) / 16);
  const isLive = show.status === 'live';
  const isReplay = show.status === 'ended' && !!show.replay_url;
  const source = isLive ? show.hls_url : isReplay ? show.replay_url : null;

  const player = useVideoPlayer(null, (p) => {
    safely(() => { p.staysActiveInBackground = true; });
    safely(() => { p.showNowPlayingNotification = true; });
    safely(() => { p.loop = false; });
  });
  const viewRef = useRef<VideoView>(null);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const [reloadNonce, setReloadNonce] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const lastLoadAt = useRef(0);

  useEffect(() => {
    if (!source) {
      safely(() => player.pause());
      return;
    }
    lastLoadAt.current = Date.now();
    void loadSource(player, source, show);
    // show is read for the now-playing metadata only; reload on source / retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, source, reloadNonce]);

  useEffect(() => {
    if (isPlaying) setHasPlayed(true);
  }, [isPlaying]);

  // Live: not playing for a while (input offline, break, network) → calm reconnect state.
  const healthy = status === 'readyToPlay' && isPlaying;
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

  const enterFullscreen = useCallback(() => {
    void viewRef.current?.enterFullscreen().catch(() => undefined);
  }, []);

  const showVideo = !!source;
  const showPoster = !showVideo || (!hasPlayed && !stalled);
  const poster = show.poster_url;
  const loadingFirst = showVideo && !hasPlayed && !stalled;

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      <View style={{ width, height, backgroundColor: '#000' }}>
        {showVideo ? (
          <VideoView
            ref={viewRef}
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={isReplay}
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

        {/* Tap anywhere → native fullscreen (live only; the replay uses the native controls). */}
        {isLive && showVideo && !stalled ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={enterFullscreen} accessibilityLabel="Vollbild" />
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
            <ActivityIndicator color={LIVE.text} />
            <Text style={styles.stateTitle}>Die Übertragung ist gleich zurück</Text>
            <Text style={styles.stateSub}>Kurze Pause auf der Fläche. Bleib dran.</Text>
          </Animated.View>
        ) : null}
        {isLive && loadingFirst && show.hls_url ? (
          <View style={styles.stateLayer} pointerEvents="none"><ActivityIndicator color={LIVE.text} /></View>
        ) : null}
        {show.status === 'ended' && !isReplay ? (
          <Animated.View entering={FadeIn} style={[styles.stateLayer, styles.stateDim]} pointerEvents="none">
            <Text style={styles.stateKicker}>DAS WAR'S</Text>
            <Text style={styles.stateTitle}>Danke fürs Zuschauen!</Text>
            <Text style={styles.stateSub}>Die Aufzeichnung folgt in Kürze.</Text>
          </Animated.View>
        ) : null}

        {/* Top chrome */}
        <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={styles.topShade} pointerEvents="none" />
        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.pills} pointerEvents="none">
            {isLive ? (
              <View style={styles.livePill}>
                <LiveDot />
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
            ) : (
              <View style={styles.mutedPill}>
                <Text style={styles.mutedPillText}>{show.status === 'scheduled' ? 'BALD LIVE' : isReplay ? 'AUFZEICHNUNG' : 'BEENDET'}</Text>
              </View>
            )}
            {show.is_test === true ? (
              <View style={styles.testPill} accessibilityLabel="Testlauf">
                <Text style={styles.testPillText}>TESTLAUF</Text>
              </View>
            ) : null}
            {viewers > 0 ? (
              <View style={styles.viewerPill}>
                <Ionicons name="eye-outline" size={13} color={LIVE.text} />
                <Text style={styles.viewerText}>{formatViewers(viewers)}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.topActions}>
            {showVideo ? (
              <Pressable onPress={enterFullscreen} hitSlop={10} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Vollbild">
                <Ionicons name="expand-outline" size={17} color={LIVE.text} />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={10} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Schließen">
              <Ionicons name="chevron-down" size={20} color={LIVE.text} />
            </Pressable>
          </View>
        </View>

        <FloatingReactions ref={reactionsRef} height={height} />
      </View>
    </View>
  );
});

export default LivePlayer;

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#000' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 72 },
  topBar: {
    position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: LIVE.red, paddingHorizontal: 8, height: 24, borderRadius: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontSize: 12, fontFamily: F.bold, letterSpacing: 0.8 },
  mutedPill: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, height: 24, borderRadius: 6, justifyContent: 'center' },
  mutedPillText: { color: '#fff', fontSize: 11, fontFamily: F.semiBold, letterSpacing: 0.8 },
  testPill: { backgroundColor: LIVE.gold, paddingHorizontal: 8, height: 24, borderRadius: 6, justifyContent: 'center' },
  testPillText: { color: '#1B1B1B', fontSize: 11, fontFamily: F.bold, letterSpacing: 1 },
  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, height: 24, borderRadius: 6,
  },
  viewerText: { color: '#fff', fontSize: 12, fontFamily: F.semiBold, fontVariant: ['tabular-nums'] },
  topActions: { flexDirection: 'row', gap: 8 },
  roundBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  stateLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 32 },
  stateDim: { backgroundColor: 'rgba(12,13,15,0.72)' },
  stateKicker: { color: LIVE.accent, fontSize: 12, fontFamily: F.bold, letterSpacing: 1.6 },
  stateTitle: { color: LIVE.text, fontSize: 18, fontFamily: F.heading, textAlign: 'center', marginTop: 4 },
  stateSub: { color: LIVE.textSecondary, fontSize: 13, fontFamily: F.medium, textAlign: 'center' },
  countdownWrap: { alignItems: 'center', gap: 2 },
  countdown: { color: LIVE.text, fontSize: 40, fontFamily: F.heading, fontVariant: ['tabular-nums'], letterSpacing: 1 },
});
