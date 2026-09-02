/**
 * "Deine Erfahrung teilen" — a photo and a line about the place, posted by a
 * visitor rather than the owner.
 *
 * Shown under the comment thread, with the existing experiences listed beneath
 * it. Photos upload as they are picked so the user sees progress before they
 * commit the text.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { uploadMediaFile } from '@/lib/upload-media';
import { EXPERIENCE_MAX_LENGTH } from '@/lib/supabase-account-experiences';
import { formatRelativeTimestamp } from '@/lib/utils';
import type { AccountExperience } from '@/lib/types';

type Props = {
  experiences: AccountExperience[];
  myWallet: string | null;
  onSubmit: (content: string, mediaUrls: string[]) => Promise<boolean>;
};

export default function OrgExperienceComposer({ experiences, myWallet, onSubmit }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;

    setUploading(true);
    try {
      for (const asset of result.assets) {
        const url = await uploadMediaFile(
          asset.uri,
          myWallet ?? '',
          'image',
          'org-experiences',
          asset.mimeType
        );
        if (url) setMediaUrls((prev) => [...prev, url]);
      }
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (sending || (!text.trim() && !mediaUrls.length)) return;
    setSending(true);
    const ok = await onSubmit(text, mediaUrls);
    setSending(false);
    if (ok) {
      setText('');
      setMediaUrls([]);
    }
  };

  const canSend = !!text.trim() || mediaUrls.length > 0;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>ERFAHRUNGEN</Text>

      {myWallet ? (
        <View style={[styles.composer, { borderColor: colors.border }]}>
          <BottomSheetTextInput
            value={text}
            onChangeText={setText}
            placeholder="Wie war es bei euch?"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary }]}
            multiline
            maxLength={EXPERIENCE_MAX_LENGTH}
            accessibilityLabel="Erfahrung schreiben"
          />

          {mediaUrls.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
              {mediaUrls.map((url) => (
                <Pressable
                  key={url}
                  onPress={() => setMediaUrls((prev) => prev.filter((u) => u !== url))}
                  accessibilityLabel="Foto entfernen"
                >
                  <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.composerActions}>
            <Pressable onPress={pickPhotos} disabled={uploading} hitSlop={8} accessibilityLabel="Foto hinzufügen">
              {uploading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={[styles.photoAction, { color: colors.textSecondary }]}>📷 Foto</Text>
              )}
            </Pressable>
            <Pressable onPress={submit} disabled={!canSend || sending} hitSlop={8}>
              <Text
                style={[
                  styles.sendLabel,
                  { color: canSend ? colors.primary : colors.textTertiary },
                ]}
              >
                {sending ? '…' : 'Teilen'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {experiences.map((experience) => (
        <View key={experience.id} style={styles.entry}>
          <Text style={[styles.entryHead, { color: colors.textTertiary }]}>
            {experience.author?.username || 'Anonym'} · {formatRelativeTimestamp(experience.created_at)}
          </Text>
          {experience.content ? (
            <Text style={[styles.entryBody, { color: colors.textPrimary }]}>{experience.content}</Text>
          ) : null}
          {experience.media_urls?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
              {experience.media_urls.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.entryPhoto} contentFit="cover" />
              ))}
            </ScrollView>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingHorizontal: 16 },
  title: { fontFamily: fontFamily.bold, fontSize: 13, letterSpacing: 0.4 },
  composer: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  input: { fontFamily: fontFamily.regular, fontSize: 15, minHeight: 40, maxHeight: 120 },
  composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoAction: { fontFamily: fontFamily.medium, fontSize: 14 },
  sendLabel: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  thumbRow: { gap: 8 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  entry: { gap: 6 },
  entryHead: { fontFamily: fontFamily.regular, fontSize: 13 },
  entryBody: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  entryPhoto: { width: 140, height: 140, borderRadius: 12 },
});
