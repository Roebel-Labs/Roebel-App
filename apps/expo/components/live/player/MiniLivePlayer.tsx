// Floating in-app mini player: the live stream keeps playing (16:9, ~42 % of the screen width) after
// the viewer leaves the live room. Drag to any of the 4 corners (snaps), "Öffnen" goes back into the
// room, X stops and releases the stream. Hidden on every /live/* route (room, join screen).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEvent } from 'expo';
import { VideoView, type VideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';
import { F } from '../tokens';
import { haptic, LiveDot, safely, Spinner } from './chrome';
import type { LiveSession } from './LivePlayerProvider';

const MARGIN = 12;
const SPRING = { damping: 20, stiffness: 220, mass: 0.7 };

type Props = { player: VideoPlayer; session: LiveSession; onClose: () => void };

export default function MiniLivePlayer({ player, session, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const w = Math.round(Math.min(screenW, screenH) * 0.42);
  const h = Math.round((w * 9) / 16);

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // Corner anchors (top-left of the card).
  const corners = useMemo(() => {
    const left = MARGIN;
    const right = screenW - w - MARGIN;
    const top = insets.top + 56;
    const bottom = screenH - h - Math.max(insets.bottom, 8) - BOTTOM_NAV_HEIGHT - MARGIN;
    return { left, right, top, bottom };
  }, [screenW, screenH, w, h, insets.top, insets.bottom]);

  const [corner, setCorner] = useState<{ right: boolean; bottom: boolean }>({ right: true, bottom: true });
  const x = useSharedValue(corners.right);
  const y = useSharedValue(corners.bottom);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Re-anchor on rotation / inset changes.
  useEffect(() => {
    x.value = withSpring(corner.right ? corners.right : corners.left, SPRING);
    y.value = withSpring(corner.bottom ? corners.bottom : corners.top, SPRING);
  }, [corners, corner, x, y]);

  const open = useCallback(() => {
    haptic();
    router.push(`/live/${encodeURIComponent(session.slug)}` as never);
  }, [router, session.slug]);

  const close = useCallback(() => {
    haptic();
    onClose();
  }, [onClose]);

  const togglePlay = useCallback(() => {
    haptic();
    safely(() => { if (player.playing) player.pause(); else player.play(); });
  }, [player]);

  // JS-thread gestures (runOnJS(true)): shared values are written from JS, no worklet helpers.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(6)
      .onBegin(() => {
        startX.value = x.value;
        startY.value = y.value;
      })
      .onUpdate((e) => {
        x.value = startX.value + e.translationX;
        y.value = startY.value + e.translationY;
      })
      .onEnd((e) => {
        // Project the fling a little, then pick the nearest corner.
        const px = x.value + e.velocityX * 0.12 + w / 2;
        const py = y.value + e.velocityY * 0.12 + h / 2;
        const next = { right: px > screenW / 2, bottom: py > screenH / 2 };
        setCorner(next);
        x.value = withSpring(next.right ? corners.right : corners.left, { ...SPRING, velocity: e.velocityX });
        y.value = withSpring(next.bottom ? corners.bottom : corners.top, { ...SPRING, velocity: e.velocityY });
      });
    const tap = Gesture.Tap().runOnJS(true).maxDuration(300).onEnd((_e, ok) => { if (ok) open(); });
    return Gesture.Race(pan, tap);
  }, [x, y, startX, startY, w, h, screenW, screenH, corners, open]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));

  if (pathname.startsWith('/live')) return null;

  const loading = status === 'loading' || (status !== 'readyToPlay' && !isPlaying);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(160)}
        style={[styles.card, { width: w, height: h }, cardStyle]}
      >
        <GestureDetector gesture={gesture}>
          <View style={StyleSheet.absoluteFill} collapsable={false} accessibilityRole="button" accessibilityLabel={`Live öffnen: ${session.title}`}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
              allowsPictureInPicture
              startsPictureInPictureAutomatically
              pointerEvents="none"
            />
            {loading ? <View style={styles.center} pointerEvents="none"><Spinner size={24} /></View> : null}
            {!isPlaying && !loading ? (
              <View style={styles.center} pointerEvents="box-none">
                <Pressable onPress={togglePlay} hitSlop={8} style={styles.play} accessibilityRole="button" accessibilityLabel="Abspielen">
                  <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
                </Pressable>
              </View>
            ) : null}
          </View>
        </GestureDetector>

        {session.isLive ? (
          <View style={styles.livePill} pointerEvents="none">
            <LiveDot />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : null}
        <View style={styles.actions} pointerEvents="box-none">
          <Pressable onPress={open} hitSlop={6} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Vollbild öffnen">
            <Ionicons name="expand" size={15} color="#fff" />
          </Pressable>
          <Pressable onPress={close} hitSlop={6} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Wiedergabe beenden">
            <Ionicons name="close" size={17} color="#fff" />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', top: 0, left: 0, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  play: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  livePill: {
    position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, height: 18, borderRadius: 9,
  },
  liveText: { color: '#fff', fontSize: 10, fontFamily: F.bold, letterSpacing: 0.6 },
  actions: { position: 'absolute', top: 4, right: 4, flexDirection: 'row', gap: 4 },
  iconBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});
