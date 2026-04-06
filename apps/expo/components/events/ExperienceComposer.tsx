import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
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
  const { activeAccount } = useAccount();
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
      const url = await uploadMediaFile(asset.uri, walletAddress, 'image', 'experiences', asset.mimeType || undefined);
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
    const url = await uploadMediaFile(result.assets[0].uri, walletAddress, 'video', 'experiences', result.assets[0].mimeType || undefined);
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
      account_id: activeAccount?.id,
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
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.55}>
      <View style={styles.container}>
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

        {/* Image/Video Previews */}
        {(images.length > 0 || videoUrl) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewRow}>
            {images.map((uri, i) => (
              <View key={i} style={styles.previewItem}>
                <Image source={{ uri }} style={styles.previewImage} />
                <Pressable onPress={() => handleRemoveImage(i)} style={styles.removeButton}>
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                </Pressable>
              </View>
            ))}
            {videoUrl && (
              <View style={[styles.videoChip, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="videocam" size={16} color={colors.textSecondary} />
                <Text style={[styles.videoChipText, { color: colors.textSecondary }]}>Video</Text>
                <Pressable onPress={handleRemoveVideo} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.error} />
                </Pressable>
              </View>
            )}
          </ScrollView>
        )}

        {/* Upload indicator */}
        {isUploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>Wird hochgeladen...</Text>
          </View>
        )}

        {/* Input area — same pattern as AI event submission */}
        <View style={styles.inputArea}>
          {/* Media buttons row (like ImageUploadButton in AI chat) */}
          <View style={styles.mediaRow}>
            <TouchableOpacity
              onPress={handlePickImages}
              disabled={images.length >= MAX_IMAGES || isUploading}
              style={[
                styles.mediaChip,
                { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                (images.length >= MAX_IMAGES || isUploading) && { opacity: 0.5 },
              ]}
            >
              <Ionicons name="image-outline" size={18} color={colors.primary} />
              <Text style={[styles.mediaChipText, { color: colors.primary }]}>
                {images.length > 0 ? `Bilder (${images.length}/${MAX_IMAGES})` : 'Bild'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePickVideo}
              disabled={!!videoUrl || isUploading}
              style={[
                styles.mediaChip,
                { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                (!!videoUrl || isUploading) && { opacity: 0.5 },
              ]}
            >
              <Ionicons name="videocam-outline" size={18} color={colors.primary} />
              <Text style={[styles.mediaChipText, { color: colors.primary }]}>Video</Text>
            </TouchableOpacity>
          </View>

          {/* Text input + send button row (matching AI chat layout) */}
          <View style={styles.inputRow}>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Wie war dein Erlebnis?"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={MAX_CONTENT_LENGTH}
              style={[styles.textInput, {
                backgroundColor: colors.pressedOverlay,
                borderColor: colors.borderSecondary,
                color: colors.textPrimary,
              }]}
            />
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[
                styles.sendButton,
                { backgroundColor: colors.primary },
                !canSubmit && styles.sendButtonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="send" size={18} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
  },
  emojiRow: {
    marginBottom: 12,
    flexGrow: 0,
  },
  emojiButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  emojiText: {
    fontSize: 22,
  },
  previewRow: {
    marginBottom: 8,
    flexGrow: 0,
  },
  previewItem: {
    position: 'relative',
    marginRight: 8,
  },
  previewImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  videoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  videoChipText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  uploadingText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  inputArea: {
    gap: 8,
  },
  mediaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mediaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  mediaChipText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingBottom: 16,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    minHeight: 100,
    maxHeight: 160,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
