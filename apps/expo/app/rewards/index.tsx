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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import InfoIcon from '@/assets/icons/info.svg';

import CoinBalanceHero from '@/components/rewards/CoinBalanceHero';
import Skeleton from '@/components/ui/Skeleton';
import CheckinStreakStrip from '@/components/rewards/CheckinStreakStrip';
import { useRoebelTalerHistory } from '@/hooks/useRoebelTalerHistory';
import TxHistoryList, { type TxHistoryItem } from '@/components/rewards/TxHistoryList';
import TaskCard from '@/components/rewards/TaskCard';
import { useRewardCelebration } from '@/context/RewardCelebrationContext';
import ReceiveSheet from '@/components/rewards/ReceiveSheet';
import MuenzenIntroSheet from '@/components/rewards/MuenzenIntroSheet';
import NotInvitedSheet from '@/components/rewards/NotInvitedSheet';
import NavigationIcon from '@/assets/icons/navigation-03.svg';
import QrIcon from '@/assets/icons/qr-code.svg';
import CoinsIcon from '@/assets/icons/coins-01.svg';
import { softShadow } from '@/lib/shadow';
import { getTreasuryEuro } from '@/lib/roebel-taler';
import { attesterSafeGnosisAddress } from '@/constants/gnosis';

const WELCOME_MECKY = require('../../assets/illustration/mecky/welcome.png');

// Min claimable Röbel Münzen before the mint button activates (≈6 min of accrual at
// ~1/hour) — avoids dust-sized mints while still letting citizens collect hourly.
const MIN_MINTABLE = 0.1;
// One full Röbel Münze accrues ≈1h after a mint — drives the in-button countdown.
const MINT_COOLDOWN_MS = 3_600_000;
const STADTKASSE_IMG = require('../../assets/illustration/muenzen/stadtkasse.png');
const SCHATZTRUHE_IMG = require('../../assets/illustration/muenzen/schatztruhe.png');

