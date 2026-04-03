import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useRoebelCard } from '@/context/RoebelCardContext';
import { fetchCheckpoints, fetchCompletions, type ExplorerCheckpoint } from '@/lib/supabase-explorer';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function ExplorerScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useUser();
  const { earnPoints } = useRoebelCard();

  const [checkpoints, setCheckpoints] = useState<ExplorerCheckpoint[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [cps, completions] = await Promise.all([
        fetchCheckpoints(),
        user?.wallet_address ? fetchCompletions(user.wallet_address) : Promise.resolve([]),
      ]);
      setCheckpoints(cps);
      setCompletedIds(new Set(completions.map(c => c.checkpoint_id)));
      setLoading(false);
    }
    load();
  }, [user?.wallet_address]);

  const completedCount = completedIds.size;
  const totalCount = checkpoints.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Röbel Explorer</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Progress Card */}
        <View style={[styles.progressCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.progressTitle}>Entdecke Röbel</Text>
          <Text style={styles.progressSubtitle}>
            Besuche Sehenswürdigkeiten und sammle Badges
          </Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {completedCount}/{totalCount} Checkpoints besucht
          </Text>
        </View>

        {/* Checkpoint List */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Checkpoints</Text>

        {loading ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Lädt...</Text>
        ) : checkpoints.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
            <Text style={styles.emptyEmoji}>🗺️</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Noch keine Checkpoints</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Checkpoints werden bald hinzugefügt. Bleib dran!
            </Text>
          </View>
        ) : (
          checkpoints.map((cp) => {
            const isCompleted = completedIds.has(cp.id);
            return (
              <View
                key={cp.id}
                style={[
                  styles.checkpointCard,
                  { backgroundColor: colors.surface, borderColor: colors.borderSecondary },
                  isCompleted && { borderColor: colors.success, borderWidth: 2 },
                ]}
              >
                <View style={styles.checkpointHeader}>
                  <Text style={styles.checkpointEmoji}>
                    {isCompleted ? '✅' : '📍'}
                  </Text>
                  <View style={styles.checkpointInfo}>
                    <Text style={[styles.checkpointName, { color: colors.textPrimary }]}>
                      {cp.name}
                    </Text>
                    {cp.description && (
                      <Text style={[styles.checkpointDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                        {cp.description}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.pointsBadge, { backgroundColor: isCompleted ? colors.successBackground : colors.primaryLight }]}>
                    <Text style={[styles.pointsText, { color: isCompleted ? colors.success : colors.primary }]}>
                      {isCompleted ? '✓' : `+${cp.points_reward}`}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
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
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  content: { padding: 16, gap: 16 },
  progressCard: {
    borderRadius: 20,
    padding: 24,
    gap: 8,
  },
  progressTitle: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  progressSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.8)',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    marginTop: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.7)',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginTop: 8,
  },
  checkpointCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  checkpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkpointEmoji: { fontSize: 24 },
  checkpointInfo: { flex: 1, gap: 2 },
  checkpointName: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  checkpointDesc: { fontSize: 13, fontFamily: 'Inter-Regular' },
  pointsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pointsText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  emptyState: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter-Regular', textAlign: 'center' },
});
