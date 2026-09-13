import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ClockIcon, LocationSmallIcon, TicketSmallIcon } from './Icons';
import { EventRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { currency, formatEventRailDate, formatTime, formatLocation } from '@/lib/utils';
import { CATEGORY_METADATA, EventCategory } from '@/lib/categories';
import InterestButton from './InterestButton';
import EventCancelledScrim from './EventCancelledScrim';

/**
 * Agenda row for the events overview: a date rail on the left, the event
 * itself in a single content column on the right (cover → host → title →
 * time → place), closed by a 1px line that spans the whole row inside the
 * list's 16px gutters.
 *
 * The date rail is drawn only on the first event of each day — consecutive
 * events on the same date hang under one chip, which is what makes a long
 * list read as an agenda instead of a stack of cards.
 */

export const DATE_RAIL_WIDTH = 52;
export const DATE_RAIL_GAP = 16;

// The end time carries the accent so a glanced row still tells you how long
// the evening runs. Amber-700 on white, amber-400 on the dark surface.
const END_TIME_ACCENT = { light: '#B45309', dark: '#FBBF24' };

// Row dividers and the date chip's border. Light mode uses the design
// system's border grey (CLAUDE.md: borders #B4B8C1) — the theme's `border`
// token is too faint at 1px on white; dark mode keeps the surface border.
const LINE_COLOR = { light: '#B4B8C1', dark: '#3c4043' };

type Props = {
  event: EventRecord;
  /** False when the previous row already carried this date's chip. */
  showDate?: boolean;
  /** Hairline below the row — omitted on the last one. */
  showDivider?: boolean;
};

export default function EventListRow({ event, showDate = true, showDivider = true }: Props) {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const rail = formatEventRailDate(event.date);
  const startTime = formatTime(event.time);
  const endTime = formatTime(event.end_time);
  const isCancelled = !!event.is_cancelled;
  const category = event.category as EventCategory | null;
  const categoryMeta = category ? CATEGORY_METADATA[category] : undefined;
  const hostName = event.author?.name || event.organizer_name;
  const hostAvatar = event.author?.avatarUrl;
  const place = formatLocation(event.location);
  const lineColor = isDark ? LINE_COLOR.dark : LINE_COLOR.light;

  return (
    <>
    <View style={styles.row}>
      <View style={styles.rail}>
        {showDate && (
          <View style={[styles.dateChip, { borderColor: lineColor }]}>
            <Text style={[styles.dateMonth, { color: colors.textSecondary }]}>{rail.month}</Text>
            <Text style={[styles.dateDay, { color: colors.textPrimary }]}>{rail.day}</Text>
            <Text style={[styles.dateWeekday, { color: colors.textSecondary }]}>{rail.weekday}</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Pressable
          onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
          accessibilityLabel={`Details für ${event.title}${isCancelled ? ' (abgesagt)' : ''} öffnen`}
        >
          <View style={styles.cover}>
            {event.image_url ? (
              <Image
                source={{ uri: event.image_url }}
                style={[styles.coverImage, { backgroundColor: colors.cardPlaceholder }]}
                contentFit="cover"
                transition={150}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={[styles.coverImage, { backgroundColor: colors.cardPlaceholder }]} />
            )}

            {categoryMeta && (
              <View style={[styles.badge, { backgroundColor: colors.background }]}>
                <Image
                  source={categoryMeta.image}
                  style={styles.badgeIcon}
                  contentFit="contain"
                  transition={0}
                />
                <Text style={[styles.badgeLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                  {categoryMeta.label}
                </Text>
              </View>
            )}

            {isCancelled && <EventCancelledScrim radius={12} compact />}
          </View>

          <View style={styles.hostRow}>
            {hostAvatar ? (
              <Image
                source={{ uri: hostAvatar }}
                style={[styles.hostAvatar, { backgroundColor: colors.cardPlaceholder }]}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[styles.hostAvatar, { backgroundColor: colors.surfaceSecondary }]} />
            )}
            <Text style={[styles.hostName, { color: colors.textSecondary }]} numberOfLines={1}>
              {hostName}
            </Text>
          </View>

          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {event.title}
            </Text>
            {/* Fixed to one title line so a one-liner hugs its text and the
                gap to the meta rows never depends on the heart's box. */}
            <View style={styles.titleAction}>
              <InterestButton eventId={event.id} iconOnly variant="feed" />
            </View>
          </View>

          {startTime && (
            <View style={styles.metaRow}>
              <ClockIcon size={14} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                {startTime} Uhr
                {endTime ? (
                  <Text style={{ color: isDark ? END_TIME_ACCENT.dark : END_TIME_ACCENT.light }}>
                    {`  ·  bis ${endTime} Uhr`}
                  </Text>
                ) : null}
              </Text>
            </View>
          )}

          {!!place && (
            <View style={styles.metaRow}>
              <LocationSmallIcon size={14} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                {place}
              </Text>
            </View>
          )}

          {event.ticket_price != null && (
            <View style={styles.metaRow}>
              <TicketSmallIcon size={14} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                {currency(event.ticket_price)}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>

    {showDivider && <View style={[styles.divider, { backgroundColor: lineColor }]} />}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  rail: {
    width: DATE_RAIL_WIDTH,
    marginRight: DATE_RAIL_GAP,
  },
  dateChip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  dateMonth: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    letterSpacing: 0.6,
    lineHeight: 14,
  },
  dateDay: {
    fontSize: 26,
    fontFamily: fontFamily.medium,
    lineHeight: 32,
  },
  dateWeekday: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    letterSpacing: 0.6,
    lineHeight: 14,
  },
  content: {
    flex: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  cover: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: '75%',
  },
  badgeIcon: {
    width: 16,
    height: 16,
  },
  badgeLabel: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    flexShrink: 1,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  hostAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  hostName: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  title: {
    flex: 1,
    fontSize: 19,
    lineHeight: 25,
    fontFamily: fontFamily.semiBold,
  },
  titleAction: {
    height: 25,
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fontFamily.regular,
  },
  divider: {
    height: 1,
    marginTop: 16,
    marginBottom: 20,
  },
});
