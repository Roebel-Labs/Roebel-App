import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { useCreatePost } from '@/context/CreatePostContext';
import { createPost, createPoll } from '@/lib/supabase-posts';
import PostLinkedEventCard from '@/components/feed/PostLinkedEventCard';
import PostLinkedMarketplaceCard from '@/components/feed/PostLinkedMarketplaceCard';

const GUIDELINES = [
  'Sei respektvoll und freundlich zu deinen Nachbarn',
  'Keine Beleidigungen, Hassrede oder Diskriminierung',
  'Teile nur wahrheitsgemäße Informationen',
  'Keine Werbung oder Spam ohne Genehmigung',
  'Respektiere die Privatsphäre anderer',
  'Keine illegalen oder gefährlichen Inhalte',
];

export default function ReviewScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const { activeAccount } = useAccount();
  const { showSnackbar } = useSnackbar();
  const draft = useCreatePost();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const walletAddress = user?.wallet_address || '';

  const handlePost = async () => {
    const hasLinkedItem = !!draft.linkedEventId || !!draft.linkedMarketplaceId;
    const hasSticker = !!draft.sticker;
    if (!walletAddress || (!draft.content.trim() && !hasLinkedItem && !hasSticker)) return;
    setIsSubmitting(true);

    try {
      const content = draft.content.trim() || (draft.linkedEventId ? 'Schaut euch dieses Event an!' : draft.linkedMarketplaceId ? 'Schaut euch diese Anzeige an!' : '');
      const post = await createPost({
        wallet_address: walletAddress,
        account_id: activeAccount?.id,
        content,
        category: draft.category,
        feed_type: draft.feedType,
        post_type: draft.postType,
        media_urls: draft.images.length > 0 ? draft.images : undefined,
        video_url: draft.videoUrl || undefined,
        linked_event_id: draft.linkedEventId || undefined,
        linked_marketplace_id: draft.linkedMarketplaceId || undefined,
        sticker_reward_id: draft.sticker?.id ?? null,
      });

      if (!post) {
        showSnackbar({ message: 'Beitrag konnte nicht erstellt werden' });
        return;
      }

      // Create poll if this is a poll post
      if (draft.isPoll) {
        const validOptions = draft.pollOptions.filter((o) => o.trim().length > 0);
        if (validOptions.length >= 2) {
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          await createPoll({
            post_id: post.id,
            poll_type: draft.pollType,
            options: validOptions,
            expires_at: expiresAt,
          });
        }
      }

      draft.reset();
      showSnackbar({ message: 'Beitrag veröffentlicht!' });

      // Navigate back to feed
      router.dismissAll();
    } catch (err) {
      console.error('Error creating post:', err);
      showSnackbar({ message: 'Fehler beim Erstellen des Beitrags' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Beitrag überprüfen
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Post preview */}
        <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.previewAuthor}>
            <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {user?.username?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
            <Text style={[styles.authorName, { color: colors.textPrimary }]}>
              {user?.username || 'Unbekannt'}
            </Text>
          </View>

          <Text style={[styles.previewContent, { color: colors.textPrimary }]}>
            {draft.content}
          </Text>

          {draft.linkedEventData && (
            <PostLinkedEventCard event={draft.linkedEventData} />
          )}

          {draft.linkedMarketplaceData && (
            <PostLinkedMarketplaceCard listing={draft.linkedMarketplaceData} />
          )}

          {draft.images.length > 0 && (
            <View style={styles.previewImages}>
              {draft.images.map((uri, i) => (
                <Image
                  key={i}
                  source={{ uri }}
                  style={styles.previewImage}
                  contentFit="cover"
                />
              ))}
            </View>
          )}

          {draft.isPoll && (
            <View style={styles.previewPoll}>
              <Text style={[styles.pollLabel, { color: colors.textSecondary }]}>Umfrage:</Text>
              {draft.pollOptions
                .filter((o) => o.trim())
                .map((opt, i) => (
                  <View
                    key={i}
                    style={[styles.pollOptionPreview, { backgroundColor: colors.surfaceSecondary }]}
                  >
                    <Text style={[styles.pollOptionText, { color: colors.textPrimary }]}>{opt}</Text>
                  </View>
                ))}
            </View>
          )}
        </View>

        {/* Guidelines */}
        <View style={styles.guidelinesSection}>
          <Text style={[styles.guidelinesTitle, { color: colors.textPrimary }]}>
            Community-Richtlinien
          </Text>
          {GUIDELINES.map((rule, i) => (
            <View key={i} style={styles.guidelineRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text style={[styles.guidelineText, { color: colors.textSecondary }]}>{rule}</Text>
            </View>
          ))}
        </View>

        {/* Disclaimer */}
        <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>
          Mit dem Posten stimmst du unseren Community-Richtlinien und der Datenschutzerklärung zu.
        </Text>
      </ScrollView>

      {/* Post CTA */}
      <View style={[styles.ctaContainer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          onPress={handlePost}
          disabled={isSubmitting}
          style={[
            styles.ctaButton,
            { backgroundColor: isSubmitting ? colors.disabled : colors.primary },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Posten</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
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
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  headerSpacer: {
    width: 24,
  },
  scrollContent: {
    padding: 16,
    gap: 24,
  },
  previewCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  previewAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  previewContent: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  previewImages: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  previewPoll: {
    gap: 6,
    marginTop: 4,
  },
  pollLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  pollOptionPreview: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  pollOptionText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  guidelinesSection: {
    gap: 10,
  },
  guidelinesTitle: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  guidelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guidelineText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  disclaimer: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    textAlign: 'center',
  },
  ctaContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});
