import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
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
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <Text className="text-lg font-inter-semibold text-text-primary mb-4">
          Erlebnis teilen
        </Text>

        {/* Emoji Picker Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          {CURATED_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => handleEmojiToggle(emoji)}
              className={`w-11 h-11 rounded-full items-center justify-center mr-2 ${
                selectedEmoji === emoji ? 'bg-primary/15' : ''
              }`}
            >
              <Text className="text-2xl">{emoji}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Text Input */}
        <View className="border border-border rounded-xl p-3 mb-3" style={{ minHeight: 100 }}>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Wie war dein Erlebnis?"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_CONTENT_LENGTH}
            className="text-sm font-inter-regular text-text-primary"
            style={{ minHeight: 60, textAlignVertical: 'top', lineHeight: 20 }}
          />
          <Text className="text-[11px] font-inter-regular text-text-tertiary text-right mt-1">
            {content.length}/{MAX_CONTENT_LENGTH}
          </Text>
        </View>

        {/* Media Toolbar */}
        <View className="flex-row gap-2 mb-3">
          <Pressable
            onPress={handlePickImages}
            disabled={images.length >= MAX_IMAGES || isUploading}
            className="flex-row items-center gap-1.5 bg-surface-secondary px-3 py-2 rounded-lg"
          >
            <Ionicons
              name="image-outline"
              size={20}
              color={images.length >= MAX_IMAGES ? colors.disabled : colors.textSecondary}
            />
            <Text
              className="text-xs font-inter-medium"
              style={{ color: images.length >= MAX_IMAGES ? colors.disabled : colors.textSecondary }}
            >
              Bilder {images.length > 0 ? `(${images.length}/${MAX_IMAGES})` : ''}
            </Text>
          </Pressable>

          <Pressable
            onPress={handlePickVideo}
            disabled={!!videoUrl || isUploading}
            className="flex-row items-center gap-1.5 bg-surface-secondary px-3 py-2 rounded-lg"
          >
            <Ionicons
              name="videocam-outline"
              size={20}
              color={videoUrl ? colors.disabled : colors.textSecondary}
            />
            <Text
              className="text-xs font-inter-medium"
              style={{ color: videoUrl ? colors.disabled : colors.textSecondary }}
            >
              Video
            </Text>
          </Pressable>
        </View>

        {/* Upload indicator */}
        {isUploading && (
          <View className="flex-row items-center gap-2 mb-3">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-xs font-inter-regular text-text-secondary">
              Wird hochgeladen...
            </Text>
          </View>
        )}

        {/* Image Previews */}
        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            {images.map((uri, i) => (
              <View key={i} className="relative mr-2">
                <Image source={{ uri }} className="w-[72px] h-[72px] rounded-lg" />
                <Pressable
                  onPress={() => handleRemoveImage(i)}
                  className="absolute -top-1.5 -right-1.5"
                >
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Video Preview */}
        {videoUrl && (
          <View className="flex-row items-center gap-2 bg-surface-secondary p-3 rounded-lg mb-3">
            <Ionicons name="videocam" size={20} color={colors.textSecondary} />
            <Text className="flex-1 text-xs font-inter-regular text-text-secondary" numberOfLines={1}>
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
          className={`h-12 rounded-xl items-center justify-center mt-1 ${
            canSubmit ? 'bg-primary' : 'bg-disabled'
          }`}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-base font-inter-semibold text-white">Teilen</Text>
          )}
        </Pressable>
      </ScrollView>
    </BottomDrawer>
  );
}
