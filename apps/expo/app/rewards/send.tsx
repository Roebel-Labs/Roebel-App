import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import { useSnackbar } from '@/context/SnackbarContext';
import { getRoebelRecipients, type Recipient } from '@/lib/circles-profile';
import { parseTalerAmount } from '@/lib/roebel-taler';
import Skeleton from '@/components/ui/Skeleton';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

function Avatar({ r, colors }: { r: Recipient; colors: any }) {
  if (r.imageUrl) {
    return <Image source={{ uri: r.imageUrl }} style={styles.avatar} />;
  }
  const letter = (r.name || 'B').trim().charAt(0).toUpperCase();
  return (
    <View style={[styles.avatar, { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 18 }}>{letter}</Text>
    </View>
  );
}

export default function SendRoebelScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const { talerBalance, send, sending, account } = useRoebelTaler();

  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Recipient | null>(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    let cancelled = false;
    getRoebelRecipients(account?.address)
      .then((r) => { if (!cancelled) setRecipients(r); })
      .catch(() => { if (!cancelled) setRecipients([]); });
    return () => { cancelled = true; };
  }, [account?.address]);

  const filtered = (recipients ?? []).filter(
    (r) => !query || (r.name ?? '').toLowerCase().includes(query.toLowerCase())
  );

  // Allow sending to any pasted wallet address (e.g. the reward funder), not just the
  // citizen list. Röbel Münzen (a group token) can be received by any address.
  const trimmed = query.trim();
  const isAddr = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  const manualRecipient: Recipient | null =
    isAddr && !(recipients ?? []).some((r) => r.address.toLowerCase() === trimmed.toLowerCase())
      ? { address: trimmed, name: `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`, imageUrl: null, registered: false, isMetri: false }
      : null;

  const onSend = useCallback(async () => {
    if (!selected) return;
    const amt = parseTalerAmount(amount);
    if (amt <= 0n) {
      showSnackbar({ message: 'Bitte einen Betrag eingeben' });
      return;
    }
    if (Number(amount.replace(',', '.')) > talerBalance) {
      showSnackbar({ message: 'Nicht genug Röbel Münzen' });
      return;
    }
    try {
      await send(selected.address, amt);
      showSnackbar({ message: `${amount} Röbel Münzen gesendet` });
      router.back();
    } catch (e: any) {
      Alert.alert('Senden fehlgeschlagen', e?.message ?? String(e));
    }
  }, [selected, amount, talerBalance, send, router, showSnackbar]);

  const themed = makeStyles(colors);

  return (
    <SafeAreaView style={themed.safe} edges={['top']}>
      <View style={themed.header}>
        <Pressable
          onPress={() => (selected ? setSelected(null) : router.back())}
          style={({ pressed }) => [themed.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={22} height={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={themed.title}>{selected ? 'Betrag' : 'Empfänger wählen'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={themed.balance}>
        Verfügbar: {Math.round(talerBalance).toLocaleString('de-DE')} Röbel Münzen
      </Text>

      {!selected ? (
        <>
          <View style={themed.searchWrap}>
            <TextInput
              placeholder="Suchen"
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={setQuery}
              style={themed.search}
            />
          </View>

          {recipients === null ? (
            <View style={themed.list}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={themed.recRow}>
                  <Skeleton width={44} height={44} radius={22} />
                  <View style={{ gap: 6 }}>
                    <Skeleton width={150} height={14} />
                    <Skeleton width={100} height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : filtered.length === 0 && !manualRecipient ? (
            <Text style={themed.empty}>
              Keine Empfänger gefunden.{'\n'}Tipp: Eine Wallet-Adresse (0x…) einfügen, um an eine beliebige Adresse zu senden.
            </Text>
          ) : (
            <View style={themed.list}>
              {manualRecipient && (
                <Pressable
                  key="manual"
                  onPress={() => setSelected(manualRecipient)}
                  style={({ pressed }) => [themed.recRow, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Avatar r={manualRecipient} colors={colors} />
                  <View style={{ flex: 1 }}>
                    <Text style={themed.recName}>An diese Adresse senden</Text>
                    <Text style={themed.recSub}>{manualRecipient.address.slice(0, 10)}…{manualRecipient.address.slice(-6)}</Text>
                  </View>
                </Pressable>
              )}
              {filtered.map((r) => (
                <Pressable
                  key={r.address}
                  onPress={() => setSelected(r)}
                  style={({ pressed }) => [themed.recRow, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Avatar r={r} colors={colors} />
                  <View style={{ flex: 1 }}>
                    <Text style={themed.recName}>
                      {r.name || 'Bürger'}
                      {r.isMetri ? '  ·  Mein Wallet' : ''}
                    </Text>
                    <Text style={themed.recSub}>Röbel Münzen senden</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={themed.amountWrap}>
          <View style={themed.selectedRow}>
            <Avatar r={selected} colors={colors} />
            <Text style={themed.recName}>{selected.name || 'Bürger'}</Text>
          </View>

          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            style={themed.amountInput}
            autoFocus
          />
          <Text style={themed.amountUnit}>Röbel Münzen</Text>

          <Pressable
            onPress={onSend}
            disabled={sending}
            style={({ pressed }) => [themed.sendBtn, { backgroundColor: colors.primary, opacity: sending || pressed ? 0.7 : 1 }]}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={themed.sendBtnText}>Senden</Text>}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 22 },
});

function makeStyles(colors: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
    backBtn: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: 'Inter-SemiBold', fontSize: 17, color: colors.textPrimary },
    balance: { fontFamily: 'Inter-Medium', fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 12 },
    searchWrap: { paddingHorizontal: 16, marginBottom: 8 },
    search: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, height: 46, fontFamily: 'Inter-Regular', fontSize: 15, color: colors.textPrimary },
    list: { paddingHorizontal: 12, gap: 2 },
    recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14 },
    recName: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.textPrimary },
    recSub: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    empty: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 40 },
    amountWrap: { paddingHorizontal: 24, alignItems: 'center', marginTop: 12 },
    selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
    amountInput: { fontFamily: 'Inter-Bold', fontSize: 52, color: colors.textPrimary, textAlign: 'center', minWidth: 120 },
    amountUnit: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: colors.primary, marginTop: 4 },
    sendBtn: { marginTop: 40, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
    sendBtnText: { color: '#fff', fontFamily: 'MonaSansSemiCondensed-Bold', fontSize: 16 },
  });
}
