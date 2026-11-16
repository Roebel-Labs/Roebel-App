import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useChatAccount } from '@/context/ChatContext';
import {
  decideEventRequest, fetchEventRequest, formatRequestDate, parseGermanDate, toGermanDate,
  type EventRequest, type EventRequestEdits,
} from '@/lib/event-requests';

type Phase = 'loading' | 'ready' | 'busy' | 'published' | 'rejected' | 'error';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * An event found for the organisation this person manages (forwarded poster or official
 * page). They publish it under the organisation's account, correct it first, or decline.
 * Opened from the push / inbox entry of type `event_request`.
 */
export default function EventRequestScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const account = useChatAccount();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [request, setRequest] = useState<EventRequest | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !account) return;
    let alive = true;
    setPhase('loading');
    fetchEventRequest(account, String(id))
      .then((r) => {
        if (!alive) return;
        setRequest(r);
        setTitle(r.title);
        setDateText(toGermanDate(r.date));
        setTimeText(r.time ?? '');
        setLocation(r.location);
        setDescription(r.description);
        setEventId(r.eventId);
        setPhase('ready');
      })
      .catch((e: Error) => {
        if (!alive) return;
        setPhase('error');
        setMessage(e.message || 'Die Anfrage konnte nicht geladen werden.');
      });
    return () => {
      alive = false;
    };
  }, [id, account]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));

  const publish = async () => {
    if (!account || !request) return;
    let edits: EventRequestEdits | undefined;
    if (editing) {
      const date = parseGermanDate(dateText);
      if (!date) {
        setMessage('Bitte gib das Datum als TT.MM.JJJJ an.');
        return;
      }
      const time = timeText.trim();
      if (time && !TIME_RE.test(time)) {
        setMessage('Bitte gib die Uhrzeit als HH:MM an.');
        return;
      }
      if (title.trim().length < 2 || location.trim().length < 2) {
        setMessage('Titel und Ort dürfen nicht leer sein.');
        return;
      }
      edits = { title: title.trim(), date, time: time || null, location: location.trim(), description: description.trim() };
    }
    setPhase('busy');
    setMessage(null);
    try {
      const outcome = await decideEventRequest(account, request.id, 'publish', edits);
      if (outcome.status === 'published_org') setEventId(outcome.eventId);
      setPhase('published');
    } catch (e) {
      setPhase('ready');
      setMessage((e as Error).message || 'Das hat nicht geklappt.');
    }
  };

  const reject = async () => {
    if (!account || !request) return;
    setPhase('busy');
    setMessage(null);
    try {
      await decideEventRequest(account, request.id, 'reject');
      setPhase('rejected');
    } catch (e) {
      setPhase('ready');
      setMessage((e as Error).message || 'Das hat nicht geklappt.');
    }
  };

  const inputStyle = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];
  const decidable = request?.canDecide === true && (phase === 'ready' || phase === 'busy');
  const busy = phase === 'busy';
  const alreadyDecided = request !== null && !request.canDecide && phase === 'ready';
  const orgName = request?.accountName ?? 'eure Organisation';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.kicker, { color: colors.primary }]}>VERANSTALTUNG GEFUNDEN</Text>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>Ist das eure Veranstaltung?</Text>

          {!account && (
            <Text style={[styles.note, { color: colors.textPrimary }]}>Bitte melde dich zuerst in der Röbel App an.</Text>
          )}
          {account && phase === 'loading' && <ActivityIndicator style={styles.spinner} color={colors.primary} />}
          {phase === 'error' && <Text style={[styles.note, { color: colors.error }]}>{message}</Text>}

          {request && phase !== 'error' && (
            <>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {request.source === 'crawl'
                  ? 'Wir haben sie auf einer offiziellen Seite gefunden.'
                  : 'Jemand hat uns das Plakat geschickt.'}{' '}
                Mit einem Tipp steht sie in der App unter {orgName}.
              </Text>

              {request.imageUrl && (
                <Image
                  source={{ uri: request.imageUrl }}
                  style={[styles.poster, { backgroundColor: colors.cardPlaceholder }]}
                  contentFit="contain"
                  accessibilityLabel="Plakat der Veranstaltung"
                />
              )}

              {!editing ? (
                <View style={[styles.card, { borderColor: colors.border }]}>
                  <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
                  <Text style={[styles.meta, { color: colors.textPrimary }]}>
                    {formatRequestDate(parseGermanDate(dateText) ?? request.date)}
                    {timeText ? `, ${timeText} Uhr` : ''}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>{location}</Text>
                  {description.length > 0 && (
                    <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
                  )}
                </View>
              ) : (
                <View style={styles.form}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Titel</Text>
                  <TextInput value={title} onChangeText={setTitle} style={inputStyle} maxLength={150} editable={!busy} />
                  <View style={styles.row}>
                    <View style={styles.rowItem}>
                      <Text style={[styles.label, { color: colors.textSecondary }]}>Datum</Text>
                      <TextInput
                        value={dateText} onChangeText={setDateText} style={inputStyle} placeholder="TT.MM.JJJJ"
                        placeholderTextColor={colors.textTertiary} keyboardType="numbers-and-punctuation" editable={!busy}
                      />
                    </View>
                    <View style={styles.rowItem}>
                      <Text style={[styles.label, { color: colors.textSecondary }]}>Beginn</Text>
                      <TextInput
                        value={timeText} onChangeText={setTimeText} style={inputStyle} placeholder="HH:MM"
                        placeholderTextColor={colors.textTertiary} keyboardType="numbers-and-punctuation" editable={!busy}
                      />
                    </View>
                  </View>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Ort</Text>
                  <TextInput value={location} onChangeText={setLocation} style={inputStyle} maxLength={200} editable={!busy} />
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Beschreibung</Text>
                  <TextInput
                    value={description} onChangeText={setDescription} style={[inputStyle, styles.multiline]}
                    multiline maxLength={3000} textAlignVertical="top" editable={!busy}
                  />
                </View>
              )}

              {phase === 'published' && (
                <Text style={[styles.note, { color: colors.success }]}>
                  Veröffentlicht. Die Veranstaltung steht jetzt unter {orgName} in der App.
                </Text>
              )}
              {phase === 'rejected' && (
                <Text style={[styles.note, { color: colors.textPrimary }]}>
                  Abgelehnt. Die Veranstaltung wird nicht eingestellt.
                </Text>
              )}
              {alreadyDecided && (
                <Text style={[styles.note, { color: colors.textPrimary }]}>
                  {request.status === 'rejected'
                    ? 'Diese Anfrage wurde abgelehnt.'
                    : 'Diese Veranstaltung ist bereits eingestellt.'}
                </Text>
              )}
              {decidable && (
                <Text style={[styles.hint, { color: colors.textTertiary }]}>
                  Ohne Antwort innerhalb von zwei Tagen stellt das Röbel-Team die Veranstaltung unter seinem eigenen Konto ein.
                </Text>
              )}
              {message && <Text style={[styles.note, { color: colors.error }]}>{message}</Text>}
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderTopColor: colors.border, backgroundColor: colors.background }]}>
          {decidable && (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={publish}
                disabled={busy}
                style={[styles.primary, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={[styles.primaryText, { color: colors.onPrimary }]}>
                  {busy ? 'Einen Moment …' : editing ? 'Mit Änderungen veröffentlichen' : 'Veröffentlichen'}
                </Text>
              </Pressable>
              <View style={styles.secondaryRow}>
                <Pressable accessibilityRole="button" onPress={() => { setEditing((v) => !v); setMessage(null); }} disabled={busy} style={styles.secondary}>
                  <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>{editing ? 'Vorschau' : 'Ändern'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={reject} disabled={busy} style={styles.secondary}>
                  <Text style={[styles.secondaryText, { color: colors.error }]}>Nicht unsere</Text>
                </Pressable>
              </View>
            </>
          )}
          {!decidable && (
            <>
              {eventId && (phase === 'published' || alreadyDecided) && request?.status !== 'rejected' && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace(`/event/${eventId}` as Href)}
                  style={[styles.primary, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Veranstaltung ansehen</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}>
                <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>Schließen</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },
  kicker: { fontFamily: fontFamily.semiBold, fontSize: 12, letterSpacing: 1.2 },
  heading: { fontFamily: fontFamily.heading, fontSize: 26, marginTop: 6 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22, marginTop: 10 },
  spinner: { marginTop: 32 },
  poster: { width: '100%', aspectRatio: 0.72, borderRadius: 12, marginTop: 18 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 18 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 19, lineHeight: 25 },
  meta: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 21, marginTop: 6 },
  description: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22, marginTop: 12 },
  form: { marginTop: 18 },
  label: { fontFamily: fontFamily.medium, fontSize: 13, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontFamily: fontFamily.regular, fontSize: 16 },
  multiline: { minHeight: 120 },
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1 },
  note: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 21, marginTop: 16 },
  hint: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, marginTop: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  primary: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
  secondary: { height: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fontFamily.medium, fontSize: 15 },
});
