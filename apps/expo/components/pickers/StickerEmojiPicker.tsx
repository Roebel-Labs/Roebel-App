import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import type { LootboxReward, LootboxRewardType } from '@/lib/supabase-rewards';

type Props = {
  onClose: () => void;
  onPickEmoji: (emoji: string) => void;
  onPickSticker: (reward: LootboxReward) => void;
  /** Hide the sticker sections (e.g. on surfaces where only emoji is wanted). */
  stickersEnabled?: boolean;
};

type EmojiSection = {
  key: string;
  title: string;
  emojis: string[];
};

const EMOJI_SECTIONS: EmojiSection[] = [
  {
    key: 'smileys',
    title: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '🥹', '😂', '🤣',
      '😊', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😗',
      '🤗', '🤩', '🥳', '😎', '🤓', '🧐', '🤔', '🤨',
      '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😴',
    ],
  },
  {
    key: 'emotions',
    title: 'Gefühle',
    emojis: [
      '😢', '😭', '😤', '😡', '🤬', '😱', '😨', '😰',
      '🥺', '😔', '😞', '😟', '🫠', '😵', '🤯', '🤕',
      '🤒', '🤧', '🤮', '💀', '👻', '😇', '🤑', '🤠',
    ],
  },
  {
    key: 'gestures',
    title: 'Gesten',
    emojis: [
      '👍', '👎', '👏', '🙌', '🙏', '🤝', '💪', '✌️',
      '🤞', '🤟', '🤘', '👌', '🤌', '🫶', '👋', '🤚',
    ],
  },
  {
    key: 'hearts',
    title: 'Herzen',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '💖', '💗', '💓', '💝', '💘', '💕', '❣️', '💔',
    ],
  },
  {
    key: 'celebration',
    title: 'Feiern',
    emojis: [
      '🎉', '🎊', '🔥', '⭐', '✨', '🌟', '💫', '🎈',
      '🎁', '🏆', '🥇', '🎇', '🎆', '💯', '✅', '👀',
    ],
  },
  {
    key: 'misc',
    title: 'Sonstiges',
    emojis: [
      '☀️', '🌙', '☕', '🍕', '🍔', '🌭', '🍟', '🍺',
      '🍷', '🎵', '🎶', '📸', '🏠', '🏡', '⚽', '🏀',
    ],
  },
];

const EMOJIS_PER_ROW = 8;
const EMOJI_SIZE = 34;
const STICKER_TILE = 68;

/**
 * Discord-style tabbed-by-section picker. Single scrollable column with
 * section headers; emoji grid first, then owned sticker grids. Used in
 * DMs, post comments, create-post and event experiences.
 */
export default function StickerEmojiPicker({
  onClose,
  onPickEmoji,
  onPickSticker,
  stickersEnabled = true,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userRewards } = useRewards();

  const stickersByType = useMemo(() => {
    const result: Record<Extract<LootboxRewardType, 'sticker' | 'animated_sticker'>, LootboxReward[]> = {
      sticker: [],
      animated_sticker: [],
    };
    if (!stickersEnabled) return result;
    for (const ur of userRewards) {
      const t = ur.reward?.type;
      if ((t === 'sticker' || t === 'animated_sticker') && ur.reward) {
        result[t].push(ur.reward);
      }
    }
    return result;
  }, [userRewards, stickersEnabled]);

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={[
          styles.container,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {EMOJI_SECTIONS.map((section) => (
            <View key={section.key} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
                {section.title}
              </Text>
              <View style={styles.emojiGrid}>
                {section.emojis.map((emoji) => (
                  <Pressable
                    key={`${section.key}-${emoji}`}
                    onPress={() => onPickEmoji(emoji)}
                    style={({ pressed }) => [
                      styles.emojiCell,
                      pressed && { backgroundColor: colors.pressedOverlay },
                    ]}
                  >
                    <Text style={styles.emojiGlyph}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          {stickersEnabled && (
            <>
              <StickerSection
                title="Sticker"
                rewards={stickersByType.sticker}
                emptyHint="Sticker aus Schatztruhen freischalten →"
                onPickSticker={onPickSticker}
                onEmptyPress={() => {
                  onClose();
                  router.push('/rewards/schatzkammer' as any);
                }}
              />
              <StickerSection
                title="Animierte Sticker"
                rewards={stickersByType.animated_sticker}
                emptyHint="Animierte Sticker freischalten →"
                onPickSticker={onPickSticker}
                onEmptyPress={() => {
                  onClose();
                  router.push('/rewards/schatzkammer' as any);
                }}
              />
            </>
          )}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

function StickerSection({
  title,
  rewards,
  emptyHint,
  onPickSticker,
  onEmptyPress,
}: {
  title: string;
  rewards: LootboxReward[];
  emptyHint: string;
  onPickSticker: (reward: LootboxReward) => void;
  onEmptyPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>{title}</Text>
      {rewards.length === 0 ? (
        <Pressable
          onPress={onEmptyPress}
          style={[styles.emptyChip, { backgroundColor: colors.surfaceSecondary }]}
        >
          <Text style={[styles.emptyChipText, { color: colors.textSecondary }]}>
            {emptyHint}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.stickerGrid}>
          {rewards.map((reward) => (
            <Pressable
              key={reward.id}
              onPress={() => onPickSticker(reward)}
              style={({ pressed }) => [
                styles.stickerCell,
                { backgroundColor: colors.surfaceSecondary },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={`Sticker ${reward.name} senden`}
            >
              <Image
                source={{ uri: reward.asset_url }}
                style={styles.stickerImage}
                contentFit="contain"
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    position: 'absolute',
    bottom: 70,
    left: 12,
    right: 12,
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: 360,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  scrollContent: {
    paddingVertical: 10,
  },
  section: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiCell: {
    width: `${100 / EMOJIS_PER_ROW}%`,
    height: EMOJI_SIZE + 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  emojiGlyph: {
    fontSize: 24,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stickerCell: {
    width: STICKER_TILE,
    height: STICKER_TILE,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  stickerImage: {
    width: '100%',
    height: '100%',
  },
  emptyChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  emptyChipText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
});
