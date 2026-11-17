/**
 * Annehmen: one invitation, the public/private choice (or the single option an office or a
 * private-only org leaves), and "Ablehnen". Opened from a push (`credential_invite`), the inbox,
 * the profile row, or right after an invite link was redeemed.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import LoginDrawer from '@/components/LoginDrawer';
import {
  CredentialScreenFrame,
  CredentialStatus,
  formatValidity,
  frameStyles,
} from '@/components/credentials/CredentialScreenFrame';
import {
  acceptInvitation,
  acceptOptions,
  forgetInvitation,
  rememberedInvitation,
  type AcceptChoice,
} from '@/lib/credreg/accept';
import { fetchMine } from '@/lib/credreg/api';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { announceHeldChanged } from '@/lib/credreg/held';
import type { InvitationView } from '@/lib/credreg/types';

const COPY = {
  publicTitle: 'Öffentlich zeigen',
  publicText:
    'Dein Ausweis steht im öffentlichen Register von Röbel. Jede:r kann nachsehen, dass dein Konto ihn trägt. Das lässt sich später beenden, bleibt aber im Verlauf des Registers sichtbar.',
  privateTitle: 'Privat behalten',
  privateText: 'Nur du hast den Nachweis. Du kannst ihn vorzeigen, wenn du möchtest. Niemand kann nachschlagen, dass du ihn hast.',
  officeButton: 'Amt annehmen',
  officeText: 'Ein Amt ist öffentlich. Mit dem Annehmen steht es im Register von Röbel.',
  privateOnlyButton: 'Annehmen',
  privateOnlyText:
    'Diese Organisation zeigt ihre Mitglieder nicht öffentlich. Deine Mitgliedschaft bleibt privat und erscheint nicht im Register. Öffnet die Organisation das später, kannst du sie in deinem Profil öffentlich machen.',
};

type Load = { id: string; owner: string | undefined; inv: InvitationView | null; status: 'loading' | 'ready' | 'missing' | 'error' };

function isExpired(inv: InvitationView): boolean {
  if (!inv.validUntil) return false;
  const ms = Date.parse(inv.validUntil);
  return Number.isFinite(ms) && ms < Date.now();
}

export default function AcceptCredentialScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = typeof idParam === 'string' ? idParam : '';
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const gate = useCredentialsGate();
  const [showLogin, setShowLogin] = useState(false);
  const address = account?.address?.toLowerCase();
  // A loaded invitation belongs to one account: switching accounts loads again.
  const [load, setLoad] = useState<Load>(() => {
    const inv = rememberedInvitation(id);
    return { id, owner: address, inv, status: inv ? 'ready' : 'loading' };
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [choice, setChoice] = useState<AcceptChoice | null>(null);
  const [busy, setBusy] = useState<AcceptChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<AcceptChoice | null>(null);

  const current = load.id === id && load.owner === address;
  const needsLoad = gate === true && !!account && !(current && load.status === 'ready');

  useEffect(() => {
    if (!needsLoad || !account) return;
    let cancelled = false;
    fetchMine(account)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoad({ id, owner: address, inv: null, status: 'error' });
          return;
        }
        const inv = res.data.find((i) => i.id === id) ?? null;
        setLoad({ id, owner: address, inv, status: inv ? 'ready' : 'missing' });
      })
      .catch(() => {
        if (!cancelled) setLoad({ id, owner: address, inv: null, status: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // account identity changes on re-render; the address is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLoad, address, id, reloadKey]);

  const inv = current ? load.inv : null;

  const answer = async (c: AcceptChoice) => {
    if (!account || !inv || busy) return;
    setBusy(c);
    setError(null);
    const result = await acceptInvitation(account, inv, c);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      if (result.code === 'NOT_PUBLIC') {
        // The org closed public membership meanwhile: the screen now offers the private way.
        setLoad((l) => (l.inv ? { ...l, inv: { ...l.inv, type: { ...l.inv.type, publicClaimAllowed: false } } } : l));
        setChoice(null);
      }
      return;
    }
    forgetInvitation(inv.id);
    setDone(c);
    announceHeldChanged();
  };

  const toProfile = () => router.replace('/profile' as any);

  const title = inv?.type.kind === 'badge' ? 'Abzeichen' : 'Ausweis';

  if (gate === null) {
    return (
      <CredentialScreenFrame title="Ausweis">
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (gate === false) {
    return (
      <CredentialScreenFrame title="Ausweis">
        <CredentialStatus title="Noch nicht verfügbar" message="Ausweise gibt es in deiner App bald." />
      </CredentialScreenFrame>
    );
  }
  if (!account) {
    return (
      <CredentialScreenFrame title="Ausweis">
        <CredentialStatus
          title="Bitte melde dich an"
          message="Melde dich an, um deinen Ausweis abzuholen."
          actionLabel="Anmelden"
          onAction={() => setShowLogin(true)}
        />
        <LoginDrawer visible={showLogin && !account} onClose={() => setShowLogin(false)} />
      </CredentialScreenFrame>
    );
  }
  if (!inv) {
    if (current && load.status === 'error') {
      return (
        <CredentialScreenFrame title="Ausweis">
          <CredentialStatus
            title="Das hat nicht geklappt"
            message="Dein Ausweis konnte nicht geladen werden."
            actionLabel="Erneut versuchen"
            onAction={() => {
              setLoad({ id, owner: address, inv: null, status: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        </CredentialScreenFrame>
      );
    }
    if (current && load.status === 'missing') {
      return (
        <CredentialScreenFrame title="Ausweis">
          <CredentialStatus title="Nicht gefunden" message="Diese Einladung gibt es nicht." actionLabel="Zum Profil" onAction={toProfile} />
        </CredentialScreenFrame>
      );
    }
    return (
      <CredentialScreenFrame title="Ausweis">
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }

  if (done) {
    const message =
      done === 'decline'
        ? 'Du hast abgelehnt.'
        : done === 'public'
          ? `${inv.type.name} steht jetzt in deinem Profil und im Register von Röbel.`
          : `${inv.type.name} steht jetzt in deinem Profil. Nur du hast den Nachweis.`;
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus
          title={done === 'decline' ? 'Abgelehnt' : 'Angenommen'}
          message={message}
          actionLabel="Zum Profil"
          onAction={toProfile}
        />
      </CredentialScreenFrame>
    );
  }
  if (inv.state === 'revoked') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Zurückgezogen" message="Dieser Ausweis wurde zurückgezogen." actionLabel="Zum Profil" onAction={toProfile} />
      </CredentialScreenFrame>
    );
  }
  if (inv.state === 'accepted') {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus
          title="Schon angenommen"
          message="Du hast diesen Ausweis bereits angenommen. Du findest ihn in deinem Profil."
          actionLabel="Zum Profil"
          onAction={toProfile}
        />
      </CredentialScreenFrame>
    );
  }
  if (isExpired(inv)) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Abgelaufen" message="Dieser Ausweis ist abgelaufen." actionLabel="Zum Profil" onAction={toProfile} />
      </CredentialScreenFrame>
    );
  }

  const opts = acceptOptions(inv);
  const isBadge = inv.type.kind === 'badge';
  // Nothing preselected for roles and memberships; "Öffentlich zeigen" for badges.
  const selected: AcceptChoice | null = choice ?? (isBadge ? 'public' : null);
  const anyBusy = busy !== null;

  const primary = (label: string, c: AcceptChoice | null) => (
    <Pressable
      onPress={() => c && answer(c)}
      disabled={anyBusy || !c}
      style={[frameStyles.primary, { backgroundColor: colors.primary }, (anyBusy || !c) && frameStyles.busy]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: anyBusy || !c, busy: busy !== null && busy !== 'decline' }}
    >
      {busy !== null && busy !== 'decline' ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={[frameStyles.primaryText, { color: colors.onPrimary }]}>{label}</Text>
      )}
    </Pressable>
  );

  const option = (c: 'public' | 'private', label: string, text: string) => {
    const on = selected === c;
    return (
      <Pressable
        key={c}
        onPress={() => setChoice(c)}
        disabled={anyBusy}
        style={[styles.option, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primaryLight : colors.surface }]}
        accessibilityRole="radio"
        accessibilityState={{ checked: on, disabled: anyBusy }}
        accessibilityLabel={label}
      >
        <View style={[styles.radio, { borderColor: on ? colors.primary : colors.textTertiary }]}>
          {on ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
        </View>
        <View style={styles.optionBody}>
          <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{label}</Text>
          <Text style={[styles.optionText, { color: colors.textSecondary }]}>{text}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <CredentialScreenFrame title={title}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          {isBadge ? 'Du hast ein Abzeichen erhalten' : 'Du hast einen Ausweis erhalten'}
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
          {inv.type.imageUrl ? <Image source={{ uri: inv.type.imageUrl }} style={styles.image} /> : null}
          <Text style={[styles.typeTitle, { color: colors.textPrimary }]}>{inv.type.name}</Text>
          {inv.org ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{inv.org.name}</Text> : null}
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatValidity(inv.validUntil)}</Text>
          {inv.type.description ? <Text style={[styles.description, { color: colors.textSecondary }]}>{inv.type.description}</Text> : null}
        </View>

        {inv.state === 'declined' ? (
          <Text style={[styles.note, { color: colors.textSecondary }]}>Du hattest abgelehnt. Du kannst es dir noch anders überlegen.</Text>
        ) : null}

        {opts.reason === 'free' ? (
          <View style={styles.options} accessibilityRole="radiogroup">
            {option('public', COPY.publicTitle, COPY.publicText)}
            {option('private', COPY.privateTitle, COPY.privateText)}
          </View>
        ) : (
          <Text style={[styles.explain, { color: colors.textSecondary }]}>
            {opts.reason === 'office' ? COPY.officeText : COPY.privateOnlyText}
          </Text>
        )}

        {busy === 'public' ? (
          <Text style={[styles.note, { color: colors.textSecondary }]}>Wird ins Register von Röbel eingetragen …</Text>
        ) : null}
        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

        <View style={styles.actions}>
          {opts.reason === 'office'
            ? primary(COPY.officeButton, 'public')
            : opts.reason === 'private_only'
              ? primary(COPY.privateOnlyButton, 'private')
              : primary('Weiter', selected)}
          <Pressable
            onPress={() => answer('decline')}
            disabled={anyBusy}
            style={styles.decline}
            accessibilityRole="button"
            accessibilityLabel="Ablehnen"
          >
            {busy === 'decline' ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <Text style={[styles.declineText, { color: colors.textSecondary }, anyBusy && frameStyles.busy]}>Ablehnen</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 16 },
  heading: { fontSize: 22, fontFamily: fontFamily.heading },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  image: { width: 64, height: 64, borderRadius: 12, marginBottom: 8 },
  typeTitle: { fontSize: 18, fontFamily: fontFamily.semiBold },
  meta: { fontSize: 14, fontFamily: fontFamily.regular },
  description: { fontSize: 14, fontFamily: fontFamily.regular, marginTop: 6, lineHeight: 20 },
  options: { gap: 10 },
  option: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optionBody: { flex: 1, gap: 4 },
  optionTitle: { fontSize: 16, fontFamily: fontFamily.semiBold },
  optionText: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
  explain: { fontSize: 15, fontFamily: fontFamily.regular, lineHeight: 21 },
  note: { fontSize: 14, fontFamily: fontFamily.regular, textAlign: 'center' },
  error: { fontSize: 14, fontFamily: fontFamily.regular, textAlign: 'center' },
  actions: { gap: 8, marginTop: 8 },
  decline: { paddingVertical: 14, alignItems: 'center' },
  declineText: { fontSize: 15, fontFamily: fontFamily.medium, textDecorationLine: 'underline' },
});
