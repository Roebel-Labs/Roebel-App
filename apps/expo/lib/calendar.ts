import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { parseISO } from 'date-fns';

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

async function getDefaultCalendarId(): Promise<string> {
  if (Platform.OS === 'ios') {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return defaultCalendar.id;
  }

  // Android: find a writable calendar
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writableCalendar = calendars.find(
    (cal) => cal.accessLevel === 'owner' || cal.accessLevel === 'root'
  );

  if (writableCalendar) {
    return writableCalendar.id;
  }

  // Fallback: create a local calendar
  const newCalendarId = await Calendar.createCalendarAsync({
    title: 'Röbel Events',
    color: '#00498B',
    entityType: Calendar.EntityTypes.EVENT,
    source: {
      isLocalAccount: true,
      name: 'Röbel',
      type: Calendar.CalendarType.LOCAL,
    },
    name: 'roebel-events',
    ownerAccount: 'local',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });

  return newCalendarId;
}

function buildDateTime(dateStr: string, timeStr: string | null): Date {
  const date = parseISO(dateStr);
  if (timeStr) {
    const [h, m, s] = timeStr.split(':').map(Number);
    date.setHours(h, m, s || 0, 0);
  }
  return date;
}

export type SaveToCalendarParams = {
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string;
};

export async function saveEventToCalendar(params: SaveToCalendarParams): Promise<string> {
  const calendarId = await getDefaultCalendarId();

  const startDate = buildDateTime(params.date, params.time);

  let endDate: Date;
  if (params.endTime) {
    endDate = buildDateTime(params.date, params.endTime);
    if (endDate <= startDate) {
      endDate.setDate(endDate.getDate() + 1);
    }
  } else if (params.time) {
    endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  } else {
    endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 0);
  }

  const isAllDay = !params.time;

  const eventId = await Calendar.createEventAsync(calendarId, {
    title: params.title,
    notes: params.description || undefined,
    location: params.location,
    startDate,
    endDate,
    allDay: isAllDay,
    timeZone: 'Europe/Berlin',
    alarms: [{ relativeOffset: -60 }],
  });

  return eventId;
}
