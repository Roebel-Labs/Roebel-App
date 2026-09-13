import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import ProfileMenuItem from '@/components/ProfileMenuItem';
import { useTheme } from '@/context/ThemeContext';
import UploadIcon from '@/assets/icons/profile/upload.svg';
import SentIcon from '@/assets/icons/profile/sent.svg';
import NotificationIcon from '@/assets/icons/profile/notification.svg';
import HelpCircleIcon from '@/assets/icons/profile/help-circle.svg';
import ShieldUserIcon from '@/assets/icons/profile/shield-user.svg';
import SettingsIcon from '@/assets/icons/settings-01.svg';
import PencilIcon from '@/assets/icons/pencil.svg';
import CalendarIcon from '@/assets/icons/calendar-02.svg';
import TrashIcon from '@/assets/icons/profile/trash.svg';

type Props = {
  variant: 'guest' | 'personal' | 'org';
  /** Personal only: tourists/guests get the row, citizens have the tile. */
  showSubmitEventRow?: boolean;
};

const ICON = 20;

/** The two groups of menu rows under the profile content. */
export default function ProfileMenu({ variant, showSubmitEventRow = false }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const c = colors.textPrimary;
  const push = (href: Href) => () => router.push(href as any);
  const open = (url: string) => () => openBrowserAsync(url);

  const divider = <View style={[styles.divider, { backgroundColor: colors.border }]} />;

  if (variant === 'org') {
    return (
      <View style={styles.section}>
        <View style={styles.group}>
          <ProfileMenuItem icon={<PencilIcon width={ICON} height={ICON} color={c} />} label="Mein Profil" onPress={push('/edit-org' as Href)} />
          <ProfileMenuItem icon={<CalendarIcon width={ICON} height={ICON} color={c} />} label="Meine Veranstaltungen" onPress={push('/my-events' as Href)} />
          <ProfileMenuItem icon={<SentIcon width={ICON} height={ICON} color={c} />} label="Feedback geben" onPress={push('/feedback' as Href)} />
        </View>
        {divider}
        <View style={styles.group}>
          <ProfileMenuItem icon={<NotificationIcon width={ICON} height={ICON} color={c} />} label="Benachrichtigungen" onPress={push('/notifications' as Href)} />
          <ProfileMenuItem icon={<SettingsIcon width={ICON} height={ICON} color={c} />} label="Einstellungen" onPress={push('/org/settings' as Href)} />
          <ProfileMenuItem icon={<HelpCircleIcon width={ICON} height={ICON} color={c} />} label="Hilfe" onPress={push('/help' as Href)} />
          <ProfileMenuItem icon={<ShieldUserIcon width={ICON} height={ICON} color={c} />} label="Datenschutz" onPress={open('https://www.roebel.app/datenschutz')} />
        </View>
      </View>
    );
  }

  const isGuest = variant === 'guest';
  return (
    <View style={styles.section}>
      <View style={styles.group}>
        {(isGuest || showSubmitEventRow) && (
          <ProfileMenuItem icon={<UploadIcon width={ICON} height={ICON} color={c} />} label="Veranstaltung einsenden" onPress={push('/submit-event' as Href)} />
        )}
        <ProfileMenuItem icon={<CalendarIcon width={ICON} height={ICON} color={c} />} label="Meine Veranstaltungen" onPress={push('/my-events' as Href)} />
        {!isGuest && (
          <ProfileMenuItem icon={<TrashIcon width={ICON} height={ICON} color={c} />} label="Abfallkalender" onPress={push('/abfallkalender' as Href)} />
        )}
        <ProfileMenuItem icon={<SentIcon width={ICON} height={ICON} color={c} />} label="Feedback geben" onPress={push('/feedback' as Href)} />
      </View>
      {divider}
      <View style={styles.group}>
        <ProfileMenuItem icon={<NotificationIcon width={ICON} height={ICON} color={c} />} label="Benachrichtigungen" onPress={push('/notifications' as Href)} />
        <ProfileMenuItem icon={<SettingsIcon width={ICON} height={ICON} color={c} />} label="Einstellungen" onPress={push('/settings' as Href)} />
        <ProfileMenuItem icon={<HelpCircleIcon width={ICON} height={ICON} color={c} />} label="Hilfe" onPress={push('/help' as Href)} />
        {isGuest && (
          <ProfileMenuItem icon={<HelpCircleIcon width={ICON} height={ICON} color={c} />} label="Über die App" onPress={open('https://www.roebel.app/about')} />
        )}
        <ProfileMenuItem icon={<ShieldUserIcon width={ICON} height={ICON} color={c} />} label="Datenschutz" onPress={open('https://www.roebel.app/datenschutz')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  group: {
    gap: 8,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
});
