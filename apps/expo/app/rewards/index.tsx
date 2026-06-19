import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
import MintSuccessOverlay from '@/components/rewards/MintSuccessOverlay';

const WELCOME_MECKY = require('../../assets/illustration/mecky/welcome.png');

// Daily-claim cooldown helpers: "Heute abholen" resets at local midnight.
const rtClaimKey = (addr: string) => `rt_lastclaim_${addr.toLowerCase()}`;
const nextMidnight = (t: number) => {
  const d = new Date(t);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
};
const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min ${sec} s`;
};

// Local Röbel-Münzen daily-mint streak (decoupled from the off-chain check-in
// streak so it reflects the REAL new currency, starting fresh per wallet).
const rtStreakKey = (addr: string) => `rt_streak_${addr.toLowerCase()}`;
const dayStart = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

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

  // The real on-chain Röbel Münzen (Circles on Gnosis). This page IS the Röbel Münzen
  // home: the headline + daily mint are the real coin; off-chain points/streaks below
  // stay the gamification layer.
  const {
    talerBalance,
    onboarded: talerOnboarded,
    loading: talerLoading,
    minting: talerMinting,
    onboarding: talerOnboarding,
    dailyMint,
    onboard,
    account: talerAccount,
  } = useRoebelTaler();
  const weekly = useRoebelTalerWeekly();

  // "Heute abholen" daily cooldown (resets at local midnight), tracked per wallet.
  const [lastClaim, setLastClaim] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const addr = talerAccount?.address;
    if (!addr) {
      setLastClaim(null);
      return;
    }
    AsyncStorage.getItem(rtClaimKey(addr))
      .then((v) => setLastClaim(v ? Number(v) : null))
      .catch(() => {});
  }, [talerAccount?.address]);
  useEffect(() => {
    if (lastClaim == null || Date.now() >= nextMidnight(lastClaim)) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastClaim]);
  const cooldownEnd = lastClaim != null ? nextMidnight(lastClaim) : 0;
  const talerClaimedToday = lastClaim != null && nowTs < cooldownEnd;
  const cooldownMs = talerClaimedToday ? cooldownEnd - nowTs : 0;

  // Röbel-Münzen streak (consecutive collected days), local per wallet. Starts
  // fresh, so it reflects the real new streak with Röbel Münzen.
  const [rtStreak, setRtStreak] = useState(0);
  const [showMintSuccess, setShowMintSuccess] = useState(false);
  useEffect(() => {
    const addr = talerAccount?.address;
    if (!addr) { setRtStreak(0); return; }
    (async () => {
      try {
        const v = await AsyncStorage.getItem(rtStreakKey(addr));
        if (v) { setRtStreak(JSON.parse(v)?.count ?? 0); return; }
        // No stored streak yet → bootstrap to 1 if they already collected today,
        // so a fresh start still reflects today's mint.
        const lc = await AsyncStorage.getItem(rtClaimKey(addr));
        if (lc && Date.now() < nextMidnight(Number(lc))) {
          setRtStreak(1);
          AsyncStorage.setItem(rtStreakKey(addr), JSON.stringify({ count: 1, lastDay: dayStart(Date.now()) })).catch(() => {});
        } else {
          setRtStreak(0);
        }
      } catch { setRtStreak(0); }
    })();
  }, [talerAccount?.address]);

  const onDailyMint = useCallback(async () => {
    try {
      await dailyMint();
      const ts = Date.now();
      setLastClaim(ts);
      setNowTs(Date.now());
      const addr = talerAccount?.address;
      if (addr) AsyncStorage.setItem(rtClaimKey(addr), String(ts)).catch(() => {});
      // Advance the local Röbel-Münzen streak (consecutive collected days).
      const today = dayStart(ts);
      let nextStreak = 1;
      try {
        const raw = addr ? await AsyncStorage.getItem(rtStreakKey(addr)) : null;
        if (raw) {
          const { count = 0, lastDay = 0 } = JSON.parse(raw);
          if (lastDay === today) nextStreak = count;
          else if (lastDay === today - 86_400_000) nextStreak = count + 1;
          else nextStreak = 1;
        }
      } catch { /* fresh streak */ }
      setRtStreak(nextStreak);
      if (addr) {
        AsyncStorage.setItem(rtStreakKey(addr), JSON.stringify({ count: nextStreak, lastDay: today })).catch(() => {});
      }
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setShowMintSuccess(true);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error('[Röbel Münzen] daily mint failed:', msg);
      Alert.alert('Heute abholen fehlgeschlagen', msg);
    }
  }, [dailyMint, talerAccount]);

  const onJoin = useCallback(async () => {
    try {
      await onboard();
      showSnackbar({ message: 'Willkommen bei Röbel Münzen!' });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error('[Röbel Münzen] onboarding failed:', msg);
      Alert.alert('Anmeldung fehlgeschlagen', msg);
    }
  }, [onboard, showSnackbar]);

  const [tab, setTab] = useState<TaskTabValue>('available');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);

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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
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
        <Pressable
          onPress={() => router.push('/roebel-taler-info' as any)}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Was ist Röbel Münzen?"
        >
          <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 13, color: colors.primary }}>Info</Text>
        </Pressable>
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
        {/* Warm gradient lives INSIDE the scroll content so it moves with the
            scroll and fades into the page background as you go down. */}
        <LinearGradient
          colors={isDark ? ['#2A261A', colors.background] : ['#FBEFBA', colors.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.scrollGradient}
          pointerEvents="none"
        />

        <View style={styles.heroBleed}>
          <CoinBalanceHero
            balance={talerBalance}
            label="Röbel Münzen"
            verified={!isConnected || talerLoading ? null : talerOnboarded}
            sublabel={
              !isConnected
                ? 'Melde dich an, um Röbel Münzen zu sammeln'
                : !talerOnboarded
                  ? 'Mach mit, um täglich Röbel Münzen abzuholen'
                  : talerClaimedToday
                    ? `Serie ${rtStreak} ${rtStreak === 1 ? 'Tag' : 'Tage'}`
                    : 'Hol dir deine täglichen Röbel Münzen'
            }
          />
        </View>

        {isConnected && (
          !talerOnboarded ? (
            // Not yet a verified Circles member → join (registerHuman)
            <Pressable
              onPress={onJoin}
              disabled={talerOnboarding || talerLoading}
              style={[styles.talerCta, { backgroundColor: colors.primary, opacity: talerOnboarding || talerLoading ? 0.6 : 1 }]}
            >
              {talerOnboarding ? (
                <View style={styles.ctaRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.talerCtaText}>Verifiziere dich…</Text>
                </View>
              ) : (
                <Text style={styles.talerCtaText}>{talerLoading ? 'Wird geladen…' : 'Bei Röbel Münzen mitmachen'}</Text>
              )}
            </Pressable>
          ) : talerClaimedToday ? (
            // Already collected today → disabled button showing the countdown only
            <View
              style={[styles.talerCta, { backgroundColor: isDark ? colors.surface : '#EEF2F7' }]}
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
            >
              <Text style={[styles.talerCtaText, { color: colors.textSecondary }]}>
                Nächste Röbel Münze in {fmtCountdown(cooldownMs)}
              </Text>
            </View>
          ) : (
            // Verified + claimable → daily mint
            <Pressable
              onPress={onDailyMint}
              disabled={talerMinting}
              style={[styles.talerCta, { backgroundColor: colors.primary, opacity: talerMinting ? 0.6 : 1 }]}
            >
              {talerMinting ? (
                <View style={styles.ctaRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.talerCtaText}>Wird abgeholt…</Text>
                </View>
              ) : (
                <Text style={styles.talerCtaText}>Heute abholen</Text>
              )}
            </Pressable>
          )
        )}

        {isConnected && !talerOnboarded && !!talerAccount && (
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(talerAccount.address);
              showSnackbar({ message: 'Adresse kopiert — jetzt in Metri einladen' });
            }}
            style={{ marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontFamily: 'Inter-Medium', fontSize: 12, color: colors.textSecondary }}>So machst du mit</Text>
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
              Lass dich von einem Bürger einladen (z. B. in Metri deine Adresse einladen), dann tippe „Bei Röbel Münzen mitmachen“.
            </Text>
            <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 13, color: colors.primary, marginTop: 6 }}>
              {`${talerAccount.address.slice(0, 8)}…${talerAccount.address.slice(-6)}`}  ·  Adresse kopieren
            </Text>
          </Pressable>
        )}

        {/* Streak — directly under the mint button */}
        {isConnected && (
          <CheckinStreakStrip
            streak={rtStreak}
            recentCheckins={[]}
            hasCheckedInToday={talerClaimedToday}
          />
        )}

        <Pressable
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

        {/* Diese Woche verdient */}
        {isConnected && (
          <WeeklyEarnedChart points={weekly.points} labels={weekly.labels} changePct={weekly.changePct} />
        )}

        {/* Stadtkasse — under the graph */}
        {isConnected && <TreasuryCard />}

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
      <MintSuccessOverlay
        visible={showMintSuccess}
        balance={talerBalance}
        onClose={() => setShowMintSuccess(false)}
      />
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
  scrollGradient: {
    position: 'absolute',
    top: 0,
    left: -16,
    right: -16,
    height: 440,
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
    marginTop: 12,
    borderRadius: 16,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talerCtaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ctaSub: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    marginTop: 3,
  },
  squareRow: {
    flexDirection: 'row',
    gap: 12,
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
