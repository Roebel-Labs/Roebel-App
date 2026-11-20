/**
 * "Deine Ausweise": open invitations on top (each opens the accept screen), then what the person
 * holds, public or private. Closed gate → a short note, no credential request.
 */
import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus, formatValidity } from '@/components/credentials/CredentialScreenFrame';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { useHeld, type HeldCredential } from '@/lib/credreg/held';
import type { InvitationView } from '@/lib/credreg/types';

const KIND_LABEL: Record<string, string> = { role: 'Amt', membership: 'Mitgliedschaft', badge: 'Abzeichen' };

function heldValidity(h: HeldCredential): string {
  if (h.validUntil === null) return 'Unbefristet';
  if (h.validUntil < Date.now() / 1000) return 'Abgelaufen';
  return formatValidity(new Date(h.validUntil * 1000).toISOString());
}

/** Mounted only with an open gate and a signed-in account: useHeld touches the credential routes. */
function CredentialsList() {
  const router = useRouter();
  const { colors } = useTheme();
  const { held, pending, refresh, loading } = useHeld();

  const openInvite = (inv: InvitationView) => router.push(`/credentials/accept/${inv.id}` as any);
  const openHeld = (h: HeldCredential) => router.push({ pathname: '/profile', params: { credential: h.typeId } } as any);

  if (loading && held.length === 0 && pending.length === 0) return <CredentialStatus loading />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    >
      {pending.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Wartet auf dich</Text>
          {pending.map((inv) => (
            <Pressable
              key={inv.id}
              onPress={() => openInvite(inv)}
              style={[styles.row, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={`${inv.type.name} annehmen`}
            >
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{inv.type.name}</Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {[inv.org?.name, KIND_LABEL[inv.type.kind]].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={[styles.rowAction, { color: colors.primary }]}>Ansehen</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Deine Ausweise</Text>
        {held.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Noch keine Ausweise. Wenn dir eine Organisation einen Ausweis gibt, findest du ihn hier.
          </Text>
        ) : (
          held.map((h) => (
            <Pressable
              key={h.typeId}
              onPress={() => openHeld(h)}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
              accessibilityRole="button"
              accessibilityLabel={`${h.title} anzeigen`}
            >
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{h.title}</Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {[h.orgName, heldValidity(h)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={[styles.rowTag, { color: colors.textSecondary }]}>{h.visibility === 'public' ? 'Öffentlich' : 'Privat'}</Text>
            </Pressable>
          ))
        )}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
    </ScrollView>
  );
}

export default function CredentialsScreen() {
  const account = useActiveAccount();
  const gate = useCredentialsGate();
  return (
    <CredentialScreenFrame title="Deine Ausweise">
      <View style={styles.body}>
      {gate === null ? (
        <CredentialStatus loading />
      ) : gate === false ? (
        <CredentialStatus title="Noch nicht verfügbar" message="Ausweise gibt es in deiner App bald." />
      ) : !account ? (
        <CredentialStatus title="Bitte melde dich an" message="Melde dich an, um deine Ausweise zu sehen." />
      ) : (
        <CredentialsList />
      )}
      </View>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  content: { padding: 16, gap: 24 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontFamily: fontFamily.semiBold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontFamily: fontFamily.semiBold },
  rowMeta: { fontSize: 13, fontFamily: fontFamily.regular },
  rowAction: { fontSize: 14, fontFamily: fontFamily.semiBold },
  rowTag: { fontSize: 13, fontFamily: fontFamily.medium },
  empty: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
});
