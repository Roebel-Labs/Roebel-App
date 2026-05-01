import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useVerificationContext } from '@/context/VerificationContext';
import CitizenPassportCard from '@/components/profile/CitizenPassportCard';

export default function CitizenVerificationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useUser();
  const { userRequests } = useVerificationContext();

  const verifiedSince = user?.citizen_verification_date
    ? new Date(user.citizen_verification_date).toLocaleDateString('de-DE', {
        month: 'long',
        year: 'numeric',
      })
    : undefined;
  const citizenRequest = userRequests.find((r: any) => r.nft_type === 'citizen') || null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          hitSlop={12}
        >
          <ArrowLeftIcon size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <CitizenPassportCard
          verifiedSince={verifiedSince ? `seit ${verifiedSince}` : undefined}
          attestedBy={user?.tier === 'citizen' ? 3 : 0}
          verificationRequestId={citizenRequest?.request_id}
          height={220}
        />

        <Text style={[styles.body, { color: colors.textPrimary }]}>
          Vertrauen ist die Grundlage unserer Bürgergemeinschaft, und die Identitätsprüfung ist
          ein Teil davon.
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Unser Verifizierungsprozess gleicht die Daten einer Person mit vertrauenswürdigen
          Drittquellen oder einem amtlichen Ausweis ab. Der Prozess hat Sicherheitsvorkehrungen,
          garantiert aber nicht, dass jemand wirklich ist, wer er vorgibt zu sein.{' '}
          <Text
            style={[styles.link, { color: colors.textPrimary }]}
            onPress={() => openBrowserAsync('https://www.roebel.app/buergerausweis')}
          >
            Mehr erfahren
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 20,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  link: {
    fontFamily: 'Inter-Medium',
    textDecorationLine: 'underline',
  },
});
