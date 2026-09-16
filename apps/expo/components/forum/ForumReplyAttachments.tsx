import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatFileSize } from '@/lib/forum-attachments';
import { openAttachment } from './ForumAttachmentsCarousel';
import type { ForumAttachmentRecord } from '@/lib/types/feed';

type Props = {
  attachments: ForumAttachmentRecord[];
  onOpenImage: (url: string) => void;
};

/** Inline attachments under a reply body: image thumbnails + file chips. */
export default function ForumReplyAttachments({ attachments, onOpenImage }: Props) {
  const { colors } = useTheme();
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind !== 'image');
  return (
    <View style={styles.wrap}>
      {images.length > 0 && (
        <View style={styles.imageRow}>
          {images.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onOpenImage(a.url)}
              accessibilityRole="imagebutton"
              accessibilityLabel={a.file_name}
            >
              <Image
                source={{ uri: a.url }}
                style={[styles.image, { backgroundColor: colors.surfaceSecondary }]}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          ))}
        </View>
      )}
      {files.map((a) => {
        const size = formatFileSize(a.size_bytes);
        return (
          <Pressable
            key={a.id}
            onPress={() => openAttachment(a)}
            style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}
            accessibilityRole="button"
            accessibilityLabel={a.file_name}
          >
            <Ionicons
              name={a.kind === 'pdf' ? 'document-text-outline' : 'document-outline'}
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.chipName, { color: colors.textPrimary }]} numberOfLines={1}>
              {a.file_name}
            </Text>
            {size ? <Text style={[styles.chipMeta, { color: colors.textTertiary }]}>{size}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 4 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  image: { width: 160, height: 120, borderRadius: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  chipName: { fontSize: 13, fontFamily: fontFamily.medium, flexShrink: 1 },
  chipMeta: { fontSize: 11, fontFamily: fontFamily.regular },
});
