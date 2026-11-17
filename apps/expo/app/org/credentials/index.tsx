/**
 * "Ausweise" of the active org: actions waiting for this phone's confirmation, the switch
 * "Mitglieder dürfen öffentlich sichtbar sein", the org's types with counts and, per type, the
 * people with "Widerrufen". Every change is prepared on the server and confirmed on the approve
 * screen. Never shows a wallet address.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus, formatValidity } from '@/components/credentials/CredentialScreenFrame';
import { OrgChainNotice, useCredOrg } from '@/components/credentials/OrgCredentialParts';
import { fetchActions, fetchPeople, fetchTypes, prepareMembersPublic, prepareRevocation } from '@/lib/credreg/api';
import { preparedLabel, submittedMessage } from '@/lib/credreg/org';
import type { ActionView, PersonRow, PersonState, TypeView } from '@/lib/credreg/types';

const STATE_LABEL: Record<PersonState, string> = {
  eingeladen: 'Offen',
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
  widerrufen: 'Widerrufen',
  abgelaufen: 'Abgelaufen',
};

type Data = {
  key: string;
  actions: ActionView[];
  types: TypeView[];
  people: Record<string, PersonRow[] | null>;
  failed: boolean;
};

export default function OrgCredentialsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, account, reload } = useCredOrg();
  const org = state.status === 'ready' ? state.org : null;
  const accountId = org?.accountId ?? null;
  const ready = org?.onChain === 'ready';
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notOnChain, setNotOnChain] = useState(false);
  const key = `${accountId}:${account?.address ?? ''}:${reloadKey}`;

  // Back from the approve screen: load again (the first focus is the first load).
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
      const [actions, types] = await Promise.all([fetchActions(account, accountId), fetchTypes(account, accountId)]);
      if (cancelled) return;
      if (!actions.ok || !types.ok) {
        setData({ key, actions: [], types: [], people: {}, failed: true });
        return;
      }
      const onchain = types.data.filter((t) => t.chainStatus === 'onchain');
      const rows = await Promise.all(onchain.map((t) => fetchPeople(account, accountId, t.typeId)));
      if (cancelled) return;
      const people: Record<string, PersonRow[] | null> = {};
      onchain.forEach((t, i) => {
        const r = rows[i];
        people[t.typeId] = r.ok ? r.data : null;
      });
      setData({ key, actions: actions.data, types: types.data, people, failed: false });
    })();
    return () => {
      cancelled = true;
    };
    // the account object changes identity on re-render; the key carries what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const toApprove = (actionId: string) =>
    router.push({ pathname: '/org/credentials/approve/[id]', params: { id: actionId, org: accountId ?? '' } } as any);

  const prepared = (res: { ok: true; data: { actionId: string } } | { ok: false; code: string; message: string }) => {
    if (res.ok) {
      toApprove(res.data.actionId);
      return;
    }
    if (res.code === 'ORG_NOT_ON_CHAIN') setNotOnChain(true);
    else setError(submittedMessage(res));
  };

  const switchMembersPublic = async (membersPublic: boolean) => {
    if (!account || !accountId || busy) return;
    setBusy('switch');
    setError(null);
    try {
      prepared(await prepareMembersPublic(account, { accountId, membersPublic }));
    } finally {
      setBusy(null);
    }
  };

  const revoke = (type: TypeView, row: PersonRow) => {
    if (!account || !accountId || busy) return;
    Alert.alert('Ausweis widerrufen?', `${row.displayName} verliert „${type.name}“ sofort. Das lässt sich nicht rückgängig machen.`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Widerrufen',
        style: 'destructive',
        onPress: async () => {
          setBusy(row.id);
          setError(null);
          try {
            prepared(await prepareRevocation(account, { accountId, invitationIds: [row.id] }));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const title = 'Ausweise';
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
  if (state.status === 'error') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Das hat nicht geklappt" message="Die Organisation konnte nicht geladen werden." actionLabel="Erneut versuchen" onAction={reload} />
      </CredentialScreenFrame>
    );
  }
  if (!org) return null;
  if (org.onChain !== 'ready' || notOnChain) {
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

  const waiting = current.actions.filter((a) => a.status === 'awaiting_confirmation');

  return (
    <CredentialScreenFrame title={title}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.orgName, { color: colors.textPrimary }]}>{org.name}</Text>

        {waiting.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Wartet auf deine Bestätigung</Text>
            {waiting.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => toApprove(a.id)}
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
                accessibilityRole="button"
                accessibilityLabel={`${a.summary.title} prüfen`}
              >
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{a.summary.title}</Text>
                  {preparedLabel(a.via) ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{preparedLabel(a.via)}</Text> : null}
                </View>
                <Text style={[styles.link, { color: colors.primary }]}>Prüfen</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={[styles.switchCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.textPrimary }]}>Mitglieder dürfen öffentlich sichtbar sein</Text>
            {busy === 'switch' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={org.membersMayBePublic}
                onValueChange={switchMembersPublic}
                disabled={busy !== null}
                trackColor={{ true: colors.primary, false: colors.switchTrackOff }}
                accessibilityLabel="Mitglieder dürfen öffentlich sichtbar sein"
              />
            )}
          </View>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Aus: Mitgliedschaften können nur privat gehalten werden. Ämter bleiben immer öffentlich.
          </Text>
        </View>

        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

        <Pressable
          onPress={() => router.push('/org/credentials/issue' as any)}
          style={[styles.primary, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Ausweis ausstellen"
        >
          <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Ausweis ausstellen</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/org/credentials/delegates' as any)} style={styles.textLink} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.primary }]}>Türscanner-Konten</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ausweis-Typen</Text>
          {current.types.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Noch keine Ausweis-Typen. Lege sie im Dashboard am Computer an.
            </Text>
          ) : null}
          {current.types.map((t) => {
            const people = current.people[t.typeId];
            const accepted = people?.filter((p) => p.state === 'angenommen').length ?? 0;
            const pending = people?.filter((p) => p.state === 'eingeladen').length ?? 0;
            const expanded = open === t.typeId;
            return (
              <View key={t.typeId} style={[styles.typeCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
                <Pressable
                  onPress={() => setOpen(expanded ? null : t.typeId)}
                  disabled={t.chainStatus !== 'onchain'}
                  style={styles.typeHead}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={t.name}
                >
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{t.name}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {t.retired
                        ? 'Stillgelegt'
                        : t.chainStatus !== 'onchain'
                          ? 'Noch nicht im Register'
                          : people
                            ? `${accepted} angenommen · ${pending} offen`
                            : 'Personen konnten nicht geladen werden'}
                    </Text>
                  </View>
                  {t.chainStatus === 'onchain' ? (
                    <Text style={[styles.link, { color: colors.primary }]}>{expanded ? 'Schließen' : 'Personen'}</Text>
                  ) : null}
                </Pressable>
                {expanded && people
                  ? people.length === 0
                    ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Noch niemand.</Text>
                    : people.map((p) => (
                        <View key={p.id} style={[styles.person, { borderTopColor: colors.borderSecondary }]}>
                          <View style={styles.rowBody}>
                            <Text style={[styles.personName, { color: colors.textPrimary }]}>{p.displayName}</Text>
                            <Text style={[styles.meta, { color: colors.textSecondary }]}>
                              {STATE_LABEL[p.state]}
                              {p.state === 'angenommen' ? (p.public ? ' · Öffentlich' : ' · Privat') : ''}
                              {p.state === 'angenommen' || p.state === 'eingeladen' ? ` · ${formatValidity(p.validUntil)}` : ''}
                            </Text>
                          </View>
                          {p.state === 'angenommen' || p.state === 'eingeladen' ? (
                            busy === p.id ? (
                              <ActivityIndicator color={colors.error} />
                            ) : (
                              <Pressable
                                onPress={() => revoke(t, p)}
                                disabled={busy !== null}
                                accessibilityRole="button"
                                accessibilityLabel={`${t.name} für ${p.displayName} widerrufen`}
                              >
                                <Text style={[styles.link, { color: colors.error }]}>Widerrufen</Text>
                              </Pressable>
                            )
                          ) : null}
                        </View>
                      ))
                  : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  orgName: { fontSize: 20, fontFamily: fontFamily.semiBold },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontFamily: fontFamily.semiBold },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, gap: 12 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontFamily: fontFamily.medium },
  meta: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 18 },
  link: { fontSize: 15, fontFamily: fontFamily.semiBold },
  switchCard: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { flex: 1, fontSize: 15, fontFamily: fontFamily.medium },
  error: { fontSize: 14, fontFamily: fontFamily.regular },
  primary: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  textLink: { alignItems: 'center', paddingVertical: 4 },
  typeCard: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
  typeHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  personName: { fontSize: 15, fontFamily: fontFamily.regular },
});
