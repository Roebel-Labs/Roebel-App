import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useLocation } from '@/context/LocationContext';
import { submitHelpRequest, type HelpRequestType } from '@/lib/supabase-pois';

type Props = {
  visible: boolean;
  onClose: () => void;
  walletAddress?: string | null;
  userName?: string | null;
};

const PANNENDIENST_PHONE = '+49 160 7908268';   // Zweirad-Flitzer 24h
const TOURIST_INFO_PHONE = '+49 39931 5380';     // Haus des Gastes Röbel

export default function VerlorenSheet({ visible, onClose, walletAddress, userName }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { location, requestLocation } = useLocation();
  const [submitting, setSubmitting] = useState(false);

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() =>
      Alert.alert('Fehler', 'Anruf konnte nicht gestartet werden.')
    );
  };

  const handleShareLocation = async () => {
    let coords = location?.coords;
    if (!coords) {
      const ok = await requestLocation();
      if (!ok) {
        Alert.alert(
          'Standort nicht verfügbar',
          'Bitte erlaube Mecky deinen Standort, um ihn zu teilen.'
        );
        return;
      }
    }
    coords = location?.coords ?? coords;
    if (!coords) return;
    const url = `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`;
    const message = `Ich brauche Hilfe in Röbel/Müritz. Mein Standort: ${url}`;
    try {
      await Share.share({ message });
    } catch {
      // user cancelled — fine
    }
  };

  const handleSubmitHelpRequest = async (type: HelpRequestType) => {
    if (!location?.coords) {
      const ok = await requestLocation();
      if (!ok) {
        Alert.alert(
          'Standort nicht verfügbar',
          'Wir brauchen deinen Standort, damit dir jemand helfen kann.'
        );
        return;
      }
    }
    const coords = location?.coords;
    if (!coords) return;
    setSubmitting(true);
    const result = await submitHelpRequest({
      user_wallet: walletAddress ?? null,
      user_name: userName ?? null,
      request_type: type,
      lat: coords.latitude,
      lon: coords.longitude,
    });
    setSubmitting(false);
    if (result) {
      Alert.alert(
        'Hilfe-Anfrage gesendet',
        'Mecky hat deinen Standort übermittelt. Jemand vom Team meldet sich, sobald möglich.'
      );
      onClose();
    } else {
      Alert.alert('Fehler', 'Anfrage konnte nicht gesendet werden. Versuch einen Anruf.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: Math.max(36, insets.bottom) },
        ]}
      >
        <View style={styles.handle} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Wo bin ich verloren?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Mecky hilft. Wähl eine Option:
        </Text>

        <Pressable
          style={[styles.optionRow, { backgroundColor: colors.surface }]}
          onPress={() => handleCall(PANNENDIENST_PHONE)}
        >
          <Text style={styles.optionEmoji}>🔧</Text>
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
              Fahrradpanne — 24h Pannendienst
            </Text>
            <Text style={[styles.optionMeta, { color: colors.textSecondary }]}>
              Zweirad-Flitzer Röbel · {PANNENDIENST_PHONE}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={[styles.optionRow, { backgroundColor: colors.surface }]}
          onPress={() => handleCall(TOURIST_INFO_PHONE)}
        >
          <Text style={styles.optionEmoji}>ℹ️</Text>
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
              Tourist-Info Röbel
            </Text>
            <Text style={[styles.optionMeta, { color: colors.textSecondary }]}>
              Haus des Gastes · {TOURIST_INFO_PHONE}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={[styles.optionRow, { backgroundColor: colors.surface }]}
          onPress={handleShareLocation}
        >
          <Text style={styles.optionEmoji}>📍</Text>
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
              Standort teilen
            </Text>
            <Text style={[styles.optionMeta, { color: colors.textSecondary }]}>
              An eine vertraute Person über WhatsApp / SMS
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={[styles.optionRow, { backgroundColor: colors.surface, opacity: submitting ? 0.6 : 1 }]}
          onPress={() => handleSubmitHelpRequest('lost')}
          disabled={submitting}
        >
          <Text style={styles.optionEmoji}>🆘</Text>
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
              Hilfe-Anfrage an Mecky-Team
            </Text>
            <Text style={[styles.optionMeta, { color: colors.textSecondary }]}>
              Standort wird übermittelt — jemand meldet sich
            </Text>
          </View>
          {submitting ? <ActivityIndicator size="small" color={colors.tabIconActive} /> : null}
        </Pressable>

        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={[styles.closeText, { color: colors.textSecondary }]}>Schließen</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 18,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  optionEmoji: {
    fontSize: 26,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  optionMeta: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  closeBtn: {
    alignSelf: 'center',
    marginTop: 12,
    padding: 10,
  },
  closeText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
