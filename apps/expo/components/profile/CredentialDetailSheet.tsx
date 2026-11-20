import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import StampCard from '@/components/credentials/StampCard';
import { formatEventDate } from '@/lib/credreg/collect-format';
import type { BadgeTile, RegisterCard } from '@/lib/credreg/model';
import CredentialCard from './CredentialCard';
import type { Holder } from '@/lib/card-design/holder-values';

type Props = {
  card: RegisterCard | null;
  /** A waiting badge (pending or queued, no card yet): information only. */
  tile?: BadgeTile | null;
  /** Badges: "Teilen" (feed post). Absent = no button. */
  onShare?(card: RegisterCard): void;
  onClose(): void;
  onShow(card: RegisterCard): void;
  /** Absent = the action is not available here yet (no button is drawn). */
  onMakePublic?(card: RegisterCard): void;
  onMakePrivate(card: RegisterCard): void;
  /** Another person's card: information only, no actions. */
  readOnly?: boolean;
  /** An action is being sent. */
  busy?: boolean;
  /** German message of the last failed action. */
  error?: string | null;
  /** The holder of an own card: fills a designed card's name field (never for readOnly cards). */
  holder?: Holder | null;
};

export const MAKE_PRIVATE_EXPLAINER =
  'Dein Ausweis wird aus dem öffentlichen Register genommen. Dein Nachweis bleibt gültig und du kannst ihn weiter vorzeigen. Wichtig: Dass du ihn öffentlich gezeigt hast, bleibt im Verlauf des Registers dauerhaft sichtbar und kann nicht gelöscht werden.';

export const PENDING_BADGE_TEXT = 'Wird eingetragen, sobald der Veranstalter die Abzeichen vergibt.';
export const QUEUED_BADGE_TEXT = 'Wird gesammelt, sobald du wieder online bist.';

