/**
 * Frame for the credential screens (inbox, accept, invite link): header with a back button, and a
 * centred status block for loading / message states. StyleSheet + useTheme.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export function CredentialScreenFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile' as any);
  };
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
        <View style={styles.headerRight} />
      </View>
      {children}
    </SafeAreaView>
  );
}

/** Centred spinner, or a title + text + optional single action. */
export function CredentialStatus({
  loading = false,
  title,
  message,
  actionLabel,
  onAction,
}: {
  loading?: boolean;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
      {title ? <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>{title}</Text> : null}
      {message ? <Text style={[styles.statusText, { color: colors.textSecondary }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={[styles.primary, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function formatValidity(validUntilIso: string | null): string {
  if (!validUntilIso) return 'Unbefristet';
  const d = new Date(validUntilIso);
  if (Number.isNaN(d.getTime())) return 'Unbefristet';
  return `Gültig bis ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

export const frameStyles = StyleSheet.create({
  primary: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  primaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  busy: { opacity: 0.5 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontFamily: fontFamily.headingSemiBold },
  headerRight: { width: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  statusTitle: { fontSize: 18, fontFamily: fontFamily.semiBold, textAlign: 'center' },
  statusText: { fontSize: 15, fontFamily: fontFamily.regular, textAlign: 'center', lineHeight: 21 },
  primary: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginTop: 8 },
  primaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
});
