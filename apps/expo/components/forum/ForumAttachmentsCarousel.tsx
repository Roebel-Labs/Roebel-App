import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatFileSize } from '@/lib/forum-attachments';
import type { ForumAttachmentRecord } from '@/lib/types/feed';

type Props = {
  attachments: ForumAttachmentRecord[];
  onOpenImage: (url: string) => void;
};

/** PDFs and other files open in the in-app browser; no native viewer needed. */
export function openAttachment(attachment: Pick<ForumAttachmentRecord, 'url'>): void {
  void WebBrowser.openBrowserAsync(attachment.url);
}

/**
 * "Anhänge (N)": everything shared in the discussion, thread body and replies,
 * newest first. Images open the lightbox, files the browser.
 */
export default function ForumAttachmentsCarousel({ attachments, onOpenImage }: Props) {
  const { colors } = useTheme();
  if (attachments.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>ANHÄNGE ({attachments.length})</Text>
      <FlatList
        horizontal
        data={attachments}
        keyExtractor={(a) => a.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => <AttachmentTile attachment={item} onOpenImage={onOpenImage} />}
      />
    </View>
  );
}

function AttachmentTile({
  attachment,
  onOpenImage,
}: {
  attachment: ForumAttachmentRecord;
  onOpenImage: (url: string) => void;
}) {
  const { colors } = useTheme();
  if (attachment.kind === 'image') {
    return (
      <Pressable
        onPress={() => onOpenImage(attachment.url)}
        accessibilityRole="imagebutton"
        accessibilityLabel={attachment.file_name}
      >
        <Image
          source={{ uri: attachment.url }}
          style={[styles.tile, { backgroundColor: colors.surfaceSecondary }]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    );
  }
  const size = formatFileSize(attachment.size_bytes);
  return (
    <Pressable
      onPress={() => openAttachment(attachment)}
      style={[styles.tile, styles.fileTile, { backgroundColor: colors.surfaceSecondary }]}
      accessibilityRole="button"
      accessibilityLabel={attachment.file_name}
    >
      <Ionicons
        name={attachment.kind === 'pdf' ? 'document-text-outline' : 'document-outline'}
        size={26}
        color={colors.primary}
      />
      <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={2}>
        {attachment.file_name}
      </Text>
      <Text style={[styles.fileMeta, { color: colors.textTertiary }]} numberOfLines={1}>
        {attachment.kind === 'pdf' ? 'PDF' : 'Datei'}
        {size ? ` · ${size}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  heading: { fontSize: 11, fontFamily: fontFamily.semiBold, letterSpacing: 0.6 },
  row: { gap: 8 },
  tile: { width: 88, height: 88, borderRadius: 10 },
  fileTile: { padding: 8, justifyContent: 'space-between' },
  fileName: { fontSize: 11, fontFamily: fontFamily.medium, lineHeight: 14 },
  fileMeta: { fontSize: 10, fontFamily: fontFamily.regular },
});
