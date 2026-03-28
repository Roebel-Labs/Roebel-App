/**
 * Request Success Drawer Component
 *
 * Bottom sheet drawer displayed after successfully creating a verification request
 * Native-feeling drawer that slides up from bottom with swipe-to-dismiss
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Dimensions, Animated, PanResponder } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_HEIGHT = 400;
const SWIPE_THRESHOLD = 50;

interface RequestSuccessModalProps {
  visible: boolean;
  requestId: number | null;
  onViewQR: () => void;
  onDismiss: () => void;
}

export default function RequestSuccessModal({
  visible,
  requestId,
  onViewQR,
  onDismiss,
}: RequestSuccessModalProps) {
  const { colors } = useTheme();
  const translateY = React.useRef(new Animated.Value(DRAWER_HEIGHT)).current;

  // Show drawer animation
  React.useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: DRAWER_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Pan responder for swipe-to-dismiss
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          onDismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouchable} onPress={onDismiss} />

        <Animated.View
          style={[
            styles.drawer,
            {
              backgroundColor: colors.background,
              transform: [{ translateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Drag Handle */}
          <View style={[styles.dragHandle, { backgroundColor: colors.borderSecondary }]} />

          {/* Success Icon */}
          <View style={styles.iconContainer}>
            <View style={[styles.successCircle, { backgroundColor: colors.successBackground, borderColor: colors.success }]}>
              <Text style={[styles.successIcon, { color: colors.success }]}>✓</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>Antrag erstellt!</Text>

          {/* Request ID */}
          {requestId !== null && (
            <Text style={[styles.requestId, { color: colors.textSecondary }]}>Antrag #{requestId}</Text>
          )}

          {/* Description */}
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Ihr Bürger-Pass Antrag wurde erfolgreich erstellt.{'\n\n'}
            Zeigen Sie Ihren QR-Code anderen Bürgern und Bescheinigern, um Unterschriften zu sammeln.
          </Text>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {/* Primary Button - View QR */}
            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={onViewQR}
              android_ripple={{ color: '#1565C0' }}
            >
              <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Zu meinem Antrag</Text>
            </Pressable>

            {/* Secondary Button - Dismiss */}
            <Pressable
              style={[styles.secondaryButton, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
              onPress={onDismiss}
              android_ripple={{ color: colors.borderSecondary }}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Schließen</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  drawer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 40,
    minHeight: DRAWER_HEIGHT,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 20,
  },
  iconContainer: {
    marginBottom: 16,
  },
  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 32,
    fontFamily: 'Inter-SemiBold',
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textAlign: 'center',
  },
  requestId: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 28,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
