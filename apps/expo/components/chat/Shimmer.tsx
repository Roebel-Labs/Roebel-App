import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { chatDarkTokens, chatFont, chatSize, useChatTokens } from './tokens';

/**
 * Chat-suite shimmer skeletons. Technique mirrors components/feed/Shimmer
 * (reanimated sweep + expo-linear-gradient band), but the clock is ONE
 * module-level shared value so every block in the chat suite sweeps in
 * phase without needing a provider. The loop runs only while at least one
 * block is mounted (ref-counted).
 */

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

const SWEEP_DURATION_MS = 1300;
const SWEEP_WIDTH = 110;

const sweepProgress = makeMutable(0);
let subscribers = 0;

function subscribeSweep() {
  subscribers += 1;
  if (subscribers === 1) {
    sweepProgress.value = 0;
    sweepProgress.value = withRepeat(
      withTiming(1, { duration: SWEEP_DURATION_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }
  return () => {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) cancelAnimation(sweepProgress);
  };
}

/** Band x-offset for a block of `width` at loop progress `p` (0→1). */
function sweepOffset(p: number, width: number): number {
  'worklet';
  return -SWEEP_WIDTH + p * (width + SWEEP_WIDTH * 2);
}

function useSweepWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((prev) => (prev === w ? prev : w));
  };
  return { width, onLayout };
}

/** The moving light band; parent must be `overflow: hidden`. */
function Sweep({ width, inverse, tone }: { width: number; inverse?: boolean; tone?: 'auto' | 'dark' }) {
  const themed = useChatTokens();
  const t = tone === 'dark' ? chatDarkTokens : themed;
  useEffect(() => subscribeSweep(), []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: sweepOffset(sweepProgress.value, width) }],
  }));
  const band = inverse ? t.skeletonHighlightInverse : t.skeletonHighlight;
  return (
    <AnimatedGradient
      pointerEvents="none"
      colors={['transparent', band, 'transparent']}
      start={{ x: 0, y: 0.4 }}
      end={{ x: 1, y: 0.6 }}
      style={[styles.sweep, style]}
    />
  );
}

export type ShimmerBlockProps = {
  width?: DimensionValue;
  height: number;
  radius?: number;
  /** 'dark' forces the dark palette (e.g. on the black computer screen). */
  tone?: 'auto' | 'dark';
  style?: StyleProp<ViewStyle>;
};

/** A single grey skeleton shape with the synced sweep. */
export function ShimmerBlock({ width = '100%', height, radius = 6, tone = 'auto', style }: ShimmerBlockProps) {
  const themed = useChatTokens();
  const t = tone === 'dark' ? chatDarkTokens : themed;
  const { width: w, onLayout } = useSweepWidth();
  return (
    <View
      onLayout={onLayout}
      style={[styles.block, { width, height, borderRadius: radius, backgroundColor: t.skeleton }, style]}
    >
      {w > 0 ? <Sweep width={w} tone={tone} /> : null}
    </View>
  );
}

export type ShimmerLineProps = {
  /** With a label: the text itself shimmers (busy button / status line). */
  label?: string;
  /** Without a label: bar width (default 120). */
  width?: DimensionValue;
  height?: number;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  /** Label color; defaults to textSecondary. */
  color?: string;
  /** Sweep tuned for black / primaryButton surfaces. */
  inverse?: boolean;
  accessibilityLabel?: string;
};

/**
 * Small inline loading affordance. With `label` it renders the (dimmed)
 * label with a band sweeping across it, so a busy button still says what
 * it is doing; without a label it is a short rounded bar.
 */
export function ShimmerLine({
  label,
  width = 120,
  height = 12,
  textStyle,
  style,
  color,
  inverse,
  accessibilityLabel,
}: ShimmerLineProps) {
  const t = useChatTokens();
  const { width: w, onLayout } = useSweepWidth();
  if (!label) {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel ?? 'Lädt'}
        style={style}
      >
        <ShimmerBlock width={width} height={height} radius={height / 2} />
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? label}
      onLayout={onLayout}
      style={[styles.labelWrap, style]}
    >
      <Text numberOfLines={1} style={[styles.label, { color: color ?? t.textSecondary }, textStyle, styles.dim]}>
        {label}
      </Text>
      {w > 0 ? <Sweep width={w} inverse={inverse} /> : null}
    </View>
  );
}

function LoadingRegion({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Lädt" style={style}>
      {children}
    </View>
  );
}

/** Mirrors ChatListRow: 42pt circle + title/time bar + preview bar. */
export function ChatListSkeleton({ rows = 7, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  const titleWidths = ['52%', '64%', '44%', '58%', '48%', '66%', '40%'] as const;
  const previewWidths = ['86%', '72%', '80%', '66%', '90%', '74%', '82%'] as const;
  return (
    <LoadingRegion style={style}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.listRow}>
          <ShimmerBlock width={chatSize.listAvatar} height={chatSize.listAvatar} radius={chatSize.listAvatar / 2} />
          <View style={styles.listBody}>
            <View style={styles.listTop}>
              <ShimmerBlock width={titleWidths[i % titleWidths.length]} height={14} radius={7} />
              <ShimmerBlock width={36} height={11} radius={5.5} />
            </View>
            <ShimmerBlock width={previewWidths[i % previewWidths.length]} height={12} radius={6} style={styles.gap10} />
          </View>
        </View>
      ))}
    </LoadingRegion>
  );
}

