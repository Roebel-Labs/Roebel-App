import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { createPost, createPoll, updatePost, PostingDeniedError } from '@/lib/supabase-posts';
import type { PostRecord } from '@/lib/types/feed';
import { supabase } from '@/lib/supabase';
import { uploadMediaFile } from '@/lib/upload-media';
import type { FeedType, PostCategory } from '@/lib/types/feed';
import { POST_CATEGORY_LABELS } from '@/lib/types/feed';
import type { UserRecord } from '@/lib/types';

import CanvasIcon from '@/assets/icons/canvas.svg';
import CheckIcon from '@/assets/icons/check.svg';

const MAX_CONTENT_LENGTH = 250;
const MAX_IMAGES = 4;
const MAX_POLL_OPTIONS = 4;

type Props = {
  visible: boolean;
  onClose: () => void;
  onPostCreated: () => void;
  feedType: FeedType;
  walletAddress: string;
  isCitizen: boolean;
  user: UserRecord | null;
  editingPost?: PostRecord;
  onPostUpdated?: (post: PostRecord) => void;
};

const CATEGORIES: PostCategory[] = [
  'generell',
  'frage',
  'empfehlungen',
  'verloren_gefunden',
  'hilfe_gebraucht',
  'im_angebot',
];

export default function PostComposer({
  visible,
  onClose,
  onPostCreated,
  feedType,
  walletAddress,
  isCitizen,
  user,
  editingPost,
  onPostUpdated,
}: Props) {
  const { colors } = useTheme();
  const { showSnackbar } = useSnackbar();
  const isEditMode = !!editingPost;
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PostCategory>('generell');
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Poll state
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollType, setPollType] = useState<'single' | 'multi'>('single');

  // Pre-populate fields when editing
  useEffect(() => {
    if (editingPost && visible) {
      setContent(editingPost.content);
      setCategory(editingPost.category);
      setImages(editingPost.media_urls?.filter(Boolean) || []);
    }
  }, [editingPost, visible]);

  const canPost = content.trim().length > 0 && !isSubmitting;
  const charCount = content.length;

  // Rathaus tab requires citizen status
  if (feedType === 'rathaus' && !isCitizen) {
    return null;
  }

  const handlePickImage = async () => {
    if (images.length >= MAX_IMAGES) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
    });

    if (!result.canceled) {
      const newUrls: string[] = [];
      for (const asset of result.assets) {
        try {
          const uploaded = await uploadImage(asset.uri, asset.mimeType || undefined);
          if (uploaded) newUrls.push(uploaded);
        } catch (err) {
          console.error('Error uploading image:', err);
        }
      }
      setImages((prev) => [...prev, ...newUrls].slice(0, MAX_IMAGES));
    }
  };

  const uploadImage = async (uri: string, mimeType?: string): Promise<string | null> => {
    return uploadMediaFile(uri, walletAddress || '', 'image', 'posts', mimeType);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const addPollOption = () => {
    if (pollOptions.length < MAX_POLL_OPTIONS) {
      setPollOptions((prev) => [...prev, '']);
    }
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!canPost) return;
    setIsSubmitting(true);

    try {
      if (isEditMode && editingPost) {
        // Edit mode — update existing post
        const updated = await updatePost(editingPost.id, {
          content: content.trim(),
          category,
        });

        if (!updated) {
          showSnackbar({ message: 'Beitrag konnte nicht aktualisiert werden' });
          return;
        }

        // Reset state
        setContent('');
        setCategory('generell');
        setImages([]);

        onPostUpdated?.(updated);
      } else {
        // Create mode
        const post = await createPost({
          wallet_address: walletAddress,
          content: content.trim(),
          category,
          feed_type: feedType,
          media_urls: images.length > 0 ? images : undefined,
        });

        if (!post) {
          showSnackbar({ message: 'Beitrag konnte nicht erstellt werden' });
          return;
        }

        // Create poll if options are filled
        if (showPollCreator) {
          const validOptions = pollOptions.filter((o) => o.trim().length > 0);
          if (validOptions.length >= 2) {
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            await createPoll({
              post_id: post.id,
              poll_type: pollType,
              options: validOptions,
              expires_at: expiresAt,
            });
          }
        }

        // Reset state
        setContent('');
        setCategory('generell');
        setImages([]);
        setShowPollCreator(false);
        setPollOptions(['', '']);

        onPostCreated();
      }
    } catch (err) {
      if (err instanceof PostingDeniedError) {
        const message =
          err.code === 'LOCATION_REQUIRED'
            ? 'Bitte bestätige kurz, dass du gerade in Röbel/Müritz bist.'
            : err.code === 'ACCOUNT_TOO_YOUNG'
            ? 'Posten ist erst 24 Stunden nach Account-Erstellung möglich.'
            : err.code === 'RATE_LIMIT_DAY'
            ? 'Du hast dein Tageslimit erreicht.'
            : err.code === 'RATE_LIMIT_WEEK'
            ? 'Du hast dein Wochenlimit erreicht.'
            : 'Beitrag konnte nicht erstellt werden.';
        showSnackbar({ message });
        return;
      }
      console.error('Error saving post:', err);
      showSnackbar({ message: isEditMode ? 'Beitrag konnte nicht aktualisiert werden' : 'Beitrag konnte nicht erstellt werden' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (content.trim() || images.length > 0) {
      Alert.alert('Verwerfen?', 'Dein Beitrag wird nicht gespeichert.', [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verwerfen',
          style: 'destructive',
          onPress: () => {
            setContent('');
            setImages([]);
            setShowPollCreator(false);
            setPollOptions(['', '']);
            onClose();
          },
        },
      ]);
    } else {
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable onPress={handleClose}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Abbrechen</Text>
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {isEditMode ? 'Beitrag bearbeiten' : feedType === 'rathaus' ? 'Stadt-Beitrag' : 'Neuer Beitrag'}
            </Text>
            <Pressable
              onPress={handleSubmit}
              disabled={!canPost}
              style={[
                styles.submitButton,
                { backgroundColor: canPost ? colors.primary : colors.disabled },
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text
                  style={[
                    styles.submitText,
                    { color: canPost ? colors.onPrimary : colors.disabledText },
                  ]}
                >
                  {isEditMode ? 'Speichern' : 'Posten'}
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled">
            {/* Author info */}
            <View style={styles.authorRow}>
              <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {user?.username?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>
                {user?.username || 'Unbekannt'}
              </Text>
            </View>

            {/* Category chips (main feed only) */}
            {feedType === 'main' && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
                contentContainerStyle={styles.categoryContent}
              >
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: category === cat ? colors.primary : colors.surface,
                        borderColor: category === cat ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        { color: category === cat ? colors.onPrimary : colors.textSecondary },
                      ]}
                    >
                      {POST_CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {/* Text input */}
            <TextInput
              style={[styles.textInput, { color: colors.textPrimary }]}
              placeholder="Was möchtest du teilen?"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={MAX_CONTENT_LENGTH}
              value={content}
              onChangeText={setContent}
              autoFocus
            />

            {/* Character counter */}
            <Text
              style={[
                styles.charCount,
                {
                  color:
                    charCount > MAX_CONTENT_LENGTH - 20 ? colors.error : colors.textTertiary,
                },
              ]}
            >
              {charCount}/{MAX_CONTENT_LENGTH}
            </Text>

            {/* Image previews */}
            {images.length > 0 && (
              <View style={styles.imagePreviewGrid}>
                {images.map((uri, i) => (
                  <View key={i} style={styles.imagePreviewContainer}>
                    <Image source={{ uri }} style={styles.imagePreview} contentFit="cover" />
                    <Pressable
                      onPress={() => removeImage(i)}
                      style={[styles.removeImageBtn, { backgroundColor: colors.error }]}
                    >
                      <Text style={styles.removeImageText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Poll creator */}
            {showPollCreator && (
              <View style={[styles.pollSection, { borderColor: colors.border }]}>
                <View style={styles.pollHeader}>
                  <Text style={[styles.pollTitle, { color: colors.textPrimary }]}>Umfrage</Text>
                  <Pressable onPress={() => setShowPollCreator(false)}>
                    <Text style={[styles.pollRemove, { color: colors.error }]}>Entfernen</Text>
                  </Pressable>
                </View>

                {pollOptions.map((option, i) => (
                  <View key={i} style={styles.pollOptionRow}>
                    <TextInput
                      style={[
                        styles.pollInput,
                        { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface },
                      ]}
                      placeholder={`Option ${i + 1}`}
                      placeholderTextColor={colors.textTertiary}
                      value={option}
                      onChangeText={(val) => updatePollOption(i, val)}
                      maxLength={60}
                    />
                    {pollOptions.length > 2 && (
                      <Pressable onPress={() => removePollOption(i)}>
                        <Text style={[styles.pollRemoveOption, { color: colors.textTertiary }]}>
                          ✕
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                {pollOptions.length < MAX_POLL_OPTIONS && (
                  <Pressable onPress={addPollOption}>
                    <Text style={[styles.addOptionText, { color: colors.primary }]}>
                      + Option hinzufügen
                    </Text>
                  </Pressable>
                )}

                <View style={styles.pollTypeRow}>
                  <Pressable
                    onPress={() => setPollType('single')}
                    style={[
                      styles.pollTypeBtn,
                      {
                        backgroundColor:
                          pollType === 'single' ? colors.primaryLight : colors.surface,
                        borderColor: pollType === 'single' ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: pollType === 'single' ? colors.primary : colors.textSecondary,
                        fontSize: 12,
                        fontFamily: 'Inter-Medium',
                      }}
                    >
                      Einzelwahl
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPollType('multi')}
                    style={[
                      styles.pollTypeBtn,
                      {
                        backgroundColor:
                          pollType === 'multi' ? colors.primaryLight : colors.surface,
                        borderColor: pollType === 'multi' ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: pollType === 'multi' ? colors.primary : colors.textSecondary,
                        fontSize: 12,
                        fontFamily: 'Inter-Medium',
                      }}
                    >
                      Mehrfachwahl
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Toolbar — hidden in edit mode */}
          {!isEditMode && (
            <View style={[styles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <Pressable onPress={handlePickImage} style={styles.toolbarBtn} disabled={images.length >= MAX_IMAGES}>
                <CanvasIcon
                  width={22}
                  height={22}
                  color={images.length >= MAX_IMAGES ? colors.disabled : colors.textSecondary}
                />
              </Pressable>
              <Pressable
                onPress={() => setShowPollCreator(!showPollCreator)}
                style={styles.toolbarBtn}
              >
                <CheckIcon
                  width={22}
                  height={22}
                  color={showPollCreator ? colors.disabled : colors.textSecondary}
                />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  submitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  authorName: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  categoryScroll: {
    maxHeight: 40,
    marginTop: 4,
  },
  categoryContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  textInput: {
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 24,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
    paddingHorizontal: 16,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  imagePreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  imagePreviewContainer: {
    position: 'relative',
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  pollSection: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  pollHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pollTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  pollRemove: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  pollOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pollInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  pollRemoveOption: {
    fontSize: 18,
    paddingHorizontal: 4,
  },
  addOptionText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  pollTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  pollTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  toolbarBtn: {
    padding: 8,
  },
});
