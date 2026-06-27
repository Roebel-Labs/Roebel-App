// Shared transaction-detail screen — used by BOTH the Röbel-Münzen history
// (rewards) and the Stadtkasse (treasury) history. Shows clean info only; the
// counterparty is ALWAYS a resolved name, never a raw 0x address. A GnosisScan
// link sits at the very bottom.
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CircleArrowDownIcon from '@/assets/icons/circle-arrow-down-02.svg';
import CircleArrowUpIcon from '@/assets/icons/circle-arrow-up-02.svg';

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export default function TransactionScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();

  const direction = first(params.direction) === 'in' ? 'in' : 'out';
  const isIn = direction === 'in';
  const title = first(params.title) || (isIn ? 'Erhalten' : 'Gesendet');
  const amountText = first(params.amountText);
  const currency = first(params.currency) === 'eur' ? 'eur' : 'muenzen';
  const currencyLabel = currency === 'eur' ? 'EURO' : 'Röbel Münzen';
  const tsRaw = Number(first(params.timestamp));
  const timestamp = Number.isFinite(tsRaw) && tsRaw > 0 ? tsRaw : 0;
  const txHash = first(params.txHash);
  const name = first(params.name);

  const dateText = timestamp
    ? new Date(timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const timeText = timestamp
    ? new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : '';
  const dateTimeText = timeText ? `${dateText}, ${timeText} Uhr` : dateText;

  const styles = makeStyles(colors, isDark);

  const rows: { label: string; value: string }[] = [
    { label: 'Art', value: isIn ? 'Erhalten' : 'Gesendet' },
    { label: 'Betrag', value: amountText || '—' },
    { label: 'Datum', value: dateTimeText },
  ];
  if (name) rows.push({ label: isIn ? 'Absender' : 'Empfänger', value: name });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={22} height={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Transaktion</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary */}
        <View style={styles.summary}>
          <View style={[styles.badge, { backgroundColor: isIn ? '#22C55E' : '#2563EB' }]}>
            {isIn ? (
              <CircleArrowDownIcon width={28} height={28} />
            ) : (
              <CircleArrowUpIcon width={28} height={28} />
            )}
          </View>
          <Text style={[styles.amount, { color: isIn ? '#16A34A' : colors.textPrimary }]}>
            {amountText || '—'}
          </Text>
          <Text style={styles.currencyCaption}>{currencyLabel}</Text>
        </View>

        {/* Info card */}
        <View style={styles.card}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.infoRow, i < rows.length - 1 && styles.infoRowBorder]}>
              <Text style={styles.infoLabel}>{r.label}</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {r.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1 }} />

        {!!txHash && (
          <Pressable
            onPress={() => Linking.openURL(`https://gnosisscan.io/tx/${txHash}`).catch(() => {})}
            style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Auf Gnosisscan ansehen"
          >
            <Text style={styles.linkText}>Auf Gnosisscan ansehen</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backBtn: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: 'MonaSansSemiCondensed-SemiBold', fontSize: 18, color: colors.textPrimary },
    content: { flexGrow: 1, padding: 20, paddingBottom: 32 },
    summary: { alignItems: 'center', marginTop: 16, marginBottom: 28, gap: 12 },
    badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
    amount: { fontFamily: 'Inter-Bold', fontSize: 36, letterSpacing: -0.5 },
    currencyCaption: { fontFamily: 'Inter-Medium', fontSize: 14, color: colors.textSecondary },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      gap: 16,
    },
    infoRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    infoLabel: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.textSecondary },
    infoValue: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
    linkBtn: {
      marginTop: 24,
      height: 54,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surface : '#F2F2F2',
    },
    linkText: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: colors.primary },
  });
}
