import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
};

export default function BottomDrawer({
  visible,
  onClose,
  children,
  snapPoint,
  maxSnapPoint = 0.92,
  keyboardAware = false,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const lastGestureDy = useRef(0);

  const isDynamic = snapPoint === undefined;
  const drawerHeight = snapPoint !== undefined ? SCREEN_HEIGHT * snapPoint : undefined;
  const drawerMaxHeight = SCREEN_HEIGHT * maxSnapPoint;

  // While the keyboard is up it already covers the home indicator, so the
  // content needs no extra safe-area padding at the bottom.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    if (!keyboardAware) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardAware]);
  const bottomPadding = keyboardAware && keyboardVisible ? 12 : Math.max(8, insets.bottom);

  // Pan responder for drag-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical drags
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          lastGestureDy.current = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If dragged down more than 150px or fast swipe down, close drawer
        if (gestureState.dy > 150 || gestureState.vy > 0.5) {
          closeDrawer();
        } else {
          // Spring back to open position
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      openDrawer();
    } else {
      closeDrawer();
    }
  }, [visible]);

  const openDrawer = () => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeDrawer}
      statusBarTranslucent
    >
      <OverlayContainer keyboardAware={keyboardAware}>
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={closeDrawer} />

        {/* Drawer */}
        <Animated.View
          style={[
            styles.drawer,
            isDynamic
              ? { maxHeight: drawerMaxHeight }
              : { height: drawerHeight },
            {
              transform: [{ translateY }],
              backgroundColor: colors.background,
            },
          ]}
        >
          {/* Drag Handle */}
          <View {...panResponder.panHandlers} style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.disabled }]} />
          </View>

          {/* Content — flex: 1 for fixed snap points fills the available
              space; for dynamic sizing, shrink so sticky children stay
              inside the max-height cap. paddingBottom keeps the last CTA
              clear of the home indicator / bottom safe area. */}
          <View
            style={[
              isDynamic ? styles.contentDynamic : styles.content,
              { paddingBottom: bottomPadding },
            ]}
          >
            {children}
          </View>
        </Animated.View>
      </OverlayContainer>
    </Modal>
  );
}

function OverlayContainer({ keyboardAware, children }: { keyboardAware: boolean; children: React.ReactNode }) {
  if (!keyboardAware) return <View style={styles.overlay}>{children}</View>;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  drawer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  handleContainer: {
    alignItems: 'center',
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
