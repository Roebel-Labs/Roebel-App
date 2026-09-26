import React, { useCallback } from 'react';
import { Pressable, Share, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import type { ChatPart } from '@/lib/chat/types';
import { chatFont, useChatTokens } from './tokens';
import { ShimmerBlock, ShimmerLine } from './Shimmer';

export type GeneratedImagePart = Extract<ChatPart, { type: 'generated_image' }>;

export type GeneratedImageCardProps = {
  part: GeneratedImagePart;
  /** Tap on a finished image (the thread's image viewer / link handler). */
  onPress?: (url: string) => void;
  style?: StyleProp<ViewStyle>;
};

const WIDTH = 224;
const RADIUS = 22;
const MIN_H = 126;
const MAX_H = 360;

/** Card size from the part's (target or real) size; square when unknown. */
export function generatedImageSize(part: Pick<GeneratedImagePart, 'width' | 'height'>): { width: number; height: number } {
  const ratio = part.width && part.height ? part.height / part.width : 1;
  return { width: WIDTH, height: Math.max(MIN_H, Math.min(MAX_H, Math.round(WIDTH * ratio))) };
}

/**
 * AI-generated image in a bot message (images pack). generating → shimmer
 * block at the target aspect with a shimmering "Bild wird erstellt …";
 * done → the image (tap = viewer, long-press = teilen/sichern) with a small
 * "KI-generiert" caption (AI Act Art. 50 transparency); failed → muted card
 * with the German reason.
 */
export function GeneratedImageCard({ part, onPress, style }: GeneratedImageCardProps) {
  const t = useChatTokens();
  const size = generatedImageSize(part);
  const url = part.status === 'done' ? part.url : undefined;

  const share = useCallback(() => {
    if (!url) return;
    // iOS offers "Bild sichern" for a url; Android shares the link.
    Share.share({ url, message: url }).catch(() => {});
  }, [url]);

  if (part.status === 'generating' || (part.status === 'done' && !url)) {
    return (
      <View
        style={[styles.left, style]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Bild wird erstellt"
      >
        <ShimmerBlock width={size.width} height={size.height} radius={RADIUS} />
        <View pointerEvents="none" style={styles.labelOverlay}>
          <ShimmerLine label="Bild wird erstellt …" textStyle={styles.label} />
        </View>
      </View>
    );
  }

  if (part.status === 'failed') {
    return (
      <View style={[styles.left, styles.failed, { backgroundColor: t.bubbleBot }, style]}>
        <Feather name="image" size={18} color={t.textTertiary} />
        <View style={styles.failedBody}>
          <Text style={[styles.failedTitle, { color: t.textSecondary }]}>Bild konnte nicht erstellt werden</Text>
          {part.error ? (
            <Text style={[styles.failedReason, { color: t.textTertiary }]} numberOfLines={3}>
              {part.error}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.left, style]}>
      <Pressable
        onPress={() => url && onPress?.(url)}
        onLongPress={share}
        accessibilityRole="imagebutton"
        accessibilityLabel={`KI-generiertes Bild: ${part.prompt}`}
        accessibilityHint="Lange drücken zum Teilen oder Sichern"
        style={styles.image}
      >
        <Image source={{ uri: url }} style={size} contentFit="cover" transition={200} />
      </Pressable>
      <Text style={[styles.caption, { color: t.textTertiary }]}>KI-generiert</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  left: { alignSelf: 'flex-start' },
  image: { borderRadius: RADIUS, overflow: 'hidden' },
  labelOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14 },
  caption: { fontFamily: chatFont.medium, fontSize: 12, marginTop: 5, marginLeft: 6 },
  failed: {
    width: WIDTH,
    borderRadius: RADIUS,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  failedBody: { flex: 1, minWidth: 0 },
  failedTitle: { fontFamily: chatFont.medium, fontSize: 15, lineHeight: 20 },
  failedReason: { fontFamily: chatFont.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
});

export default GeneratedImageCard;
