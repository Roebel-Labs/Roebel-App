import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useTheme } from '@/context/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type NotificationSheetProps = {
  visible: boolean;
  onDismiss: () => void;
};

export default function NotificationSheet({ visible, onDismiss }: NotificationSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(SCREEN_HEIGHT);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [visible, translateY]);

  const dismiss = () => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 240,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  const handleEnable = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (Device.isDevice) {
        const existing = await Notifications.getPermissionsAsync();
        if (existing.status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#00498B',
          });
        }
      }
    } catch (err) {
      console.error('Notification permission error:', err);
    } finally {
      setSubmitting(false);
      dismiss();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Schließen" />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              transform: [{ translateY }],
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          <View style={styles.handle} />
          <Pressable style={styles.closeButton} onPress={dismiss} accessibilityLabel="Schließen">
            <Text style={[styles.closeIcon, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>

          <View style={styles.heroIcon}>
            <Image
              source={require('../../assets/illustration/onboarding/bell.png')}
              style={styles.bellImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>Benachrichtigungen aktivieren</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Verpasse keine wichtigen Nachrichten wie Event-Updates und Aktivitäten deines Accounts.
          </Text>

          <Pressable
            onPress={() => setMarketingOptIn((v) => !v)}
            style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: marketingOptIn }}
          >
            <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>
              Erhalte auch Tipps, Angebote und Empfehlungen.
            </Text>
            <CustomToggle value={marketingOptIn} onChange={setMarketingOptIn} />
          </Pressable>

          <Pressable
            onPress={handleEnable}
            disabled={submitting}
            style={[styles.primaryButton, { backgroundColor: colors.primary }, submitting && { opacity: 0.6 }]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Ja, benachrichtigen</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

type ToggleProps = { value: boolean; onChange: (next: boolean) => void };

function CustomToggle({ value, onChange }: ToggleProps) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [value, progress]);

  const trackBackground = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderSecondary, colors.primary],
  });
  const thumbTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22],
  });

  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={8} accessibilityRole="switch">
      <Animated.View style={[toggleStyles.track, { backgroundColor: trackBackground }]}>
        <Animated.View
          style={[
            toggleStyles.thumb,
            { backgroundColor: '#ffffff', transform: [{ translateX: thumbTranslate }] },
          ]}
        >
          {value && <Text style={toggleStyles.check}>✓</Text>}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const toggleStyles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  check: {
    color: '#00498B',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginBottom: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 18,
    fontFamily: 'Inter-Regular',
  },
  heroIcon: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  bellImage: {
    width: 64,
    height: 64,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
