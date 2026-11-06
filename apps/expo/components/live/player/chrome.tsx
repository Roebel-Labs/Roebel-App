// Shared on-video chrome for the live player (inline, immersive fullscreen and mini player):
// LIVE dot, buffering ring, round icon buttons, running time, viewer pill, share.
// The video area is black in every app theme, so everything here uses fixed white-on-dark colours.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { formatViewers, type LiveShow } from '@/lib/live';
import { F } from '../tokens';

export const YT_RED = '#FF0033';
export const LIVE_WEB_BASE = 'https://www.roebel.app/live/';

export function haptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

export function safely(fn: () => void) {
  try { fn(); } catch { /* player released or call unsupported on this runtime */ }
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Replay clock: M:SS or H:MM:SS. */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Overlay keys added in Part 3 (live_since, youtube_url); read defensively, older rows lack them. */
type OverlayExtras = { live_since?: string | null; youtube_url?: string | null };

function overlayExtras(show: LiveShow): OverlayExtras {
  const o = show.overlay as unknown;
  return o && typeof o === 'object' ? (o as OverlayExtras) : {};
}

/**
 * When the current live run started (overlay.live_since, set by the server each time the show goes LIVE).
 * No fallback to starts_at: that is the planned start, not the broadcast start (showed "15:13:50").
 * Implausible values (future, or older than 24 h) hide the timer instead of showing nonsense.
 */
export function liveSinceOf(show: LiveShow): string | null {
  if (show.status !== 'live') return null;
  const since = overlayExtras(show).live_since;
  if (typeof since !== 'string' || !since) return null;
  const age = Date.now() - Date.parse(since);
  return Number.isFinite(age) && age >= -60_000 && age < 24 * 3600_000 ? since : null;
}

export function youtubeUrlOf(show: LiveShow): string | null {
  const u = overlayExtras(show).youtube_url;
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null;
}

/** H:MM:SS */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Ticking running time since `since` (renders nothing for a missing / future / invalid timestamp). */
export function RunningTime({ since, style }: { since: string | null; style?: object }) {
  const [now, setNow] = useState(Date.now());
  const start = since ? Date.parse(since) : NaN;
  const valid = Number.isFinite(start);
  useEffect(() => {
    if (!valid) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [valid]);
  if (!valid || now < start) return null;
  return <Text style={[styles.time, style]} accessibilityLabel="Laufzeit">{formatElapsed(now - start)}</Text>;
}

export function LiveDot() {
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
export function Spinner({ size = 44 }: { size?: number }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
  }, [r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  const ring = { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size * 0.08) };
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, ring, { borderColor: 'rgba(255,255,255,0.18)' }]} />
      <Animated.View
        style={[StyleSheet.absoluteFill, ring, { borderColor: 'transparent', borderTopColor: '#fff', borderRightColor: '#fff' }, style]}
      />
    </View>
  );
}

type ChromeButtonProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  size?: number;
  /** Small dark disc behind the icon (fullscreen / mini player, where the video can be bright). */
  disc?: boolean;
};

export function ChromeButton({ icon, label, onPress, size = 22, disc }: ChromeButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.chromeBtn, disc && styles.chromeDisc, pressed && styles.chromePressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={size} color="#fff" />
    </Pressable>
  );
}

export function ViewerPill({ viewers }: { viewers: number }) {
  if (viewers <= 0) return null;
  return (
    <View style={styles.viewerPill} pointerEvents="none" accessibilityLabel={`${viewers} Zuschauer`}>
      <Ionicons name="eye-outline" size={13} color="#fff" />
      <Text style={styles.viewerText}>{formatViewers(viewers)}</Text>
    </View>
  );
}

/** Twitch-style info block: red dot + LIVE + running time, viewer pill. */
export function LiveInfo({ show, viewers, behind, onJumpToLive }: {
  show: LiveShow; viewers: number; behind?: boolean; onJumpToLive?: () => void;
}) {
  return (
    <View style={styles.infoRow} pointerEvents="box-none">
      <Pressable
        onPress={behind ? onJumpToLive : undefined}
        disabled={!behind}
        hitSlop={8}
        style={styles.liveIndicator}
        accessibilityRole="button"
        accessibilityLabel={behind ? 'Zum Live-Bild springen' : 'Live'}
      >
        {behind ? <View style={[styles.liveDot, styles.liveDotBehind]} /> : <LiveDot />}
        <Text style={[styles.liveText, behind && styles.liveTextBehind]}>LIVE</Text>
        <RunningTime since={liveSinceOf(show)} />
      </Pressable>
      <ViewerPill viewers={viewers} />
    </View>
  );
}

export async function shareShow(show: LiveShow) {
  const url = `${LIVE_WEB_BASE}${encodeURIComponent(show.slug)}`;
  const text = show.status === 'live'
    ? `${show.title} – jetzt live in der Röbel App`
    : `${show.title} – in der Röbel App`;
  try {
    await Share.share(
      Platform.OS === 'ios' ? { message: text, url } : { message: `${text}: ${url}`, title: show.title },
      { dialogTitle: 'Live teilen' },
    );
  } catch { /* dismissed */ }
}

const styles = StyleSheet.create({
  time: { color: 'rgba(255,255,255,0.86)', fontSize: 12, fontFamily: F.semiBold, fontVariant: ['tabular-nums'], marginLeft: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: YT_RED },
  liveDotBehind: { backgroundColor: 'rgba(255,255,255,0.55)' },
  liveText: { color: '#fff', fontSize: 13, fontFamily: F.bold, letterSpacing: 0.6 },
  liveTextBehind: { color: 'rgba(255,255,255,0.7)' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chromeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chromeDisc: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.38)' },
  chromePressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, height: 24, borderRadius: 12,
  },
  viewerText: { color: '#fff', fontSize: 12, fontFamily: F.semiBold, fontVariant: ['tabular-nums'] },
});
