import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  StyleSheet,
  Modal,
  Dimensions,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  type LayoutChangeEvent,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import {
  SHEET_CLOSE_TIMING,
  SHEET_OPEN_TIMING,
  useSheetStageLink,
} from "@/components/ui/SheetStage";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
/** Drag distance / downward velocity (px, px/s) that dismisses on release. */
const DISMISS_DISTANCE = 150;
const DISMISS_VELOCITY = 500;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Fixed drawer height as a fraction of the screen (0-1). If omitted,
   * the drawer uses dynamic height: it sizes to its content up to
   * `maxSnapPoint` (default 0.92). Drag-to-dismiss still works.
   */
  snapPoint?: number;
  /**
   * Max height cap when using dynamic sizing. Defaults to 0.92.
   * Ignored when `snapPoint` is provided.
   */
  maxSnapPoint?: number;
  /**
   * Dock the drawer above the keyboard while a text input inside it is focused
   * (same behaviour as the comment composer). Opt-in so existing drawers keep
   * their layout.
   */
  keyboardAware?: boolean;
  /** Horizontal content padding. Defaults to 24; full-width lists can pass 16. */
  contentPaddingHorizontal?: number;
  /** Fixed sheet colours for screens that are always dark (live room); default = theme `sheet`. */
  backgroundColor?: string;
  handleColor?: string;
};

/**
 * Drag-to-dismiss bottom drawer. One `progress` value (0 closed → 1 open)
 * drives the sheet position, its scrim and — through the SheetStage — the
 * shrinking app page behind it; dragging the handle writes the same value, so
 * the page grows back with the finger. All on the UI thread (Reanimated).
 */
export default function BottomDrawer({
  visible,
  onClose,
  children,
  snapPoint,
  maxSnapPoint = 0.92,
  keyboardAware = false,
  contentPaddingHorizontal,
  backgroundColor,
  handleColor,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const sheetHeight = useSharedValue(SCREEN_HEIGHT);
  const [mounted, setMounted] = useState(visible);
  // Open waits for the first layout so the slide starts from the real height.
  const measured = useRef(false);
  const pendingOpen = useRef(false);
  const hasStage = useSheetStageLink(progress, mounted);

  const isDynamic = snapPoint === undefined;
  const drawerHeight =
    snapPoint !== undefined ? SCREEN_HEIGHT * snapPoint : undefined;
  const drawerMaxHeight = SCREEN_HEIGHT * maxSnapPoint;

  // While the keyboard is up it already covers the home indicator, so the
  // content needs no extra safe-area padding at the bottom.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    if (!keyboardAware) return;
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, () =>
      setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(hideEvt, () =>
      setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardAware]);
  const bottomPadding =
    keyboardAware && keyboardVisible ? 12 : Math.max(8, insets.bottom);

  const callOnClose = useCallback(() => onClose(), [onClose]);
  const unmount = useCallback(() => setMounted(false), []);

  // User-initiated close (scrim tap, back button, drag): animate out, then
  // tell the parent, which flips `visible` and unmounts the modal.
  const dismiss = useCallback(() => {
    progress.set(
      withTiming(0, SHEET_CLOSE_TIMING, (finished) => {
        if (finished) runOnJS(callOnClose)();
      })
    );
  }, [progress, callOnClose]);

  // Mount on open during render (no effect round-trip); unmount after the close animation.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      if (measured.current) {
        progress.set(withTiming(1, SHEET_OPEN_TIMING));
      } else {
        pendingOpen.current = true;
      }
    } else if (mounted) {
      pendingOpen.current = false;
      // Parent-driven close: slide out, then unmount.
      progress.set(
        withTiming(0, SHEET_CLOSE_TIMING, (finished) => {
          if (finished) runOnJS(unmount)();
        })
      );
    }
    // `mounted` is read, not tracked: only `visible` drives the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onSheetLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0) sheetHeight.set(h);
      measured.current = true;
      if (pendingOpen.current) {
        pendingOpen.current = false;
        progress.set(withTiming(1, SHEET_OPEN_TIMING));
      }
    },
    [progress, sheetHeight]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onUpdate((e) => {
          const h = sheetHeight.get() > 1 ? sheetHeight.get() : SCREEN_HEIGHT;
          const dy = e.translationY > 0 ? e.translationY : 0;
          const p = 1 - dy / h;
          progress.set(p < 0 ? 0 : p);
        })
        .onEnd((e) => {
          if (
            e.translationY > DISMISS_DISTANCE ||
            e.velocityY > DISMISS_VELOCITY
          ) {
            progress.set(
              withTiming(
                0,
                { ...SHEET_CLOSE_TIMING, duration: 220 },
                (finished) => {
                  if (finished) runOnJS(callOnClose)();
                }
              )
            );
          } else {
            progress.set(withTiming(1, SHEET_OPEN_TIMING));
          }
        }),
    [progress, sheetHeight, callOnClose]
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * sheetHeight.get() }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));

  if (!mounted) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        <OverlayContainer keyboardAware={keyboardAware}>
          {/* Scrim — only without a SheetStage; with one, the stage dims the
              page behind (no double dim). Follows open, drag and close. */}
          {!hasStage && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.backdrop,
                { backgroundColor: colors.scrim },
                scrimStyle,
              ]}
            />
          )}
          <Pressable
            style={styles.backdrop}
            onPress={dismiss}
            accessibilityLabel="Schließen"
          />

          {/* Drawer */}
          <Animated.View
            onLayout={onSheetLayout}
            style={[
              styles.drawer,
              isDynamic
                ? { maxHeight: drawerMaxHeight }
                : { height: drawerHeight },
              { backgroundColor: backgroundColor ?? colors.sheet },
              sheetStyle,
            ]}
          >
            {/* Drag Handle */}
            <GestureDetector gesture={pan}>
              <View style={styles.handleContainer}>
                <View
                  style={[
                    styles.handle,
                    { backgroundColor: handleColor ?? colors.disabled },
                  ]}
                />
              </View>
            </GestureDetector>

            {/* Content — flex: 1 for fixed snap points fills the available
                space; for dynamic sizing, shrink so sticky children stay
                inside the max-height cap. paddingBottom keeps the last CTA
                clear of the home indicator / bottom safe area. */}
            <View
              style={[
                isDynamic ? styles.contentDynamic : styles.content,
                { paddingBottom: bottomPadding },
                contentPaddingHorizontal !== undefined && {
                  paddingHorizontal: contentPaddingHorizontal,
                },
              ]}
            >
              {children}
            </View>
          </Animated.View>
        </OverlayContainer>
      </GestureHandlerRootView>
    </Modal>
  );
}

function OverlayContainer({
  keyboardAware,
  children,
}: {
  keyboardAware: boolean;
  children: React.ReactNode;
}) {
  if (!keyboardAware) return <View style={styles.overlay}>{children}</View>;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.overlay}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  drawer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  contentDynamic: {
    flexShrink: 1,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
});
