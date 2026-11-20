/**
 * "Mitglieder & Ausweise" of the active org (spec 5.6b, management side): per type the people
 * with filter chips and search, "Widerrufen" per row, and the header actions "Ausweis
 * ausstellen", "Für neues Jahr erneuern" and "Neuer Ausweis-Typ". Every change is prepared on
 * the server and confirmed on the approve screen. At most 100 rows on the phone.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus } from '@/components/credentials/CredentialScreenFrame';
import { OrgChainNotice, useCredOrg } from '@/components/credentials/OrgCredentialParts';
import { fetchPeople, fetchTypes, prepareRenewal, prepareRevocation } from '@/lib/credreg/api';
import { submittedMessage } from '@/lib/credreg/org';
import {
  defaultRenewDate,
  MEMBER_FILTERS,
  memberRows,
  memberStateLabel,
  parseGermanDate,
  phoneList,
  type MemberFilter,
} from '@/lib/credreg/members-view';
import { KIND_LABEL } from '@/lib/credreg/templates';
import type { PersonRow, TypeView } from '@/lib/credreg/types';

type Loaded = { key: string; types: TypeView[]; people: PersonRow[] | null; failed: boolean };

export default function OrgMembersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, account, reload } = useCredOrg();
  const org = state.status === 'ready' ? state.org : null;
  const accountId = org?.accountId ?? null;
  const ready = org?.onChain === 'ready';
  // `?type=<typeId>` from the area's start opens that type first.
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const [typeId, setTypeId] = useState<string | null>(typeof typeParam === 'string' ? typeParam : null);
  const [filter, setFilter] = useState<MemberFilter>('alle');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewDate, setRenewDate] = useState(() => defaultRenewDate(new Date()));
  const key = `${accountId}:${account?.address ?? ''}:${typeId ?? ''}:${reloadKey}`;

  const seenFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (seenFocus.current) setReloadKey((k) => k + 1);
      seenFocus.current = true;
    }, []),
  );

  useEffect(() => {
    if (!account || !accountId || !ready) return;
    let cancelled = false;
    (async () => {
      const types = await fetchTypes(account, accountId);
      if (cancelled) return;
      if (!types.ok) {
        setData({ key, types: [], people: null, failed: true });
        return;
      }
      const usable = types.data.filter((t) => t.chainStatus === 'onchain' && !t.retired);
      const current = usable.find((t) => t.typeId === typeId) ?? usable[0] ?? null;
      if (current && current.typeId !== typeId) setTypeId(current.typeId);
      const people = current ? await fetchPeople(account, accountId, current.typeId) : null;
      if (cancelled) return;
      setData({ key, types: usable, people: people && people.ok ? people.data : current ? null : [], failed: false });
    })();
    return () => {
      cancelled = true;
    };
    // the account object changes identity on re-render; the key carries what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const toApprove = (actionId: string) =>
    router.push({ pathname: '/org/credentials/approve/[id]', params: { id: actionId, org: accountId ?? '' } } as never);

  const run = async (tag: string, fn: () => Promise<{ ok: true; data: { actionId: string } } | { ok: false; code: string; message: string }>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(tag);
    setError(null);
    try {
      const res = await fn();
      if (res.ok) toApprove(res.data.actionId);
      else setError(submittedMessage(res));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const revoke = (type: TypeView, row: PersonRow) => {
    if (!account || !accountId) return;
    Alert.alert('Ausweis widerrufen?', `${row.displayName} verliert „${type.name}“ sofort. Das lässt sich nicht rückgängig machen.`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Widerrufen',
        style: 'destructive',
        onPress: () => void run(row.id, () => prepareRevocation(account, { accountId, invitationIds: [row.id] })),
      },
    ]);
  };

  const renew = (type: TypeView) => {
    if (!account || !accountId) return;
    const iso = parseGermanDate(renewDate);
    if (!iso) {
      setError('Bitte ein Datum wie 31.12.2027 eingeben.');
      return;
    }
    void run('renew', () => prepareRenewal(account, { accountId, renewTypeId: type.typeId, validUntil: iso }));
  };

  const title = 'Mitglieder & Ausweise';
  if (state.status === 'loading') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (state.status === 'closed') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Noch nicht verfügbar" message="Ausweise gibt es in deiner App bald." />
      </CredentialScreenFrame>
    );
  }
  if (state.status === 'signed_out') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Bitte melde dich an" message="Melde dich an, um die Ausweise deiner Organisation zu verwalten." />
      </CredentialScreenFrame>
    );
  }
  if (state.status === 'not_admin') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Keine Berechtigung" message="Ausweise verwalten können Inhaber:innen und Admins einer Organisation." />
      </CredentialScreenFrame>
    );
  }
  if (state.status === 'error' || !org) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Das hat nicht geklappt" message="Die Organisation konnte nicht geladen werden." actionLabel="Erneut versuchen" onAction={reload} />
      </CredentialScreenFrame>
    );
  }
  if (org.onChain !== 'ready') {
    return (
      <CredentialScreenFrame title={title}>
        <OrgChainNotice reason={org.onChain === 'no_chain_authority' ? 'no_chain_authority' : 'org_not_registered'} />
      </CredentialScreenFrame>
    );
  }

  const current = data && data.key === key ? data : null;
  if (!current) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (current.failed) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus
          title="Das hat nicht geklappt"
          message="Die Ausweise konnten nicht geladen werden."
          actionLabel="Erneut versuchen"
          onAction={() => setReloadKey((k) => k + 1)}
        />
      </CredentialScreenFrame>
    );
  }

  const type = current.types.find((t) => t.typeId === typeId) ?? null;
  const list = current.people ? phoneList(memberRows(current.people, filter, query)) : null;

  return (
    <CredentialScreenFrame title={title}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.orgName, { color: colors.textPrimary }]}>{org.name}</Text>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push('/org/credentials/issue' as never)}
            style={[styles.primary, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Ausweis ausstellen</Text>
          </Pressable>
          <View style={styles.linkRow}>
            {type && type.kind !== 'badge' ? (
              <Pressable onPress={() => setRenewOpen((o) => !o)} accessibilityRole="button" hitSlop={6}>
                <Text style={[styles.link, { color: colors.primary }]}>Für neues Jahr erneuern</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.push('/org/credentials/types-new' as never)} accessibilityRole="button" hitSlop={6}>
              <Text style={[styles.link, { color: colors.primary }]}>Neuer Ausweis-Typ</Text>
            </Pressable>
          </View>
        </View>

        {renewOpen && type ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
            <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{`„${type.name}“ für alle erneuern, die ihn angenommen haben`}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Gültig bis</Text>
            <TextInput
              value={renewDate}
              onChangeText={setRenewDate}
              placeholder="31.12.2027"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numbers-and-punctuation"
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary, backgroundColor: colors.background }]}
              accessibilityLabel="Gültig bis"
            />
            <Pressable
              onPress={() => renew(type)}
              disabled={busy !== null}
              style={[styles.primary, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
            >
              {busy === 'renew' ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Erneuern</Text>}
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

        {current.types.length === 0 ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>Noch keine Ausweis-Typen im Register. Lege mit „Neuer Ausweis-Typ“ den ersten an.</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {current.types.map((t) => {
                const on = t.typeId === typeId;
                return (
                  <Pressable
                    key={t.typeId}
                    onPress={() => setTypeId(t.typeId)}
                    style={[styles.chip, { borderColor: on ? colors.primary : colors.borderSecondary, backgroundColor: on ? colors.primary : 'transparent' }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, { color: on ? colors.onPrimary : colors.textPrimary }]}>{`${t.name} · ${KIND_LABEL[t.kind]}`}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {MEMBER_FILTERS.map((f) => {
                const on = f.key === filter;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={[styles.chip, { borderColor: on ? colors.primary : colors.borderSecondary }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, { color: on ? colors.primary : colors.textSecondary }]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Namen suchen"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary, backgroundColor: colors.surface }]}
              accessibilityLabel="Namen suchen"
            />

            {!list ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Personen konnten nicht geladen werden.</Text>
            ) : list.rows.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Niemand gefunden.</Text>
            ) : (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
                {list.rows.map((p, i) => (
                  <View key={p.id} style={[styles.person, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSecondary }]}>
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{p.displayName}</Text>
                      <Text style={[styles.meta, { color: colors.textSecondary }]}>{memberStateLabel(p)}</Text>
                    </View>
                    {type && (p.state === 'angenommen' || p.state === 'eingeladen') ? (
                      busy === p.id ? (
                        <ActivityIndicator color={colors.error} />
                      ) : (
                        <Pressable
                          onPress={() => revoke(type, p)}
                          disabled={busy !== null}
                          accessibilityRole="button"
                          accessibilityLabel={`${type.name} für ${p.displayName} widerrufen`}
                        >
                          <Text style={[styles.link, { color: colors.error }]}>Widerrufen</Text>
                        </Pressable>
                      )
                    ) : null}
                  </View>
                ))}
              </View>
            )}
            {list?.more ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{list.more}</Text> : null}
          </>
        )}

        <Pressable onPress={() => router.push('/org/credentials' as never)} style={styles.textLink} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.primary }]}>Einstellungen und Türscanner-Konten</Text>
        </Pressable>
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  orgName: { fontSize: 20, fontFamily: fontFamily.semiBold },
  actions: { gap: 10 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  primary: { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  primaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  link: { fontSize: 15, fontFamily: fontFamily.semiBold },
  textLink: { alignItems: 'center', paddingVertical: 4 },
  card: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, gap: 8 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 14, fontFamily: fontFamily.medium },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: fontFamily.regular },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontFamily: fontFamily.medium },
  meta: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.regular },
  error: { fontSize: 14, fontFamily: fontFamily.regular },
});
