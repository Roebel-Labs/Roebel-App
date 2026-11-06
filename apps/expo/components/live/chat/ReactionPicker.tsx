// YouTube-Live-style reactions: one round ❤️ button at the bottom-right of the chat. Tap = ❤️;
// long-press (or the small chevron) unfolds a vertical pill with the whole set.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import LiveIcon from '@/components/live/LiveIcon';
import { LIVE_REACTIONS, type LiveReaction } from '@/lib/live';
import { HeartFilledIcon } from '@/components/Icons';
import { liveStyles, useLivePalette, type LivePalette } from '../tokens';

/** Heart colour on the dark stage discs (the app's HeartFilledIcon). */
const OVERLAY_HEART = '#FF3B5C';

type Props = {
  onReact: (e: LiveReaction) => void;
  style?: StyleProp<ViewStyle>;
  /** 'overlay' = dark translucent discs over the video with the app's own heart icon on the main button. */
  variant?: 'theme' | 'overlay';
  /** Called whenever the viewer touches the picker (the stage keeps its controls awake). */
  onInteract?: () => void;
};

export default function ReactionPicker({ onReact, style, variant = 'theme', onInteract }: Props) {
  const L = useLivePalette();
  const themed = liveStyles(makeStyles, L);
  const overlay = variant === 'overlay';
  const styles = overlay ? overlayStyles : themed;
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => { onInteract?.(); setOpen((o) => !o); }, [onInteract]);
  const chevronColor = overlay ? '#FFFFFF' : L.textSecondary;

  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      {open ? (
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(140)} style={styles.pill}>
          {LIVE_REACTIONS.map((e) => (
            <Pressable
              key={e}
              onPress={() => onReact(e)}
              hitSlop={2}
              style={({ pressed }) => [styles.pillBtn, pressed && styles.pillPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Reaktion ${e}`}
            >
              <Text style={styles.emoji}>{e}</Text>
            </Pressable>
          ))}
          <Pressable onPress={toggle} hitSlop={4} style={styles.pillBtn} accessibilityRole="button" accessibilityLabel="Reaktionen einklappen">
            <LiveIcon name="chevron-down" size={20} color={chevronColor} />
          </Pressable>
        </Animated.View>
      ) : null}
      {!open ? (
        <View>
          <Pressable
            onPress={() => onReact('❤️')}
            onLongPress={toggle}
            delayLongPress={300}
            style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
            accessibilityRole="button"
            accessibilityLabel="Herz senden"
            accessibilityHint="Lange drücken für weitere Reaktionen"
          >
            {overlay ? <HeartFilledIcon size={24} color={OVERLAY_HEART} /> : <Text style={styles.mainEmoji}>❤️</Text>}
          </Pressable>
          <Pressable onPress={toggle} hitSlop={8} style={styles.chevron} accessibilityRole="button" accessibilityLabel="Weitere Reaktionen">
            <LiveIcon name="chevron-up" size={11} color={chevronColor} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const SIZE = 44;

const makeStyles = (L: LivePalette) => {
  const raised = L.isDark ? L.surfaceRaised : '#FFFFFF';
  const elevation = L.isDark
    ? { borderWidth: StyleSheet.hairlineWidth, borderColor: L.borderStrong }
    : { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 };
  return StyleSheet.create({
    wrap: { alignItems: 'center' },
    main: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: raised, ...elevation },
    mainPressed: { transform: [{ scale: 0.92 }] },
    mainEmoji: { fontSize: 22 },
    chevron: {
      position: 'absolute', top: -4, left: -4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
      backgroundColor: raised, ...(L.isDark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: L.borderStrong } : { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 }),
    },
    pill: { width: SIZE, borderRadius: SIZE / 2, paddingVertical: 4, alignItems: 'center', backgroundColor: raised, ...elevation },
    pillBtn: { width: SIZE, height: 42, alignItems: 'center', justifyContent: 'center' },
    pillPressed: { transform: [{ scale: 1.25 }] },
    emoji: { fontSize: 23 },
  });
};

const overlayStyles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  main: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.38)' },
  mainPressed: { transform: [{ scale: 0.92 }] },
  mainEmoji: { fontSize: 22 },
  chevron: {
    position: 'absolute', top: -4, left: -4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pill: { width: SIZE, borderRadius: SIZE / 2, paddingVertical: 4, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  pillBtn: { width: SIZE, height: 42, alignItems: 'center', justifyContent: 'center' },
  pillPressed: { transform: [{ scale: 1.25 }] },
  emoji: { fontSize: 23 },
});
