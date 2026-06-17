import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import { useRoebelTalerWeekly } from '@/hooks/useRoebelTalerWeekly';
import WeeklyEarnedChart from '@/components/roebeltaler/WeeklyEarnedChart';
import TreasuryCard from '@/components/roebeltaler/TreasuryCard';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

import CoinBalanceHero from '@/components/rewards/CoinBalanceHero';
import CheckinStreakStrip from '@/components/rewards/CheckinStreakStrip';
import TaskTabs, { type TaskTabValue } from '@/components/rewards/TaskTabs';
import TaskCard from '@/components/rewards/TaskCard';

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
    referralCode,
    recentCheckins,
    hasCheckedInToday,
    hasCompleted,
    isTaskEligible,
    completeTask,
    refresh,
    isLoading,
  } = useRewards();

  // The real on-chain Röbel-Taler (Circles on Gnosis). This page IS the Röbel-Taler
  // home: the headline + daily mint are the real coin; off-chain points/streaks below
  // stay the gamification layer.
  const {
    talerBalance,
    onboarded: talerOnboarded,
    minting: talerMinting,
    onboarding: talerOnboarding,
    dailyMint,
    onboard,
  } = useRoebelTaler();
  const weekly = useRoebelTalerWeekly();

  const onDailyMint = useCallback(async () => {
    try {
      await dailyMint();
      showSnackbar({ message: 'Dein tägliches Röbel-Taler ist da' });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error('[Röbel-Taler] daily mint failed:', msg);
      Alert.alert('Heute abholen fehlgeschlagen', msg);
    }
  }, [dailyMint, showSnackbar]);

  const onJoin = useCallback(async () => {
    try {
      await onboard();
      showSnackbar({ message: 'Willkommen beim Röbel-Taler!' });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error('[Röbel-Taler] onboarding failed:', msg);
      Alert.alert('Anmeldung fehlgeschlagen', msg);
    }
  }, [onboard, showSnackbar]);

  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TaskTabValue>('available');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  // Gradient backdrop ends exactly at the bottom of the "Zur Schatzkammer"
  // CTA. We measure the header height + the CTA's offset within the scroll
  // content so the gradient can fade to the page background by that point.
  const [headerHeight, setHeaderHeight] = useState(0);
  const [ctaBottom, setCtaBottom] = useState(0);
  const gradientHeight = insets.top + headerHeight + ctaBottom;

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

  const handleTaskPress = useCallback(
    async (taskKey: string, ctaRoute: string | null) => {
      if (!isConnected) {
        showSnackbar({ message: 'Bitte zuerst anmelden' });
        return;
      }
      // If user is eligible (state-based: already citizen, already granted
      // push, etc.) call the RPC directly. Otherwise route them to the CTA
      // page so they can fulfill the condition.
      if (isTaskEligible(taskKey)) {
        setClaimingKey(taskKey);
        try {
          const res = await completeTask(taskKey);
          if (res.success) {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
                () => {}
              );
            }
            showSnackbar({ message: `+${res.coins_awarded} Münzen erhalten` });
          } else if (res.error === 'already_completed') {
            showSnackbar({ message: 'Bereits erhalten' });
          } else if (res.error === 'user_not_ready') {
            showSnackbar({ message: 'Einen Moment — Profil wird geladen' });
          } else if (res.error === 'cooldown_active') {
            showSnackbar({ message: 'Bitte später erneut versuchen' });
          } else {
            showSnackbar({ message: 'Konnte nicht eingelöst werden' });
          }
        } finally {
          setClaimingKey(null);
        }
        return;
      }
      if (ctaRoute) {
        router.push(ctaRoute as any);
      }
    },
    [completeTask, isConnected, isTaskEligible, router, showSnackbar]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={isDark ? ['#2A261A', colors.background] : ['#FBEFBA', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.gradient, gradientHeight > 0 && { height: gradientHeight }]}
        pointerEvents="none"
      />
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.9)', opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Belohnungen</Text>
        <View style={styles.headerBtn} />
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
        <View style={styles.heroBleed}>
          <CoinBalanceHero
            balance={talerBalance}
            label="Röbel-Taler"
            sublabel={
              !isConnected
                ? 'Melde dich an, um Röbel-Taler zu sammeln'
                : !talerOnboarded
                  ? 'Mach mit, um täglich Röbel-Taler abzuholen'
                  : hasCheckedInToday
                    ? `Serie ${streak} Tage`
                    : 'Hol dir dein tägliches Röbel-Taler'
            }
          />
        </View>

        {isConnected && (talerOnboarded ? (
          <Pressable
            onPress={onDailyMint}
            disabled={talerMinting}
            style={[styles.talerCta, { backgroundColor: colors.primary, opacity: talerMinting ? 0.6 : 1 }]}
          >
            {talerMinting ? <ActivityIndicator color="#fff" /> : <Text style={styles.talerCtaText}>Heute abholen</Text>}
          </Pressable>
        ) : (
          <Pressable
            onPress={onJoin}
            disabled={talerOnboarding}
            style={[styles.talerCta, { backgroundColor: colors.primary, opacity: talerOnboarding ? 0.6 : 1 }]}
          >
            {talerOnboarding ? <ActivityIndicator color="#fff" /> : <Text style={styles.talerCtaText}>Bei Röbel-Taler mitmachen</Text>}
          </Pressable>
        ))}

        {isConnected && (
          <View style={{ marginHorizontal: 16, marginTop: 16 }}>
            <WeeklyEarnedChart points={weekly.points} labels={weekly.labels} changePct={weekly.changePct} />
          </View>
        )}

        {isConnected && (
          <>
            <View style={styles.squareRow}>
              <Pressable
                style={[styles.square, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => router.push('/rewards/schatzkammer' as any)}
              >
                <Text style={[styles.squareValue, { color: colors.textPrimary }]}>{keyCount}</Text>
                <Text style={[styles.squareLabel, { color: colors.textSecondary }]}>Schatzkammer-Schlüssel</Text>
              </Pressable>
              <View style={[styles.square, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                <Text style={[styles.squareValue, { color: colors.textPrimary }]}>{streak}</Text>
                <Text style={[styles.squareLabel, { color: colors.textSecondary }]}>Tage Serie</Text>
              </View>
            </View>
            <TreasuryCard />
          </>
        )}

        <CheckinStreakStrip
          streak={streak}
          recentCheckins={recentCheckins}
          hasCheckedInToday={hasCheckedInToday}
        />

        <Pressable
          onLayout={(e) =>
            setCtaBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)
          }
          onPress={() => router.push('/rewards/schatzkammer' as any)}
          style={({ pressed }) => [
            styles.primaryCTA,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Zur Schatzkammer navigieren"
        >
          <Text style={styles.primaryCTAText}>Zur Schatzkammer</Text>
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
                  eligible={isTaskEligible(task.key) && !hasCompleted(task.key)}
                  claiming={claimingKey === task.key}
                  onPress={() => handleTaskPress(task.key, task.cta_route)}
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
      </ScrollView>
    </SafeAreaView>
    </View>
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
  root: { flex: 1 },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 16,
  },
  heroBleed: {
    marginHorizontal: -16,
  },
  talerCta: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  talerCtaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  squareRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 16,
  },
  square: {
    flex: 1,
    aspectRatio: 1.4,
    backgroundColor: '#00000000',
    borderRadius: 20,
    padding: 16,
    justifyContent: 'center',
  },
  squareValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
  },
  squareLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    marginTop: 4,
  },
  primaryCTA: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCTAText: {
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
});
