import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { CREDENTIAL_COPY, type CredentialKind } from '@/lib/credentials';
import type { RegisterCard } from '@/lib/credreg/model';
import { softShadow } from '@/lib/shadow';
import { CARD_ASPECT, CREDENTIAL_ART, cardRadiusFor } from './credential-art';
import RecognisedSeal from './RecognisedSeal';
import { cardHolderValues, type Holder } from '@/lib/card-design/holder-values';
// Skia (and Reanimated) load only when a card has a design and the binary has Skia; a card Skia
// cannot draw shows its old picture.
import SafeDesignedCard from '@/components/credentials/SafeDesignedCard';
import { COMMUNITY_DESIGNS } from '@/lib/card-design/community';

type Props = {
  /** A built-in card by kind (today's cards), or any card of the profile model. */
  kind?: CredentialKind;
  card?: RegisterCard;
  width: number;
  style?: StyleProp<ViewStyle>;
  shadow?: boolean;
  /** The holder (own cards only): fills the design's name field on this device. */
  holder?: Holder | null;
  /** A designed card's sheen: 'tilt' follows the phone while the screen is focused. */
  animate?: 'tilt' | 'static';
};


export function cardHeightFor(width: number): number {
  return Math.round(width / CARD_ASPECT);
}

const KIND_LABEL: Record<RegisterCard['kind'], string> = { role: 'Amt', membership: 'Mitglied', badge: 'Abzeichen' };

/** Screen-reader label of a register card: title, org, then its state. */
export function registerCardLabel(card: RegisterCard): string {
  const parts = [card.title];
  if (card.orgName) parts.push(card.orgName);
  if (card.kind === 'role' && card.recognised) parts.push('Offizielles Amt der Stadt');
  if (card.visibility === 'private') parts.push('Privat');
  if (card.state === 'expired') parts.push('Abgelaufen');
  return parts.join(', ');
}

/**
 * The neutral face of a register card without its own image: card shape, theme primary, the type
 * title, the org name and a small "Amt" / "Mitglied" label. No image assets.
 */
