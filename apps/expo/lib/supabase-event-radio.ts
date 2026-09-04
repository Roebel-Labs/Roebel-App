// apps/expo/lib/supabase-event-radio.ts
import { supabase } from './supabase';
import { fetchEventRadioEnabled } from './supabase-app-settings';
import {
  assembleRadioBundle,
  EMPTY_RADIO_BUNDLE,
  isoWeekKey,
  localDateKey,
  type EventRadioBundle,
  type RadioSegmentRow,
} from './event-radio-select';

export type { EventRadioBundle, RadioSegment } from './event-radio-select';

/**
 * Narration clips for the given events plus today's intro and this week's
 * outro. Returns the empty bundle (enabled: false) when the kill switch is
 * off, on any error, or when there is nothing to fetch.
 */
export async function fetchEventRadio(eventIds: string[]): Promise<EventRadioBundle> {
  if (eventIds.length === 0) return EMPTY_RADIO_BUNDLE;
  const enabled = await fetchEventRadioEnabled();
  if (!enabled) return EMPTY_RADIO_BUNDLE;

  const todayKey = localDateKey();
  const weekKey = isoWeekKey(todayKey);
  const idList = eventIds.map((id) => `"${id}"`).join(',');
  const { data, error } = await supabase
    .from('event_radio_segments')
    .select('kind, scope_key, audio_url, duration_ms, created_at')
    .or(
      `and(kind.eq.event,scope_key.in.(${idList})),and(kind.eq.intro,scope_key.eq.${todayKey}),and(kind.eq.outro,scope_key.eq.${weekKey})`,
    );
  if (error) {
    console.error('fetch event_radio_segments error:', error);
    return EMPTY_RADIO_BUNDLE;
  }
  return assembleRadioBundle((data ?? []) as RadioSegmentRow[], eventIds, todayKey, weekKey);
}
