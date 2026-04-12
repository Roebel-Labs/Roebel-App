// Röbel Card — buyer "Meine Karte" screen.
//
// Uber Cash-inspired layout:
//   - Hero balance
//   - Action buttons row (Aufladen, Einlösen)
//   - Transaction history (Apple Wallet-style rows)
//   - Partner list at the bottom
//
// QR code is shown in a modal triggered by "Einlösen" — not always
// visible on the main screen. Polls for pending charges every 2 s;
// when a partner submits a charge the PendingChargeModal appears.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { useRoebelCard } from '@/context/RoebelCardContext';
import {
  fetchPendingChargesForCard,
  fetchSignedCardQr,
  type PendingChargeWithPartner,
  type ChargeStatus,
} from '@/lib/supabase-roebel-card-charges';
import {
  fetchApprovedPartners,
  type ApprovedPartnerDisplay,
} from '@/lib/supabase-roebel-card-partners';
import { supabase } from '@/lib/supabase';
import { formatEuros } from '@/lib/format-currency';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import PendingChargeModal from '@/components/PendingChargeModal';
import TopUpBottomSheet from '@/components/TopUpBottomSheet';
import { useActiveAccount } from 'thirdweb/react';

const POLL_INTERVAL_MS = 2000;
const QR_REFRESH_INTERVAL_MS = 30_000;

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
  const activeAccount = useActiveAccount();

  const [pending, setPending] = useState<PendingChargeWithPartner | null>(null);
  const [history, setHistory] = useState<ChargeHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [partners, setPartners] = useState<ApprovedPartnerDisplay[]>([]);
  const [topUpVisible, setTopUpVisible] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const loadPartners = useCallback(async () => {
    const result = await fetchApprovedPartners();
    setPartners(result);
  }, []);

  const pollPending = useCallback(async () => {
    if (!card) return;
    const rows = await fetchPendingChargesForCard(card.card_id);
    setPending(rows.length > 0 ? rows[0] : null);
  }, [card]);

  const walletAddress = activeAccount?.address?.toLowerCase() ?? '';

  const refreshQr = useCallback(async () => {
    if (!card || !walletAddress) return;
    try {
      const payload = await fetchSignedCardQr(card.card_id, walletAddress);
      setQrPayload(payload);
      setQrError(null);
    } catch (err) {
      console.error('fetchSignedCardQr error:', err);
      setQrError('QR-Code konnte nicht geladen werden.');
      setQrPayload(null);
    }
  }, [card, walletAddress]);

  const startPolling = useCallback(() => {
    stopPolling();
    void pollPending();
    pollingRef.current = setInterval(() => void pollPending(), POLL_INTERVAL_MS);
  }, [pollPending]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startQrRefresh = useCallback(() => {
    stopQrRefresh();
    void refreshQr();
    qrRefreshRef.current = setInterval(() => void refreshQr(), QR_REFRESH_INTERVAL_MS);
  }, [refreshQr]);

  const stopQrRefresh = () => {
    if (qrRefreshRef.current) {
      clearInterval(qrRefreshRef.current);
      qrRefreshRef.current = null;
    }
  };

  useFocusEffect(
    useCallback(() => {
      startPolling();
      void loadHistory();
      void loadPartners();
      return () => {
        stopPolling();
        stopQrRefresh();
      };
    }, [startPolling, loadHistory, loadPartners]),
  );

  useEffect(() => {
    if (!card) {
      stopPolling();
      stopQrRefresh();
      setQrPayload(null);
    }
  }, [card]);

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
    setQrModalVisible(true);
    startQrRefresh();
  };

  const handleCloseQr = () => {
    setQrModalVisible(false);
    stopQrRefresh();
  };

  const handleTopUpPress = () => {
    setTopUpVisible(true);
  };

  const handleStripeDismissed = () => {
    router.push('/roebel-card/topup-success' as any);
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Header */}
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Meine Karte
        </Text>
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
          {/* Balance hero */}
          <View style={styles.balanceBlock}>
            <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
              Guthaben
            </Text>
            <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
              {formatEuros(card.balance_cents)}
            </Text>
          </View>

          {/* Action buttons (Uber Cash style) */}
          <View style={styles.actionsRow}>
            <ActionButton
              label="Aufladen"
              emoji="↑"
              onPress={handleTopUpPress}
              colors={colors}
            />
            <ActionButton
              label="Einlösen"
              emoji="⊘"
              onPress={handleOpenQr}
              colors={colors}
            />
          </View>

          {/* Transaction history (Apple Wallet style) */}
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
            <View style={[styles.historyCard, { backgroundColor: colors.surface }]}>
              {history.map((row, i) => (
                <View key={row.id}>
                  {i > 0 && (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  )}
                  <HistoryRow row={row} colors={colors} />
                </View>
              ))}
            </View>
          )}

          {/* Partner list */}
          {partners.length > 0 && (
            <>
              <Text
                style={[styles.sectionHeading, { color: colors.textSecondary, marginTop: 32 }]}
              >
                Teilnehmende Partner
              </Text>
              <View style={[styles.partnerCard, { backgroundColor: colors.surface }]}>
                {partners.map((p, i) => (
                  <View key={p.id}>
                    {i > 0 && (
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    )}
                    <PartnerRow partner={p} colors={colors} />
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* QR Modal */}
      <Modal
        visible={qrModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseQr}
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: colors.background }]}
        >
          <View style={[styles.qrModalHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.headerButton} />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Einlösen
            </Text>
            <Pressable
              onPress={handleCloseQr}
              style={styles.headerButton}
              hitSlop={8}
            >
              <Text style={[styles.qrCloseText, { color: colors.primary }]}>
                Fertig
              </Text>
            </Pressable>
          </View>

          <View style={styles.qrContent}>
            {card && (
              <Text style={[styles.qrBalance, { color: colors.textSecondary }]}>
                Guthaben: {formatEuros(card.balance_cents)}
              </Text>
            )}

            <View style={[styles.qrBox, { backgroundColor: '#ffffff' }]}>
              {qrPayload ? (
                <QRCode
                  value={qrPayload}
                  size={240}
                  color="#000000"
                  backgroundColor="#ffffff"
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  {qrError ? (
                    <Text style={styles.qrErrorText}>{qrError}</Text>
                  ) : (
                    <ActivityIndicator color="#000000" />
                  )}
                </View>
              )}
            </View>

            <Text style={[styles.qrHint, { color: colors.textSecondary }]}>
              Zeige diesen Code dem Partner zum Bezahlen.{'\n'}
              Der Betrag wird dir zur Bestätigung angezeigt.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Pending charge modal */}
      <PendingChargeModal charge={pending} walletAddress={walletAddress} onResolved={handlePendingResolved} />

      {/* Top-up bottom sheet */}
      <TopUpBottomSheet
        visible={topUpVisible}
        walletAddress={activeAccount?.address ?? null}
        onClose={() => setTopUpVisible(false)}
        onStripeDismissed={handleStripeDismissed}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionButton({
  label,
  emoji,
  onPress,
  colors,
}: {
  label: string;
  emoji: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.actionButton, { backgroundColor: colors.surface }]}
    >
      <Text style={styles.actionEmoji}>{emoji}</Text>
      <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function HistoryRow({
  row,
  colors,
}: {
  row: ChargeHistoryRow;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const isApproved = row.status === 'approved';
  const sign = isApproved ? '-' : '';
  const amountColor = isApproved ? colors.textPrimary : colors.textTertiary;
  const statusColor = isApproved
    ? colors.textPrimary
    : row.status === 'declined'
      ? colors.error
      : colors.textTertiary;

  return (
    <View style={styles.historyRow}>
      {/* Icon circle */}
      <View
        style={[
          styles.historyIcon,
          { backgroundColor: isApproved ? colors.primaryLight : colors.surface },
        ]}
      >
        <Text style={styles.historyIconText}>
          {isApproved ? '🛍️' : row.status === 'declined' ? '✕' : '⏳'}
        </Text>
      </View>

      {/* Name + date */}
      <View style={styles.historyRowCenter}>
        <Text
          style={[styles.historyName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {row.partner_name ?? 'Unbekannter Partner'}
        </Text>
        <Text style={[styles.historyMeta, { color: colors.textTertiary }]}>
          {formatGermanDate(row.created_at)}
          {!isApproved && (
            <Text style={{ color: statusColor }}>
              {' · '}{statusLabel(row.status)}
            </Text>
          )}
        </Text>
      </View>

      {/* Amount */}
      <Text style={[styles.historyAmount, { color: amountColor }]}>
        {`${sign}${formatEuros(row.amount_cents)}`}
      </Text>
    </View>
  );
}

function PartnerRow({
  partner,
  colors,
}: {
  partner: ApprovedPartnerDisplay;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.partnerRow}>
      {partner.avatar_url ? (
        <Image
          source={{ uri: partner.avatar_url }}
          style={styles.partnerAvatar}
          contentFit="cover"
        />
      ) : (
        <View
          style={[styles.partnerAvatar, { backgroundColor: colors.primaryLight }]}
        >
          <Text style={styles.partnerAvatarFallback}>
            {partner.account_name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <Text
        style={[styles.partnerName, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {partner.account_name}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    width: 56,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },

  // Balance hero
  balanceBlock: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  balanceLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceValue: {
    fontSize: 44,
    fontFamily: 'Inter-Bold',
    marginTop: 4,
  },

  // Action buttons
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
  },
  actionEmoji: {
    fontSize: 22,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },

  // Section heading
  sectionHeading: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },

  // History
  historyLoader: { marginTop: 16 },
  emptyCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter-Regular' },
  historyCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconText: {
    fontSize: 16,
  },
  historyRowCenter: { flex: 1, gap: 2 },
  historyName: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  historyMeta: { fontSize: 12, fontFamily: 'Inter-Regular' },
  historyAmount: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },

  // Partners
  partnerCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  partnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  partnerAvatarFallback: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#194383',
  },
  partnerName: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    flex: 1,
  },

  // QR modal
  qrModalHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  qrCloseText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  qrContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  qrBalance: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 24,
  },
  qrBox: {
    padding: 20,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: 280,
    height: 280,
    marginBottom: 24,
  },
  qrPlaceholder: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrErrorText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#DC2626',
    textAlign: 'center',
    padding: 16,
  },
  qrHint: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
});
