/**
 * Erkunden edit mode — iOS home-screen style. Long-press anywhere on Erkunden
 * (or tap "Erkunden bearbeiten" at the bottom) and every section collapses
 * into a compact card (a few short wiggles on entry, then still):
 *   – badge     → hide the section (it moves to the "Hinzufügen" tray)
 *   hold + drag → reorder
 *   + in tray   → show a hidden section again / pin a mini app
 * Every change is saved immediately (lib/explore-layout.ts, device-local);
 * "Fertig" only leaves the mode. Locked blocks get no – badge.
 *
 * Worklet rules (release-only crashes otherwise, see memory
 * worklet-directive-ota-testing): every gesture/animation callback and every
 * helper they call carries an explicit 'worklet' directive.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { fetchLiveMiniApps, type MiniApp } from '@/lib/miniapps';
import {
  getExploreBlock,
  miniAppBlockId,
  miniAppSlugOf,
  useExploreLayout,
  visibleBlockIds,
} from '@/lib/explore-layout';

const CARD_H = 60;
const GAP = 10;
const STEP = CARD_H + GAP;
const WIGGLE_DEG = 1.4;
// Back-and-forth wiggles on entering edit mode (~0.6 s), then the cards rest.
const WIGGLE_CYCLES = 3;

const BLOCK_EMOJI: Record<string, string> = {
  hero: '🌟',
  this_week: '📅',
  all_events: '🗓️',
  nearby_events: '📍',
  movies: '🎬',
  audio: '🎧',
  mini_apps: '🧩',
  marketplace: '🛍️',
  news: '📰',
  restaurants: '🍽️',
  businesses: '🏪',
};

type Positions = Record<string, number>;

function toPositions(ids: string[]): Positions {
  const p: Positions = {};
  ids.forEach((id, i) => {
    p[id] = i;
  });
  return p;
}

/** Move the item at `from` to `to`, shifting everything in between. */
function movePosition(positions: Positions, from: number, to: number): Positions {
  'worklet';
  const next: Positions = {};
  for (const key in positions) {
    const p = positions[key];
    if (p === from) next[key] = to;
    else if (from < to && p > from && p <= to) next[key] = p - 1;
    else if (from > to && p >= to && p < from) next[key] = p + 1;
    else next[key] = p;
  }
  return next;
}

function orderOf(positions: Positions): string[] {
  'worklet';
  const ids = Object.keys(positions);
  ids.sort((a, b) => positions[a] - positions[b]);
  return ids;
}

function clampIndex(i: number, count: number): number {
  'worklet';
  return Math.max(0, Math.min(count - 1, i));
}

function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

type CardInfo = { label: string; subtitle: string; emoji?: string; iconUrl?: string | null; removable: boolean };

function CardFace({ info, colors }: { info: CardInfo; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
      {info.iconUrl ? (
        <Image source={{ uri: info.iconUrl }} style={styles.icon} contentFit="cover" />
      ) : (
        <View style={[styles.icon, styles.emojiBox, { backgroundColor: colors.background }]}>
          <Text style={styles.emoji}>{info.emoji ?? '▫️'}</Text>
        </View>
      )}
      <View style={styles.cardText}>
        <Text style={[styles.cardLabel, { color: colors.textPrimary }]} numberOfLines={1}>{info.label}</Text>
        <Text style={[styles.cardSub, { color: colors.textSecondary }]} numberOfLines={1}>{info.subtitle}</Text>
      </View>
      <Text style={[styles.handle, { color: colors.textSecondary }]}>☰</Text>
    </View>
  );
}

