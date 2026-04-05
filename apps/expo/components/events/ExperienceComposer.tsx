import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useSnackbar } from '@/context/SnackbarContext';
import BottomDrawer from '@/components/BottomDrawer';
import { uploadMediaFile } from '@/lib/upload-media';
import { createExperience } from '@/lib/supabase-experiences';

const MAX_IMAGES = 4;
const MAX_CONTENT_LENGTH = 500;

const CURATED_EMOJIS = ['😍', '🎉', '🔥', '😊', '👏', '🎶', '⭐', '🥳'];

type Props = {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  walletAddress: string;
  onExperienceCreated: () => void;
};

export default function ExperienceComposer({
  visible,
  onClose,
  eventId,
  walletAddress,
  onExperienceCreated,
}: Props) {
  const { colors } = useTheme();
  const { showSnackbar } = useSnackbar();

  const [content, setContent] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = content.trim().length > 0 && !isUploading && !isSubmitting;

  const handleEmojiToggle = (emoji: string) => {
    setSelectedEmoji((prev) => (prev === emoji ? null : emoji));
  };

  const handlePickImages = async () => {
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });

    if (result.canceled) return;

    setIsUploading(true);
    const newUrls: string[] = [];
    for (const asset of result.assets) {
      const url = await uploadMediaFile(asset.uri, walletAddress, 'image', 'experiences');
      if (url) newUrls.push(url);
    }
    setImages((prev) => [...prev, ...newUrls].slice(0, MAX_IMAGES));
    setIsUploading(false);
  };

  const handlePickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (result.canceled) return;

    setIsUploading(true);
    const url = await uploadMediaFile(result.assets[0].uri, walletAddress, 'video', 'experiences');
    setVideoUrl(url);
    setIsUploading(false);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveVideo = () => {
    setVideoUrl(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    const result = await createExperience({
      event_id: eventId,
      wallet_address: walletAddress,
      content: content.trim(),
      media_urls: images.length > 0 ? images : undefined,
      video_url: videoUrl || undefined,
      emoji: selectedEmoji || undefined,
    });

    setIsSubmitting(false);

    if (result) {
      setContent('');
      setSelectedEmoji(null);
      setImages([]);
      setVideoUrl(null);
      onClose();
      onExperienceCreated();
      showSnackbar({ message: 'Erlebnis geteilt', duration: 3000 });
    } else {
      showSnackbar({ message: 'Fehler beim Teilen', duration: 3000 });
    }
  };

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.75}>
      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>Erlebnis teilen</Text>

        {/* Emoji Picker Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
          {CURATED_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => handleEmojiToggle(emoji)}
              style={[
                styles.emojiButton,
                selectedEmoji === emoji && { backgroundColor: colors.primaryLight },
              ]}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Text Input */}
        <View style={[styles.inputContainer, { borderColor: colors.border }]}>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Wie war dein Erlebnis?"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_CONTENT_LENGTH}
            style={[styles.textInput, { color: colors.textPrimary }]}
          />
          <Text style={[styles.charCount, { color: colors.textTertiary }]}>
            {content.length}/{MAX_CONTENT_LENGTH}
          </Text>
        </View>

        {/* Media Toolbar */}
        <View style={styles.mediaToolbar}>
          <Pressable
            onPress={handlePickImages}
            disabled={images.length >= MAX_IMAGES || isUploading}
            style={[styles.mediaButton, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Ionicons name="image-outline" size={20} color={images.length >= MAX_IMAGES ? colors.disabled : colors.textSecondary} />
            <Text style={[styles.mediaButtonText, { color: images.length >= MAX_IMAGES ? colors.disabled : colors.textSecondary }]}>
              Bilder {images.length > 0 ? `(${images.length}/${MAX_IMAGES})` : ''}
            </Text>
          </Pressable>

          <Pressable
            onPress={handlePickVideo}
            disabled={!!videoUrl || isUploading}
            style={[styles.mediaButton, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Ionicons name="videocam-outline" size={20} color={videoUrl ? colors.disabled : colors.textSecondary} />
            <Text style={[styles.mediaButtonText, { color: videoUrl ? colors.disabled : colors.textSecondary }]}>
              Video
            </Text>
          </Pressable>
        </View>

        {/* Upload indicator */}
        {isUploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>Wird hochgeladen...</Text>
          </View>
        )}

        {/* Image Previews */}
        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewRow}>
            {images.map((uri, i) => (
              <View key={i} style={styles.previewItem}>
                <Image source={{ uri }} style={styles.previewImage} />
                <Pressable onPress={() => handleRemoveImage(i)} style={styles.removeButton}>
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Video Preview */}
        {videoUrl && (
          <View style={[styles.videoPreview, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="videocam" size={20} color={colors.textSecondary} />
            <Text style={[styles.videoPreviewText, { color: colors.textSecondary }]} numberOfLines={1}>
              Video hinzugefügt
            </Text>
            <Pressable onPress={handleRemoveVideo} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.error} />
            </Pressable>
          </View>
        )}

        {/* Submit Button */}
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[
            styles.submitButton,
            { backgroundColor: canSubmit ? colors.primary : colors.disabled },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.submitText}>Teilen</Text>
          )}
        </Pressable>
      </ScrollView>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 16,
  },
  emojiRow: {
    marginBottom: 16,
  },
  emojiButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  emojiText: {
    fontSize: 24,
  },
  inputContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    minHeight: 100,
  },
  textInput: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textAlign: 'right',
    marginTop: 4,
  },
  mediaToolbar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mediaButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  uploadingText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  previewRow: {
    marginBottom: 12,
  },
  previewItem: {
    position: 'relative',
    marginRight: 8,
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  videoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  videoPreviewText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  submitButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});
