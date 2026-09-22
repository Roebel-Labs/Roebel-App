// Per-event ticket type editor plus the order list — org-owner only. Ticket types come from the
// signed ticket_types_list action rather than a table read, because BOTH anon paths (the RLS
// policy and fetchTicketTypes) hide is_active = false rows, and the org has to see the types it
// deactivated. Below the editor, the orders for this event, with a refund action for paid ones.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { supabase } from '@/lib/supabase';
import { connectStatus } from '@/lib/stripe-connect';
import {
  upsertTicketTypes,
  fetchTicketTypesForOrg,
  fetchOrgOrders,
  refundOrder,
  formatCents,
  orderStatusLabel,
  type TicketTypeRow,
  type OrgOrderView,
} from '@/lib/tickets';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

interface EditableRow {
  key: string;
  id?: string;
  name: string;
  priceText: string;
  price_cents: number;
  priceInvalid: boolean;
  capacityText: string;
  capacity: number | null;
  perOrderMaxText: string;
  per_order_max: number;
  is_active: boolean;
  sort_order: number;
}

/** 1000 → "10", 1050 → "10,5", 1005 → "10,05", 0 → "" (free). */
function centsToEuroInputText(cents: number): string {
  if (!cents) return '';
  const str = (cents / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return str.replace('.', ',');
}

function rowFromRecord(t: TicketTypeRow, index: number): EditableRow {
  return {
    key: t.id,
    id: t.id,
    name: t.name,
    priceText: centsToEuroInputText(t.price_cents),
    price_cents: t.price_cents,
    priceInvalid: false,
    capacityText: t.capacity != null ? String(t.capacity) : '',
    capacity: t.capacity,
    perOrderMaxText: String(t.per_order_max ?? 10),
    per_order_max: t.per_order_max ?? 10,
    is_active: t.is_active,
    sort_order: t.sort_order ?? index,
  };
}

let localKeySeq = 0;
function blankRow(sortOrder: number): EditableRow {
  localKeySeq += 1;
  return {
    key: `new-${localKeySeq}`,
    id: undefined,
    name: '',
    priceText: '',
    price_cents: 0,
    priceInvalid: false,
    capacityText: '',
    capacity: null,
    perOrderMaxText: '10',
    per_order_max: 10,
    is_active: true,
    sort_order: sortOrder,
  };
}

export default function EventTicketsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeAccount } = useAccount();
  const thirdwebAccount = useActiveAccount();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [chargesEnabled, setChargesEnabled] = useState(false);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [orders, setOrders] = useState<OrgOrderView[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !activeAccount) return;
    setLoading(true);
    try {
      const { data: event, error } = await supabase
        .from('events')
        .select('title, account_id')
        .eq('id', id)
        .maybeSingle();

      if (error || !event) {
        setAuthorized(false);
        return;
      }
      setEventTitle((event as { title: string | null }).title ?? '');

      const ok = (event as { account_id: string | null }).account_id === activeAccount.id;
      setAuthorized(ok);
      if (!ok) return;

      const [typesResult, statusResult] = await Promise.all([
        thirdwebAccount ? fetchTicketTypesForOrg(thirdwebAccount, id) : Promise.resolve(null),
        thirdwebAccount ? connectStatus(thirdwebAccount, activeAccount.id) : Promise.resolve(null),
      ]);

      if (typesResult?.ok) setRows(typesResult.data.types.map(rowFromRecord));
      else if (typesResult) Alert.alert('Fehler', typesResult.message);
      if (statusResult?.ok) setChargesEnabled(statusResult.data.charges_enabled);
    } finally {
      setLoading(false);
    }
  }, [id, activeAccount?.id, thirdwebAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  // Waits for `authorized`, so a visitor who is not owner/admin never signs a request the server
  // would only answer with 403. Always clears the spinner — including on the early return, which
  // otherwise leaves the Bestellungen section loading forever.
  const loadOrders = useCallback(async () => {
    if (!id || !thirdwebAccount || authorized !== true) {
      if (authorized === false) setOrdersLoading(false);
      return;
    }
    setOrdersLoading(true);
    try {
      const res = await fetchOrgOrders(thirdwebAccount, id);
      if (res.ok) setOrders(res.data.orders);
      else console.warn('[tickets] order list failed', res.code, res.message);
    } finally {
      setOrdersLoading(false);
    }
  }, [id, thirdwebAccount, authorized]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  function updateRow(key: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // An empty field means free. Anything unparseable OR negative is invalid and blocks saving —
  // it is never quietly rewritten to 0, which would sell a paid ticket for nothing.
  function handlePriceChange(key: string, text: string) {
    const parsed = Math.round(parseFloat(text.replace(',', '.')) * 100);
    const invalid = text.trim() !== '' && (!Number.isFinite(parsed) || parsed < 0);
    updateRow(key, {
      priceText: text,
      price_cents: !invalid && Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
      priceInvalid: invalid,
    });
  }

  function handleCapacityChange(key: string, text: string) {
    const digits = text.replace(/[^0-9]/g, '');
    updateRow(key, { capacityText: digits, capacity: digits === '' ? null : parseInt(digits, 10) });
  }

  function handlePerOrderMaxChange(key: string, text: string) {
    const digits = text.replace(/[^0-9]/g, '');
    updateRow(key, {
      perOrderMaxText: digits,
      per_order_max: digits === '' ? 10 : Math.max(1, parseInt(digits, 10)),
    });
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow(prev.length)]);
  }

  // Only unsaved rows can be discarded outright — a persisted ticket type is
  // deactivated via the "Aktiv" toggle instead, since upsertTicketTypes never
  // deletes rows that are simply left out of the payload.
  function discardUnsavedRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  const hasPaidRow = rows.some((r) => r.price_cents > 0);
  const stripeBlocked = hasPaidRow && !chargesEnabled;
  const hasInvalidPrice = rows.some((r) => r.priceInvalid);
  const saveBlocked = saving || stripeBlocked || hasInvalidPrice;

  const handleSave = useCallback(async () => {
    if (!activeAccount || !thirdwebAccount || !id || saveBlocked) return;
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        id: r.id,
        name: r.name.trim(),
        price_cents: r.price_cents,
        capacity: r.capacity,
        per_order_max: r.per_order_max,
        is_active: r.is_active,
        sort_order: r.sort_order,
      }));
      const result = await upsertTicketTypes(thirdwebAccount, id, payload);
      if (result.ok) {
        setRows(result.data.types.map(rowFromRecord));
      } else {
        Alert.alert('Fehler', result.message);
      }
    } finally {
      setSaving(false);
    }
  }, [activeAccount, thirdwebAccount, id, saveBlocked, rows]);

  // Declared as a function so it can call itself for the forced retry without a self-referencing
  // useCallback. `force` is only ever true after the organiser confirmed a second time.
  async function submitRefund(order: OrgOrderView, force: boolean): Promise<void> {
    if (!thirdwebAccount || refundingId) return;
    setRefundingId(order.id);
    try {
      const res = await refundOrder(thirdwebAccount, order.id, force ? { force: true } : undefined);
      if (res.ok) {
        Alert.alert('Erstattet', 'Die Bestellung wurde erstattet. Die Tickets sind nicht mehr gültig.');
        await loadOrders();
        return;
      }
      if (res.code === 'TICKETS_CHECKED_IN' && !force) {
        Alert.alert('Ticket bereits eingelöst', 'Mindestens ein Ticket wurde eingelöst. Trotzdem erstatten?', [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Trotzdem erstatten', style: 'destructive', onPress: () => void submitRefund(order, true) },
        ]);
        return;
      }
      Alert.alert('Fehler', res.message);
    } finally {
      setRefundingId(null);
    }
  }

  function confirmRefund(order: OrgOrderView) {
    Alert.alert(
      'Bestellung erstatten?',
      `${formatCents(order.amount_cents)} für ${order.quantity} × ${order.ticket_type_name} werden zurückgebucht. Die Tickets verlieren ihre Gültigkeit.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Erstatten', style: 'destructive', onPress: () => void submitRefund(order, false) },
      ]
    );
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
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          Tickets · {eventTitle || 'Veranstaltung'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {authorized === false ? (
        <View style={styles.contentInner}>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>Nicht berechtigt.</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
          {stripeBlocked && (
            <View style={[styles.warningCard, { backgroundColor: colors.warningBackground, borderColor: colors.warning }]}>
              <Text style={[styles.warningText, { color: colors.warning }]}>
                Für bezahlte Tickets muss zuerst das Stripe-Konto aktiv sein.
              </Text>
              <Pressable onPress={() => router.push('/org/payments' as any)} style={styles.warningLink}>
                <Text style={[styles.warningLinkText, { color: colors.warning }]}>Zu Zahlungen</Text>
              </Pressable>
            </View>
          )}

          {rows.map((row) => (
            <View key={row.key} style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                value={row.name}
                onChangeText={(text) => updateRow(row.key, { name: text })}
                placeholder="Name, z. B. Normalticket"
                placeholderTextColor={colors.textTertiary}
              />

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Preis (€)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { color: colors.textPrimary, backgroundColor: colors.background, borderColor: row.priceInvalid ? colors.error : colors.border },
                    ]}
                    value={row.priceText}
                    onChangeText={(text) => handlePriceChange(row.key, text)}
                    keyboardType="decimal-pad"
                    placeholder="0 = kostenlos"
                    placeholderTextColor={colors.textTertiary}
                  />
                  {row.priceInvalid ? (
                    <Text style={[styles.errorHint, { color: colors.error }]}>Ungültiger Preis — bitte korrigieren.</Text>
                  ) : (
                    <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>{formatCents(row.price_cents)}</Text>
                  )}
                </View>
                <View style={styles.halfField}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Kontingent</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                    value={row.capacityText}
                    onChangeText={(text) => handleCapacityChange(row.key, text)}
                    keyboardType="number-pad"
                    placeholder="Unbegrenzt"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Max. pro Bestellung</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                    value={row.perOrderMaxText}
                    onChangeText={(text) => handlePerOrderMaxChange(row.key, text)}
                    keyboardType="number-pad"
                    placeholder="10"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={[styles.halfField, styles.switchRow]}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Aktiv</Text>
                  <Switch value={row.is_active} onValueChange={(value) => updateRow(row.key, { is_active: value })} />
                </View>
              </View>

              {!row.id && (
                <Pressable onPress={() => discardUnsavedRow(row.key)} style={styles.removeRow}>
                  <Text style={[styles.removeText, { color: colors.error }]}>Verwerfen</Text>
                </Pressable>
              )}
            </View>
          ))}

          <Pressable
            onPress={addRow}
            style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Ticketart hinzufügen</Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={saveBlocked}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: saveBlocked ? 0.5 : pressed ? 0.85 : 1 },
            ]}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Speichern</Text>}
          </Pressable>

          <Text style={[styles.footerNote, { color: colors.textTertiary }]}>
            Käufer sehen: Preis inkl. MwSt., Veranstalter = deine Organisation, kein Widerrufsrecht bei
            termingebundenen Veranstaltungen.
          </Text>

          <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Bestellungen</Text>
          {ordersLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : orders.length === 0 ? (
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>Noch keine Bestellungen.</Text>
          ) : (
            orders.map((order) => (
              <View key={order.id} style={[styles.orderRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.orderLine, { color: colors.textPrimary }]}>
                  #{order.id.slice(0, 8).toUpperCase()} · {order.quantity} × {order.ticket_type_name} ·{' '}
                  {formatCents(order.amount_cents)} · {orderStatusLabel(order.status)}
                </Text>
                {order.tickets_total > 0 && (
                  <Text style={[styles.orderMeta, { color: colors.textTertiary }]}>
                    {order.tickets_checked_in} von {order.tickets_total} eingelöst
                  </Text>
                )}
                {order.status === 'paid' && (
                  <Pressable
                    onPress={() => confirmRefund(order)}
                    disabled={refundingId === order.id}
                    style={styles.refundButton}
                    accessibilityRole="button"
                  >
                    {refundingId === order.id ? (
                      <ActivityIndicator color={colors.error} />
                    ) : (
                      <Text style={[styles.refundText, { color: colors.error }]}>Erstatten</Text>
                    )}
                  </Pressable>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'MonaSansSemiCondensed-SemiBold', marginHorizontal: 8 },
  headerSpacer: { width: 32 },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 16, paddingBottom: 40 },
  section: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionBody: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  sectionHeading: { fontSize: 16, fontFamily: 'MonaSansSemiCondensed-Bold', marginTop: 8 },
  orderRow: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  orderLine: { fontSize: 13, fontFamily: 'Inter-Medium', lineHeight: 18 },
  orderMeta: { fontSize: 11, fontFamily: 'Inter-Regular' },
  refundButton: { alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center' },
  refundText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },
  label: { fontSize: 12, fontFamily: 'Inter-Medium', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldHint: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 4 },
  errorHint: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 4 },
  removeRow: { alignItems: 'flex-end' },
  removeText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  warningCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  warningText: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  warningLink: { alignSelf: 'flex-start' },
  warningLinkText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  footerNote: { fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 16, textAlign: 'center' },
});
