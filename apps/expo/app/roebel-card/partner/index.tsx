// Röbel Card — Partner dashboard.
//
// Reads live data from roebel_card_partners for the active org account.
// - No row yet for the active org → show a "Jetzt als Partner registrieren" CTA
// - Row exists → render status banner + balance cards + recent charges list
//
// Manual charge entry is STUBBED for this session because
// roebel_card_charges.card_id is NOT NULL and the scanner flow that
// identifies a buyer card hasn't landed yet.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import {
  fetchPartnerByAccountId,
  fetchRecentChargesByPartner,
  type RoebelCardPartnerRow,
  type PartnerChargeRow,
  type PartnerStatus,
} from '@/lib/supabase-roebel-card-partners';
import { formatEuros } from '@/lib/format-currency';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-account' }
  | { kind: 'not-registered' }
  | { kind: 'ready'; partner: RoebelCardPartnerRow; charges: PartnerChargeRow[] };

export default function PartnerDashboardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeAccount || activeAccount.account_type !== 'organisation') {
      setLoadState({ kind: 'no-account' });
      return;
    }
    const partner = await fetchPartnerByAccountId(activeAccount.id);
    if (!partner) {
      setLoadState({ kind: 'not-registered' });
      return;
    }
    const charges = await fetchRecentChargesByPartner(partner.id);
    setLoadState({ kind: 'ready', partner, charges });
  }, [activeAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Partner Dashboard</Text>
        <View style={styles.backButton} />
      </View>

      {loadState.kind === 'loading' ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : loadState.kind === 'no-account' ? (
        <NoAccountState colors={colors} router={router} />
      ) : loadState.kind === 'not-registered' ? (
        <NotRegisteredState colors={colors} router={router} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <StatusBanner partner={loadState.partner} colors={colors} />

          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>Guthaben</Text>
          <View style={styles.balanceRow}>
            <BalanceCard
              label="Offen"
              value={formatEuros(loadState.partner.pending_balance_cents)}
              colors={colors}
            />
            <BalanceCard
              label="Gesamt"
              value={formatEuros(loadState.partner.lifetime_volume_cents)}
              colors={colors}
            />
          </View>

          <Pressable
            onPress={() => {
              if (loadState.partner.status !== 'approved') {
                Alert.alert(
                  'Noch nicht freigeschaltet',
                  'Zahlungen kannst du erst erfassen, sobald dein Antrag geprüft und freigeschaltet wurde.',
                );
                return;
              }
              Alert.alert(
                'Scanner folgt',
                'Die Zahlungserfassung per QR-Scanner wird in einer kommenden Version freigeschaltet.',
              );
            }}
            style={[
              styles.chargeButton,
              {
                backgroundColor:
                  loadState.partner.status === 'approved' ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chargeButtonText,
                {
                  color:
                    loadState.partner.status === 'approved'
                      ? colors.onPrimary
                      : colors.textSecondary,
                },
              ]}
            >
              + Zahlung erfassen
            </Text>
          </Pressable>

          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
            Letzte Transaktionen
          </Text>
          {loadState.charges.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                Noch keine Transaktionen
              </Text>
            </View>
          ) : (
            loadState.charges.map((charge) => (
              <ChargeRow key={charge.id} charge={charge} colors={colors} />
            ))
          )}

          <View style={styles.quietRow}>
            <QuietCard title="Angebote" colors={colors} />
            <QuietCard title="Auszahlungen" colors={colors} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBanner({
  partner,
  colors,
}: {
  partner: RoebelCardPartnerRow;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const bg = STATUS_BG[partner.status] ?? colors.surface;
  const title = STATUS_TITLE[partner.status];
  const subtitle =
    partner.status === 'pending'
      ? `Dein Antrag vom ${formatGermanDate(partner.created_at)}`
      : partner.status === 'approved'
      ? `Seit ${formatGermanDate(partner.approved_at ?? partner.created_at)}`
      : partner.status === 'rejected'
      ? 'Bitte kontaktiere uns'
      : 'Zahlungen sind aktuell nicht möglich';

  return (
    <View style={[styles.statusBanner, { backgroundColor: bg }]}>
      <Text style={[styles.statusTitle, { color: '#ffffff' }]}>{title}</Text>
      <Text style={[styles.statusSubtitle, { color: '#ffffff' }]}>{subtitle}</Text>
    </View>
  );
}

const STATUS_TITLE: Record<PartnerStatus, string> = {
  pending: 'Wird geprüft',
  approved: 'Freigeschaltet',
  rejected: 'Abgelehnt',
  suspended: 'Pausiert',
};

const STATUS_BG: Record<PartnerStatus, string> = {
  pending: '#194383',
  approved: '#16a34a',
  rejected: '#DC2626',
  suspended: '#D97706',
};

function BalanceCard({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={[styles.balanceCard, { backgroundColor: colors.surface }]}>
      <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function ChargeRow({
  charge,
  colors,
}: {
  charge: PartnerChargeRow;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={[styles.chargeRow, { backgroundColor: colors.surface }]}>
      <View style={styles.chargeRowLeft}>
        <Text style={[styles.chargeAmount, { color: colors.textPrimary }]}>
          {formatEuros(charge.amount_cents)}
        </Text>
        {charge.partner_note ? (
          <Text style={[styles.chargeNote, { color: colors.textSecondary }]}>{charge.partner_note}</Text>
        ) : null}
      </View>
      <View style={styles.chargeRowRight}>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: chargeStatusBg(charge.status, colors) },
          ]}
        >
          <Text style={styles.statusPillText}>{chargeStatusLabel(charge.status)}</Text>
        </View>
        <Text style={[styles.chargeDate, { color: colors.textTertiary }]}>
          {formatGermanDate(charge.created_at)}
        </Text>
      </View>
    </View>
  );
}

function chargeStatusLabel(status: PartnerChargeRow['status']): string {
  switch (status) {
    case 'pending': return 'Ausstehend';
    case 'approved': return 'Bestätigt';
    case 'declined': return 'Abgelehnt';
    case 'expired': return 'Abgelaufen';
    case 'reversed': return 'Storniert';
  }
}

function chargeStatusBg(
  status: PartnerChargeRow['status'],
  colors: ReturnType<typeof useTheme>['colors'],
): string {
  switch (status) {
    case 'approved': return '#16a34a';
    case 'pending': return colors.primary;
    case 'declined':
    case 'expired':
    case 'reversed': return '#6b7280';
  }
}

function QuietCard({
  title,
  colors,
}: {
  title: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={[styles.quietCard, { backgroundColor: colors.surface }]}>
      <Text style={[styles.quietTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.quietSubtitle, { color: colors.textTertiary }]}>Bald verfügbar</Text>
    </View>
  );
}

function NoAccountState({
  colors,
  router,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={styles.centerFill}>
      <Text style={styles.stateEmoji}>🏪</Text>
      <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
        Kein Unternehmensaccount aktiv
      </Text>
      <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
        Wechsle zu einem Unternehmensaccount oder lege einen an.
      </Text>
      <Pressable
        onPress={() => router.replace('/create-org' as any)}
        style={[styles.statePrimary, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.statePrimaryText, { color: colors.onPrimary }]}>Unternehmen anlegen</Text>
      </Pressable>
    </View>
  );
}

function NotRegisteredState({
  colors,
  router,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={styles.centerFill}>
      <Text style={styles.stateEmoji}>🎫</Text>
      <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
        Noch nicht als Partner registriert
      </Text>
      <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
        Registriere diesen Betrieb, um Röbel Card Zahlungen entgegenzunehmen.
      </Text>
      <Pressable
        onPress={() => router.push('/roebel-card/partner-register' as any)}
        style={[styles.statePrimary, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.statePrimaryText, { color: colors.onPrimary }]}>
          Jetzt als Partner registrieren
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  stateEmoji: { fontSize: 56, marginBottom: 8 },
  stateTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  stateBody: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  statePrimary: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  statePrimaryText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  statusBanner: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  statusTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  statusSubtitle: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 4, opacity: 0.9 },
  sectionHeading: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 12,
  },
  balanceRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  balanceCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
    gap: 4,
  },
  balanceValue: { fontSize: 22, fontFamily: 'Inter-Bold' },
  balanceLabel: { fontSize: 13, fontFamily: 'Inter-Regular' },
  chargeButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  chargeButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  emptyCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter-Regular' },
  chargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  chargeRowLeft: { flex: 1, gap: 4 },
  chargeRowRight: { alignItems: 'flex-end', gap: 4 },
  chargeAmount: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  chargeNote: { fontSize: 12, fontFamily: 'Inter-Regular' },
  chargeDate: { fontSize: 12, fontFamily: 'Inter-Regular' },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  quietRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  quietCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  quietTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  quietSubtitle: { fontSize: 12, fontFamily: 'Inter-Regular' },
});
