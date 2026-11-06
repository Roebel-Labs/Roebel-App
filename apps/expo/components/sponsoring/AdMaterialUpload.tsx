import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { MAX_IMAGE_BYTES, sendAdMaterialToChat, SPONSORING_CONTACT_NAME, uploadSponsoringMedia } from '@/lib/sponsoring';

const MAX_PICTURES = 6;

type Picked = { uri: string; mimeType?: string | null };

type Props = { myAccountId: string; orgName: string };

/**
 * Own pictures for a custom spot (logo, products, team, venue). They are uploaded to our storage
 * and sent to Max as a chat message; he then gets in touch to agree on the spot.
 */
export default function AdMaterialUpload({ myAccountId, orgName }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Kein Zugriff auf Fotos', 'Bitte erlaubt den Zugriff auf eure Fotos in den Einstellungen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PICTURES - picked.length,
      quality: 0.9,
    });
    if (result.canceled || !result.assets.length) return;
    const tooBig = result.assets.filter((a) => (a.fileSize ?? 0) > MAX_IMAGE_BYTES).length;
    const ok = result.assets.filter((a) => (a.fileSize ?? 0) <= MAX_IMAGE_BYTES).map((a) => ({ uri: a.uri, mimeType: a.mimeType }));
    if (tooBig) Alert.alert('Bild zu groß', 'Bilder dürfen höchstens 10 MB groß sein.');
    setPicked((cur) => [...cur, ...ok].slice(0, MAX_PICTURES));
    setSentTo(null);
  };

  const remove = (uri: string) => setPicked((cur) => cur.filter((p) => p.uri !== uri));

  const send = async () => {
    if (!picked.length || sending) return;
    setSending(true);
    try {
      const urls: string[] = [];
      for (const p of picked) {
        const url = await uploadSponsoringMedia(p, 'image', '');
        if (url) urls.push(url);
      }
      if (!urls.length) {
        Alert.alert('Hochladen fehlgeschlagen', 'Bitte versucht es gleich noch einmal.');
        return;
      }
      const conversationId = await sendAdMaterialToChat(myAccountId, orgName, urls, note);
      if (!conversationId) {
        Alert.alert('Senden fehlgeschlagen', 'Die Bilder sind hochgeladen, aber die Nachricht ging nicht raus. Bitte versucht es noch einmal.');
        return;
      }
      setPicked([]);
      setNote('');
      setSentTo(conversationId);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.box, { borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Eigene Bilder für eure Werbung</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Logo, Produkte, Team oder Laden: Ladet bis zu {MAX_PICTURES} Bilder hoch. {SPONSORING_CONTACT_NAME} meldet sich danach bei euch, um eure Werbung gemeinsam anzupassen – ihr bekommt den fertigen Spot vor dem Stream zur Freigabe.
      </Text>

      {picked.length ? (
        <View style={styles.grid}>
          {picked.map((p) => (
            <View key={p.uri} style={styles.thumbWrap}>
              <Image source={{ uri: p.uri }} style={[styles.thumb, { backgroundColor: colors.surface }]} contentFit="cover" />
              <Pressable onPress={() => remove(p.uri)} style={styles.remove} hitSlop={6} accessibilityRole="button" accessibilityLabel="Bild entfernen">
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {picked.length < MAX_PICTURES ? (
        <Pressable onPress={pick} disabled={sending} style={[styles.dropzone, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
          accessibilityRole="button" accessibilityLabel="Bilder auswählen">
          <Text style={[styles.dropzoneText, { color: colors.primary }]}>{picked.length ? '+ Weitere Bilder' : '+ Bilder auswählen'}</Text>
        </Pressable>
      ) : null}

      {picked.length ? (
        <>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Wünsche zur Werbung (optional), z. B. Text, Angebot, Farben"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
          />
          <Pressable onPress={send} disabled={sending} style={[styles.send, { backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 }]}
            accessibilityRole="button">
            {sending ? <ActivityIndicator color={colors.onPrimary} /> : (
              <Text style={[styles.sendText, { color: colors.onPrimary }]}>
                {picked.length === 1 ? 'Bild' : `${picked.length} Bilder`} an {SPONSORING_CONTACT_NAME} senden
              </Text>
            )}
          </Pressable>
        </>
      ) : null}

      {sentTo ? (
        <View style={[styles.sent, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.body, { color: colors.textPrimary }]}>
            Danke! Eure Bilder sind bei {SPONSORING_CONTACT_NAME}. Wir melden uns bei euch, um eure Werbung abzustimmen.
          </Text>
          <Pressable onPress={() => router.push(`/messages/${sentTo}` as any)} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.primary }]}>Zum Chat</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  title: { fontFamily: fontFamily.heading, fontSize: 19 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { width: 76, height: 76 },
  thumb: { width: 76, height: 76, borderRadius: 10 },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#FFFFFF', fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 17 },
  dropzone: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 18, alignItems: 'center' },
  dropzoneText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 64, fontFamily: fontFamily.regular, fontSize: 14, textAlignVertical: 'top' },
  send: { borderRadius: 999, paddingVertical: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  sendText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  sent: { borderRadius: 10, padding: 12, gap: 6 },
  link: { fontFamily: fontFamily.semiBold, fontSize: 14 },
});
