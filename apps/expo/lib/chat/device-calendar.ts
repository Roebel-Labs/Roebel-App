// Native device-calendar access for Mecky Chat (phase 3). OTA-safe on the 3.7.0 binary:
//
// - Imports `expo-calendar/legacy`: in expo-calendar 56 the root `expo-calendar` export is the
//   new object API and its legacy-named functions (requestCalendarPermissionsAsync, …) THROW at
//   runtime. The legacy native module ships in the same pod/AAR, so this is binary-compatible.
// - Adding events uses the OS "new event" sheet (createEventInCalendarAsync): no permission on
//   iOS 17+ (EKEventEditViewController) and Android (ACTION_INSERT intent).
// - Reading events needs full access. iOS 17+ requires NSCalendarsFullAccessUsageDescription,
//   which the binary has: the expo-calendar config plugin is registered in app.config.ts with
//   `calendarPermission` and without `writeOnlyAccess`, so prebuild writes both
//   NSCalendarsUsageDescription and NSCalendarsFullAccessUsageDescription (see the prebuilt
//   ios/Rbel/Info.plist). As a second guard we only ever call request when getPermissions says
//   the prompt can still be shown: the native getter reports `denied` (canAskAgain false)
//   when the plist key is missing, so a binary without the key never reaches the request.
import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar/legacy';
import { buildCalendarContext, CALENDAR_CONTEXT_DAYS } from './calendar';
import type { CalendarContextEvent } from './types';

export type CalendarReadAccess = 'granted' | 'undetermined' | 'blocked';

const READ_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('calendar timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Current read-access state without prompting. */
export async function getCalendarReadAccess(): Promise<CalendarReadAccess> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'blocked';
  try {
    const res = await Calendar.getCalendarPermissionsAsync();
    if (res.status === 'granted') return 'granted';
    return res.canAskAgain ? 'undetermined' : 'blocked';
  } catch {
    return 'blocked';
  }
}

/** Asks for read access when the OS still allows a prompt. 'blocked' → only the Settings app helps. */
export async function requestCalendarReadAccess(): Promise<CalendarReadAccess> {
  const current = await getCalendarReadAccess();
  if (current !== 'undetermined') return current;
  try {
    const res = await Calendar.requestCalendarPermissionsAsync();
    if (res.status === 'granted') return 'granted';
    return res.canAskAgain ? 'undetermined' : 'blocked';
  } catch {
    return 'blocked';
  }
}

/**
 * Upcoming events (next 7 days, ≤ 50) for the send body — or null when read access is not
 * granted or reading fails. Never prompts.
 */
export async function readCalendarContext(now: Date = new Date()): Promise<CalendarContextEvent[] | null> {
  if ((await getCalendarReadAccess()) !== 'granted') return null;
  try {
    const calendars = await withTimeout(Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT), READ_TIMEOUT_MS);
    const ids = calendars.filter((c) => c.isVisible !== false).map((c) => c.id);
    if (!ids.length) return [];
    // Android only returns events that START inside the window; start a day early to catch running ones.
    const from = new Date(now.getTime() - 86_400_000);
    const to = new Date(now.getTime() + CALENDAR_CONTEXT_DAYS * 86_400_000);
    const events = await withTimeout(Calendar.getEventsAsync(ids, from, to), READ_TIMEOUT_MS);
    return buildCalendarContext(events, now);
  } catch {
    return null;
  }
}

export interface NewCalendarEvent {
  title: string;
  start: string;
  end: string;
  location?: string;
  notes?: string;
}

/**
 * Opens the OS "new event" sheet prefilled with `ev`. Resolves true when the event was
 * (probably) saved: iOS reports 'saved'; Android always reports 'done' (no signal).
 */
export async function addEventWithSystemSheet(ev: NewCalendarEvent): Promise<boolean> {
  const data = {
    title: ev.title,
    startDate: new Date(ev.start),
    endDate: new Date(ev.end),
    ...(ev.location ? { location: ev.location } : {}),
    ...(ev.notes ? { notes: ev.notes } : {}),
  };
  const open = async () => {
    const res = await Calendar.createEventInCalendarAsync(data);
    return res.action === 'saved' || res.action === 'done';
  };
  try {
    return await open();
  } catch (err) {
    // iOS < 17 needs calendar permission for the sheet (it throws, it does not crash).
    if (Platform.OS === 'ios' && (await requestCalendarReadAccess()) === 'granted') return open();
    throw err;
  }
}
