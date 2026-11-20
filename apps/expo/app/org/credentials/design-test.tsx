/**
 * Test preview of a card design draft ("Auf mein Handy senden", push `design_test`): the draft
 * drawn with the real Skia renderer, the viewer's own name in the name field, the sheen following
 * the phone. Only the org's owners/admins can open it; nothing is written to the register.
 * `?draft=<id>`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus } from '@/components/credentials/CredentialScreenFrame';
import DesignedCard from '@/components/credentials/DesignedCard';
import { holderValues, useHolder } from '@/lib/card-design/holder-values';
import { usePublishGate } from '@/lib/card-design/publish-gate';
import { designErrorMessage, fetchDraft, publishDraft, type DraftWithDesign } from '@/lib/credreg/designs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; draft: DraftWithDesign };

export default function DesignTestScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { draft: draftParam } = useLocalSearchParams<{ draft?: string }>();
  const draftId = typeof draftParam === 'string' && UUID.test(draftParam) ? draftParam : null;
  const account = useActiveAccount();
  const { user } = useUser();
  const holder = useHolder(account?.address, user?.display_name || user?.username || null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account || !draftId) return;
    let alive = true;
    setLoad({ status: 'loading' });
    fetchDraft(account, draftId).then((res) => {
      if (!alive) return;
      setLoad(res.ok ? { status: 'ready', draft: res.data } : { status: 'error', message: designErrorMessage(res, 'draft') });
    });
    return () => { alive = false; };
    // the account object changes identity on re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address, draftId]);

  const draft = load.status === 'ready' ? load.draft : null;
  const gate = usePublishGate(draft?.accountId ?? null);
  const values = useMemo(
    () => holderValues({ verifiedName: holder.verifiedName, displayName: holder.displayName, validUntil: null, acceptedAt: null }),
    [holder],
  );

  const publish = useCallback(async () => {
    if (!account || !draft || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const res = await publishDraft(account, draft.id);
    inFlight.current = false;
    setBusy(false);
    if (!res.ok) {
      setError(designErrorMessage(res));
      return;
    }
    router.push(`/org/credentials/approve/${res.data.actionId}` as any);
  }, [account, draft, router]);

  const title = 'Entwurf testen';
  if (!draftId) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Link ungültig" message="Dieser Test-Link ist unvollständig." />
      </CredentialScreenFrame>
    );
  }
  if (!account) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Bitte anmelden" message="Melde dich an, um den Entwurf zu sehen." />
      </CredentialScreenFrame>
    );
  }
  if (load.status === 'loading') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (load.status === 'error') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Nicht verfügbar" message={load.message} />
      </CredentialScreenFrame>
    );
  }

  const d = load.draft;
  const cardWidth = Math.min(screenWidth - 32, 480);
  return (
    <CredentialScreenFrame title={title}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.bannerText, { color: colors.textPrimary }]}>Entwurf · nur für dich</Text>
        </View>
        <DesignedCard
          design={d.design}
          width={cardWidth}
          mode="preview"
          values={values}
          animate="tilt"
          accessibilityLabel={`Entwurf ${d.name}`}
        />
        <Text style={[styles.name, { color: colors.textPrimary }]}>{d.name}</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Neige dein Handy, um den Glanz zu sehen. Mitglieder sehen diesen Entwurf erst, wenn du ihn veröffentlichst.
        </Text>

        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        <Pressable
          onPress={() => router.push(`/org/credentials/designer?draft=${d.id}` as any)}
          style={[styles.secondary, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Im Designer öffnen"
        >
          <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Im Designer öffnen</Text>
        </Pressable>
        <Pressable
          onPress={publish}
          disabled={!gate.allowed || busy}
          style={[styles.primary, { backgroundColor: colors.primary }, (!gate.allowed || busy) && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={d.liveVersion ? 'Update veröffentlichen' : 'Veröffentlichen'}
          accessibilityState={{ disabled: !gate.allowed || busy }}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{d.liveVersion ? 'Update veröffentlichen' : 'Veröffentlichen'}</Text>
          )}
        </Pressable>
        {!gate.allowed && gate.reason ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{gate.reason}</Text> : null}
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, alignItems: 'center' },
  banner: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  bannerText: { fontSize: 13, fontFamily: fontFamily.semiBold },
  name: { fontSize: 20, fontFamily: fontFamily.heading, alignSelf: 'stretch' },
  hint: { fontSize: 14, fontFamily: fontFamily.regular, alignSelf: 'stretch' },
  error: { fontSize: 14, fontFamily: fontFamily.medium, alignSelf: 'stretch' },
  primary: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  primaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  secondary: { paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', alignSelf: 'stretch' },
  secondaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  disabled: { opacity: 0.5 },
});
