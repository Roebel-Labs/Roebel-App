// Live preview for events with a live room (Max, 2026-11-07, DanceCup): while the show is live, event cards and
// the event page show the muted stream instead of the flyer; a tap opens the live room. One cached query for all
// shows that belong to an event, so a rail of cards does not fire a request per card.
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { supabase } from '@/lib/supabase';
import type { LiveStatus } from '@/lib/live';
import { F } from './tokens';

export type EventLiveShow = { slug: string; event_id: string; status: LiveStatus; hls_url: string | null; starts_at: string | null };

const QUERY_KEY = ['live', 'event-shows'] as const;

async function fetchEventShows(): Promise<EventLiveShow[]> {
  try {
    const { data, error } = await (supabase as any)
      .from('live_shows')
      .select('slug, event_id, status, hls_url, starts_at')
      .not('event_id', 'is', null)
      .in('status', ['scheduled', 'live']);
    if (error) return [];
    return (data ?? []) as EventLiveShow[];
  } catch {
    return [];
  }
}

/** The (not yet ended) live show of an event, refreshed every 20 s so cards flip to the stream when it starts. */
export function useEventLiveShow(eventId: string | null | undefined): EventLiveShow | null {
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchEventShows,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
  if (!eventId || !data) return null;
  return data.find((s) => s.event_id === eventId) ?? null;
}

export function isStreaming(show: EventLiveShow | null): show is EventLiveShow & { hls_url: string } {
  return !!show && show.status === 'live' && !!show.hls_url;
}

type Props = {
  show: EventLiveShow & { hls_url: string };
  style?: StyleProp<ViewStyle>;
  /** Bigger badge + "Tippen zum Ansehen" hint (event page). */
  large?: boolean;
};

/** Muted live stream filling its parent; tap opens the live room. Render only when `isStreaming(show)`. */
export default function LiveEventMedia({ show, style, large = false }: Props) {
  const router = useRouter();
  const focused = useIsFocused();
  const player = useVideoPlayer(show.hls_url, (p) => {
    p.muted = true;
    p.loop = false;
  });

  // Only plays while its screen is in front: the live room has its own player, and two decoders cost battery.
  useEffect(() => {
    try {
      if (focused) player.play();
      else player.pause();
    } catch {
      // player already released
    }
  }, [focused, player]);

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.root, style]}
      onPress={() => router.push({ pathname: '/live/[slug]' as any, params: { slug: show.slug } })}
      accessibilityRole="button"
      accessibilityLabel="Livestream öffnen"
    >
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
      <View style={[styles.badge, large && styles.badgeLarge]} pointerEvents="none">
        <View style={styles.dot} />
        <Text style={[styles.badgeText, large && styles.badgeTextLarge]}>LIVE</Text>
      </View>
      {large ? (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>Tippen zum Ansehen</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000', overflow: 'hidden' },
  badge: {
    position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: '#FF3040',
  },
  badgeLarge: { height: 26, borderRadius: 13, paddingHorizontal: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: F.bold, letterSpacing: 0.6 },
  badgeTextLarge: { fontSize: 12 },
  hint: {
    position: 'absolute', bottom: 10, right: 10, paddingHorizontal: 10, height: 26, borderRadius: 13,
    justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)',
  },
  hintText: { color: '#fff', fontSize: 12, fontFamily: F.semiBold },
});
