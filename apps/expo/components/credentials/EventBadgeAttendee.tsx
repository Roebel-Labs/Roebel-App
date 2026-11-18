/**
 * Event page, attendee block (spec 5.6b): the event's badge art and name with the state label
 * ("Das bekommst du, wenn du dabei bist", "Gesammelt", "Wird eingetragen", "Vorbei"). The public
 * badge needs no sign-in; held/pending come from the person's credentials when the gate is open.
 * "Wird eingetragen" = an open invitation of the badge type, or the attendance is recorded and the
 * organiser has not issued the badge yet (`mine` pendingBadges).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { fetchPublicEventBadge } from '@/lib/credreg/api';
import { ATTENDEE_LABELS, attendeeBadgeState } from '@/lib/credreg/event-page';
import { useHeld } from '@/lib/credreg/held';
import type { PublicEventBadge } from '@/lib/credreg/types';
import StampCard from './StampCard';

export default function EventBadgeAttendee({ eventId }: { eventId: string }) {
  const { colors } = useTheme();
  const { held, pending, pendingBadges } = useHeld();
  const [badge, setBadge] = useState<PublicEventBadge | null>(null);
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    let alive = true;
    void fetchPublicEventBadge(eventId).then((b) => {
      if (alive && b) setBadge(b);
    });
    return () => {
      alive = false;
    };
  }, [eventId]);

  const typeKey = badge?.typeId?.toLowerCase();
  const state = attendeeBadgeState({
    badge,
    held: !!typeKey && held.some((h) => h.typeId.toLowerCase() === typeKey),
    pending:
      (!!typeKey && pending.some((i) => i.type.typeId.toLowerCase() === typeKey)) || pendingBadges.some((p) => p.eventId === eventId),
    nowSec,
  });
  if (!badge || !state) return null;

  const collected = state.state === 'collected';
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* The state label sits beside the stamp, so the stamp itself carries no chip; not yet held = faded. */}
      <View style={[styles.stamp, { opacity: collected ? 1 : state.state === 'over' ? 0.4 : 0.6 }]}>
        <StampCard imageUrl={badge.imageUrl} title="" subtitle="" state="collected" size="tile" />
      </View>
      <View style={styles.text}>
        <Text style={[styles.heading, { color: colors.textSecondary }]}>{ATTENDEE_LABELS.heading}</Text>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
          {badge.name}
        </Text>
        <Text style={[styles.state, { color: collected ? colors.primary : colors.textSecondary }]}>{state.label}</Text>
        {badge.collected > 0 ? (
          <Text style={[styles.meta, { color: colors.textTertiary }]}>{`${badge.collected} gesammelt`}</Text>
        ) : null}
      </View>
    </View>
  );
}

const STAMP = 64;
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  stamp: { width: STAMP + 32 },
  text: { flex: 1, gap: 2 },
  heading: { fontSize: 12, fontFamily: fontFamily.medium },
  name: { fontSize: 15, fontFamily: fontFamily.semiBold },
  state: { fontSize: 14, fontFamily: fontFamily.semiBold, marginTop: 2 },
  meta: { fontSize: 12, fontFamily: fontFamily.regular },
});
