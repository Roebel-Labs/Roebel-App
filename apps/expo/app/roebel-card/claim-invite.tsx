// Röbel Card — employee invite claim screen.
//
// Single-screen form where an employee enters their ROEB-XXXX-XXXX code
// from the employer's invite. Calls the SECURITY DEFINER RPC
// claim_roebel_card_employee_invite which reassigns the card's
// wallet_address and links the employee to the employer org as a member.

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRoebelCard } from '@/context/RoebelCardContext';
import {
  claimEmployeeInvite,
  claimErrorMessage,
} from '@/lib/supabase-roebel-card-employees';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

// ROEB-XXXX-XXXX — 4 uppercase chars, a dash, 4 more. Alphabet restricted
// to avoid ambiguous characters (matches the generator in supabase-roebel-card-employees).
const CODE_PATTERN = /^ROEB-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/i;

export default function ClaimInviteScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { refresh } = useRoebelCard();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = code.trim().toUpperCase();
  const codeValid = CODE_PATTERN.test(normalized);

  const handleSubmit = async () => {
    if (!codeValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await claimEmployeeInvite(normalized);
      // Pull the freshly-linked card into the context then jump to it.
      await refresh();
      router.replace('/roebel-card/my-card' as any);
    } catch (err) {
      setError(claimErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Einladung einlösen
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.emoji}>🎫</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Sachbezug Röbel Card aktivieren
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Gib den Code ein, den du von deinem Arbeitgeber erhalten hast. Deine
          Karte wird sofort mit deinem Wallet verknüpft.
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Einladungscode</Text>
        <TextInput
          value={code}
          onChangeText={(v) => {
            setCode(v);
            setError(null);
          }}
          placeholder="ROEB-AB12-CD34"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[
            styles.textInput,
            {
              borderColor: error ? colors.error ?? '#DC2626' : colors.border,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            },
          ]}
        />
        {error && (
          <Text style={[styles.helperError, { color: colors.error ?? '#DC2626' }]}>
            {error}
          </Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={handleSubmit}
          disabled={!codeValid || submitting}
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary },
            (!codeValid || submitting) && { opacity: 0.5 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
              Einladung einlösen
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: 'MonaSansSemiCondensed-SemiBold'},
  scroll: { flex: 1 },
  scrollContent: {
    padding: 24,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 56,
    marginTop: 24,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  label: {
    alignSelf: 'stretch',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  textInput: {
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  helperError: {
    alignSelf: 'stretch',
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
