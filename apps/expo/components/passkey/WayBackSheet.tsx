/**
 * Shown instead of a citizenship request when an independent account has no way back yet.
 * Primary button = the fastest option; "Vertrauensperson hinzufügen" is secondary unless it is
 * already the primary one.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import { ADD_PERSON_OPTION, WAY_BACK_REASON } from '@/lib/passkey/way-back';
import { BigButton } from './PasskeyUi';

export default function WayBackSheet({
  visible,
  option,
  onClose,
}: {
  visible: boolean;
  option: { label: string; route: string };
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const go = (route: string) => {
    onClose();
    router.push(route as never);
  };
  const showSecondary = option.route !== ADD_PERSON_OPTION.route;
  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Ein Weg zurück</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{WAY_BACK_REASON}</Text>
        <BigButton label={option.label} onPress={() => go(option.route)} />
        {showSecondary ? <BigButton kind="secondary" label={ADD_PERSON_OPTION.label} onPress={() => go(ADD_PERSON_OPTION.route)} /> : null}
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 8, gap: 12 },
  title: { fontSize: 20, fontFamily: 'Inter-Medium', textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 8 },
});
