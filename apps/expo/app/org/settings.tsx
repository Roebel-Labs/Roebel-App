import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import BottomDrawer from '@/components/BottomDrawer';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function OrgSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { activeAccount, ownedAccounts, switchAccount, deleteOrgAccount } = useAccount();

  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Guard: this screen is only valid for org accounts.
  useEffect(() => {
    if (!activeAccount || activeAccount.account_type !== 'organisation') {
      router.replace('/profile');
    }
  }, [activeAccount, router]);

  const handleDelete = async () => {
    if (!activeAccount || isDeleting) return;
    try {
      setIsDeleting(true);
      const personal = ownedAccounts.find((a) => a.account_type === 'personal');
      await deleteOrgAccount(activeAccount.id);
      if (personal) {
        await switchAccount(personal.id);
      }
      setShowConfirm(false);
      router.replace('/profile');
    } catch (err) {
      console.error('Failed to delete account', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Konto konnte nicht gelöscht werden.';
      Alert.alert('Fehler beim Löschen', message);
      setIsDeleting(false);
    }
  };

  if (!activeAccount || activeAccount.account_type !== 'organisation') {
    return null;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Einstellungen</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <View style={styles.accountInfo}>
          <Text style={[styles.accountName, { color: colors.textPrimary }]}>{activeAccount.name}</Text>
          <Text style={[styles.accountSub, { color: colors.textSecondary }]}>Organisation</Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Konto löschen</Text>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            Dieses Organisationskonto wird unwiderruflich entfernt. Inhalte (Beiträge, Veranstaltungen) bleiben erhalten,
            verlieren jedoch ihre Verknüpfung zum Konto.
          </Text>
          <Pressable
            onPress={() => setShowConfirm(true)}
            style={({ pressed }) => [
              styles.dangerButton,
              { backgroundColor: colors.errorBackground, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.dangerButtonText, { color: colors.error }]}>Konto löschen</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomDrawer visible={showConfirm} onClose={() => !isDeleting && setShowConfirm(false)}>
        <View style={styles.confirmBody}>
          <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>Konto wirklich löschen?</Text>
          <Text style={[styles.confirmText, { color: colors.textSecondary }]}>
            <Text style={{ color: colors.textPrimary, fontFamily: 'Inter-SemiBold' }}>{activeAccount.name}</Text>
            {' '}wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </Text>

          <Pressable
            onPress={handleDelete}
            disabled={isDeleting}
            style={({ pressed }) => [
              styles.confirmDelete,
              { opacity: isDeleting || pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.confirmDeleteText}>
              {isDeleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => !isDeleting && setShowConfirm(false)}
            style={[styles.confirmCancel, { paddingBottom: 12 + insets.bottom }]}
          >
            <Text style={[styles.confirmCancelText, { color: colors.textSecondary }]}>Abbrechen</Text>
          </Pressable>
        </View>
      </BottomDrawer>
    </SafeAreaView>
  );
}

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
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  headerSpacer: { width: 32 },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 16 },
  accountInfo: { gap: 4 },
  accountName: { fontSize: 22, fontFamily: 'Inter-Bold' },
  accountSub: { fontSize: 14, fontFamily: 'Inter-Regular' },
  section: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  sectionBody: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  dangerButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerButtonText: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  confirmBody: { gap: 12, paddingTop: 4 },
  confirmTitle: { fontSize: 18, fontFamily: 'Inter-Bold' },
  confirmText: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20, marginBottom: 4 },
  confirmDelete: {
    backgroundColor: '#EF4444',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmDeleteText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-SemiBold' },
  confirmCancel: { alignItems: 'center', paddingTop: 6 },
  confirmCancelText: { fontSize: 15, fontFamily: 'Inter-Medium' },
});
