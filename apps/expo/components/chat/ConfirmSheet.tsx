import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { chatFont, chatSize, haloShadow, useChatTokens } from './tokens';

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Primary action label, e.g. „Löschen“. */
  confirmLabel: string;
  /** Secondary text button (default „Abbrechen“). */
  cancelLabel?: string;
  /** Red pill instead of the black one. */
  destructive?: boolean;
  /** Optional Ionicons glyph shown in a grey circle above the title. */
  icon?: keyof typeof Ionicons.glyphMap;
};

export type ConfirmSheetProps = ConfirmOptions & {
  /** Called once the sheet has animated out: true = confirmed. */
  onDone: (confirmed: boolean) => void;
  /** Increment to request a dismiss from outside (Android back). */
  dismissSignal?: number;
};

/** Designed confirm dialog (ref 19 style): title, message, black/red pill, „Abbrechen“ text button. */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  destructive,
  icon,
  onDone,
  dismissSignal,
}: ConfirmSheetProps) {
  const t = useChatTokens();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const result = useRef(false);
  const closing = useRef(false);

  const backdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.25} pressBehavior="close" />
    ),
    [],
  );

  const close = (confirmed: boolean) => {
    if (closing.current) return;
    closing.current = true;
    result.current = confirmed;
    if (confirmed) {
      Haptics.impactAsync(destructive ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      Haptics.selectionAsync().catch(() => {});
    }
    sheetRef.current?.close();
  };

  useEffect(() => {
    if (dismissSignal) sheetRef.current?.close();
  }, [dismissSignal]);

  const pillBg = destructive ? t.recordingRed : t.primaryButton;
  const pillText = destructive ? '#FFFFFF' : t.primaryButtonText;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      enableDynamicSizing
      enablePanDownToClose
      onClose={() => onDone(result.current)}
      detached
      bottomInset={Math.max(8, insets.bottom - 18)}
      style={styles.sheet}
      backdropComponent={backdrop}
      backgroundStyle={{ backgroundColor: t.sheetBackground, borderRadius: 40 }}
      handleIndicatorStyle={[styles.handle, { backgroundColor: t.textTertiary }]}
    >
      <BottomSheetView style={styles.content}>
        {icon ? (
          <View style={[styles.iconCircle, { backgroundColor: t.closeCircle }]}>
            <Ionicons name={icon} size={26} color={destructive ? t.recordingRed : t.icon} />
          </View>
        ) : null}
        <Text style={[styles.title, { color: t.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
        {message ? <Text style={[styles.message, { color: t.textSecondary }]}>{message}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          onPress={() => close(true)}
          style={({ pressed }) => [
            styles.pill,
            haloShadow(t),
            { backgroundColor: pillBg, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.pillLabel, { color: pillText }]}>{confirmLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={() => close(false)}
          hitSlop={8}
          style={({ pressed }) => [styles.secondary, pressed ? { opacity: 0.5 } : null]}
        >
          <Text style={[styles.secondaryLabel, { color: t.textSecondary }]}>{cancelLabel}</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 9 },
  handle: { width: 36, height: 5, opacity: 0.5 },
  content: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18, alignItems: 'stretch' },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontFamily: chatFont.semiBold, fontSize: 21, lineHeight: 27, textAlign: 'center' },
  message: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 21, textAlign: 'center', marginTop: 6 },
  pill: {
    height: chatSize.pillButtonHeight + 6,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  pillLabel: { fontFamily: chatFont.semiBold, fontSize: 17 },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secondaryLabel: { fontFamily: chatFont.medium, fontSize: 17 },
});

export default ConfirmSheet;
