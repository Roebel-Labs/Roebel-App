import { isSameWeek, parseISO, startOfDay } from 'date-fns';
import type { EventRecord } from './types';
import { isEventInRoebel } from './utils';

export type ExploreEventBuckets = {
  /** Upcoming events this ISO week (Mon–Sun) that take place in Röbel. */
  thisWeek: EventRecord[];
  /** Upcoming non-popular events beyond this week, anywhere. */
  later: EventRecord[];
  /** Upcoming non-popular events outside Röbel, any week. */
  nearby: EventRecord[];
};

const dayStamp = (date: Date) => startOfDay(date).getTime();

/**
 * One pass over the explore event list that yields every rail's bucket.
 * The rails used to re-filter the full list independently (three passes,
 * each re-parsing every date); this parses each event once and keeps the
 * exact per-rail semantics. Past events are dropped everywhere — the query
 * already filters server-side, but a persisted cache restored on a later
 * day still carries yesterday's rows.
 */
export function partitionExploreEvents(
  events: EventRecord[],
  now: Date = new Date()
): ExploreEventBuckets {
  const today = dayStamp(now);
  const thisWeek: EventRecord[] = [];
  const later: EventRecord[] = [];
  const nearby: EventRecord[] = [];

  for (const event of events) {
    const day = dayStamp(parseISO(event.date));
    if (day < today) continue;

    const inWeek = isSameWeek(day, now, { weekStartsOn: 1 });
    const inRoebel = isEventInRoebel(
      event.location,
      event.formatted_address,
      event.address_components
    );
    const popular = event.is_popular === true;

    if (inWeek && inRoebel) thisWeek.push(event);
    if (!inWeek && !popular) later.push(event);
    if (!inRoebel && !popular) nearby.push(event);
  }

  return { thisWeek, later, nearby };
}

/**
 * Hero cards: the popular events that are still upcoming. Returns the input
 * array itself when nothing is dropped so memoized consumers keep identity.
 */
export function selectHeroEvents(popular: EventRecord[], now: Date = new Date()): EventRecord[] {
  const today = dayStamp(now);
  const upcoming = popular.filter((event) => dayStamp(parseISO(event.date)) >= today);
  return upcoming.length === popular.length ? popular : upcoming;
}
