import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import { uploadMediaFile } from '@/lib/upload-media';
import {
  createBlogArticle,
  updateBlogArticle,
  getBlogArticleById,
  plainTextToHtml,
  htmlToPlainText,
} from '@/lib/supabase-blog-articles';
import { canPublishBlog } from '@/lib/types';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

type Props = {
  /** When set, this composer edits an existing article. Otherwise creates new. */
  articleId?: string;
};

export default function BlogComposer({ articleId }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const { user } = useUser();
  const wallet = user?.wallet_address;
  const canWrite = canPublishBlog(activeAccount);

  const [loading, setLoading] = useState(!!articleId);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [category, setCategory] = useState('');

  // Load existing article if editing
  useEffect(() => {
    if (!articleId) return;
    getBlogArticleById(articleId).then((a) => {
      if (a && a.account_id === activeAccount?.id) {
        setTitle(a.title);
        setExcerpt(a.excerpt ?? '');
        setBody(htmlToPlainText(a.content));
        setCoverUrl(a.cover_image_url);
        setCategory(a.category ?? '');
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const pickCover = async () => {
    if (!wallet) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Berechtigung erforderlich', 'Erlaube den Zugriff auf deine Fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    const url = await uploadMediaFile(
      result.assets[0].uri,
      wallet,
      'image',
      'blog',
      result.assets[0].mimeType,
      'blog-images'
    );
    setUploading(false);
    if (!url) {
      Alert.alert('Fehler', 'Bild konnte nicht hochgeladen werden.');
      return;
    }
    setCoverUrl(url);
  };

  const submit = async (status: 'draft' | 'published') => {
    if (!activeAccount || !wallet) return;
    if (!title.trim() || !body.trim()) {
      Alert.alert('Pflichtfelder', 'Titel und Inhalt sind erforderlich.');
      return;
    }
    if (status === 'published' && !canWrite) {
      Alert.alert('Nicht freigegeben', 'Externes Konto wartet auf Freigabe.');
      return;
    }

    setSubmitting(true);
    const html = plainTextToHtml(body.trim());
    const payload = {
      account_id: activeAccount.id,
      wallet_address: wallet,
      author_account_id: activeAccount.id,
      title: title.trim(),
      excerpt: excerpt.trim() || null,
      content: html,
      cover_image_url: coverUrl,
      category: category.trim() || null,
      tags: [] as string[],
      status,
    };

    const res = articleId
      ? await updateBlogArticle(articleId, payload)
      : await createBlogArticle(payload);

    setSubmitting(false);

    if (res.success) {
      router.back();
    } else {
      Alert.alert('Fehler', res.error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {articleId ? 'Artikel bearbeiten' : 'Neuer Artikel'}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Titel *</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="z. B. Saisoneröffnung 2026"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              borderColor: colors.border,
            },
          ]}
        />

        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>
          Kurzbeschreibung
        </Text>
        <TextInput
          value={excerpt}
          onChangeText={setExcerpt}
          placeholder="Eine kurze Zusammenfassung (optional)"
          placeholderTextColor={colors.textTertiary}
          multiline
          style={[
            styles.inputMulti,
            {
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              borderColor: colors.border,
            },
          ]}
        />

        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>
          Titelbild
        </Text>
        {coverUrl ? (
          <View style={styles.coverWrap}>
            <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" />
            <Pressable
              onPress={() => setCoverUrl(null)}
              style={[styles.coverRemove, { backgroundColor: colors.background }]}
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={pickCover}
            disabled={uploading}
            style={[
              styles.coverPicker,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="image-outline" size={28} color={colors.textTertiary} />
                <Text style={[styles.coverPickerText, { color: colors.textSecondary }]}>
                  Titelbild auswählen
                </Text>
              </>
            )}
          </Pressable>
        )}

        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>
          Kategorie (optional)
        </Text>
        <TextInput
          value={category}
          onChangeText={setCategory}
          placeholder="z. B. Lokales, Kultur"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              borderColor: colors.border,
            },
          ]}
        />

        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>
          Inhalt *
        </Text>
        <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
          Tipp: Leerzeile zwischen zwei Absätzen erzeugt einen neuen Block. Für reichhaltige Formatierung (Bilder im Text, Listen, Überschriften) nutze die Web-App.
        </Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Schreibe deinen Artikel…"
          placeholderTextColor={colors.textTertiary}
          multiline
          textAlignVertical="top"
          style={[
            styles.bodyInput,
            {
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              borderColor: colors.border,
            },
          ]}
        />

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => submit('draft')}
            disabled={submitting || !title.trim() || !body.trim()}
            style={[
              styles.btnSecondary,
              {
                borderColor: colors.border,
                opacity: submitting || !title.trim() || !body.trim() ? 0.5 : 1,
              },
            ]}
          >
            <Text style={[styles.btnSecondaryText, { color: colors.textPrimary }]}>
              Als Entwurf speichern
            </Text>
          </Pressable>
          <Pressable
            onPress={() => submit('published')}
            disabled={submitting || !canWrite || !title.trim() || !body.trim()}
            style={[
              styles.btnPrimary,
              {
                backgroundColor: colors.primary,
                opacity: submitting || !canWrite || !title.trim() || !body.trim() ? 0.5 : 1,
              },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.btnPrimaryText, { color: colors.onPrimary }]}>
                Veröffentlichen
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'MonaSansSemiCondensed-Medium'},
  scroll: { padding: 16, paddingBottom: 80 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  fieldHint: { fontSize: 11, fontFamily: 'Inter-Regular', marginBottom: 6 },
  input: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputMulti: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  bodyInput: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Inter-Regular',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 240,
    textAlignVertical: 'top',
  },
  coverPicker: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderStyle: 'dashed',
  },
  coverPickerText: { fontSize: 13, fontFamily: 'Inter-Regular' },
  coverWrap: { position: 'relative' },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12 },
  coverRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  btnSecondaryText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold'},
  btnPrimary: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  btnPrimaryText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold'},
});
