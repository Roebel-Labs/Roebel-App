import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { chatFont, useChatTokens } from './tokens';

export const REACTION_EMOJIS = ['👍', '👎', '❤️', '😂', '🎉', '😮'] as const;

export type MessageActionSheetProps = {
  /** Mount/unmount controlled by the parent; render at the screen root. */
  visible: boolean;
  onClose: () => void;
  onReact?: (emoji: string) => void;
  /** "+" circle after the emoji row. */
  onMoreReactions?: () => void;
  onReply?: () => void;
  onStartThread?: () => void;
  onMarkUnread?: () => void;
  onCopy?: () => void;
};

type Row = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; run?: () => void };

/** Long-press sheet (ref 15): emoji row + Antworten / Thread starten / Als ungelesen markieren, Kopieren. */
export function MessageActionSheet({
  visible,
  onClose,
  onReact,
  onMoreReactions,
  onReply,
  onStartThread,
  onMarkUnread,
  onCopy,
}: MessageActionSheetProps) {
  const t = useChatTokens();
  const insets = useSafeAreaInsets();

  const backdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.25} pressBehavior="close" />
    ),
    [],
  );

  const run = (fn?: () => void) => () => {
    Haptics.selectionAsync().catch(() => {});
    onClose();
    fn?.();
  };

  const group1: Row[] = useMemo(
    () => [
      { key: 'reply', label: 'Antworten', icon: 'arrow-undo-outline', run: onReply },
      { key: 'thread', label: 'Thread starten', icon: 'chatbubbles-outline', run: onStartThread },
      { key: 'unread', label: 'Als ungelesen markieren', icon: 'chatbox-ellipses-outline', run: onMarkUnread },
    ],
    [onReply, onStartThread, onMarkUnread],
  );

  if (!visible) return null;

  const renderGroup = (rows: Row[]) => (
    <View style={[styles.group, { backgroundColor: t.groupedBackground }]}>
      {rows.map((r, i) => (
        <Pressable
          key={r.key}
          accessibilityRole="button"
          onPress={run(r.run)}
          style={({ pressed }) => [styles.row, pressed ? { opacity: 0.6 } : null]}
        >
          <Ionicons name={r.icon} size={23} color={t.icon} style={styles.rowIcon} />
          <View
            style={[
              styles.rowLabelWrap,
              i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: t.separator } : null,
            ]}
          >
            <Text style={[styles.rowLabel, { color: t.textPrimary }]}>{r.label}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );

  return (
    <BottomSheet
      index={0}
      enableDynamicSizing
      enablePanDownToClose
      onClose={onClose}
      detached
      bottomInset={Math.max(8, insets.bottom - 18)}
      style={styles.sheet}
      backdropComponent={backdrop}
      backgroundStyle={{ backgroundColor: t.sheetBackground, borderRadius: 40 }}
      handleIndicatorStyle={[styles.handle, { backgroundColor: t.textTertiary }]}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.emojiRow}>
          {REACTION_EMOJIS.map((e) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`Mit ${e} reagieren`}
              onPress={run(() => onReact?.(e))}
              style={({ pressed }) => [styles.emoji, { backgroundColor: t.groupedBackground, transform: [{ scale: pressed ? 0.9 : 1 }] }]}
            >
              <Text style={styles.emojiText}>{e}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Weitere Reaktionen"
            onPress={run(onMoreReactions)}
            style={[styles.emoji, { backgroundColor: t.groupedBackground }]}
          >
            <MaterialCommunityIcons name="emoticon-plus-outline" size={24} color={t.textSecondary} />
          </Pressable>
        </View>
        {renderGroup(group1)}
        {renderGroup([{ key: 'copy', label: 'Kopieren', icon: 'copy-outline', run: onCopy }])}
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 9 },
  handle: { width: 36, height: 5, opacity: 0.5 },
  content: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 28, gap: 12 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  emoji: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 22 },
  group: { borderRadius: 20, overflow: 'hidden' },
  row: { height: 49, flexDirection: 'row', alignItems: 'center', paddingLeft: 20 },
  rowIcon: { width: 26 },
  rowLabelWrap: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', marginLeft: 11 },
  rowLabel: { fontFamily: chatFont.regular, fontSize: 17 },
});

export default MessageActionSheet;
