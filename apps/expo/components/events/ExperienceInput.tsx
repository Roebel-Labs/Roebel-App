import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { uploadMediaFile } from '@/lib/upload-media';
import { createExperience } from '@/lib/supabase-experiences';

import SendIcon from '@/assets/icons/sent.svg';
import ImageIcon from '@/assets/icons/image-01.svg';

const MAX_CONTENT_LENGTH = 500;

type Props = {
  eventId: string;
  walletAddress: string;
  onCreated: () => void;
  onFocusChange?: (focused: boolean) => void;
  autoFocus?: boolean;
};

export default function ExperienceInput({
  eventId,
  walletAddress,
  onCreated,
  onFocusChange,
  autoFocus,
}: Props) {
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = (text.trim().length > 0 || !!imageUrl) && !isUploading && !isSubmitting;
  const showImageIcon = isFocused || !!imageUrl;

  const handleFocus = () => {
    setIsFocused(true);
    onFocusChange?.(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    onFocusChange?.(false);
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setIsUploading(true);
    const asset = result.assets[0];
    const url = await uploadMediaFile(
      asset.uri,
      walletAddress,
      'image',
      'experiences',
      asset.mimeType || undefined,
    );
    if (url) setImageUrl(url);
    setIsUploading(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const created = await createExperience({
        event_id: eventId,
        wallet_address: walletAddress,
        account_id: activeAccount?.id,
        content: text.trim(),
        media_urls: imageUrl ? [imageUrl] : [],
      });
      if (created) {
        setText('');
        setImageUrl(null);
        Keyboard.dismiss();
        onCreated();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      {imageUrl && (
        <View style={[styles.previewChip, { backgroundColor: colors.surfaceSecondary }]}>
          <Image source={{ uri: imageUrl }} style={styles.previewImage} contentFit="cover" />
          <Pressable onPress={() => setImageUrl(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}
      <View style={styles.row}>
        <View
          style={[
            styles.inputWrap,
            { backgroundColor: colors.surfaceSecondary },
          ]}
        >
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            placeholder="Teile dein Erlebnis..."
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            maxLength={MAX_CONTENT_LENGTH}
            multiline
            autoFocus={autoFocus}
          />
          {showImageIcon && (
            <Pressable
              onPress={handlePickImage}
              style={styles.imageButton}
              hitSlop={6}
              accessibilityLabel="Bild anhängen"
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <ImageIcon width={22} height={22} color={colors.textSecondary} />
              )}
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[
            styles.sendButton,
            { backgroundColor: canSubmit ? colors.primary : colors.disabled },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <SendIcon width={18} height={18} color={canSubmit ? colors.onPrimary : colors.disabledText} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 38,
    maxHeight: 120,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    minHeight: 30,
  },
  imageButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 12,
    padding: 6,
    gap: 6,
  },
  previewImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
});
