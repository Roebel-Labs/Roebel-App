import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

export default function RequestSuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Ionicons name="checkmark-circle" size={72} color={colors.primary} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Antrag erfolgreich eingereicht</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Tippe jetzt auf Weiter um den Antrag zu sehen und lass Ihn anschließend von anderen Bürgern scannen.
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.replace('/verification/my-request' as any)}
          style={[styles.button, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    marginTop: 24,
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  description: {
    marginTop: 12,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
    textAlign: 'center',
  },
  footer: { paddingHorizontal: 24, paddingBottom: 8 },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
});
