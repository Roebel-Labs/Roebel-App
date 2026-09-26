import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ChatMenuItem, PopoverFrame } from '@/lib/chat/sheets';
import { chatFont, haloShadow, useChatTokens, type ChatTokens } from './tokens';

/** Called once the sheet/popover has fully animated out, with the chosen row's action (null = dismissed). */
export type ChatMenuDone = (action: (() => void) | null) => void;

function MenuIcon({ item, color, size }: { item: ChatMenuItem; color: string; size: number }) {
  if (!item.icon) return null;
  if (item.iconSet === 'feather') {
    return <Feather name={item.icon as keyof typeof Feather.glyphMap} size={size} color={color} />;
  }
  return <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
}

function rowColor(t: ChatTokens, item: ChatMenuItem): string {
  return item.destructive ? t.recordingRed : t.textPrimary;
}

// ─── Bottom sheet (ref 15) ────────────────────────────────────────────────

export type ChatMenuSheetProps = {
  title?: string;
  groups: ChatMenuItem[][];
  onDone: ChatMenuDone;
  /** Increment to request a dismiss from outside (Android back). */
  dismissSignal?: number;
};

/**
 * Long-press menu (ref 15): white detached sheet, grabber, optional title, rows grouped
 * in light-grey rounded containers with inset separators. Swipe/backdrop dismisses.
 */
export function ChatMenuSheet({ title, groups, onDone, dismissSignal }: ChatMenuSheetProps) {
  const t = useChatTokens();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const chosen = useRef<(() => void) | null>(null);
  const closing = useRef(false);

  const backdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.25} pressBehavior="close" />
    ),
    [],
  );

  const choose = (item: ChatMenuItem) => {
    if (closing.current) return;
    closing.current = true;
    Haptics.selectionAsync().catch(() => {});
    chosen.current = item.onPress;
    sheetRef.current?.close();
  };

  useEffect(() => {
    if (dismissSignal) sheetRef.current?.close();
  }, [dismissSignal]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      enableDynamicSizing
      enablePanDownToClose
      onClose={() => onDone(chosen.current)}
      detached
      bottomInset={Math.max(8, insets.bottom - 18)}
      style={styles.sheet}
      backdropComponent={backdrop}
      backgroundStyle={{ backgroundColor: t.sheetBackground, borderRadius: 40 }}
      handleIndicatorStyle={[styles.handle, { backgroundColor: t.textTertiary }]}
    >
      <BottomSheetView style={styles.content}>
        {title ? (
          <Text style={[styles.title, { color: t.textSecondary }]} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {groups.map((rows, gi) => (
          <View key={gi} style={[styles.group, { backgroundColor: t.groupedBackground }]}>
            {rows.map((r, i) => (
              <Pressable
                key={`${r.label}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={r.label}
                onPress={() => choose(r)}
                style={({ pressed }) => [styles.row, pressed ? { opacity: 0.6 } : null]}
              >
                {r.icon ? (
                  <View style={styles.rowIcon}>
                    <MenuIcon item={r} size={22} color={r.destructive ? t.recordingRed : t.icon} />
                  </View>
                ) : null}
                <View
                  style={[
                    styles.rowLabelWrap,
                    r.icon ? styles.rowLabelWithIcon : null,
                    i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: t.separator } : null,
                  ]}
                >
                  <Text style={[styles.rowLabel, { color: rowColor(t, r) }]} numberOfLines={1}>
                    {r.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </BottomSheetView>
    </BottomSheet>
  );
}

// ─── Anchored popover (ref 11, top right) ─────────────────────────────────

export type ChatMenuPopoverProps = {
  groups: ChatMenuItem[][];
  frame: PopoverFrame;
  onDone: ChatMenuDone;
  /** Increment to request a dismiss from outside (Android back). */
  dismissSignal?: number;
};

/** Header "⋯" menu: white rounded card with the soft halo, grows out of the top-right control. */
export function ChatMenuPopover({ groups, frame, onDone, dismissSignal }: ChatMenuPopoverProps) {
  const t = useChatTokens();
  const progress = useSharedValue(0);
  const chosen = useRef<(() => void) | null>(null);
  const closing = useRef(false);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 190, easing: Easing.out(Easing.cubic) });
  }, [progress]);

  const finish = useCallback(() => onDone(chosen.current), [onDone]);

  const close = useCallback(
    (action: (() => void) | null) => {
      if (closing.current) return;
      closing.current = true;
      chosen.current = action;
      progress.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }, (done) => {
        'worklet';
        if (done) runOnJS(finish)();
      });
    },
    [progress, finish],
  );

  useEffect(() => {
    if (dismissSignal) close(null);
  }, [dismissSignal, close]);

  const backdropStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: progress.value };
  });
  const cardStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: progress.value,
      transform: [{ scale: 0.86 + 0.14 * progress.value }, { translateY: -8 * (1 - progress.value) }],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.06)' }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(null)} accessibilityLabel="Menü schließen" />
      </Animated.View>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: t.surface, top: frame.top, right: frame.right, transformOrigin: 'top right' },
          haloShadow(t, true),
          cardStyle,
        ]}
      >
        {groups.map((rows, gi) => (
          <View
            key={gi}
            style={gi > 0 ? [styles.popoverGroup, { borderTopColor: t.separator }] : null}
          >
            {rows.map((r, i) => (
              <Pressable
                key={`${r.label}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={r.label}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  close(r.onPress);
                }}
                style={({ pressed }) => [styles.popoverRow, pressed ? { backgroundColor: t.chipBackground } : null]}
              >
                {r.icon ? (
                  <View style={styles.popoverIcon}>
                    <MenuIcon item={r} size={22} color={r.destructive ? t.recordingRed : t.icon} />
                  </View>
                ) : null}
                <Text
                  style={[styles.popoverLabel, r.icon ? styles.popoverLabelWithIcon : null, { color: rowColor(t, r) }]}
                  numberOfLines={1}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 9 },
  handle: { width: 36, height: 5, opacity: 0.5 },
  content: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 28, gap: 12 },
  title: { fontFamily: chatFont.medium, fontSize: 15, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12, marginBottom: 2 },
  group: { borderRadius: 20, overflow: 'hidden' },
  row: { height: 49, flexDirection: 'row', alignItems: 'center', paddingLeft: 20 },
  rowIcon: { width: 26, alignItems: 'flex-start' },
  rowLabelWrap: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingRight: 16 },
  rowLabelWithIcon: { marginLeft: 11 },
  rowLabel: { fontFamily: chatFont.regular, fontSize: 17 },
  card: { position: 'absolute', minWidth: 230, maxWidth: 290, borderRadius: 28, paddingVertical: 10 },
  popoverGroup: { borderTopWidth: StyleSheet.hairlineWidth * 2, marginTop: 6, paddingTop: 6, marginHorizontal: 0 },
  popoverRow: { height: 42, flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 24 },
  popoverIcon: { width: 28 },
  popoverLabel: { fontFamily: chatFont.regular, fontSize: 17 },
  popoverLabelWithIcon: { marginLeft: 10 },
});

export default ChatMenuSheet;