function SortableCard({
  id,
  index,
  count,
  positions,
  info,
  onRemove,
  onDrop,
  onDragActive,
}: {
  id: string;
  index: number;
  count: number;
  positions: SharedValue<Positions>;
  info: CardInfo;
  onRemove: (id: string) => void;
  onDrop: (order: string[]) => void;
  onDragActive: (active: boolean) => void;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const y = useSharedValue(index * STEP);
  const startY = useSharedValue(0);
  const active = useSharedValue(false);
  const rot = useSharedValue(0);

  // A few short wiggles on entering edit mode, then settle — a cue that the
  // cards are editable, not a permanent animation. Random phase so the cards
  // don't move in lockstep.
  useEffect(() => {
    if (reduceMotion) return;
    rot.value = withDelay(
      Math.round(Math.random() * 120),
      withSequence(
        withRepeat(
          withSequence(withTiming(-WIGGLE_DEG, { duration: 90 }), withTiming(WIGGLE_DEG, { duration: 90 })),
          WIGGLE_CYCLES,
          true,
        ),
        withTiming(0, { duration: 90 }),
      ),
    );
    return () => {
      cancelAnimation(rot);
      rot.value = 0;
    };
  }, [reduceMotion, rot]);

  // Follow slot changes caused by other cards being dragged past this one.
  useAnimatedReaction(
    () => {
      'worklet';
      return positions.value[id];
    },
    (slot, prev) => {
      'worklet';
      if (slot === undefined || slot === prev || active.value) return;
      y.value = withTiming(slot * STEP, { duration: 180 });
    },
  );

  const pan = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => {
      'worklet';
      active.value = true;
      startY.value = y.value;
      runOnJS(hapticLight)();
      runOnJS(onDragActive)(true);
    })
    .onUpdate((e) => {
      'worklet';
      y.value = startY.value + e.translationY;
      const from = positions.value[id];
      const to = clampIndex(Math.round(y.value / STEP), count);
      if (from !== undefined && to !== from) positions.value = movePosition(positions.value, from, to);
    })
    .onFinalize(() => {
      'worklet';
      if (!active.value) return;
      active.value = false;
      const slot = positions.value[id] ?? 0;
      y.value = withTiming(slot * STEP, { duration: 180 });
      runOnJS(onDragActive)(false);
      runOnJS(onDrop)(orderOf(positions.value));
    });

  const style = useAnimatedStyle(() => {
    'worklet';
    return {
      zIndex: active.value ? 10 : 0,
      transform: [
        { translateY: y.value },
        { scale: withTiming(active.value ? 1.04 : 1, { duration: 120 }) },
        { rotateZ: `${active.value ? 0 : rot.value}deg` },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.slot, style]} entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)}>
        <CardFace info={info} colors={colors} />
        {info.removable && (
          <Pressable
            onPress={() => onRemove(id)}
            hitSlop={10}
            style={[styles.badge, { backgroundColor: colors.textSecondary }]}
            accessibilityRole="button"
            accessibilityLabel={`${info.label} ausblenden`}
          >
            <Text style={[styles.badgeText, { color: colors.background }]}>–</Text>
          </Pressable>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

export default function ExploreEditBoard({
  onDone,
  onDragActive,
}: {
  onDone: () => void;
  /** Lets the screen freeze its ScrollView while a card is dragged. */
  onDragActive: (active: boolean) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { layout, save, reset, isCustom } = useExploreLayout();

  const { data: miniApps } = useQuery({
    queryKey: ['explore', 'mini-apps'],
    queryFn: fetchLiveMiniApps,
    meta: { persist: true },
  });
  const appBySlug = useMemo(() => new Map((miniApps ?? []).map((a) => [a.slug, a])), [miniApps]);

  // Android back leaves edit mode instead of the screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDone();
      return true;
    });
    return () => sub.remove();
  }, [onDone]);

  // Pins whose app is offline stay in the saved order but are not shown.
  const shown = visibleBlockIds(layout).filter((id) => {
    const slug = miniAppSlugOf(id);
    return slug ? appBySlug.has(slug) : !!getExploreBlock(id);
  });
  const shownKey = shown.join('|');

  const positions = useSharedValue<Positions>(toPositions(shown));
  useEffect(() => {
    positions.value = toPositions(shownKey ? shownKey.split('|') : []);
  }, [shownKey, positions]);

  const infoOf = (id: string): CardInfo => {
    const slug = miniAppSlugOf(id);
    if (slug) {
      const app = appBySlug.get(slug);
      return { label: app?.name ?? slug, subtitle: 'Angeheftete Mini-App', iconUrl: app?.iconUrl, removable: true };
    }
    const def = getExploreBlock(id);
    return {
      label: def?.label ?? id,
      subtitle: def?.description ?? '',
      emoji: BLOCK_EMOJI[id],
      removable: !def?.locked,
    };
  };

  const remove = useCallback(
    (id: string) => {
      hapticLight();
      if (miniAppSlugOf(id)) void save({ ...layout, order: layout.order.filter((o) => o !== id) });
      else void save({ ...layout, hidden: [...layout.hidden, id] });
    },
    [layout, save],
  );

  // Dropped order covers only the shown cards; hidden blocks and offline
  // pins keep their relative slots by filling the gaps in the old order.
  const drop = useCallback(
    (order: string[]) => {
      const shownSet = new Set(order);
      const queue = [...order];
      const next = layout.order.map((id) => (shownSet.has(id) ? queue.shift()! : id));
      if (next.some((id, i) => id !== layout.order[i])) void save({ ...layout, order: next });
    },
    [layout, save],
  );

  const showBlock = (id: string) => {
    hapticLight();
    void save({ ...layout, hidden: layout.hidden.filter((h) => h !== id) });
  };
  const pinApp = (app: MiniApp) => {
    hapticLight();
    void save({ ...layout, order: [miniAppBlockId(app.slug), ...layout.order] });
  };

  const hiddenBlocks = layout.hidden.filter((id) => getExploreBlock(id));
  const pinnable = (miniApps ?? []).filter((a) => !layout.order.includes(miniAppBlockId(a.slug)));

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.board}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Erkunden bearbeiten</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Halten und ziehen zum Verschieben</Text>
        </View>
        <Pressable
          onPress={onDone}
          style={({ pressed }) => [styles.done, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.doneText, { color: colors.onPrimary }]}>Fertig</Text>
        </Pressable>
      </View>

      {shown.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          Alle Bereiche sind ausgeblendet. Füge unten welche hinzu.
        </Text>
      ) : (
        <View style={[styles.list, { height: shown.length * STEP }]}>
          {shown.map((id, i) => (
            <SortableCard
              key={id}
              id={id}
              index={i}
              count={shown.length}
              positions={positions}
              info={infoOf(id)}
              onRemove={remove}
              onDrop={drop}
              onDragActive={onDragActive}
            />
          ))}
        </View>
      )}

      {(hiddenBlocks.length > 0 || pinnable.length > 0) && (
        <Animated.View layout={LinearTransition.duration(180)} style={styles.tray}>
          <Text style={[styles.trayTitle, { color: colors.textSecondary }]}>Hinzufügen</Text>
          {hiddenBlocks.map((id) => (
            <Animated.View key={id} entering={FadeIn.duration(180)} layout={LinearTransition.duration(180)}>
              <Pressable onPress={() => showBlock(id)} accessibilityRole="button" accessibilityLabel={`${infoOf(id).label} einblenden`}>
                <CardFace info={infoOf(id)} colors={colors} />
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.badgeText, { color: colors.onPrimary }]}>+</Text>
                </View>
              </Pressable>
            </Animated.View>
          ))}
          {pinnable.map((app) => (
            <Animated.View key={app.id} entering={FadeIn.duration(180)} layout={LinearTransition.duration(180)}>
              <Pressable onPress={() => pinApp(app)} accessibilityRole="button" accessibilityLabel={`${app.name} anheften`}>
                <CardFace
                  info={{ label: app.name, subtitle: 'Mini-App anheften', iconUrl: app.iconUrl, removable: false }}
                  colors={colors}
                />
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.badgeText, { color: colors.onPrimary }]}>+</Text>
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </Animated.View>
      )}

      <View style={styles.footer}>
        <Pressable onPress={() => router.push('/settings/darstellung' as any)} hitSlop={8} accessibilityRole="link">
          <Text style={[styles.link, { color: colors.primary }]}>Vorlagen & mehr</Text>
        </Pressable>
        {isCustom && (
          <Pressable onPress={() => void reset()} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.primary }]}>Zurücksetzen</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  board: { paddingHorizontal: 16, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerText: { flex: 1 },
  title: { fontFamily: 'MonaSansSemiCondensed-Medium', fontSize: 22 },
  hint: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 2 },
  done: { paddingHorizontal: 18, height: 36, borderRadius: 18, justifyContent: 'center' },
  doneText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  list: { position: 'relative' },
  slot: { position: 'absolute', left: 0, right: 0, top: 0, height: CARD_H },
  card: {
    height: CARD_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  icon: { width: 38, height: 38, borderRadius: 10 },
  emojiBox: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20 },
  cardText: { flex: 1 },
  cardLabel: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  cardSub: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 1 },
  handle: { fontSize: 18 },
  badge: {
    position: 'absolute',
    top: -7,
    left: -7,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 16, lineHeight: 18 },
  empty: { fontFamily: fontFamily.regular, fontSize: 14, textAlign: 'center', marginVertical: 24 },
  tray: { marginTop: 24, gap: GAP },
  trayTitle: {
    fontSize: 13,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 24 },
  link: { fontFamily: fontFamily.semiBold, fontSize: 14 },
});
