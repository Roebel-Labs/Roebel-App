import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useRoebelCard } from '@/context/RoebelCardContext';
import { fetchDealsByBusiness, fetchDealAnalytics } from '@/lib/supabase-deals';

interface StatCardProps {
  label: string;
  value: string | number;
  emoji: string;
  colors: any;
}

function StatCard({ label, value, emoji, colors }: StatCardProps) {
  return (
    <View style={[statStyles.card, { backgroundColor: colors.surface }]}>
      <Text style={statStyles.emoji}>{emoji}</Text>
      <Text style={[statStyles.value, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[statStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  emoji: { fontSize: 24 },
  value: { fontSize: 22, fontFamily: 'Inter-SemiBold' },
  label: { fontSize: 12, fontFamily: 'Inter-Regular' },
});

interface QuickActionProps {
  emoji: string;
  label: string;
  onPress: () => void;
  colors: any;
}

function QuickAction({ emoji, label, onPress, colors }: QuickActionProps) {
  return (
    <Pressable onPress={onPress} style={[styles.quickAction, { backgroundColor: colors.surface }]}>
      <Text style={styles.quickEmoji}>{emoji}</Text>
      <Text style={[styles.quickLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[styles.quickArrow, { color: colors.textSecondary }]}>›</Text>
    </Pressable>
  );
}

export default function OrgDashboard() {
  const router = useRouter();
  const { colors } = useTheme();
  const { userBusiness } = useUser();
  const { pointsBalance } = useRoebelCard();

  const [dealCount, setDealCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);

  useEffect(() => {
    if (!userBusiness?.id) return;

    async function loadStats() {
      try {
        const [deals, analytics] = await Promise.all([
          fetchDealsByBusiness(userBusiness!.id),
          fetchDealAnalytics(userBusiness!.id).catch(() => null),
        ]);
        setDealCount(deals.length);
        if (analytics) {
          setTotalViews(analytics.totalViews);
        }
      } catch {
        // Silently fail
      }
    }

    loadStats();
  }, [userBusiness?.id]);

  return (
    <View style={styles.container}>
      {/* Business Name */}
      <Text style={[styles.businessName, { color: colors.textPrimary }]}>
        {userBusiness?.name || 'Mein Unternehmen'}
      </Text>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <StatCard emoji="👁️" label="Aufrufe" value={totalViews} colors={colors} />
        <StatCard emoji="🏷️" label="Deals" value={dealCount} colors={colors} />
        <StatCard emoji="🎴" label="Punkte" value={pointsBalance} colors={colors} />
      </View>

      {/* Quick Actions */}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Schnellaktionen</Text>

      <View style={styles.actionsContainer}>
        <QuickAction
          emoji="🏷️"
          label="Neues Angebot erstellen"
          onPress={() => router.push('/business/deals/create' as any)}
          colors={colors}
        />
        <QuickAction
          emoji="📊"
          label="Statistiken ansehen"
          onPress={() => router.push('/business/analytics' as any)}
          colors={colors}
        />
        <QuickAction
          emoji="✏️"
          label="Profil bearbeiten"
          onPress={() => router.push('/business/dashboard' as any)}
          colors={colors}
        />
        <QuickAction
          emoji="🤝"
          label="Röbel Card Partner werden"
          onPress={() => router.push('/business/dashboard' as any)}
          colors={colors}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 16,
  },
  businessName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginTop: 8,
  },
  actionsContainer: {
    gap: 8,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  quickEmoji: {
    fontSize: 20,
  },
  quickLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  quickArrow: {
    fontSize: 20,
  },
});
