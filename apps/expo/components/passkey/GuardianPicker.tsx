/**
 * "Person hinzufügen": scan a family member's "Mein Konto-Code", or pick a person by name.
 * The picked profile wallet is replaced by that person's passkey Safe when they have exactly
 * one (resolveGuardianAddress). Returns the guardian address + a display name; never shows 0x.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAddress, type Address } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { profileName } from '@/lib/passkey/people';
import { resolveGuardianAddress } from '@/lib/passkey/recovery-lookup';
import { lookupChain, searchPeopleByName, type PersonSearchHit } from '@/lib/passkey/guardians-runtime';
import KontoCodeScanner from './KontoCodeScanner';
import { BigButton, Initials, Notice, ScreenHeader } from './PasskeyUi';

export type PickedGuardian = { address: Address; name: string };

type Tab = 'scan' | 'search';

export default function GuardianPicker({
  visible,
  onClose,
  onPick,
  exclude,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (g: PickedGuardian) => void;
  /** Addresses that cannot be picked (my own Safe / legacy, current guardians). */
  exclude: Address[];
}) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('scan');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PersonSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (!visible) {
      setTab('scan');
      setQuery('');
      setHits([]);
      setNotice(null);
      setResolving(null);
    }
  }, [visible]);

  useEffect(() => {
    if (tab !== 'search') return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(() => {
      searchPeopleByName(q)
        .then((rows) => {
          if (seq === searchSeq.current) setHits(rows);
        })
        .catch(() => {
          if (seq === searchSeq.current) setNotice('Die Suche hat nicht geklappt. Bitte versuche es erneut.');
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, tab]);

  const excluded = (a: Address) => exclude.some((e) => e.toLowerCase() === a.toLowerCase());

  const pickScanned = (address: Address, name: string | null) => {
    if (excluded(address)) {
      setNotice('Diese Person ist schon dabei.');
      return;
    }
    onPick({ address, name: name ?? 'Familienmitglied' });
  };

  const pickHit = async (hit: PersonSearchHit) => {
    const name = profileName(hit) ?? 'Unbekannte Person';
    let wallet: Address;
    try {
      wallet = getAddress(hit.wallet_address);
    } catch {
      return;
    }
    setResolving(hit.wallet_address);
    setNotice(null);
    try {
      const address = await resolveGuardianAddress(wallet, lookupChain);
      if (excluded(address) || excluded(wallet)) {
        setNotice('Diese Person ist schon dabei.');
        return;
      }
      onPick({ address, name });
    } catch {
      setNotice('Keine Verbindung. Bitte versuche es erneut.');
    } finally {
      setResolving(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <ScreenHeader title="Person hinzufügen" onBack={onClose} />
        <View style={[styles.tabs, { backgroundColor: colors.surfaceSecondary }]}>
          {(['scan', 'search'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && { backgroundColor: colors.background }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
            >
              <Text style={[styles.tabText, { color: tab === t ? colors.textPrimary : colors.textSecondary }]}>
                {t === 'scan' ? 'Code scannen' : 'Name suchen'}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {notice ? <Notice tone="warning" text={notice} /> : null}
          {tab === 'scan' ? (
            <>
              <Text style={[styles.help, { color: colors.textSecondary }]}>
                Die Person öffnet in ihrer App „Mein Konto-Code“. Scanne den Code auf ihrem Handy.
              </Text>
              {visible ? <KontoCodeScanner onFound={(l) => pickScanned(l.safe, l.name)} /> : null}
            </>
          ) : (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Name eingeben"
                placeholderTextColor={colors.textTertiary}
                autoFocus
                autoCorrect={false}
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
              {searching ? <ActivityIndicator color={colors.primary} /> : null}
              {hits.map((hit) => {
                const name = profileName(hit) ?? 'Unbekannte Person';
                const busy = resolving === hit.wallet_address;
                return (
                  <Pressable
                    key={hit.wallet_address}
                    onPress={() => pickHit(hit)}
                    disabled={!!resolving}
                    style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${name} auswählen`}
                  >
                    <Initials name={name} />
                    <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {name}
                    </Text>
                    {busy ? <ActivityIndicator color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
              {!searching && query.trim().length >= 2 && hits.length === 0 ? (
                <Text style={[styles.help, { color: colors.textSecondary }]}>Niemanden gefunden.</Text>
              ) : null}
            </>
          )}
          <BigButton label="Schließen" kind="secondary" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 14, padding: 4 },
  tab: { flex: 1, minHeight: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  help: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 23 },
  input: { minHeight: 56, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontFamily: fontFamily.regular, fontSize: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderRadius: 14, paddingHorizontal: 14 },
  rowName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 17 },
});