/** Mirrors a thread: grey bot bubbles left, user bubbles right. */
export function ThreadSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const r = chatSize.bubbleRadius;
  return (
    <LoadingRegion style={[styles.thread, style]}>
      <View style={styles.bubbleLeft}>
        <ShimmerBlock width={'66%'} height={44} radius={r} />
      </View>
      <View style={styles.bubbleRight}>
        <ShimmerBlock width={'44%'} height={44} radius={r} />
      </View>
      <View style={styles.bubbleLeft}>
        <ShimmerBlock width={'76%'} height={88} radius={r} />
      </View>
      <View style={styles.bubbleLeft}>
        <ShimmerBlock width={'52%'} height={44} radius={r} />
      </View>
      <View style={styles.bubbleRight}>
        <ShimmerBlock width={'58%'} height={66} radius={r} />
      </View>
      <View style={styles.bubbleLeft}>
        <ShimmerBlock width={'70%'} height={66} radius={r} />
      </View>
    </LoadingRegion>
  );
}

/** Mirrors InspirationCard: avatar + title bar + pitch bars + chip. */
export function InspirationSkeleton({ cards = 4, style }: { cards?: number; style?: StyleProp<ViewStyle> }) {
  const t = useChatTokens();
  return (
    <LoadingRegion style={[styles.inspirationList, style]}>
      {Array.from({ length: cards }).map((_, i) => (
        <View key={i} style={[styles.inspirationCard, { backgroundColor: t.surface }]}>
          <ShimmerBlock width={40} height={40} radius={20} />
          <View style={styles.listBody}>
            <ShimmerBlock width={i % 2 ? '62%' : '74%'} height={15} radius={7.5} />
            <ShimmerBlock width="94%" height={12} radius={6} style={styles.gap10} />
            <ShimmerBlock width={i % 2 ? '70%' : '58%'} height={12} radius={6} style={styles.gap6} />
            <ShimmerBlock width={88} height={24} radius={7} style={styles.gap12} />
          </View>
        </View>
      ))}
    </LoadingRegion>
  );
}

/** Mirrors the settings lists (memory / activity / connections rows). */
export function SettingsListSkeleton({
  rows = 5,
  withIcon = false,
  style,
}: {
  rows?: number;
  withIcon?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useChatTokens();
  const widths = ['78%', '62%', '84%', '56%', '70%', '66%'] as const;
  return (
    <LoadingRegion style={[styles.settingsGroup, { backgroundColor: t.groupedBackground }, style]}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.settingsRow,
            i < rows - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.separator } : null,
          ]}
        >
          {withIcon ? <ShimmerBlock width={32} height={32} radius={16} /> : null}
          <View style={styles.listBody}>
            <ShimmerBlock width={widths[i % widths.length]} height={13} radius={6.5} />
            <ShimmerBlock width={i % 2 ? '38%' : '30%'} height={10} radius={5} style={styles.gap8} />
          </View>
        </View>
      ))}
    </LoadingRegion>
  );
}

/** Mirrors a rendered markdown file: heading, paragraphs, a table. */
export function FileSheetSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useChatTokens();
  return (
    <LoadingRegion style={style}>
      <ShimmerBlock width="58%" height={22} radius={8} />
      <ShimmerBlock width="100%" height={12} radius={6} style={styles.gap16} />
      <ShimmerBlock width="94%" height={12} radius={6} style={styles.gap8} />
      <ShimmerBlock width="82%" height={12} radius={6} style={styles.gap8} />
      <ShimmerBlock width="40%" height={16} radius={7} style={styles.gap22} />
      <View style={[styles.table, { borderColor: t.separator }]}>
        {Array.from({ length: 4 }).map((_, row) => (
          <View
            key={row}
            style={[
              styles.tableRow,
              row < 3 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.separator } : null,
            ]}
          >
            <ShimmerBlock width="28%" height={row === 0 ? 12 : 10} radius={5} />
            <ShimmerBlock width="24%" height={row === 0 ? 12 : 10} radius={5} />
            <ShimmerBlock width="20%" height={row === 0 ? 12 : 10} radius={5} />
          </View>
        ))}
      </View>
      <ShimmerBlock width="96%" height={12} radius={6} style={styles.gap22} />
      <ShimmerBlock width="70%" height={12} radius={6} style={styles.gap8} />
    </LoadingRegion>
  );
}

const styles = StyleSheet.create({
  block: { overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SWEEP_WIDTH },
  labelWrap: { overflow: 'hidden', alignSelf: 'center' },
  label: { fontFamily: chatFont.medium, fontSize: 14 },
  dim: { opacity: 0.7 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 23, paddingVertical: 15, minHeight: 80, gap: 17 },
  listBody: { flex: 1, marginLeft: 0, minWidth: 0 },
  listTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  thread: { paddingHorizontal: chatSize.screenPadH, paddingVertical: 12, gap: 12 },
  bubbleLeft: { alignItems: 'flex-start' },
  bubbleRight: { alignItems: 'flex-end' },
  inspirationList: { gap: 12 },
  inspirationCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, borderRadius: 22, padding: 16 },
  settingsGroup: { borderRadius: 16, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  table: { marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11 },
  gap6: { marginTop: 6 },
  gap8: { marginTop: 8 },
  gap10: { marginTop: 10 },
  gap12: { marginTop: 12 },
  gap16: { marginTop: 16 },
  gap22: { marginTop: 22 },
});

export default ShimmerBlock;
