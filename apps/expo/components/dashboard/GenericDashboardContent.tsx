import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import AnalyticsCard from '@/components/AnalyticsCard';
import { canPublishBlog, subTypeFeatures } from '@/lib/types';

export default function GenericDashboardContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const features = subTypeFeatures(activeAccount?.sub_type ?? null);
  const canWrite = canPublishBlog(activeAccount);

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Übersicht</Text>
      <View style={styles.statsGrid}>
        <AnalyticsCard label="Profilaufrufe" value={0} />
        <AnalyticsCard label="Beiträge" value={0} />
        <AnalyticsCard label="Veranstaltungen" value={0} />
        <AnalyticsCard label="Reichweite" value={0} />
      </View>

      {features.blog && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push('/org/blog' as any)}
            style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
                Blog verwalten
              </Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
                Artikel anzeigen und veröffentlichen
              </Text>
            </View>
          </Pressable>
          <Pressable
            disabled={!canWrite}
            onPress={() => router.push('/org/blog/new' as any)}
            style={[
              styles.action,
              {
                backgroundColor: canWrite ? colors.primary : colors.surface,
                borderColor: canWrite ? colors.primary : colors.border,
                opacity: canWrite ? 1 : 0.6,
              },
            ]}
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={canWrite ? colors.onPrimary : colors.textTertiary}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.actionTitle,
                  { color: canWrite ? colors.onPrimary : colors.textTertiary },
                ]}
              >
                Neuer Artikel
              </Text>
              <Text
                style={[
                  styles.actionSub,
                  { color: canWrite ? colors.onPrimary : colors.textTertiary, opacity: 0.85 },
                ]}
              >
                {canWrite ? 'Mit einfachem Editor' : 'Nach Freigabe verfügbar'}
              </Text>
            </View>
          </Pressable>
        </View>
      )}

      <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          Detaillierte Statistiken werden verfügbar, sobald dein Profil freigeschaltet ist.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 20 },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  actions: { paddingHorizontal: 16, marginTop: 16, gap: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionTitle: { fontSize: 14, fontFamily: 'Inter-Medium' },
  actionSub: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  emptyState: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, fontFamily: 'Inter-Regular', textAlign: 'center' },
});
