import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

import CoinBalanceHero from '@/components/rewards/CoinBalanceHero';
import CheckinStreakStrip from '@/components/rewards/CheckinStreakStrip';
import TaskTabs, { type TaskTabValue } from '@/components/rewards/TaskTabs';
import TaskCard from '@/components/rewards/TaskCard';
import KeyInventoryBadge from '@/components/rewards/KeyInventoryBadge';

const WELCOME_MECKY = require('../../assets/illustration/mecky/welcome.png');

export default function RewardsIndexScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isConnected } = useUser();
  const { showSnackbar } = useSnackbar();
  const {
    coins,
    keyCount,
    streak,
    tasks,
    completions,
    lootboxes,
    referralCode,
    recentCheckins,
    hasCheckedInToday,
    hasCompleted,
    claimDaily,
    completeTask,
    refresh,
    isLoading,
  } = useRewards();

  const [tab, setTab] = useState<TaskTabValue>('available');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClaimingCheckin, setIsClaimingCheckin] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const availableTasks = useMemo(
    () => tasks.filter((t) => !hasCompleted(t.key) || t.is_repeatable),
    [tasks, hasCompleted]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => hasCompleted(t.key) && !t.is_repeatable),
    [tasks, hasCompleted]
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }, [refresh]);

  const handleCheckIn = useCallback(async () => {
    if (!isConnected) {
      showSnackbar({ message: 'Bitte zuerst anmelden, um einzuchecken' });
      return;
    }
    setIsClaimingCheckin(true);
    try {
      const result = await claimDaily();
      if (result.success) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        showSnackbar({
          message: `+${result.coins_awarded} Münzen${result.is_bonus ? ' (Bonus 2×!)' : ''}`,
          duration: 3500,
        });
      } else if (result.error === 'already_checked_in') {
        showSnackbar({ message: 'Du hast heute bereits eingecheckt' });
      } else {
        showSnackbar({ message: 'Check-in nicht möglich. Versuche es später.' });
      }
    } finally {
      setIsClaimingCheckin(false);
    }
  }, [claimDaily, isConnected, showSnackbar]);

  const handleTaskPress = useCallback(
    async (taskKey: string, ctaRoute: string | null, isCompleted: boolean) => {
      if (!isConnected) {
        showSnackbar({ message: 'Bitte zuerst anmelden' });
        return;
      }
      if (isCompleted) return;
      // If task has an in-app route, push it. Deferred trigger hook will
      // auto-complete when conditions are met. For repeatable tasks without
      // a route, mark complete directly.
      if (ctaRoute) {
        router.push(ctaRoute as any);
        return;
      }
      const res = await completeTask(taskKey);
      if (res.success) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        showSnackbar({ message: `+${res.coins_awarded} Münzen` });
      } else if (res.error === 'already_completed') {
        showSnackbar({ message: 'Bereits abgeschlossen' });
      } else if (res.error === 'cooldown_active') {
        showSnackbar({ message: 'Bitte noch etwas warten' });
      }
    },
    [completeTask, isConnected, router, showSnackbar]
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Belohnungen</Text>
        <View style={styles.headerBtn}>
          <KeyInventoryBadge />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <CoinBalanceHero
          balance={coins}
          label="Mein Guthaben"
          sublabel={
            !isConnected
              ? 'Melde dich an, um Münzen zu sammeln'
              : keyCount > 0
                ? `${keyCount} Schlüssel bereit für die Schatzkammer`
                : undefined
          }
        />

        <CheckinStreakStrip
          streak={streak}
          recentCheckins={recentCheckins}
          hasCheckedInToday={hasCheckedInToday}
        />

        <Pressable
          onPress={handleCheckIn}
          disabled={!isConnected || hasCheckedInToday || isClaimingCheckin}
          style={({ pressed }) => [
            styles.checkinBtn,
            {
              backgroundColor: hasCheckedInToday || !isConnected ? colors.disabled : '#E02424',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Täglichen Check-in einlösen"
        >
          {isClaimingCheckin ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.checkinText}>
              {!isConnected
                ? 'Anmelden um zu starten'
                : hasCheckedInToday
                  ? 'Heute bereits eingelöst'
                  : 'Check-in machen'}
            </Text>
          )}
        </Pressable>

        <View style={styles.missionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Missionen für Münzen
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Sammle mehr Münzen, wenn du Mecky&apos;s Missionen abschließt
          </Text>
        </View>

        <TaskTabs
          value={tab}
          onChange={setTab}
          availableCount={availableTasks.length}
          completedCount={completedTasks.length}
        />

        <View style={styles.taskList}>
          {isLoading && tasks.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
          ) : tab === 'available' ? (
            availableTasks.length === 0 ? (
              <EmptyState colors={colors} isDark={isDark}>
                Alles erledigt! Schau später wieder vorbei.
              </EmptyState>
            ) : (
              availableTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  completed={false}
                  onPress={() =>
                    handleTaskPress(task.key, task.cta_route, hasCompleted(task.key))
                  }
                />
              ))
            )
          ) : completedTasks.length === 0 ? (
            <EmptyState colors={colors} isDark={isDark}>
              Noch keine Missionen abgeschlossen.
            </EmptyState>
          ) : (
            completedTasks.map((task) => (
              <TaskCard key={task.id} task={task} completed onPress={() => {}} />
            ))
          )}
        </View>

        <Pressable
          onPress={() => router.push('/rewards/referral' as any)}
          style={({ pressed }) => [
            styles.referralBanner,
            {
              backgroundColor: isDark ? '#1a3a5c' : '#EEF4FB',
              borderColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Image source={WELCOME_MECKY} style={styles.referralMecky} resizeMode="contain" />
          <View style={styles.referralText}>
            <Text style={[styles.referralTitle, { color: colors.textPrimary }]}>
              Freunde einladen
            </Text>
            <Text style={[styles.referralSubtitle, { color: colors.textSecondary }]}>
              Du und dein Freund bekommen 200 / 100 Münzen
            </Text>
            {!!referralCode && (
              <Text style={[styles.referralCode, { color: colors.primary }]}>
                Code: {referralCode}
              </Text>
            )}
          </View>
        </Pressable>

        <Pressable
          onPress={() => router.push('/rewards/schatzkammer' as any)}
          style={({ pressed }) => [
            styles.treasuryShortcut,
            {
              backgroundColor: isDark ? '#3c2a12' : '#FFF4DC',
              borderColor: '#E9B949',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={styles.treasuryEmoji}>🗝️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.treasuryTitle, { color: colors.textPrimary }]}>
              Röbeler Schatzkammer
            </Text>
            <Text style={[styles.treasurySub, { color: colors.textSecondary }]}>
              Tausche Münzen gegen Schlüssel und öffne Truhen von Mecky
            </Text>
          </View>
          <Text style={[styles.treasuryChevron, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({
  children,
  colors,
  isDark,
}: {
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.emptyState,
        {
          backgroundColor: isDark ? colors.surface : '#F9FAFB',
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={styles.emptyEmoji}>🐂</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  headerBtn: { minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 16,
  },
  checkinBtn: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  missionHeader: {
    gap: 4,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
  },
  sectionSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
  },
  taskList: { gap: 10, marginTop: 4 },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyEmoji: { fontSize: 32 },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginTop: 8,
  },
  referralMecky: { width: 64, height: 64 },
  referralText: { flex: 1, gap: 2 },
  referralTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  referralSubtitle: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 },
  referralCode: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    marginTop: 4,
  },
  treasuryShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  treasuryEmoji: { fontSize: 28 },
  treasuryTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  treasurySub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    marginTop: 2,
  },
  treasuryChevron: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
  },
});
