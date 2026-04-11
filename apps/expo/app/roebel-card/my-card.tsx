// Röbel Card — buyer "Meine Karte" screen.
//
// Shows the active card's balance + QR code (encoding roebel-card:v1:<id>)
// + recent charges, and polls for pending charges every 2 seconds. When
// a pending charge appears, it renders the full-screen PendingChargeModal
// for approve/decline.
//
// The QR code is the primary artifact — the buyer hands their phone to
// the partner who scans it with the partner scanner. A later session
// will add HMAC signing with roebel_card.qr_secret so a screenshot
// can't be replayed.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/context/ThemeContext';
import { useRoebelCard } from '@/context/RoebelCardContext';
import {
  fetchPendingChargesForCard,
  type PendingChargeWithPartner,
  type ChargeStatus,
} from '@/lib/supabase-roebel-card-charges';
import { supabase } from '@/lib/supabase';
import { formatEuros } from '@/lib/format-currency';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import PendingChargeModal from '@/components/PendingChargeModal';

const POLL_INTERVAL_MS = 2000;

interface ChargeHistoryRow {
  id: string;
  amount_cents: number;
  status: ChargeStatus;
  created_at: string;
  approved_at: string | null;
  partner_name: string | null;
}

export default function MyRoebelCardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { card, refresh } = useRoebelCard();

  const [pending, setPending] = useState<PendingChargeWithPartner | null>(null);
  const [history, setHistory] = useState<ChargeHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    if (!card) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('roebel_card_charges' as any)
        .select(
          'id, amount_cents, status, created_at, approved_at, roebel_card_partners!inner(accounts!inner(name))',
        )
        .eq('card_id', card.card_id)
        .in('status', ['approved', 'declined', 'expired'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('loadHistory error:', error);
        setHistory([]);
        return;
      }

      const mapped: ChargeHistoryRow[] = (data as any[]).map((row) => ({
        id: row.id,
        amount_cents: row.amount_cents,
        status: row.status,
        created_at: row.created_at,
        approved_at: row.approved_at,
        partner_name: row.roebel_card_partners?.accounts?.name ?? null,
      }));
      setHistory(mapped);
    } finally {
      setHistoryLoading(false);
    }
  }, [card]);

  const pollPending = useCallback(async () => {
    if (!card) return;
    const rows = await fetchPendingChargesForCard(card.card_id);
    // Pick the newest non-expired pending charge.
    setPending(rows.length > 0 ? rows[0] : null);
  }, [card]);

  const startPolling = useCallback(() => {
    stopPolling();
    void pollPending();
    pollingRef.current = setInterval(() => {
      void pollPending();
    }, POLL_INTERVAL_MS);
  }, [pollPending]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // Start polling + refresh history whenever the screen gains focus.
  useFocusEffect(
    useCallback(() => {
      startPolling();
      void loadHistory();
      return () => stopPolling();
    }, [startPolling, loadHistory]),
  );

  // Stop polling whenever the card disappears.
  useEffect(() => {
    if (!card) stopPolling();
  }, [card]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), loadHistory()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, loadHistory]);

  const handlePendingResolved = () => {
    setPending(null);
    void refresh();
    void loadHistory();
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Meine Karte</Text>
        <View style={styles.headerButton} />
      </View>

      {!card ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.balanceBlock}>
            <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Guthaben</Text>
            <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
              {formatEuros(card.balance_cents)}
            </Text>
          </View>

          <View style={[styles.qrBox, { backgroundColor: '#ffffff' }]}>
            <QRCode
              value={`roebel-card:v1:${card.card_id}`}
              size={240}
              color="#000000"
              backgroundColor="#ffffff"
            />
          </View>

          <Text style={[styles.qrHint, { color: colors.textSecondary }]}>
            Zeige diesen Code dem Partner zum Bezahlen. Der Betrag wird dir zur
            Bestätigung angezeigt, bevor er abgebucht wird.
          </Text>

          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
            Letzte Zahlungen
          </Text>

          {historyLoading && history.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={styles.historyLoader} />
          ) : history.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                Noch keine Zahlungen
              </Text>
            </View>
          ) : (
            history.map((row) => (
              <HistoryRow key={row.id} row={row} colors={colors} />
            ))
          )}
        </ScrollView>
      )}

      <PendingChargeModal charge={pending} onResolved={handlePendingResolved} />
    </SafeAreaView>
  );
}

function HistoryRow({
  row,
  colors,
}: {
  row: ChargeHistoryRow;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const sign = row.status === 'approved' ? '-' : '';
  const amountColor =
    row.status === 'approved' ? colors.textPrimary : colors.textTertiary;
  return (
    <View style={[styles.historyRow, { backgroundColor: colors.surface }]}>
      <View style={styles.historyRowLeft}>
        <Text
          style={[styles.historyName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {row.partner_name ?? 'Unbekannter Partner'}
        </Text>
        <Text style={[styles.historyMeta, { color: colors.textTertiary }]}>
          {formatGermanDate(row.created_at)} · {statusLabel(row.status)}
        </Text>
      </View>
      <Text
        style={[styles.historyAmount, { color: amountColor }]}
      >{`${sign}${formatEuros(row.amount_cents)}`}</Text>
    </View>
  );
}

function statusLabel(status: ChargeStatus): string {
  switch (status) {
    case 'approved': return 'Bestätigt';
    case 'declined': return 'Abgelehnt';
    case 'expired': return 'Abgelaufen';
    case 'reversed': return 'Storniert';
    case 'pending': return 'Offen';
  }
}

function formatGermanDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  balanceBlock: { alignItems: 'center', marginBottom: 24 },
  balanceLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceValue: {
    fontSize: 40,
    fontFamily: 'Inter-Bold',
    marginTop: 4,
  },
  qrBox: {
    padding: 20,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  qrHint: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
    marginBottom: 32,
  },
  sectionHeading: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  historyLoader: { marginTop: 16 },
  emptyCard: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter-Regular' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    width: '100%',
  },
  historyRowLeft: { flex: 1, gap: 2 },
  historyName: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  historyMeta: { fontSize: 12, fontFamily: 'Inter-Regular' },
  historyAmount: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});
