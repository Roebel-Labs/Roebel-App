import React from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { formatEuros } from '@/lib/format-currency';
import QrCodeIcon from '@/assets/icons/qr-code.svg';

export interface SheetHistoryRow {
  id: string;
  kind: 'charge' | 'topup';
  amount_cents: number;
  status: string;
  created_at: string;
  approved_at: string | null;
  partner_name: string | null;
  partner_avatar_url?: string | null;
}

type Props = {
  balanceCents: number;
  history: SheetHistoryRow[];
  historyLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onTopUp: () => void;
  onRedeem: () => void;
  translateY: SharedValue<number>;
  onMeasure: (height: number) => void;
};

export default function RoebelCardSheet({
  balanceCents,
  history,
  historyLoading,
  refreshing,
  onRefresh,
  onTopUp,
  onRedeem,
  translateY,
  onMeasure,
}: Props) {
  const { colors } = useTheme();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    onMeasure(e.nativeEvent.layout.height);
  };

  const { euros, cents } = splitAmount(balanceCents);

  return (
    <Animated.View
      onLayout={handleLayout}
      style={[
        styles.sheet,
        animatedStyle,
        {
          backgroundColor: colors.background,
          shadowColor: '#000',
        },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
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
          <Text style={[styles.balanceLabel, { color: colors.textPrimary }]}>
            Ihr Guthaben
          </Text>
          <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
            €{euros}
            <Text style={{ color: colors.textSecondary }}>.{cents}</Text>
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <PillButton
            label="Aufstocken"
            onPress={onTopUp}
            colors={colors}
          />
          <PillButton
            label="Einlösen"
            onPress={onRedeem}
            colors={colors}
            icon={
              <QrCodeIcon
                width={20}
                height={20}
                color={colors.primary}
              />
            }
          />
        </View>

        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
          Partner-Geschäfte
        </Text>

        {historyLoading && history.length === 0 ? (
          <ActivityIndicator
            color={colors.primary}
            style={styles.loader}
          />
        ) : history.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            Noch keine Zahlungen
          </Text>
        ) : (
          <View style={styles.historyList}>
            {history.map((row) => (
              <HistoryRow key={row.id} row={row} />
            ))}
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

function PillButton({
  label,
  onPress,
  icon,
  colors,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: colors.borderSecondary,
          backgroundColor: pressed ? colors.feedBackground : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? <View style={styles.pillIcon}>{icon}</View> : null}
      <Text style={[styles.pillLabel, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function HistoryRow({ row }: { row: SheetHistoryRow }) {
  const { colors } = useTheme();
  const isTopup = row.kind === 'topup';
  const isApproved = row.status === 'approved' || row.status === 'paid';

  const sign = isTopup ? '+' : isApproved ? '-' : '';
  const amountColor = isTopup
    ? colors.success
    : isApproved
      ? colors.textPrimary
      : colors.textTertiary;

  const displayName = isTopup
    ? 'Aufstockung'
    : (row.partner_name ?? 'Unbekannter Partner');

  return (
    <View style={styles.historyRow}>
      <View style={[styles.historyIcon, { backgroundColor: colors.primaryLight }]}>
        {row.partner_avatar_url ? (
          <Image
            source={{ uri: row.partner_avatar_url }}
            style={styles.historyIconImage}
            contentFit="cover"
          />
        ) : (
          <Text style={[styles.historyIconGlyph, { color: colors.primary }]}>
            {isTopup ? '↓' : displayName.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.historyCenter}>
        <Text
          style={[styles.historyName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {displayName}
        </Text>
        <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>
          {formatGermanShort(row.created_at)}
        </Text>
      </View>

      <Text style={[styles.historyAmount, { color: amountColor }]}>
        {`${sign}${formatEuros(row.amount_cents)}`}
      </Text>
    </View>
  );
}

function splitAmount(cents: number): { euros: string; cents: string } {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100).toString();
  const remainder = (abs % 100).toString().padStart(2, '0');
  return { euros: negative ? `-${euros}` : euros, cents: remainder };
}

function formatGermanShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 48,
  },

  balanceBlock: {
    gap: 8,
    marginBottom: 24,
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  balanceValue: {
    fontSize: 36,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 44,
    letterSpacing: -0.5,
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  pill: {
    flex: 1,
    height: 56,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pillIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },

  sectionHeading: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
  },

  loader: { marginTop: 16 },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    paddingVertical: 8,
  },

  historyList: {
    gap: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  historyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  historyIconImage: {
    width: '100%',
    height: '100%',
  },
  historyIconGlyph: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  historyCenter: { flex: 1, gap: 2 },
  historyName: { fontSize: 15, fontFamily: 'Inter-Medium' },
  historyMeta: { fontSize: 13, fontFamily: 'Inter-Regular' },
  historyAmount: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
