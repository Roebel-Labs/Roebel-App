import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useXmtp } from '@/context/XmtpContext';
import { useSnackbar } from '@/context/SnackbarContext';

/**
 * One-time XMTP inbox registration ("Private Nachrichten aktivieren"),
 * shown inline as the inbox's default content — vertically centered —
 * while activation is possible on this device; gone for good after
 * success.
 */
export default function XmtpActivationView() {
  const { colors } = useTheme();
  const { activating, activationError, activate } = useXmtp();
  const { showSnackbar } = useSnackbar();

  const handleActivate = async () => {
    const ok = await activate();
    if (ok) showSnackbar({ message: 'Private Nachrichten aktiviert' });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSecondary }]}>
        <Ionicons name="lock-closed" size={26} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Private Nachrichten aktivieren
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Ende-zu-Ende-verschlüsselt: Nur du und dein Gegenüber können eure
        Chats lesen. Einmal aktivieren, fertig.
      </Text>
      {activationError ? (
        <Text style={[styles.error, { color: colors.error }]}>{activationError}</Text>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary },
          (pressed || activating) && { opacity: 0.85 },
        ]}
        onPress={handleActivate}
        disabled={activating}
        accessibilityLabel="Private Nachrichten aktivieren"
      >
        {activating ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Aktivieren</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
