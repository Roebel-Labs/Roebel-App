// Ticket-Kauf: Ticketart wählen, Menge, optional E-Mail für die
// Stripe-Zahlungsbestätigung, dann weiter zu Stripe Checkout — oder direkt
// reserviert, wenn die Ticketart kostenlos ist. Nach dem Checkout landet man
// auf /tickets/[order], demselben Ziel wie der Deep-Link roebel://tickets/<id>.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { fetchTicketTypes, startCheckout, openCheckout, formatCents, type TicketTypeRow } from '@/lib/tickets';

interface EventSummary {
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  account_id: string | null;
}

export default function EventTicketOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeRow[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setLoading(true);
      const [{ data: eventData }, types] = await Promise.all([
        supabase.from('events').select('title, date, time, location, account_id').eq('id', id).maybeSingle(),
        fetchTicketTypes(id),
      ]);
      if (cancelled) return;
      const summary = (eventData as EventSummary | null) ?? null;
      setEvent(summary);
      setTicketTypes(types);
      setSelectedTypeId(types[0]?.id ?? null);
      setQuantity(1);
      if (summary?.account_id) {
        const { data: org } = await supabase.from('accounts').select('name').eq('id', summary.account_id).maybeSingle();
        if (!cancelled) setOrgName((org as { name: string | null } | null)?.name ?? null);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId) ?? null;
  const maxQuantity = Math.max(1, selectedType?.per_order_max ?? 10);
  const totalCents = (selectedType?.price_cents ?? 0) * quantity;

  function selectType(type: TicketTypeRow) {
    setSelectedTypeId(type.id);
    setQuantity((q) => Math.min(q, Math.max(1, type.per_order_max ?? 10)));
  }

  function stepQuantity(delta: number) {
    setQuantity((q) => Math.max(1, Math.min(maxQuantity, q + delta)));
  }

  async function handleCheckout() {
    if (!account || !selectedType || submitting) return;
    setSubmitting(true);
    try {
      const res = await startCheckout(account, {
        ticketTypeId: selectedType.id,
        quantity,
        email: email.trim() || null,
      });
      if (!res.ok) {
        Alert.alert('Nicht möglich', res.message);
        return;
      }
      if (res.data.status === 'paid' || !res.data.url) {
        router.replace({ pathname: '/tickets/[order]' as any, params: { order: res.data.order_id } });
        return;
      }
      await openCheckout(res.data.url, res.data.order_id);
      router.replace({ pathname: '/tickets/[order]' as any, params: { order: res.data.order_id } });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButtonCircle, { backgroundColor: colors.surfaceSecondary }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          Tickets
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {!!event?.title && (
          <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {event.title}
          </Text>
        )}

        {ticketTypes.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Für diese Veranstaltung sind aktuell keine Tickets verfügbar.
          </Text>
        ) : (
          <>
            <View style={styles.typeList}>
              {ticketTypes.map((type) => {
                const selected = type.id === selectedTypeId;
                return (
                  <Pressable
                    key={type.id}
                    onPress={() => selectType(type)}
                    style={[
                      styles.typeRow,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <View style={[styles.radioOuter, { borderColor: selected ? colors.primary : colors.border }]}>
                      {selected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                    </View>
                    <View style={styles.typeInfo}>
                      <Text style={[styles.typeName, { color: colors.textPrimary }]}>{type.name}</Text>
                      {!!type.description && (
                        <Text style={[styles.typeDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                          {type.description}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.typePrice, { color: colors.textPrimary }]}>{formatCents(type.price_cents)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.quantityRow}>
              <Text style={[styles.quantityLabel, { color: colors.textSecondary }]}>Menge</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => stepQuantity(-1)}
                  disabled={quantity <= 1}
                  style={[styles.stepperButton, { borderColor: colors.border, opacity: quantity <= 1 ? 0.4 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Menge verringern"
                >
                  <Text style={[styles.stepperButtonText, { color: colors.textPrimary }]}>−</Text>
                </Pressable>
                <Text style={[styles.stepperValue, { color: colors.textPrimary }]}>{quantity}</Text>
                <Pressable
                  onPress={() => stepQuantity(1)}
                  disabled={quantity >= maxQuantity}
                  style={[styles.stepperButton, { borderColor: colors.border, opacity: quantity >= maxQuantity ? 0.4 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Menge erhöhen"
                >
                  <Text style={[styles.stepperButtonText, { color: colors.textPrimary }]}>+</Text>
                </Pressable>
              </View>
            </View>

            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={email}
              onChangeText={setEmail}
              placeholder="Für die Zahlungsbestätigung von Stripe, optional"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  {quantity} × {formatCents(selectedType?.price_cents ?? 0)}
                </Text>
                <Text style={[styles.summaryTotal, { color: colors.textPrimary }]}>{formatCents(totalCents)}</Text>
              </View>
              {!!orgName && (
                <Text style={[styles.summaryLine, { color: colors.textSecondary }]}>Veranstalter: {orgName}</Text>
              )}
              <Text style={[styles.legalLine, { color: colors.textTertiary }]}>
                Preis inkl. MwSt. · Kein Widerrufsrecht bei termingebundenen Veranstaltungen (§ 312g Abs. 2 Nr. 9 BGB)
              </Text>
            </View>

            {!account && (
              <Text style={[styles.authHint, { color: colors.error }]}>Bitte melde dich an, um Tickets zu kaufen.</Text>
            )}

            <Pressable
              onPress={handleCheckout}
              disabled={!account || submitting}
              style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !account || submitting ? 0.5 : 1 }]}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                  {totalCents > 0 ? 'Weiter zur Zahlung' : 'Kostenlos reservieren'}
                </Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginHorizontal: 8,
  },
  headerSpacer: { width: 40 },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 16, paddingBottom: 40 },
  eventTitle: { fontSize: 20, fontFamily: 'MonaSansSemiCondensed-Bold', lineHeight: 26 },
  emptyText: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20, textAlign: 'center', marginTop: 24 },
  typeList: { gap: 10 },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  typeInfo: { flex: 1, gap: 2 },
  typeName: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  typeDescription: { fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 17 },
  typePrice: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quantityLabel: { fontSize: 14, fontFamily: 'Inter-Medium' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  stepperValue: { fontSize: 16, fontFamily: 'Inter-SemiBold', minWidth: 20, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  summary: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, fontFamily: 'Inter-Regular' },
  summaryTotal: { fontSize: 17, fontFamily: 'Inter-Bold' },
  summaryLine: { fontSize: 13, fontFamily: 'Inter-Regular' },
  legalLine: { fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 16, marginTop: 4 },
  authHint: { fontSize: 13, fontFamily: 'Inter-Medium', textAlign: 'center' },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 15, fontFamily: 'MonaSansSemiCondensed-Bold' },
});
