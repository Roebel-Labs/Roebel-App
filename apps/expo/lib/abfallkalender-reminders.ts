import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

export type AbfallFraction =
  | 'restmuell'
  | 'bio'
  | 'papier'
  | 'gelbe_tonne'
  | 'schadstoff'
  | 'weihnachtsbaum';

export const FRACTION_LABEL: Record<AbfallFraction, string> = {
  restmuell: 'Restmüll',
  bio: 'Bioabfall',
  papier: 'Papier',
  gelbe_tonne: 'Gelbe Tonne',
  schadstoff: 'Schadstoffmobil',
  weihnachtsbaum: 'Weihnachtsbaum',
};

const STORAGE_PREFIX = 'abfall_reminder_';
const NOTIFICATION_PREFIX = 'abfall_';
const NODE_ID = 12236; // Röbel
const REMINDER_HOUR_LOCAL = 19; // 19:00 wall time the evening before

export async function getReminderEnabled(fraction: AbfallFraction): Promise<boolean> {
  const stored = await AsyncStorage.getItem(`${STORAGE_PREFIX}${fraction}`);
  return stored === '1';
}

async function setReminderFlag(fraction: AbfallFraction, enabled: boolean) {
  if (enabled) {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${fraction}`, '1');
  } else {
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${fraction}`);
  }
}

async function cancelFractionNotifications(fraction: AbfallFraction) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const targets = scheduled.filter((n) =>
    n.identifier.startsWith(`${NOTIFICATION_PREFIX}${fraction}_`),
  );
  await Promise.all(targets.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

async function schedule(fraction: AbfallFraction, pickupDate: Date) {
  const trigger = new Date(pickupDate);
  trigger.setDate(trigger.getDate() - 1);
  trigger.setHours(REMINDER_HOUR_LOCAL, 0, 0, 0);
  if (trigger.getTime() <= Date.now()) return; // already passed

  const id = `${NOTIFICATION_PREFIX}${fraction}_${pickupDate.toISOString().slice(0, 10)}`;
  const label = FRACTION_LABEL[fraction];

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: `Morgen ist ${label}-Tag`,
      body: 'Stell die Tonne heute Abend an die Straße.',
      data: { type: 'abfallkalender', fraction },
      sound: 'default',
    },
    trigger: { date: trigger },
  });
}

export async function enableReminder(fraction: AbfallFraction): Promise<void> {
  await setReminderFlag(fraction, true);
  await cancelFractionNotifications(fraction);

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('waste_collection')
    .select('pickup_date')
    .eq('node_id', NODE_ID)
    .eq('fraction', fraction)
    .gte('pickup_date', today)
    .order('pickup_date', { ascending: true })
    .limit(20);

  if (error || !data) return;

  for (const row of data) {
    await schedule(fraction, new Date(`${row.pickup_date}T00:00:00`));
  }
}

export async function disableReminder(fraction: AbfallFraction): Promise<void> {
  await setReminderFlag(fraction, false);
  await cancelFractionNotifications(fraction);
}

// Re-syncs all enabled reminders against the latest data. Safe to call on screen mount.
export async function refreshAllReminders(): Promise<void> {
  const fractions: AbfallFraction[] = [
    'restmuell',
    'bio',
    'papier',
    'gelbe_tonne',
    'schadstoff',
    'weihnachtsbaum',
  ];
  for (const f of fractions) {
    if (await getReminderEnabled(f)) {
      await enableReminder(f);
    }
  }
}
