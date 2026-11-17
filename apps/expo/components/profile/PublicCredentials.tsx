import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Address } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { loadPublicHeld, type HeldCredential } from '@/lib/credreg/held';
import { publicProfile, type RegisterCard } from '@/lib/credreg/model';
import BadgeGrid from './BadgeGrid';
import CredentialCard from './CredentialCard';
import CredentialDetailSheet from './CredentialDetailSheet';

const CARD_WIDTH = 220;
const noop = () => {};

/**
 * Another person's public cards and badges (read from the chain; the server is never asked about
 * them, private entries never reach this device). Closed gate: renders nothing and loads nothing.
 * The account address is only used for the chain read, never rendered.
 */
export default function PublicCredentials({ address }: { address: string | null | undefined }) {
  const gate = useCredentialsGate();
  if (gate !== true || !address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  return <PublicCredentialsLoaded address={address as Address} />;
}

function PublicCredentialsLoaded({ address }: { address: Address }) {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<{ for: string; held: HeldCredential[] } | null>(null);
  const [detail, setDetail] = useState<RegisterCard | null>(null);
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    let cancelled = false;
    loadPublicHeld(address)
      .catch(() => [] as HeldCredential[])
      .then((held) => {
        if (!cancelled) setEntries({ for: address, held });
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const publicHeld = entries && entries.for === address ? entries.held : null;
  const profile = useMemo(
    () =>
      publicHeld
        ? publicProfile({ isCitizen: false, isAttester: false, publicHeld, nowSec })
        : null,
    [publicHeld, nowSec],
  );
  if (!profile) return null;
  // The person's citizen status is shown by the seal next to the name; only register cards here.
  const cards = profile.cards.filter((c) => c.source === 'register');
  if (cards.length === 0 && profile.badges.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {cards.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: colors.textPrimary }]} accessibilityRole="header">
            Ausweise
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {cards.map((card) => (
              <Pressable key={card.key} onPress={() => setDetail(card)} accessibilityRole="button" accessibilityLabel={`${card.title} anzeigen`}>
                <CredentialCard card={card} width={CARD_WIDTH} shadow={false} />
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
      <BadgeGrid badges={profile.badges} onPress={setDetail} inset={0} parentInset={16} />
      <CredentialDetailSheet card={detail} onClose={() => setDetail(null)} onShow={noop} onMakePrivate={noop} readOnly />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
  },
  heading: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    marginBottom: 12,
  },
  row: {
    gap: 12,
  },
});