// One-time Röbel Münzen feature intro (per device).
const MUENZEN_INTRO_KEY = '@rewards/muenzen_intro_seen';

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
  const { isConnected, user } = useUser();
  const { showSnackbar } = useSnackbar();
  const { celebrate } = useRewardCelebration();
  const {
    lootboxes,
    userRewards,
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
    mintable: talerMintable,
    onboarded: talerOnboarded,
    loading: talerLoading,
    minting: talerMinting,
    onboarding: talerOnboarding,
    dailyMint,
    onboard,
    account: talerAccount,
  } = useRoebelTaler();
  // Stadtkasse euro figure (same source as the old TreasuryCard).
  const [stadtkasseEuro, setStadtkasseEuro] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTreasuryEuro(attesterSafeGnosisAddress)
      .then((e) => { if (!cancelled) setStadtkasseEuro(e); })
      .catch(() => { if (!cancelled) setStadtkasseEuro(0); });
    return () => { cancelled = true; };
  }, []);

  // Hourly mint cooldown: a mint claims the accrued coin, then the next whole
  // Röbel Münze lands ≈1h later. We anchor a real 60-min countdown on the last
  // mint timestamp (persisted per wallet, so it survives reloads).
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
    if (lastClaim == null || Date.now() >= lastClaim + MINT_COOLDOWN_MS) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastClaim]);
  const cooldownEnd = lastClaim != null ? lastClaim + MINT_COOLDOWN_MS : 0;
  const talerInCooldown = lastClaim != null && nowTs < cooldownEnd;
  const cooldownMs = talerInCooldown ? cooldownEnd - nowTs : 0;
  // Separate "claimed today" flag for the streak strip — calendar day, not the
  // 1h cooldown, so the streak stays lit for the rest of the day after a mint.
  const talerClaimedToday = lastClaim != null && dayStart(lastClaim) === dayStart(nowTs);

  // Röbel-Münzen streak (consecutive collected days), local per wallet. Starts
  // fresh, so it reflects the real new streak with Röbel Münzen.
  const [rtStreak, setRtStreak] = useState(0);
  const [showReceive, setShowReceive] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [showNotInvited, setShowNotInvited] = useState(false);

  // One-time Röbel Münzen intro: show the first time this device lands on the
  // page, after a short beat so the screen paints first.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(MUENZEN_INTRO_KEY)
      .then((v) => {
        if (active && v !== '1') {
          setTimeout(() => { if (active) setShowIntro(true); }, 500);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    AsyncStorage.setItem(MUENZEN_INTRO_KEY, '1').catch(() => {});
  }, []);
  const onIntroLearnMore = useCallback(() => {
    dismissIntro();
    router.push('/roebel-taler-info' as any);
  }, [dismissIntro, router]);
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
      // Capture what's accruing now — that's the amount the mint lands.
      const received = Math.max(1, Math.round(talerMintable));
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
      celebrate(received);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error('[Röbel Münzen] daily mint failed:', msg);
      Alert.alert('Heute abholen fehlgeschlagen', msg);
    }
  }, [dailyMint, talerAccount, talerMintable, celebrate]);

  const onJoin = useCallback(async () => {
    try {
      await onboard();
      showSnackbar({ message: 'Willkommen bei Röbel Münzen!' });
    } catch (e: any) {
      if (e?.code === 'NOT_INVITED') {
        setShowNotInvited(true);
        return;
      }
      const msg = e?.message ?? String(e);
      console.error('[Röbel Münzen] onboarding failed:', msg);
      Alert.alert('Anmeldung fehlgeschlagen', msg);
    }
  }, [onboard, showSnackbar]);

  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'missionen' | 'verlauf'>('verlauf');
  const history = useRoebelTalerHistory();
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
            celebrate(res.coins_awarded ?? 0);
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
    [completeTask, isConnected, isTaskEligible, router, showSnackbar, celebrate]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Warm gradient lives INSIDE the scroll content so it scrolls with the
            page, fades to the background, and sits BEHIND the transparent header. */}
        <LinearGradient
          colors={isDark ? ['#2A261A', colors.background] : ['#FBEFBA', colors.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.scrollGradient, { height: insets.top + 460 }]}
          pointerEvents="none"
        />

        {/* Header scrolls with the page (not fixed) — only visible at the top. */}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerSide}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backBtn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)',
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Zurück"
            >
              <ChevronLeftIcon width={22} height={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Belohnungen</Text>
          <View style={[styles.headerSide, styles.headerSideEnd]}>
            <Pressable
              onPress={() => router.push('/roebel-taler-info' as any)}
              style={({ pressed }) => [
                styles.backBtn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)',
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Was ist Röbel Münzen?"
            >
              <InfoIcon width={22} height={22} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.heroBleed}>
          <CoinBalanceHero
            balance={Math.round(talerBalance)}
            loading={isConnected && talerLoading}
            label="Röbel Münzen"
            verified={null}
            sublabel={
              !isConnected
                ? 'Melde dich an, um Röbel Münzen zu sammeln'
                : !talerOnboarded
                  ? 'Mach mit, um täglich Röbel Münzen abzuholen'
                  : `Serie ${rtStreak} ${rtStreak === 1 ? 'Tag' : 'Tage'}`
            }
          />
        </View>

        {/* White rounded sheet wraps everything from Senden/Empfangen down */}
        <View style={[styles.sheet, { backgroundColor: isDark ? colors.background : '#FFFFFF' }]}>
        {/* Senden / Empfangen — above the daily mint button */}
        {isConnected && talerOnboarded && (
          <View style={styles.sendRecvRow}>
            <Pressable
              onPress={() => router.push('/rewards/send' as any)}
              style={({ pressed }) => [
                styles.srBtn,
                { backgroundColor: isDark ? colors.surface : '#F2F2F2', opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Röbel Münzen senden"
            >
              <NavigationIcon width={20} height={20} color={isDark ? colors.textPrimary : '#001A42'} />
              <Text style={[styles.srText, { color: isDark ? colors.textPrimary : '#001A42' }]}>Senden</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowReceive(true)}
              style={({ pressed }) => [
                styles.srBtn,
                { backgroundColor: isDark ? colors.surface : '#F2F2F2', opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Röbel Münzen empfangen"
            >
              <QrIcon width={20} height={20} color={isDark ? colors.textPrimary : '#001A42'} />
              <Text style={[styles.srText, { color: isDark ? colors.textPrimary : '#001A42' }]}>Empfangen</Text>
            </Pressable>
          </View>
        )}

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
                <Text style={styles.talerCtaText}>{talerLoading ? 'Wird geladen…' : 'Belohnungen erhalten'}</Text>
              )}
            </Pressable>
          ) : talerMinting ? (
            // Minting in progress
            <View style={[styles.talerCta, { backgroundColor: colors.primary, opacity: 0.6 }]}>
              <View style={styles.ctaRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.talerCtaText}>Wird abgeholt…</Text>
              </View>
            </View>
          ) : talerInCooldown ? (
            // Just minted → real 60-min countdown INSIDE the button until the
            // next whole Röbel Münze lands.
            <View
              style={[
                styles.talerCta,
                styles.talerCtaCountdown,
                { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderColor: colors.border },
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
            >
              <Text style={[styles.talerCtaText, styles.talerCtaCountdownText, { color: colors.textSecondary }]}>
                Nächste Röbel Münze in {fmtCountdown(cooldownMs)}
              </Text>
            </View>
          ) : talerMintable >= MIN_MINTABLE ? (
            // Münzen have accrued (≈1/Stunde) → collect whatever is claimable now
            <Pressable
              onPress={onDailyMint}
              style={[styles.talerCta, { backgroundColor: colors.primary }]}
            >
              <View style={styles.ctaRow}>
                <CoinsIcon width={20} height={20} color="#fff" />
                <Text style={styles.talerCtaText}>
                  {talerMintable.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Röbel Münzen abholen
                </Text>
              </View>
            </Pressable>
          ) : (
            // Still accruing — show the live amount; the protocol issues continuously
            <View
              style={[
                styles.talerCta,
                styles.talerCtaCountdown,
                { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderColor: colors.border },
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
            >
              <Text style={[styles.talerCtaText, styles.talerCtaCountdownText, { color: colors.textSecondary }]}>
                {talerMintable > 0
                  ? `Sammelt sich… ≈ ${talerMintable.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Röbel Münzen`
                  : 'Deine Röbel Münzen sammeln sich…'}
              </Text>
            </View>
          )
        )}

        {/* Streak — CheckinStreakStrip already provides its own card + shadow */}
        {isConnected && (
          <CheckinStreakStrip
            streak={rtStreak}
            recentCheckins={[]}
            hasCheckedInToday={talerClaimedToday}
          />
        )}

        {/* Stadtkasse + Schatzkammer — two soft-shadow square cards */}
        {isConnected && (
          <View style={styles.cardsRow}>
            <Pressable
              onPress={() => router.push('/treasury' as any)}
              style={({ pressed }) => [
                styles.squareCard,
                { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 },
                softShadow(2, isDark),
              ]}
              accessibilityRole="button"
              accessibilityLabel="Stadtkasse ansehen"
            >
              <Text style={[styles.squareTitle, { color: colors.textPrimary }]}>Stadtkasse</Text>
              {stadtkasseEuro == null ? (
                <Skeleton width={72} height={18} radius={6} style={{ marginTop: 6 }} />
              ) : (
                <Text style={[styles.squareValue, { color: colors.textSecondary }]} numberOfLines={1}>
                  {`${stadtkasseEuro.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
                </Text>
              )}
              <Image source={STADTKASSE_IMG} style={styles.squareImg} resizeMode="contain" />
            </Pressable>

            <Pressable
              onPress={() => router.push('/rewards/schatzkammer' as any)}
              style={({ pressed }) => [
                styles.squareCard,
                { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 },
                softShadow(2, isDark),
              ]}
              accessibilityRole="button"
              accessibilityLabel="Zur Schatzkammer navigieren"
            >
              <Text style={[styles.squareTitle, { color: colors.textPrimary }]}>Schatzkammer</Text>
              {isLoading && lootboxes.length === 0 ? (
                <Skeleton width={48} height={18} radius={6} style={{ marginTop: 6 }} />
              ) : (
                <Text style={[styles.squareValue, { color: colors.textSecondary }]} numberOfLines={1}>
                  {userRewards.length}/{lootboxes.length}
                </Text>
              )}
              <Image source={SCHATZTRUHE_IMG} style={styles.squareImg} resizeMode="contain" />
            </Pressable>
          </View>
        )}

        {/* Tabs: Missionen | Verlauf */}
        <View style={[styles.tabBar, { backgroundColor: isDark ? colors.surface : '#F1F2F4' }]}>
          <Pressable
            onPress={() => setTab('missionen')}
            style={[styles.tabItem, tab === 'missionen' && { backgroundColor: isDark ? colors.background : '#FFFFFF' }]}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, { color: tab === 'missionen' ? colors.textPrimary : colors.textSecondary }]}>
              Missionen
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('verlauf')}
            style={[styles.tabItem, tab === 'verlauf' && { backgroundColor: isDark ? colors.background : '#FFFFFF' }]}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, { color: tab === 'verlauf' ? colors.textPrimary : colors.textSecondary }]}>
              Verlauf
            </Text>
          </Pressable>
        </View>

        {tab === 'missionen' ? (
          <>
            <View style={styles.taskList}>
              {isLoading && tasks.length === 0 ? (
                <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
              ) : tasks.length === 0 ? (
                <EmptyState colors={colors} isDark={isDark}>
                  Alles erledigt! Schau später wieder vorbei.
                </EmptyState>
              ) : (
                [...tasks]
                  .sort(
                    (a, b) =>
                      Number(hasCompleted(a.key) && !a.is_repeatable) -
                      Number(hasCompleted(b.key) && !b.is_repeatable)
                  )
                  .map((task) => {
                  const done = hasCompleted(task.key) && !task.is_repeatable;
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      completed={done}
                      eligible={isTaskEligible(task.key) && !hasCompleted(task.key)}
                      claiming={claimingKey === task.key}
                      onPress={() => { if (!done) handleTaskPress(task.key, task.cta_route); }}
                    />
                  );
                })
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
          </>
        ) : (
          <TxHistoryList
            items={history.items.map((tx): TxHistoryItem => ({
              id: tx.id,
              direction: tx.direction,
              title: tx.name || (tx.direction === 'in' ? 'Erhalten' : 'Gesendet'),
              timestamp: tx.timestamp,
              amountText: `${tx.direction === 'in' ? '+ ' : '− '}${Math.round(tx.value).toLocaleString('de-DE')}`,
              avatarUrl: tx.avatarUrl,
              txHash: tx.txHash,
            }))}
            loading={history.loading}
            onPressTx={(item) =>
              router.push({
                pathname: '/transaction',
                params: {
                  direction: item.direction,
                  title: item.title,
                  amountText: item.amountText,
                  currency: 'muenzen',
                  timestamp: String(item.timestamp),
                  ...(item.txHash ? { txHash: item.txHash } : {}),
                  ...(item.avatarUrl ? {} : {}),
                  ...(item.title && item.title !== 'Erhalten' && item.title !== 'Gesendet'
                    ? { name: item.title }
                    : {}),
                },
              } as any)
            }
          />
        )}
        </View>
      </ScrollView>

      <ReceiveSheet
        visible={showReceive}
        address={talerAccount?.address}
        name={user?.display_name ?? user?.username ?? null}
        username={user?.username ?? null}
        onClose={() => setShowReceive(false)}
      />

      <MuenzenIntroSheet
        visible={showIntro}
        onClose={dismissIntro}
        onLearnMore={onIntroLearnMore}
      />

      <NotInvitedSheet
        visible={showNotInvited}
        onClose={() => setShowNotInvited(false)}
        address={talerAccount?.address}
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
  sheet: {
    marginHorizontal: -16,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },
  headerSide: {
    flex: 1,
    justifyContent: 'center',
  },
  headerSideEnd: {
    alignItems: 'flex-end',
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    gap: 4,
    marginTop: 16,
  },
  tabItem: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  scroll: { flex: 1 },
  scrollGradient: {
    position: 'absolute',
    top: 0,
    left: -16,
    right: -16,
    height: 440,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: -16,
    paddingHorizontal: 12,
    paddingBottom: 8,
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
    borderRadius: 999,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talerCtaCountdown: {
    borderWidth: 1,
  },
  talerCtaCountdownText: {
    fontSize: 13,
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
  sendRecvRow: {
    flexDirection: 'row',
    gap: 12,
  },
  srBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 999,
  },
  srText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
  },
  ctaSub: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    marginTop: 3,
  },
  streakCard: {
    borderRadius: 16,
    padding: 16,
    minHeight: 120,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  squareCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
  squareTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
  },
  squareValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    marginTop: 4,
  },
  squareSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    marginTop: 1,
  },
  squareImg: {
    position: 'absolute',
    right: -4,
    bottom: -6,
    width: 118,
    height: 104,
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
