/**
 * SheetModal — the shared shell for one-off bottom sheets and dialogs that
 * render their own card (BottomDrawer is the full drag-to-dismiss drawer).
 *
 * The scrim (theme `scrim`: black ~38 % light / ~55-60 % dark) FADES while
 * the content SLIDES up, and both run in reverse before the modal unmounts —
 * RN's `animationType="slide"` moved the dimming layer up with the card
 * instead. Paint the card with the theme `sheet` token so it lifts off the
 * page in dark mode.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useTheme } from "@/context/ThemeContext";
import {
  SHEET_CLOSE_TIMING,
  SHEET_OPEN_TIMING,
  useSheetStageLink,
} from "@/components/ui/SheetStage";

type Props = {
  visible: boolean;
  /** Android back button. Omit to make the sheet non-dismissable by back. */
  onRequestClose?: () => void;
  /** Tap on the scrim. Omit (or pass undefined while busy) to disable. */
  onBackdropPress?: () => void;
  children: React.ReactNode;
  /** Layout of the area above the scrim; defaults to bottom-aligned. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Lift the content above the keyboard (sheets with inputs). */
  keyboardAware?: boolean;
  statusBarTranslucent?: boolean;
  /**
   * Swipe the content down to dismiss (calls `onBackdropPress`). Defaults to
   * on whenever `onBackdropPress` is set; pass false for centred dialogs.
   */
  dragToDismiss?: boolean;
};

const OFFSET = Math.min(480, Dimensions.get("window").height * 0.6);
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 500;

export default function SheetModal({
  visible,
  onRequestClose,
  onBackdropPress,
  children,
  contentContainerStyle,
  keyboardAware = false,
  statusBarTranslucent = true,
  dragToDismiss,
}: Props) {
  const { colors } = useTheme();
  const [mounted, setMounted] = useState(visible);
  // 0 closed → 1 open; also follows the finger and drives the SheetStage.
  const progress = useSharedValue(0);
  const hasStage = useSheetStageLink(progress, mounted);
  const canDrag = (dragToDismiss ?? true) && !!onBackdropPress;

  const unmount = useCallback(() => setMounted(false), []);
  const callDismiss = useCallback(() => onBackdropPress?.(), [onBackdropPress]);

  // Mount on open during render (no effect round-trip); unmount after the close animation.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, SHEET_OPEN_TIMING));
    } else if (mounted) {
      progress.set(
        withTiming(0, SHEET_CLOSE_TIMING, (finished) => {
          if (finished) runOnJS(unmount)();
        })
      );
    }
    // `mounted` is read, not tracked: only `visible` drives the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, progress]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canDrag)
        .activeOffsetY(12)
        .failOffsetY(-12)
        .failOffsetX([-16, 16])
        .onUpdate((e) => {
          const dy = e.translationY > 0 ? e.translationY : 0;
          const p = 1 - dy / OFFSET;
          progress.set(p < 0 ? 0 : p);
        })
        .onEnd((e) => {
          if (
            e.translationY > DISMISS_DISTANCE ||
            e.velocityY > DISMISS_VELOCITY
          ) {
            // Stay at the dragged position; the parent flips `visible` and the
            // effect above finishes the slide-out from here.
            progress.set(
              withTiming(0.0001, { ...SHEET_CLOSE_TIMING, duration: 200 })
            );
            runOnJS(callDismiss)();
          } else {
            progress.set(withTiming(1, SHEET_OPEN_TIMING));
          }
        }),
    [canDrag, progress, callDismiss]
  );

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * OFFSET }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));

  if (!mounted) return null;

  const Container = keyboardAware ? KeyboardAvoidingView : View;
  const containerProps = keyboardAware
    ? {
        behavior:
          Platform.OS === "ios" ? ("padding" as const) : ("height" as const),
      }
    : {};

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent={statusBarTranslucent}
      onRequestClose={onRequestClose ?? (() => undefined)}
    >
      <GestureHandlerRootView style={styles.fill}>
        <Container style={styles.fill} {...containerProps}>
          {/* Own scrim only without a SheetStage (the stage dims the page). */}
          {!hasStage && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.scrim },
                scrimStyle,
              ]}
            />
          )}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onBackdropPress}
            disabled={!onBackdropPress}
            accessibilityLabel={onBackdropPress ? "Schließen" : undefined}
          />
          <GestureDetector gesture={pan}>
            <Animated.View
              pointerEvents="box-none"
              style={[styles.content, contentContainerStyle, contentStyle]}
            >
              {children}
            </Animated.View>
          </GestureDetector>
        </Container>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, justifyContent: "flex-end" },
});
