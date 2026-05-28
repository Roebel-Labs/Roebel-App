// Röbel Card — buyer "Meine Karte" screen.
//
// Two-state animated layout:
//   - State A (default): navy card teaser peeks behind a white sheet that
//     holds balance, action pills (Aufstocken / Einlösen) and the
//     transaction history.
//   - State B (expanded): tapping the card teaser slides the sheet down
//     off-screen to reveal the full navy card and the partner-business
//     grid. Tapping the back arrow slides the sheet back up.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { useRoebelCard } from '@/context/RoebelCardContext';
import {
  fetchPartnerName,
  fetchPendingChargesForCard,
  fetchSignedCardQr,
  type PendingChargeWithPartner,
  type RoebelCardChargeRow,
} from '@/lib/supabase-roebel-card-charges';
import {
  fetchApprovedPartners,
  type ApprovedPartnerDisplay,
} from '@/lib/supabase-roebel-card-partners';
import { supabase } from '@/lib/supabase';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import PendingChargeModal from '@/components/PendingChargeModal';
import TopUpBottomSheet from '@/components/TopUpBottomSheet';
import { useActiveAccount } from 'thirdweb/react';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';

import RoebelCardHero, {
  HERO_HEIGHT,
} from './_components/RoebelCardHero';
import RoebelCardSheet, {
  type SheetHistoryRow,
} from './_components/RoebelCardSheet';
import PartnersGrid from './_components/PartnersGrid';
import RoebelCardRedeemSheet from './_components/RoebelCardRedeemSheet';

const QR_REFRESH_INTERVAL_MS = 30_000;
const CARD_PEEK_HEIGHT = 72;
const TOP_BAR_HEIGHT = 48;
const TOP_BAR_GAP = 32;
const SHEET_SPRING = { damping: 22, stiffness: 200, mass: 1 };

export type BuyerMode = 'citizen' | 'tourist' | 'sachbezug';