export const ORG_PRIVATE_ONLY = 'Diese Organisation zeigt ihre Mitglieder nicht öffentlich.';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Gültig bis 31.12.2027" or "Unbefristet". */
export function validityLabel(validUntil: number | null): string {
  if (validUntil === null) return 'Unbefristet';
  const d = new Date(validUntil * 1000);
  return `Gültig bis ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** An office the town recognises stays public (spec: offices are always public). */
const isOffice = (c: RegisterCard) => c.kind === 'role' && c.recognised;

/**
 * Details of one register card: title, org, validity, benefits and the actions "Vorzeigen",
 * "Öffentlich zeigen" / "Privat machen". "Privat machen" first explains, then sends from the same
 * sheet with one button. Built-in cards never open here (the profile opens their explainer).
 */
export default function CredentialDetailSheet({
  card,
  tile = null,
  onShare,
  onClose,
  onShow,
  onMakePublic,
  onMakePrivate,
  readOnly = false,
  busy = false,
  error = null,
  holder = null,
}: Props) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  // The explanation step belongs to one card: another card opens on its details again.
  const [confirmingFor, setConfirmingFor] = useState<string | null>(null);

  if (!card && tile && tile.state !== 'collected') {
    return (
      <BottomDrawer visible onClose={onClose}>
        <View style={styles.content}>
          <View style={styles.stamp}>
            <StampCard imageUrl={tile.imageUrl} title={tile.title} subtitle="" state={tile.state} size="hero" />
          </View>
          {tile.eventTitle ? <Text style={[styles.title, { color: colors.textPrimary }]}>{tile.eventTitle}</Text> : null}
          {tile.orgName ? <Text style={[styles.org, { color: colors.textSecondary }]}>{tile.orgName}</Text> : null}
          {tile.date ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatEventDate(tile.date)}</Text> : null}
          <View style={styles.block}>
            <Text style={[styles.note, { color: colors.textSecondary }]}>{tile.state === 'queued' ? QUEUED_BADGE_TEXT : PENDING_BADGE_TEXT}</Text>
          </View>
        </View>
      </BottomDrawer>
    );
  }
  if (!card || card.source !== 'register') return null;
  const isBadge = card.kind === 'badge';

  const expired = card.state === 'expired';
  const isPrivate = card.visibility === 'private';
  const canAct = !readOnly && !expired;
  const showMakePrivate = canAct && !isPrivate && !isOffice(card);
  const publicBlocked = isPrivate && card.publicAllowed === false;
  const showMakePublic = canAct && isPrivate && !publicBlocked && !!onMakePublic;
  const benefits = card.benefits ?? [];
  const confirming = confirmingFor === card.key;

  return (
    <BottomDrawer visible onClose={onClose}>
      <View style={styles.content}>
        {isBadge ? (
          <View style={styles.stamp}>
            <StampCard imageUrl={card.imageUrl} title={card.title} subtitle="" state="collected" size="hero" />
          </View>
        ) : (
          <CredentialCard
            card={card}
            width={Math.min(screenWidth - 64, 320)}
            style={styles.card}
            holder={readOnly ? null : holder}
            animate="tilt"
          />
        )}
        {isBadge ? null : <Text style={[styles.title, { color: colors.textPrimary }]}>{card.title}</Text>}
        {isBadge && card.eventTitle ? <Text style={[styles.title, { color: colors.textPrimary }]}>{card.eventTitle}</Text> : null}
        {card.orgName ? <Text style={[styles.org, { color: colors.textSecondary }]}>{card.orgName}</Text> : null}
        {isBadge && card.eventDate ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatEventDate(card.eventDate)}</Text> : null}
        {isBadge && !expired && card.validUntil === null ? null : (
          <Text style={[styles.meta, { color: expired ? colors.warning : colors.textSecondary }]}>
            {expired ? 'Abgelaufen' : validityLabel(card.validUntil)}
          </Text>
        )}

        {confirming ? (
          <View style={styles.block}>
            <Text style={[styles.body, { color: colors.textPrimary }]}>{MAKE_PRIVATE_EXPLAINER}</Text>
            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            <Pressable
              onPress={() => onMakePrivate(card)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Privat machen"
              style={[styles.primary, { backgroundColor: colors.primary }, busy && styles.busy]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Privat machen</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            {benefits.length > 0 ? (
              <View style={styles.block}>
                {benefits.map((b) => (
                  <View key={b} style={styles.benefitRow}>
                    <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.body, styles.benefitText, { color: colors.textPrimary }]}>{b}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {canAct ? (
              <View style={styles.block}>
                {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
                <Pressable
                  onPress={() => onShow(card)}
                  accessibilityRole="button"
                  accessibilityLabel="Vorzeigen"
                  style={[styles.primary, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Vorzeigen</Text>
                </Pressable>
                {isBadge && onShare ? (
                  <Pressable onPress={() => onShare(card)} accessibilityRole="button" accessibilityLabel="Teilen" style={styles.secondary}>
                    <Text style={[styles.secondaryText, { color: colors.primary }]}>Teilen</Text>
                  </Pressable>
                ) : null}
                {showMakePublic ? (
                  <Pressable
                    onPress={() => onMakePublic?.(card)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Öffentlich zeigen"
                    style={styles.secondary}
                  >
                    <Text style={[styles.secondaryText, { color: colors.primary }]}>Öffentlich zeigen</Text>
                  </Pressable>
                ) : null}
                {publicBlocked ? <Text style={[styles.note, { color: colors.textSecondary }]}>{ORG_PRIVATE_ONLY}</Text> : null}
                {showMakePrivate ? (
                  <Pressable
                    onPress={() => setConfirmingFor(card.key)}
                    accessibilityRole="button"
                    accessibilityLabel="Privat machen"
                    style={styles.secondary}
                  >
                    <Text style={[styles.secondaryText, { color: colors.primary }]}>Privat machen</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'stretch',
    gap: 6,
    paddingTop: 8,
    paddingBottom: 16,
  },
  card: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  stamp: {
    alignSelf: 'center',
    width: 260,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    textAlign: 'center',
  },
  org: {
    fontSize: 15,
    fontFamily: 'MonaSans-Medium',
    textAlign: 'center',
  },
  meta: {
    fontSize: 14,
    fontFamily: 'MonaSans-Regular',
    textAlign: 'center',
  },
  block: {
    marginTop: 16,
    gap: 10,
  },
  body: {
    fontSize: 15,
    fontFamily: 'MonaSans-Regular',
    lineHeight: 22,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  benefitText: {
    flex: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  note: {
    fontSize: 14,
    fontFamily: 'MonaSans-Regular',
    textAlign: 'center',
  },
  error: {
    fontSize: 14,
    fontFamily: 'MonaSans-Medium',
    textAlign: 'center',
  },
  primary: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: {
    opacity: 0.7,
  },
  primaryText: {
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  secondary: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 15,
    fontFamily: 'MonaSans-SemiBold',
  },
});
