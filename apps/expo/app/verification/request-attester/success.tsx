/**
 * Attester (Bescheiniger) Request Success Screen
 *
 * Shows the QR code for the freshly created attester attestation request so the
 * user can collect the required Bescheiniger signatures right inside the app.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import VerificationQRCode from '@/components/VerificationQRCode';

export default function RequestAttesterSuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = Number(params.requestId);
  const hasRequestId = Number.isFinite(requestId) && requestId > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Antrag eingereicht</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Lassen Sie zwei Bescheiniger diesen QR-Code scannen, um Ihren Antrag zu bestätigen.
          </Text>
        </View>

        {hasRequestId ? (
          <VerificationQRCode
            requestId={requestId}
            nftType="attester"
            attesterCount={0}
            citizenCount={0}
          />
        ) : (
          <View style={styles.messageContainer}>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Ihr Antrag wurde erstellt. Die Antrags-ID wird gerade ermittelt …
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.replace('/settings' as any)}
          style={[styles.button, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Fertig</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 24,
  },
  titleBlock: {
    alignItems: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  title: {
    marginTop: 16,
    fontSize: 22,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
    textAlign: 'center',
  },
  messageContainer: {
    paddingHorizontal: 32,
    paddingVertical: 24,
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    paddingTop: 12,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
