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
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';

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
};

const OFFSET = Math.min(480, Dimensions.get('window').height * 0.6);

export default function SheetModal({
  visible,
  onRequestClose,
  onBackdropPress,
  children,
  contentContainerStyle,
  keyboardAware = false,
  statusBarTranslucent = true,
}: Props) {
  const { colors } = useTheme();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // `mounted` is read, not tracked: only `visible` drives the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, progress]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [OFFSET, 0] });
  const Container = keyboardAware ? KeyboardAvoidingView : View;
  const containerProps = keyboardAware ? { behavior: Platform.OS === 'ios' ? ('padding' as const) : ('height' as const) } : {};

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent={statusBarTranslucent}
      onRequestClose={onRequestClose ?? (() => undefined)}
    >
      <Container style={styles.fill} {...containerProps}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onBackdropPress}
          disabled={!onBackdropPress}
          accessibilityLabel={onBackdropPress ? 'Schließen' : undefined}
        />
        <Animated.View
          pointerEvents="box-none"
          style={[styles.content, contentContainerStyle, { transform: [{ translateY }] }]}
        >
          {children}
        </Animated.View>
      </Container>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, justifyContent: 'flex-end' },
});
