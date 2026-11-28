import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveAccount } from 'thirdweb/react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ChevronLeft } from '@/components/Icons';
import { connectCalendly, disconnectCalendly, fetchBookingInfo, type BookingEventType } from '@/lib/booking';

/**
 * Settings → Terminbuchung: connect your own Calendly with a personal access token. The token goes to the
 * server only (signed request); booking is then switched on per listing in the listing editor.
 */
export default function TerminbuchungSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const wallet = account?.address?.toLowerCase() ?? null;

  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<BookingEventType[] | null>(null); // null = not connected
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const r = await fetchBookingInfo(wallet, { slots: false });
    setTypes(r.ok ? r.data.event_types : null);
    setLoading(false);
  }, [wallet]);
  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    if (!account || busy) return;
    setError(null);
    if (token.trim().length < 40) return setError('Bitte füge den ganzen Schlüssel aus Calendly ein.');
    setBusy(true);
    const r = await connectCalendly(account, token);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setTypes(r.data.event_types);
    setToken('');
    setEditing(false);
  };

  const disconnect = () => {
    if (!account) return;
    Alert.alert('Verbindung trennen?', 'Die Terminbuchung wird in all deinen Anzeigen ausgeschaltet.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Trennen',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const r = await disconnectCalendly(account);
          setBusy(false);
          if (r.ok) setTypes(null);
          else setError(r.message);
        },
      },
    ]);
  };

  const connected = types !== null;
  const showForm = !connected || editing;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Zurück">
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Terminbuchung</Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={Platform.OS === 'ios' ? 24 : 80}
        extraHeight={120}
      >
        <Text style={[styles.lead, { color: colors.textSecondary }]}>
          Verbinde deinen Calendly-Kalender. Kundinnen und Kunden buchen dann direkt in der Röbel App einen freien Termin bei dir – du entscheidest pro Anzeige, ob „Termin buchen“ erscheint.
        </Text>

        {!wallet ? (
          <Text style={[styles.lead, { color: colors.textPrimary }]}>Bitte melde dich zuerst an.</Text>
        ) : loading ? (
          <ActivityIndicator color={colors.textPrimary} style={styles.spinner} />
        ) : (
          <>
            {connected ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: '#1F9D55' }]} />
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Calendly verbunden</Text>
                </View>
                {types.length === 0 ? (
                  <Text style={[styles.text, { color: colors.textSecondary }]}>Calendly zeigt gerade keine aktiven Termin-Arten. Lege in Calendly eine an.</Text>
                ) : (
                  types.map((t) => (
                    <Text key={t.uri} style={[styles.text, { color: colors.textPrimary }]}>
                      • {t.name} · {t.duration} Min.
                    </Text>
                  ))
                )}
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  Einschalten: Öffne deine Anzeige → Bearbeiten → „Terminbuchung“.
                </Text>
              </View>
            ) : null}

            {showForm ? (
              <View style={styles.form}>
                <Text style={[styles.h3, { color: colors.textPrimary }]}>{connected ? 'Neuen Schlüssel eintragen' : 'So verbindest du Calendly'}</Text>
                <Text style={[styles.text, { color: colors.textSecondary }]}>
                  1. Öffne Calendly → Integrationen → „API & Webhooks“.{'\n'}
                  2. Erstelle einen „Persönlichen Zugangsschlüssel“ mit den Rechten event_types:read, availability:read, scheduled_events:read und scheduled_events:write.{'\n'}
                  3. Kopiere den Schlüssel und füge ihn hier ein.
                </Text>
                <Pressable onPress={() => Linking.openURL('https://calendly.com/integrations/api_webhooks')} accessibilityRole="link">
                  <Text style={[styles.link, { color: colors.textPrimary }]}>Calendly öffnen</Text>
                </Pressable>
                <TextInput
                  value={token}
                  onChangeText={setToken}
                  placeholder="Zugangsschlüssel einfügen"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                  accessibilityLabel="Calendly-Zugangsschlüssel"
                />
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  Der Schlüssel wird nur auf unserem Server gespeichert und nie angezeigt. Ohne „scheduled_events:write“ bestätigen Kunden den Termin kurz auf der Calendly-Seite.
                </Text>
                {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
                <Pressable onPress={connect} disabled={busy} style={[styles.primary, { backgroundColor: colors.textPrimary }]} accessibilityRole="button">
                  {busy ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryText, { color: colors.background }]}>Verbinden</Text>}
                </Pressable>
                {connected ? (
                  <Pressable onPress={() => { setEditing(false); setError(null); }} style={styles.secondary} accessibilityRole="button">
                    <Text style={[styles.link, { color: colors.textPrimary }]}>Abbrechen</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.form}>
                {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
                <Pressable onPress={() => setEditing(true)} style={[styles.outline, { borderColor: colors.textPrimary }]} accessibilityRole="button">
                  <Text style={[styles.primaryText, { color: colors.textPrimary }]}>Schlüssel ersetzen</Text>
                </Pressable>
                <Pressable onPress={disconnect} disabled={busy} style={styles.secondary} accessibilityRole="button">
                  <Text style={[styles.link, { color: colors.error }]}>Verbindung trennen</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.heading, fontSize: 20 },
  content: { paddingHorizontal: 20, gap: 18, paddingTop: 8 },
  lead: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  spinner: { marginTop: 24 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16, gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  h3: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  text: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  hint: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, marginTop: 4 },
  link: { fontFamily: fontFamily.semiBold, fontSize: 15, textDecorationLine: 'underline' },
  form: { gap: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, minHeight: 96, fontFamily: fontFamily.mono, fontSize: 13, textAlignVertical: 'top' },
  error: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  primary: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  outline: { height: 52, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
