import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useLocation } from '@/context/LocationContext';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { supabase } from '@/lib/supabase';
import { type PostingStatus } from '@/hooks/usePostingPermission';
import { fontFamily, fontSize, spacing, borderRadius } from '@/constants/theme';

interface Props {
  status: PostingStatus;
  refresh: () => Promise<void>;
  children: React.ReactNode;
}

/**
 * Presentational gate: given the posting `status` (owned by the parent via
 * [`usePostingPermission`](hooks/usePostingPermission.ts)), it short-circuits to
 * a gate UI whenever a non-citizen fails a precondition. Citizens and org
 * accounts are bypassed upstream and fall straight through to `children`.
 *
 * Non-citizens must (1) verify they're physically near Röbel, (2) wait 24h after
 * sign-up, (3) stay under the rate limit (2/day, 5/week). The parent owns the
 * single source of truth so the composer's "Weiter" button and this gate stay
 * in sync (e.g. both update the instant location verification completes).
 */
export default function PostingGate({ status, refresh, children }: Props) {
  switch (status.kind) {
    case 'loading':
      return <GateContainer><LoadingGate /></GateContainer>;
    case 'needs_location':
      return <GateContainer><LocationGate onVerified={refresh} /></GateContainer>;
    case 'account_too_young':
      return <GateContainer><CooldownGate kind="age" unlockAt={status.unlockAt} /></GateContainer>;
    case 'rate_limited':
      return <GateContainer><CooldownGate kind={status.scope} unlockAt={status.unlockAt} /></GateContainer>;
    case 'unknown_user':
    case 'allowed':
    default:
      return (
        <>
          {status.kind === 'allowed' && status.tier === 'tourist' && (
            <TouristBanner remainingToday={status.remainingToday} />
          )}
          {children}
        </>
      );
  }
}

// ─── Subcomponents ──────────────────────────────────────────────

function GateContainer({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.gateRoot, { backgroundColor: colors.background }]}>
      {children}
    </View>
  );
}

function LoadingGate() {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
        Lade…
      </Text>
    </View>
  );
}

function LocationGate({ onVerified }: { onVerified: () => Promise<void> }) {
  const { colors } = useTheme();
  const { requestLocation, isLoading: locationLoading } = useLocation();
  const { user } = useUser();
  const { showSnackbar } = useSnackbar();
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!user?.wallet_address) return;
    setErrorMsg(null);
    setIsVerifying(true);
    try {
      const ok = await requestLocation();
      if (!ok) {
        setErrorMsg('Bitte erlaube den Standortzugriff, um fortzufahren.');
        return;
      }
      const Location = await import('expo-location');
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { data, error } = await supabase.rpc('verify_user_location', {
        p_wallet: user.wallet_address,
        p_lat: current.coords.latitude,
        p_lng: current.coords.longitude,
      });
      if (error) {
        const farMatch = error.message.match(/LOCATION_TOO_FAR:([\d.]+)/);
        if (farMatch) {
          setErrorMsg(
            `Du bist gerade ${farMatch[1]} km von Röbel entfernt. Versuch es noch einmal, wenn du in der Nähe bist.`,
          );
        } else {
          setErrorMsg('Standort konnte nicht verifiziert werden. Bitte versuche es später erneut.');
        }
        return;
      }
      showSnackbar({ message: 'Standort bestätigt — du kannst jetzt posten.' });
      await onVerified();
    } catch (e) {
      console.error('[LocationGate] verify failed', e);
      setErrorMsg('Etwas ist schiefgelaufen. Bitte erneut versuchen.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <View style={styles.center}>
      <View style={[styles.iconBubble, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="location-outline" size={28} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Bist du in Röbel/Müritz?
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Damit der Feed für Einheimische und echte Besucher bleibt, bestätige
        bitte einmalig, dass du dich gerade in Röbel/Müritz oder im Umkreis von
        10 km aufhältst.
      </Text>
      <Text style={[styles.bodyMuted, { color: colors.textTertiary }]}>
        Wir speichern nur den Zeitstempel der Verifizierung — keine laufende
        Standortverfolgung.
      </Text>
      {errorMsg && (
        <Text style={[styles.errorText, { color: colors.error ?? '#dc2626' }]}>
          {errorMsg}
        </Text>
      )}
      <Pressable
        onPress={handleVerify}
        disabled={isVerifying || locationLoading}
        style={[
          styles.primaryButton,
          {
            backgroundColor:
              isVerifying || locationLoading ? colors.disabled : colors.primary,
          },
        ]}
      >
        {isVerifying || locationLoading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
            Standort bestätigen
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function CooldownGate({
  kind,
  unlockAt,
}: {
  kind: 'age' | 'day' | 'week';
  unlockAt: Date;
}) {
  const { colors } = useTheme();
  const formatted = unlockAt.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const title =
    kind === 'age'
      ? 'Noch ein bisschen Geduld'
      : kind === 'day'
      ? 'Tageslimit erreicht'
      : 'Wochenlimit erreicht';

  const body =
    kind === 'age'
      ? 'Posten ist erst 24 Stunden nach Account-Erstellung möglich. Schau dich gerne bis dahin in der App um — lies Beiträge, kommentiere, vote.'
      : kind === 'day'
      ? 'Du hast heute schon 2 Beiträge geteilt. Damit der Feed für alle übersichtlich bleibt, gibt es ein Tageslimit.'
      : 'Du hast diese Woche schon 5 Beiträge geteilt. Damit der Feed für alle übersichtlich bleibt, gibt es ein Wochenlimit.';

  return (
    <View style={styles.center}>
      <View style={[styles.iconBubble, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="time-outline" size={28} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
      <View style={[styles.unlockCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.unlockLabel, { color: colors.textSecondary }]}>
          Nächster Beitrag möglich
        </Text>
        <Text style={[styles.unlockValue, { color: colors.textPrimary }]}>
          {formatted}
        </Text>
      </View>
    </View>
  );
}

function TouristBanner({ remainingToday }: { remainingToday?: number }) {
  const { colors } = useTheme();
  const left = typeof remainingToday === 'number' ? remainingToday : 2;
  const suffix =
    left === 1 ? '1 Beitrag' : left === 0 ? 'keinen Beitrag' : `${left} Beiträge`;
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: colors.primaryLight, borderColor: colors.border },
      ]}
    >
      <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
      <Text style={[styles.bannerText, { color: colors.textPrimary }]}>
        Besucher-Modus · Du kannst heute noch {suffix} teilen.
      </Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  gateRoot: {
    flex: 1,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[8],
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: spacing[2],
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize['2xl'],
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing[3],
  },
  bodyMuted: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing[5],
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  primaryButton: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius: borderRadius.full,
    minWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
  },
  unlockCard: {
    marginTop: spacing[5],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  unlockLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    marginBottom: spacing[1],
  },
  unlockValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  bannerText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    flexShrink: 1,
  },
});

export type { PostingStatus };
