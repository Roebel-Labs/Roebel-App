/**
 * Issue one Ausweis to one person: pick a type, find the person by name, optional "Gültig bis",
 * one button. Prepares a batch with one recipient and opens the approve screen. The search hit's
 * account is only sent back to the server, never rendered.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Hex } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus, frameStyles } from '@/components/credentials/CredentialScreenFrame';
import { OrgChainNotice, useCredOrg } from '@/components/credentials/OrgCredentialParts';
import { fetchTypes, prepareBatch, searchPeople } from '@/lib/credreg/api';
import { germanDateToIso, submittedMessage } from '@/lib/credreg/org';
import type { PersonSearchHit, TypeView } from '@/lib/credreg/types';

const SEARCH_DELAY_MS = 350;

export default function IssueCredentialScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, account } = useCredOrg();
  const org = state.status === 'ready' ? state.org : null;
  const accountId = org?.accountId ?? null;
  const [types, setTypes] = useState<{ key: string; list: TypeView[] | null } | null>(null);
  const [typeId, setTypeId] = useState<Hex | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ query: string; list: PersonSearchHit[] } | null>(null);
  const [person, setPerson] = useState<PersonSearchHit | null>(null);
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  // Synchronous guard: a double tap must never start two requests (state updates are async).
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notOnChain, setNotOnChain] = useState(false);
  const typesKey = `${accountId}:${account?.address ?? ''}`;

  useEffect(() => {
    if (!account || !accountId || org?.onChain !== 'ready') return;
    let cancelled = false;
    fetchTypes(account, accountId).then((res) => {
      if (cancelled) return;
      const list = res.ok ? res.data.filter((t) => t.chainStatus === 'onchain' && !t.retired && t.kind !== null) : null;
      setTypes({ key: typesKey, list });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesKey, org?.onChain]);

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

  const title = 'Ausweis ausstellen';
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
          message={
            state.status === 'closed'
              ? 'Ausweise gibt es in deiner App bald.'
              : state.status === 'signed_out'
                ? 'Bitte melde dich an.'
                : 'Ausweise ausstellen können Inhaber:innen und Admins einer Organisation.'
          }
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
  if (list === null) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Das hat nicht geklappt" message="Die Ausweis-Typen konnten nicht geladen werden." />
      </CredentialScreenFrame>
    );
  }
  if (list.length === 0) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Noch keine Ausweis-Typen" message="Lege zuerst einen Ausweis-Typ im Dashboard am Computer an." />
      </CredentialScreenFrame>
    );
  }

  const shownHits = q.length >= 2 && hits && hits.query === q ? hits.list : [];
  const untilIso = germanDateToIso(until);
  const canSubmit = !!typeId && !!person && untilIso !== null && !busy;

  const submit = async () => {
    if (inFlight.current || !account || !typeId || !person || untilIso === null || busy) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await prepareBatch(account, {
        accountId: org.accountId,
        typeId,
        recipients: [{ kind: 'account', wallet: person.wallet, displayName: person.displayName }],
        ...(untilIso ? { validUntil: untilIso } : {}),
        source: 'people',
      });
      if (res.ok) {
        router.replace({ pathname: '/org/credentials/approve/[id]', params: { id: res.data.actionId, org: org.accountId } } as any);
        return;
      }
      if (res.code === 'ORG_NOT_ON_CHAIN') setNotOnChain(true);
      else setError(submittedMessage(res));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <CredentialScreenFrame title={title}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        <Text style={[styles.label, { color: colors.textPrimary }]}>Person</Text>
        {person ? (
          <View style={[styles.selected, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}>
            {person.avatarUrl ? <Image source={{ uri: person.avatarUrl }} style={styles.avatar} /> : null}
            <Text style={[styles.personName, { color: colors.textPrimary }]}>{person.displayName}</Text>
            <Pressable onPress={() => setPerson(null)} accessibilityRole="button" accessibilityLabel="Andere Person wählen">
              <Text style={[styles.link, { color: colors.primary }]}>Ändern</Text>
            </Pressable>
          </View>
        ) : (
          <>
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
              <Pressable
                key={`${h.displayName}-${i}`}
                onPress={() => setPerson(h)}
                style={[styles.hit, { borderBottomColor: colors.borderSecondary }]}
                accessibilityRole="button"
                accessibilityLabel={h.displayName}
              >
                {h.avatarUrl ? <Image source={{ uri: h.avatarUrl }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: colors.skeleton }]} />}
                <Text style={[styles.personName, { color: colors.textPrimary }]}>{h.displayName}</Text>
              </Pressable>
            ))}
            {q.length >= 2 && hits && hits.query === q && shownHits.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Niemand gefunden.</Text>
            ) : null}
          </>
        )}

        <Text style={[styles.label, { color: colors.textPrimary }]}>Gültig bis (optional)</Text>
        <TextInput
          value={until}
          onChangeText={setUntil}
          placeholder="TT.MM.JJJJ"
          placeholderTextColor={colors.textTertiary}
          keyboardType="numbers-and-punctuation"
          style={[styles.input, { borderColor: untilIso === null ? colors.error : colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
          accessibilityLabel="Gültig bis"
        />
        {untilIso === null ? <Text style={[styles.meta, { color: colors.error }]}>Bitte als TT.MM.JJJJ eingeben.</Text> : null}
        {untilIso === '' ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Leer: Gültigkeit wie beim Ausweis-Typ festgelegt.</Text> : null}

        {error ? <Text style={[styles.meta, { color: colors.error }]}>{error}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={[frameStyles.primary, { backgroundColor: colors.primary }, !canSubmit && frameStyles.busy]}
          accessibilityRole="button"
          accessibilityLabel="Ausweis ausstellen"
          accessibilityState={{ disabled: !canSubmit, busy }}
        >
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[frameStyles.primaryText, { color: colors.onPrimary }]}>Ausweis ausstellen</Text>}
        </Pressable>
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  label: { fontSize: 15, fontFamily: fontFamily.semiBold, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 14, fontFamily: fontFamily.medium },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: fontFamily.regular },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  personName: { flex: 1, fontSize: 15, fontFamily: fontFamily.regular },
  link: { fontSize: 15, fontFamily: fontFamily.semiBold },
  meta: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 18 },
});
