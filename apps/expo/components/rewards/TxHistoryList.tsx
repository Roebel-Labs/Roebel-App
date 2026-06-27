import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import CircleArrowDownIcon from '@/assets/icons/circle-arrow-down-02.svg';
import CircleArrowUpIcon from '@/assets/icons/circle-arrow-up-02.svg';

const RECEIVE_IMG = require('../../assets/illustration/gamification/receive.png');

/** A normalized history row, shared by the rewards (Röbel Münzen) + treasury (€) lists. */
export interface TxHistoryItem {
  id: string;
  direction: 'in' | 'out';
  title: string;
  timestamp: number;
  /** Pre-formatted amount, e.g. "+ 12" or "− 50,00 €". */
  amountText: string;
  avatarUrl?: string | null;
  txHash?: string;
  /** 'eur' renders a € badge instead of the coin/avatar image (treasury list). */
  iconKind?: 'coin' | 'eur';
}

/** Day-group header label: "Heute" / "Gestern" / a full de-DE date. */
export function txDayLabel(ts: number): string {
  const start = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diff = Math.round((start(Date.now()) - start(ts)) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}

interface TxHistoryListProps {
  items: TxHistoryItem[];
  loading: boolean;
  onPressTx: (item: TxHistoryItem) => void;
  emptyText?: string;
}

/** Day-grouped transaction list (avatar + in/out badge, title, time, amount). */
export default function TxHistoryList({ items, loading, onPressTx, emptyText }: TxHistoryListProps) {
  const { colors, isDark } = useTheme();

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />;
  }
  if (items.length === 0) {
    return (
      <View
        style={[
          styles.emptyState,
          { backgroundColor: isDark ? colors.surface : '#F9FAFB', borderColor: colors.border },
        ]}
      >
        <Text style={styles.emptyEmoji}>🐂</Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {emptyText ?? 'Noch keine Transaktionen.'}
        </Text>
      </View>
    );
  }

  // Group by day (items are already newest-first).
  const groups: { label: string; rows: TxHistoryItem[] }[] = [];
  for (const tx of items) {
    const label = txDayLabel(tx.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(tx);
    else groups.push({ label, rows: [tx] });
  }

  return (
    <View style={{ gap: 18 }}>
      {groups.map((g) => (
        <View key={g.label} style={{ gap: 2 }}>
          <Text style={[styles.txDayHeader, { color: colors.textTertiary }]}>{g.label.toUpperCase()}</Text>
          {g.rows.map((tx) => {
            const isIn = tx.direction === 'in';
            return (
              <Pressable
                key={tx.id}
                onPress={() => onPressTx(tx)}
                style={({ pressed }) => [styles.txRow, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`${tx.title} — Transaktionsdetails ansehen`}
              >
                <View style={styles.txIconWrap}>
                  {tx.iconKind === 'eur' ? (
                    <View style={[styles.eurBadge, { backgroundColor: colors.primaryLight }]}>
                      <Text style={[styles.eurBadgeText, { color: colors.primary }]}>€</Text>
                    </View>
                  ) : (
                    <Image source={tx.avatarUrl ? { uri: tx.avatarUrl } : RECEIVE_IMG} style={styles.txAvatar} />
                  )}
                  <View
                    style={[
                      styles.txBadge,
                      { backgroundColor: isIn ? '#22C55E' : '#2563EB', borderColor: isDark ? colors.background : '#FFFFFF' },
                    ]}
                  >
                    {isIn ? (
                      <CircleArrowDownIcon width={12} height={12} />
                    ) : (
                      <CircleArrowUpIcon width={12} height={12} />
                    )}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {tx.title}
                  </Text>
                  <Text style={[styles.txTime, { color: colors.textSecondary }]} numberOfLines={1}>
                    {new Date(tx.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: colors.textPrimary }]}>
                  {tx.amountText}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  txDayHeader: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 9,
  },
  txIconWrap: {
    width: 44,
    height: 44,
  },
  txAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECECEC',
  },
  eurBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eurBadgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
  },
  txBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  txTime: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    marginTop: 2,
  },
  txAmount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
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
});
