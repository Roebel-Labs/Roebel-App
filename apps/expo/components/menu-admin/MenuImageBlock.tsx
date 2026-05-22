import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, TextInput, Alert } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/context/ThemeContext';
import { useActiveAccount } from 'thirdweb/react';
import { uploadMediaFile } from '@/lib/upload-media';
import { regenerateMenuItemImage } from '@/lib/generate-menu-image-client';

type Props = {
  menuItemId: string | null;
  restaurantId: string;
  imageUrl: string | null;
  onChange: (url: string | null) => void;
};

export default function MenuImageBlock({ menuItemId, restaurantId, imageUrl, onChange }: Props) {
  const { colors } = useTheme();
  const wallet = useActiveAccount()?.address ?? '';
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [promptHint, setPromptHint] = useState('');

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlaube den Zugriff auf deine Fotos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.length) return;
    setUploading(true);
    const url = await uploadMediaFile(
      res.assets[0].uri,
      wallet,
      'image',
      `menu-items/${restaurantId}`,
      res.assets[0].mimeType,
    );
    setUploading(false);
    if (!url) {
      Alert.alert('Upload fehlgeschlagen', 'Bitte versuche es erneut.');
      return;
    }
    onChange(url);
  }

  async function generateAI() {
    if (!menuItemId) {
      Alert.alert('Zuerst speichern', 'Bitte speichere das Gericht erst, danach kann ein KI-Bild generiert werden.');
      return;
    }
    setGenerating(true);
    const result = await regenerateMenuItemImage({
      menu_item_id: menuItemId,
      prompt_hint: promptHint.trim() || undefined,
    });
    setGenerating(false);
    if (!result.ok) {
      const code = (result as any).code ?? 'UNKNOWN';
      Alert.alert('Generierung fehlgeschlagen', `Code: ${code}\n${(result as any).error ?? ''}`);
      return;
    }
    if ('image_url' in result && result.image_url) {
      onChange(result.image_url);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>Bild</Text>
      <View style={[styles.previewWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderSecondary }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.preview} contentFit="cover" />
        ) : (
          <Text style={[styles.placeholder, { color: colors.textTertiary }]}>Kein Bild</Text>
        )}
        {(uploading || generating) && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.overlayText}>
              {uploading ? 'Wird hochgeladen…' : 'KI generiert (10–30 s)…'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={pickAndUpload}
          disabled={uploading || generating}
          style={[styles.btn, { borderColor: colors.borderSecondary, opacity: uploading || generating ? 0.5 : 1 }]}
        >
          <Text style={{ color: colors.textPrimary, fontFamily: 'Inter-Medium' }}>
            {imageUrl ? 'Eigenes Bild ersetzen' : 'Eigenes Bild hochladen'}
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={promptHint}
        onChangeText={setPromptHint}
        placeholder="Optional: KI-Stil-Hinweis (z. B. extra knusprig)"
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
      />

      <Pressable
        onPress={generateAI}
        disabled={uploading || generating}
        style={[
          styles.btnPrimary,
          { backgroundColor: colors.primary, opacity: uploading || generating ? 0.5 : 1 },
        ]}
      >
        <Text style={{ color: '#fff', fontFamily: 'Inter-Medium' }}>
          {imageUrl ? 'KI-Bild neu generieren' : 'KI-Bild generieren'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 8, paddingBottom: 12, gap: 10 },
  label: { fontSize: 14, fontFamily: 'Inter-Medium' },
  previewWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { width: '100%', height: '100%' },
  placeholder: { fontSize: 14, fontFamily: 'Inter-Regular' },
  overlay: {
    position: 'absolute',
    inset: 0 as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 13 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnPrimary: {
    paddingVertical: 12,
    borderRadius: 9999,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
});