export default function MyRoebelCardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { card, refresh } = useRoebelCard();
  const activeAccount = useActiveAccount();
  const { isCitizen } = useUser();
  const { activeAccount: accountCtx } = useAccount();

  const buyerMode: BuyerMode =
    accountCtx?.account_type === 'organisation'
      ? 'sachbezug'
      : isCitizen
        ? 'citizen'
        : 'tourist';

  const [pending, setPending] = useState<PendingChargeWithPartner | null>(null);
  const [history, setHistory] = useState<SheetHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [partners, setPartners] = useState<ApprovedPartnerDisplay[]>([]);
  const [topUpVisible, setTopUpVisible] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const sheetTranslateY = useSharedValue(0);
  const qrRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const TOP_BAR_BOTTOM = insets.top + TOP_BAR_HEIGHT + TOP_BAR_GAP;
  const HERO_TOP = TOP_BAR_BOTTOM + 4;
  const SHEET_REST_TOP = HERO_TOP + CARD_PEEK_HEIGHT;

  const expand = useCallback(() => {
    if (sheetHeight === 0) return;
    setIsExpanded(true);
    sheetTranslateY.value = withSpring(sheetHeight, SHEET_SPRING);
  }, [sheetHeight, sheetTranslateY]);

  const collapse = useCallback(() => {
    sheetTranslateY.value = withSpring(0, SHEET_SPRING, (finished) => {
      if (finished) runOnJS(setIsExpanded)(false);
    });
  }, [sheetTranslateY]);

  const loadHistory = useCallback(async () => {
    if (!card) return;
    setHistoryLoading(true);
    try {
      const [chargesResult, purchasesResult] = await Promise.all([
        supabase
          .from('roebel_card_charges' as any)
          .select(
            'id, amount_cents, status, created_at, approved_at, roebel_card_partners!inner(accounts!inner(name, avatar_url))',
          )
          .eq('card_id', card.card_id)
          .in('status', ['approved', 'declined', 'expired'])
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('roebel_card_purchases' as any)
          .select('id, amount_cents, status, created_at, paid_at')
          .eq('card_id', card.card_id)
          .eq('status', 'paid')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (chargesResult.error) {
        console.error('loadHistory charges error:', chargesResult.error);
      }
      if (purchasesResult.error) {
        console.error('loadHistory purchases error:', purchasesResult.error);
      }

      const charges: SheetHistoryRow[] = (
        (chargesResult.data as any[]) ?? []
      ).map((row) => ({
        id: row.id,
        kind: 'charge' as const,
        amount_cents: row.amount_cents,
        status: row.status,
        created_at: row.created_at,
        approved_at: row.approved_at,
        partner_name: row.roebel_card_partners?.accounts?.name ?? null,
        partner_avatar_url:
          row.roebel_card_partners?.accounts?.avatar_url ?? null,
      }));

      const purchases: SheetHistoryRow[] = (
        (purchasesResult.data as any[]) ?? []
      ).map((row) => ({
        id: `purchase-${row.id}`,
        kind: 'topup' as const,
        amount_cents: row.amount_cents,
        status: row.status,
        created_at: row.created_at,
        approved_at: row.paid_at ?? null,
        partner_name: null,
        partner_avatar_url: null,
      }));

      const merged = [...charges, ...purchases]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )
        .slice(0, 20);

      setHistory(merged);
    } finally {
      setHistoryLoading(false);
    }
  }, [card]);

  const loadPartners = useCallback(async () => {
    const result = await fetchApprovedPartners();
    setPartners(result);
  }, []);

  const walletAddress = activeAccount?.address?.toLowerCase() ?? '';

  const refreshQr = useCallback(async () => {
    if (!card || !walletAddress) {
      console.log('[my-card] refreshQr skipped', {
        hasCard: !!card,
        hasWallet: !!walletAddress,
      });
      return;
    }
    try {
      const payload = await fetchSignedCardQr(card.card_id, walletAddress);
      setQrPayload(payload);
      setQrError(null);
      console.log('[my-card] refreshQr success', {
        card_id: card.card_id,
        payloadHead: payload.slice(0, 32),
      });
    } catch (err) {
      console.error('fetchSignedCardQr error:', err);
      setQrError('QR-Code konnte nicht geladen werden.');
      setQrPayload(null);
    }
  }, [card, walletAddress]);

  const stopQrRefresh = () => {
    if (qrRefreshRef.current) {
      clearInterval(qrRefreshRef.current);
      qrRefreshRef.current = null;
    }
  };

  const startQrRefresh = useCallback(() => {
    stopQrRefresh();
    void refreshQr();
    qrRefreshRef.current = setInterval(
      () => void refreshQr(),
      QR_REFRESH_INTERVAL_MS,
    );
  }, [refreshQr]);

  useFocusEffect(
    useCallback(() => {
      console.log('[my-card] focus');
      void loadHistory();
      void loadPartners();
      return () => {
        console.log('[my-card] blur');
        stopQrRefresh();
      };
    }, [loadHistory, loadPartners]),
  );

  // Initial fetch + Realtime subscription + 3s polling fallback for pending
  // charges. Realtime is the primary path (instant); polling is the safety
  // net for cases realtime can't cover — channel reconnect after a network
  // blip or backgrounding (Supabase Realtime does not replay missed events)
  // and the rare case where the realtime publication / RLS is misconfigured
  // server-side. Scoped to card.card_id; torn down on focus/blur/card change.
  useFocusEffect(
    useCallback(() => {
      if (!card) return;
      const cardId = card.card_id;
      let cancelled = false;

      void (async () => {
        const rows = await fetchPendingChargesForCard(cardId);
        console.log('[my-card] initial pending fetch', {
          card_id: cardId,
          rowCount: rows.length,
        });
        if (cancelled) return;
        setPending(rows.length > 0 ? rows[0] : null);
      })();

      const channel = supabase
        .channel(`roebel_card_charges:${cardId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'roebel_card_charges',
            filter: `card_id=eq.${cardId}`,
          },
          async (payload) => {
            const row = payload.new as RoebelCardChargeRow;
            console.log('[my-card] realtime INSERT', {
              id: row.id,
              card_id: row.card_id,
              status: row.status,
              amount_cents: row.amount_cents,
            });
            if (row.status !== 'pending') return;
            if (new Date(row.expires_at).getTime() <= Date.now()) return;
            const partner_name = row.partner_id
              ? await fetchPartnerName(row.partner_id)
              : null;
            if (cancelled) return;
            // Functional setter: don't reopen a modal the user just resolved.
            setPending((cur) => cur ?? { ...row, partner_name });
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'roebel_card_charges',
            filter: `card_id=eq.${cardId}`,
          },
          (payload) => {
            const row = payload.new as RoebelCardChargeRow;
            console.log('[my-card] realtime UPDATE', {
              id: row.id,
              status: row.status,
            });
            if (row.status !== 'pending') {
              setPending((cur) => (cur?.id === row.id ? null : cur));
            }
          },
        )
        .subscribe((status) => {
          console.log('[my-card] realtime', status, { card_id: cardId });
        });

      // Polling fallback. Functional setter ensures we never override a
      // modal the user is interacting with (or already resolved within
      // this 3s window).
      const pollInterval = setInterval(async () => {
        const rows = await fetchPendingChargesForCard(cardId);
        if (cancelled || rows.length === 0) return;
        setPending((cur) => cur ?? rows[0]);
      }, 3000);

      return () => {
        cancelled = true;
        clearInterval(pollInterval);
        void supabase.removeChannel(channel);
      };
    }, [card]),
  );

  useEffect(() => {
    if (!card) {
      stopQrRefresh();
      setQrPayload(null);
    }
  }, [card]);

  useEffect(() => {
    console.log('[my-card] pending state', {
      hasPending: !!pending,
      pendingId: pending?.id ?? null,
      qrModalVisible,
    });
    if (pending && qrModalVisible) {
      console.log('[my-card] auto-close QR sheet');
      setQrModalVisible(false);
      stopQrRefresh();
    }
  }, [pending, qrModalVisible]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isExpanded) {
          collapse();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [isExpanded, collapse]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), loadHistory(), loadPartners()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, loadHistory, loadPartners]);

  const handlePendingResolved = () => {
    setPending(null);
    void refresh();
    void loadHistory();
  };

  const handleOpenQr = () => {
    console.log('[my-card] handleOpenQr');
    setQrModalVisible(true);
    startQrRefresh();
  };

  const handleCloseQr = () => {
    console.log('[my-card] handleCloseQr');
    setQrModalVisible(false);
    stopQrRefresh();
  };

  const handleTopUpPress = () => {
    setTopUpVisible(true);
  };

  const handleStripeDismissed = () => {
    router.push('/roebel-card/topup-success' as any);
  };

  const handleBack = () => {
    if (isExpanded) {
      collapse();
    } else {
      router.back();
    }
  };

  const handleHeroPress = () => {
    if (!isExpanded) expand();
  };

  if (!card) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.feedBackground }]}
        edges={['top', 'bottom']}
      >
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.feedBackground }]}>
      <ScrollView
        style={styles.bgScroll}
        contentContainerStyle={[
          styles.bgScrollContent,
          { paddingTop: HERO_TOP + HERO_HEIGHT + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={isExpanded}
      >
        <PartnersGrid
          partners={partners}
          onPressPartner={(p) => router.push(`/account/${p.account_id}` as any)}
        />
      </ScrollView>

      <View
        style={[
          styles.heroLayer,
          { top: HERO_TOP, left: 16, right: 16 },
        ]}
        pointerEvents="box-none"
      >
        <RoebelCardHero
          height={HERO_HEIGHT}
          onPress={handleHeroPress}
          pressable={!isExpanded}
        />
      </View>

      <View
        style={[
          styles.sheetLayer,
          { top: SHEET_REST_TOP },
        ]}
        pointerEvents="box-none"
      >
        <RoebelCardSheet
          balanceCents={card.balance_cents}
          history={history}
          historyLoading={historyLoading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onTopUp={handleTopUpPress}
          onRedeem={handleOpenQr}
          translateY={sheetTranslateY}
          onMeasure={(h) => {
            if (h > 0 && Math.abs(h - sheetHeight) > 1) setSheetHeight(h);
          }}
        />
      </View>

      <View
        style={[
          styles.topBar,
          { top: insets.top + 8, paddingHorizontal: 16 },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleBack}
          style={[
            styles.roundButton,
            { backgroundColor: colors.background, shadowColor: '#000' },
          ]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon
            width={24}
            height={24}
            color={colors.textPrimary}
          />
        </Pressable>

        {!isExpanded && (
          <View
            style={[
              styles.roundButton,
              { backgroundColor: colors.background, shadowColor: '#000' },
            ]}
          >
            <Text style={[styles.infoGlyph, { color: colors.textPrimary }]}>
              i
            </Text>
          </View>
        )}
      </View>

      <RoebelCardRedeemSheet
        visible={qrModalVisible}
        onClose={handleCloseQr}
        balanceCents={card.balance_cents}
        qrPayload={qrPayload}
        qrError={qrError}
      />

      <PendingChargeModal
        charge={pending}
        walletAddress={walletAddress}
        onResolved={handlePendingResolved}
      />

      <TopUpBottomSheet
        visible={topUpVisible}
        walletAddress={activeAccount?.address ?? null}
        buyerMode={buyerMode}
        onClose={() => setTopUpVisible(false)}
        onStripeDismissed={handleStripeDismissed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bgScroll: { flex: 1 },
  bgScrollContent: { flexGrow: 1 },

  heroLayer: {
    position: 'absolute',
    zIndex: 1,
  },
  sheetLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 48,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  infoGlyph: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
});
