/**
 * Event create/edit: section "Abzeichen für Teilnehmende" (spec 5.6b). Controlled: the screen
 * keeps the BadgeSetupForm and, after the event itself was saved, sends event_badge_setup.
 * The picture defaults to the event poster; a different one is uploaded when picked.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { uploadBadgeArt } from '@/lib/credreg/badge-art';
import { defaultBadgeName, SETUP_LABELS, type BadgeSetupForm } from '@/lib/credreg/event-page';

export default function EventBadgeSetupSection({
  value,
  onChange,
  eventTitle,
  posterUri,
}: {
  value: BadgeSetupForm;
  onChange: (next: BadgeSetupForm) => void;
  eventTitle: string;
  /** The poster as currently chosen in the form (local or remote), for the preview. */
  posterUri: string | null;
}) {
  const { colors } = useTheme();
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<BadgeSetupForm>) => onChange({ ...value, ...patch });

  const pickArt = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlaube den Zugriff auf deine Fotobibliothek.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    const url = await uploadBadgeArt(res.assets[0].uri);
    setUploading(false);
    if (!url) {
      Alert.alert('Bild', 'Das Bild konnte nicht hochgeladen werden. Bitte versuche es noch einmal.');
      return;
    }
    set({ artUrl: url });
  };

  const preview = value.artUrl ?? posterUri;
  const inputStyle = [styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }];

  return (
    <View style={[styles.card, { borderColor: colors.borderSecondary }]}>
      <View style={styles.headRow}>
        <View style={styles.headText}>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>{SETUP_LABELS.heading}</Text>
          <Text style={[styles.help, { color: colors.textSecondary }]}>{SETUP_LABELS.help}</Text>
        </View>
        <Switch
          value={value.enabled}
          onValueChange={(enabled) => set({ enabled })}
          trackColor={{ false: colors.borderSecondary, true: colors.primary }}
          accessibilityLabel={SETUP_LABELS.heading}
        />
      </View>

      {value.enabled ? (
        <>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{SETUP_LABELS.name}</Text>
          <TextInput
            style={inputStyle}
            value={value.name}
            onChangeText={(name) => set({ name })}
            placeholder={defaultBadgeName(eventTitle || 'Titel')}
            placeholderTextColor={colors.textTertiary}
            maxLength={60}
          />

          <Text style={[styles.label, { color: colors.textPrimary }]}>{SETUP_LABELS.art}</Text>
          <View style={styles.artRow}>
            {preview ? (
              <Image source={{ uri: preview }} style={styles.art} contentFit="cover" />
            ) : (
              <View style={[styles.art, { backgroundColor: colors.primary }]} />
            )}
            <View style={styles.artActions}>
              <Text style={[styles.help, { color: colors.textSecondary }]}>{value.artUrl ? '' : SETUP_LABELS.artPoster}</Text>
              <Pressable onPress={pickArt} disabled={uploading} accessibilityRole="button" hitSlop={6}>
                {uploading ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.link, { color: colors.primary }]}>{SETUP_LABELS.artChange}</Text>}
              </Pressable>
              {value.artUrl ? (
                <Pressable onPress={() => set({ artUrl: null })} accessibilityRole="button" hitSlop={6}>
                  <Text style={[styles.link, { color: colors.primary }]}>{SETUP_LABELS.artUsePoster}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Text style={[styles.label, { color: colors.textPrimary }]}>{SETUP_LABELS.limit}</Text>
          <TextInput
            style={inputStyle}
            value={value.limit}
            onChangeText={(limit) => set({ limit })}
            placeholder={SETUP_LABELS.limitPlaceholder}
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
          />
        </>
      ) : null}
    </View>
  );
}

const ART = 64;
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, marginBottom: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 2 },
  heading: { fontSize: 16, fontFamily: fontFamily.semiBold },
  help: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.regular },
  label: { fontSize: 14, fontFamily: fontFamily.medium, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: fontFamily.regular },
  artRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  art: { width: ART, height: ART, borderRadius: ART / 2 },
  artActions: { flex: 1, gap: 6 },
  link: { fontSize: 14, fontFamily: fontFamily.semiBold },
});
