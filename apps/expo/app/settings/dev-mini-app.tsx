import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import MiniAppHost from '@/components/miniapp/MiniAppHost';
import type { MiniApp } from '@/lib/miniapps';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const LAST_URL_KEY = '@developer_mode_last_url';

// Vorschau einer beliebigen Mini-App-URL im echten Host (Entwicklermodus).
// Es braucht keinen Store-Eintrag: wir bauen ein synthetisches MiniApp-Objekt
// mit allen Berechtigungen. Server-gebundene Aktionen (z. B. Belohnungen)
// lehnt das Backend für nicht gelistete Apps weiterhin ab — erwartet.
function devApp(url: string): MiniApp {
  return {
    id: 'dev-preview',
    slug: 'dev-preview',
    name: 'Dev Preview',
    iconUrl: null,
    homeUrl: url,
    description: null,
    category: 'utility',
    tags: [],
    screenshots: [],
    permissions: ['wallet', 'rewards', 'notifications', 'circles', 'share'],
    primaryColor: '#00498B',
    featured: false,
    authorName: null,
  };
}

export default function DevMiniAppScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [url, setUrl] = useState('');
  const [hostVisible, setHostVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LAST_URL_KEY)
      .then((v) => {
        if (v) setUrl(v);
      })
      .catch(() => {});
  }, []);

  const trimmed = url.trim();
  const isValid = /^https?:\/\/.+\..+/.test(trimmed);

  const open = async () => {
    if (!isValid) return;
    try {
      await AsyncStorage.setItem(LAST_URL_KEY, trimmed);
    } catch {}
    setHostVisible(true);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mini-App Vorschau</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex1}
      >
        <View style={styles.content}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>URL DEINER MINI-APP</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://meine-mini-app.vercel.app"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
          />
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Die Seite läuft im echten Mini-App-Host mit allen Berechtigungen —
            genau wie eine App aus dem Store. Belohnungen funktionieren erst,
            wenn die App gelistet ist.
          </Text>
          <Pressable
            onPress={open}
            disabled={!isValid}
            style={[
              styles.openButton,
              { backgroundColor: colors.primary, opacity: isValid ? 1 : 0.4 },
            ]}
          >
            <Text style={[styles.openButtonText, { color: colors.background }]}>Öffnen</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {hostVisible && (
        <MiniAppHost app={devApp(trimmed)} visible={hostVisible} onClose={() => setHostVisible(false)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontFamily: 'MonaSans-SemiBold',
  },
  headerSpacer: { width: 40 },
  content: { padding: 16 },
  label: {
    fontSize: 12,
    fontFamily: 'MonaSans-Medium',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'MonaSans-Regular',
  },
  hint: {
    fontSize: 13,
    fontFamily: 'MonaSans-Regular',
    lineHeight: 18,
    marginTop: 10,
  },
  openButton: {
    marginTop: 20,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  openButtonText: {
    fontSize: 15,
    fontFamily: 'MonaSans-SemiBold',
  },
});
