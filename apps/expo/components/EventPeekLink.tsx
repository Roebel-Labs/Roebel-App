import React, { type ReactNode } from 'react';
import { Platform, Pressable, Share, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Link } from 'expo-router';
import type { EventRecord } from '@/lib/types';
import { logEvent } from '@/lib/firebase';

/**
 * iOS: an event card that behaves like a link in a system app. Tap opens the
 * event; touch and hold lifts the card, shows the event page as a preview and
 * a menu below it (Öffnen, Teilen); tapping the preview opens it. Android and
 * web keep each card's own Pressable — callers only use this when it is true.
 */
export const EVENT_PEEK = Platform.OS === 'ios';

type Props = {
  event: Pick<EventRecord, 'id' | 'title' | 'location'>;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  children: ReactNode;
};

export default function EventPeekLink({ event, style, accessibilityLabel, children }: Props) {
  const share = () => {
    Share.share({
      message: `${event.title}\n\n${event.location ? `📍 ${event.location}\n` : ''}https://www.roebel.app/events/${event.id}`,
      title: event.title,
    })
      .then(() => logEvent('share_event', { event_id: event.id, event_title: event.title }))
      .catch(() => {});
  };

  return (
    <Link href={{ pathname: '/event/[id]', params: { id: event.id } }} push asChild>
      <Link.Trigger>
        {/* Link's Slot merges props into this child: its style must be one
            flat object and it must not navigate on its own. */}
        <Pressable style={StyleSheet.flatten(style)} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
          {children}
        </Pressable>
      </Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        <Link.MenuAction title="Teilen" icon="square.and.arrow.up" onPress={share} />
      </Link.Menu>
    </Link>
  );
}