export function DefaultCardFace({ card, width }: { card: RegisterCard; width: number }) {
  const { colors } = useTheme();
  const height = cardHeightFor(width);
  const radius = cardRadiusFor(width);
  const pad = Math.max(12, Math.round(width * 0.05));
  return (
    <View style={[styles.face, { width, height, borderRadius: radius, padding: pad, backgroundColor: colors.primary }]}>
      <Text style={[styles.kindLabel, { color: colors.onPrimary }]} numberOfLines={1}>
        {KIND_LABEL[card.kind]}
      </Text>
      <View style={styles.faceBottom}>
        <Text style={[styles.faceTitle, { color: colors.onPrimary }]} numberOfLines={2}>
          {card.title}
        </Text>
        {card.orgName ? (
          <Text style={[styles.faceOrg, { color: colors.onPrimary }]} numberOfLines={1}>
            {card.orgName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The card's picture (type image), or the neutral face without one. */
function PictureFace({ card, width }: { card: RegisterCard; width: number }) {
  const height = cardHeightFor(width);
  const radius = cardRadiusFor(width);
  return card.imageUrl ? (
    <Image source={{ uri: card.imageUrl }} style={[styles.image, { width, height, borderRadius: radius }]} resizeMode="cover" />
  ) : (
    <DefaultCardFace card={card} width={width} />
  );
}

/** One credential card at the given width (462:290 aspect). */
export default function CredentialCard({ kind, card, width, style, shadow = true, holder, animate = 'static' }: Props) {
  const { colors, isDark } = useTheme();
  const height = cardHeightFor(width);
  const radius = cardRadiusFor(width);
  const builtin: CredentialKind | undefined = card ? card.builtin : kind;
  const validUntil = card?.validUntil ?? null;
  // Stable per holder and date, so the designed card is not re-recorded on every render.
  const values = useMemo(() => (holder ? cardHolderValues(holder, validUntil) : undefined), [holder, validUntil]);

  if (!card || card.source === 'builtin' || builtin) {
    const k = (builtin ?? 'guest') as CredentialKind;
    const art = <Image source={CREDENTIAL_ART[k]} style={[styles.image, { width, height, borderRadius: radius }]} resizeMode="cover" />;
    return (
      <View
        style={[{ width, height, borderRadius: radius }, shadow && softShadow(animate === 'tilt' ? 3 : 2, isDark), style]}
        accessibilityRole="image"
        accessibilityLabel={CREDENTIAL_COPY[k].title}
      >
        {/* The tilting card is drawn from its design so the sheen follows the phone; the PNG is the
            fallback (no Skia in this binary, still loading, or drawing failed) and every static card. */}
        {animate === 'tilt' ? (
          <View style={[styles.inner, { borderRadius: radius }]}>
            <SafeDesignedCard design={COMMUNITY_DESIGNS[k]} width={width} mode="holder" animate="tilt" fallback={art} />
          </View>
        ) : (
          art
        )}
      </View>
    );
  }

  const expired = card.state === 'expired';
  const tagInset = Math.max(10, Math.round(width * 0.035));
  return (
    <View
      style={[{ width, height, borderRadius: radius }, shadow && softShadow(animate === 'tilt' ? 3 : 2, isDark), style]}
      accessibilityRole="image"
      accessibilityLabel={registerCardLabel(card)}
    >
      <View style={[styles.inner, { borderRadius: radius }, expired && styles.dimmed]}>
        {card.design ? (
          <SafeDesignedCard
            design={card.design}
            width={width}
            mode="holder"
            values={values}
            animate={animate}
            fallback={<PictureFace card={card} width={width} />}
          />
        ) : (
          <PictureFace card={card} width={width} />
        )}
      </View>
      {card.kind === 'role' && card.recognised ? (
        <RecognisedSeal style={[styles.seal, { top: tagInset, right: tagInset }]} />
      ) : null}
      {card.visibility === 'private' || expired ? (
        <View style={[styles.tags, { top: tagInset, right: tagInset + (card.kind === 'role' && card.recognised ? 36 : 0) }]}>
          {card.visibility === 'private' ? (
            <View style={[styles.tag, { backgroundColor: colors.surface }]}>
              <LockMark color={colors.textPrimary} />
              <Text style={[styles.tagText, { color: colors.textPrimary }]}>Privat</Text>
            </View>
          ) : null}
          {expired ? (
            <View style={[styles.tag, { backgroundColor: colors.warningBackground }]}>
              <Text style={[styles.tagText, { color: colors.textPrimary }]}>Abgelaufen</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A small padlock drawn with views (shackle + body). */
function LockMark({ color }: { color: string }) {
  return (
    <View style={styles.lock}>
      <View style={[styles.lockShackle, { borderColor: color }]} />
      <View style={[styles.lockBody, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: 'transparent',
  },
  inner: {
    overflow: 'hidden',
  },
  dimmed: {
    opacity: 0.45,
  },
  face: {
    justifyContent: 'space-between',
  },
  faceBottom: {
    gap: 2,
  },
  kindLabel: {
    fontSize: 12,
    fontFamily: 'MonaSans-SemiBold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.85,
  },
  faceTitle: {
    fontSize: 20,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  faceOrg: {
    fontSize: 14,
    fontFamily: 'MonaSans-Medium',
    opacity: 0.85,
  },
  seal: {
    position: 'absolute',
  },
  tags: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    fontFamily: 'MonaSans-SemiBold',
  },
  lock: {
    width: 10,
    height: 12,
    alignItems: 'center',
  },
  lockShackle: {
    width: 7,
    height: 6,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  lockBody: {
    width: 10,
    height: 7,
    borderRadius: 1.5,
  },
});
