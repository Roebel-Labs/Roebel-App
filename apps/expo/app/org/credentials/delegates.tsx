/**
 * Door-scanner accounts ("Türscanner"): an account that may issue and revoke one type, nothing
 * else. Pick a type and a person; lists the current ones by display name with "Entziehen". Every
 * change goes through the approve screen. Accounts are never rendered.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Hex } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus } from '@/components/credentials/CredentialScreenFrame';
import { OrgChainNotice, useCredOrg } from '@/components/credentials/OrgCredentialParts';
import { fetchTypes, prepareDelegate, searchPeople } from '@/lib/credreg/api';
import { nameAccounts, readDelegates, type Delegate } from '@/lib/credreg/delegates';
import { rememberExpectedDelegate, submittedMessage } from '@/lib/credreg/org';
import type { PersonSearchHit, TypeView } from '@/lib/credreg/types';

const SEARCH_DELAY_MS = 350;

export default function DelegatesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, account } = useCredOrg();
  const org = state.status === 'ready' ? state.org : null;
  const accountId = org?.accountId ?? null;
  const [types, setTypes] = useState<{ key: string; list: TypeView[] | null } | null>(null);
  const [typeId, setTypeId] = useState<Hex | null>(null);
  const [delegates, setDelegates] = useState<{ key: string; list: Delegate[] | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ query: string; list: PersonSearchHit[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notOnChain, setNotOnChain] = useState(false);
  const typesKey = `${accountId}:${account?.address ?? ''}`;
  const delegatesKey = `${typeId}:${reloadKey}`;

  // Back from the approve screen: load again (the first focus is the first load).
  const seenFocus = useRef(false);
  useFocusEffect(
    React.useCallback(() => {
      if (seenFocus.current) setReloadKey((k) => k + 1);
      seenFocus.current = true;
    }, []),
  );

  useEffect(() => {
    if (!account || !accountId || org?.onChain !== 'ready') return;
    let cancelled = false;
    fetchTypes(account, accountId).then((res) => {
      if (!cancelled) setTypes({ key: typesKey, list: res.ok ? res.data.filter((t) => t.chainStatus === 'onchain' && !t.retired) : null });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesKey, org?.onChain]);

  useEffect(() => {
    if (!typeId) return;
    let cancelled = false;
    readDelegates(typeId)
      .then((addresses) => nameAccounts(addresses))
      .then(
        (list) => {
          if (!cancelled) setDelegates({ key: delegatesKey, list });
        },
        () => {
          if (!cancelled) setDelegates({ key: delegatesKey, list: null });
        },
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delegatesKey]);

  const q = query.trim();
  useEffect(() => {
    if (!account || !accountId || q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPeople(account, accountId, q).then((res) => {
        if (!cancelled) setHits({ query: q, list: res.ok ? res.data : [] });
      });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, accountId]);

  const title = 'Türscanner-Konten';
  if (state.status === 'loading') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (state.status !== 'ready' || !org) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus
          title="Nicht verfügbar"
          message={state.status === 'closed' ? 'Ausweise gibt es in deiner App bald.' : 'Das können Inhaber:innen und Admins einer Organisation.'}
        />
      </CredentialScreenFrame>
    );
  }
  if (org.onChain !== 'ready' || notOnChain) {
    return (
      <CredentialScreenFrame title={title}>
        <OrgChainNotice reason={org.onChain === 'no_chain_authority' ? 'no_chain_authority' : 'org_not_registered'} />
      </CredentialScreenFrame>
    );
  }
  const list = types && types.key === typesKey ? types.list : undefined;
  if (list === undefined) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (list === null || list.length === 0) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus
          title={list === null ? 'Das hat nicht geklappt' : 'Noch keine Ausweis-Typen'}
          message={list === null ? 'Die Ausweis-Typen konnten nicht geladen werden.' : 'Lege zuerst einen Ausweis-Typ im Dashboard am Computer an.'}
        />
      </CredentialScreenFrame>
    );
  }

  const change = async (delegate: string, allowed: boolean, label?: string) => {
    if (!account || !typeId || busy) return;
    setBusy(delegate);
    setError(null);
    try {
      const res = await prepareDelegate(account, { accountId: org.accountId, typeId, delegate, allowed, ...(label ? { label: label.slice(0, 80) } : {}) });
      if (res.ok) {
        // In memory only: the approve screen refuses a step that names another account.
        rememberExpectedDelegate(res.data.actionId, delegate);
        setQuery('');
        router.push({ pathname: '/org/credentials/approve/[id]', params: { id: res.data.actionId, org: org.accountId } } as any);
        return;
      }
      if (res.code === 'ORG_NOT_ON_CHAIN') setNotOnChain(true);
      else setError(submittedMessage(res));
    } finally {
      setBusy(null);
    }
  };

  const current = typeId && delegates && delegates.key === delegatesKey ? delegates.list : undefined;
  const shownHits = q.length >= 2 && hits && hits.query === q ? hits.list : [];

  return (
    <CredentialScreenFrame title={title}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.explain, { color: colors.textSecondary }]}>
          Ein Türscanner-Konto darf für diesen Ausweis-Typ ausstellen und widerrufen, sonst nichts.
        </Text>

        <Text style={[styles.label, { color: colors.textPrimary }]}>Ausweis</Text>
        <View style={styles.chips}>
          {list.map((t) => {
            const on = t.typeId === typeId;
            return (
              <Pressable
                key={t.typeId}
                onPress={() => setTypeId(t.typeId)}
                style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primaryLight : colors.surface }]}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t.name}
              >
                <Text style={[styles.chipText, { color: on ? colors.primary : colors.textPrimary }]}>{t.name}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={[styles.meta, { color: colors.error }]}>{error}</Text> : null}

        {typeId ? (
          <>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Berechtigt</Text>
            {current === undefined ? (
              <ActivityIndicator color={colors.primary} />
            ) : current === null ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Die Liste ist gerade nicht verfügbar.</Text>
            ) : current.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Noch kein Türscanner-Konto.</Text>
            ) : (
              current.map((d) => (
                <View key={d.address} style={[styles.row, { borderBottomColor: colors.borderSecondary }]}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{d.displayName}</Text>
                  {busy === d.address ? (
                    <ActivityIndicator color={colors.error} />
                  ) : (
                    <Pressable
                      onPress={() => change(d.address, false)}
                      disabled={busy !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`Berechtigung von ${d.displayName} entziehen`}
                    >
                      <Text style={[styles.link, { color: colors.error }]}>Entziehen</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}

            <Text style={[styles.label, { color: colors.textPrimary }]}>Konto hinzufügen</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Name suchen"
              placeholderTextColor={colors.textTertiary}
              autoCorrect={false}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              accessibilityLabel="Name suchen"
            />
            {shownHits.map((h, i) => (
              <View key={`${h.displayName}-${i}`} style={[styles.row, { borderBottomColor: colors.borderSecondary }]}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{h.displayName}</Text>
                {busy === h.wallet ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Pressable
                    onPress={() => change(h.wallet, true, h.displayName)}
                    disabled={busy !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`${h.displayName} berechtigen`}
                  >
                    <Text style={[styles.link, { color: colors.primary }]}>Berechtigen</Text>
                  </Pressable>
                )}
              </View>
            ))}
            {q.length >= 2 && hits && hits.query === q && shownHits.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Niemand gefunden.</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  explain: { fontSize: 15, fontFamily: fontFamily.regular, lineHeight: 21 },
  label: { fontSize: 15, fontFamily: fontFamily.semiBold, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 14, fontFamily: fontFamily.medium },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { flex: 1, fontSize: 15, fontFamily: fontFamily.regular },
  link: { fontSize: 15, fontFamily: fontFamily.semiBold },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: fontFamily.regular },
  meta: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 18 },
});
