import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useXmtp } from '@/context/XmtpContext';
import { useSnackbar } from '@/context/SnackbarContext';

/**
 * Inbox banner for the one-time XMTP inbox registration. Renders only while
 * activation is possible on this device (new build, kill switch on, wallet
 * connected, not yet registered) and disappears for good after success.
 */
export default function XmtpActivationCard() {
  const { colors } = useTheme();
  const { activationAvailable, activating, activationError, activate } = useXmtp();
  const { showSnackbar } = useSnackbar();

  if (!activationAvailable && !activating) return null;

  const handleActivate = async () => {
    const ok = await activate();
    if (ok) showSnackbar({ message: 'Private Nachrichten aktiviert' });
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSecondary }]}>
          <Ionicons name="lock-closed" size={20} color={colors.primary} />
        </View>
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Private Nachrichten aktivieren
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Ende-zu-Ende-verschlüsselt: Nur du und dein Gegenüber können eure
            Chats lesen.
          </Text>
        </View>
      </View>
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
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  error: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  button: {
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
