import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { useActiveProfileImage } from '@/hooks/useActiveProfileImage';
import { useRequireAuth } from '@/context/AuthGateContext';
import { useCreatePost } from '@/context/CreatePostContext';
import { POST_CATEGORY_LABELS } from '@/lib/types/feed';
import type { PostCategory, FeedType } from '@/lib/types/feed';
import { isOrgAccount } from '@/lib/types';
import PostLinkedEventCard from '@/components/feed/PostLinkedEventCard';
import PostLinkedMarketplaceCard from '@/components/feed/PostLinkedMarketplaceCard';
import PostImageGrid from '@/components/feed/PostImageGrid';
import PostingGate from '@/components/feed/PostingGate';
import { usePostingPermission } from '@/hooks/usePostingPermission';
import ImageZoomModal from '@/components/ImageZoomModal';

import ImageIcon from '@/assets/icons/image-01.svg';
import VideoIcon from '@/assets/icons/video-01.svg';
import MarketsIcon from '@/assets/icons/markets.svg';
import CalendarIcon from '@/assets/icons/calendar.svg';
import CommunityIcon from '@/assets/icons/community.svg';
import EmojiIcon from '@/assets/icons/emoji.svg';
import StickerEmojiPicker from '@/components/pickers/StickerEmojiPicker';
import PostVideoPlayer from '@/components/feed/PostVideoPlayer';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';

const MAX_CONTENT_LENGTH = 500;

const FEED_TYPE_LABELS: Record<FeedType, string> = {
  main: 'Für Alle',
  rathaus: 'Stadt',
  app: 'App',
};

const CATEGORIES: PostCategory[] = [
  'generell',
  'frage',
  'empfehlungen',
  'verloren_gefunden',
  'hilfe_gebraucht',
  'im_angebot',
];

type BottomOption = {
  key: string;
  label: string;
  icon: React.ReactNode;
  route: string;
};

export default function CreateScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    feedType?: string;
    linkedEventId?: string;
    linkedEventTitle?: string;
    linkedEventDate?: string;
    linkedEventTime?: string;
    linkedEventLocation?: string;
    linkedEventImageUrl?: string;
    linkedEventCategory?: string;
    linkedListingId?: string;
    linkedListingTitle?: string;
    linkedListingPrice?: string;
    linkedListingPriceType?: string;
    linkedListingCategory?: string;
    linkedListingCondition?: string;
    linkedListingMediaUrls?: string;
    linkedListingNeighborhood?: string;
  }>();
  const { user, isCitizen } = useUser();
  const { activeAccount } = useAccount();
  const walletAddress = user?.wallet_address || '';
  const activeProfileImage = useActiveProfileImage();
  const draft = useCreatePost();
  const requireAuth = useRequireAuth();
  // Citizens (on-chain NFT may outpace the DB flag) and org accounts (always
  // citizen-owned) bypass the tourist gate entirely.
  const bypassGate = isCitizen || isOrgAccount(activeAccount);
  const { status: postingStatus, refresh: refreshPosting } = usePostingPermission({
    bypass: bypassGate,
  });
  const postingAllowed = postingStatus.kind === 'allowed' || postingStatus.kind === 'unknown_user';

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [feedDropdownOpen, setFeedDropdownOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  // Initialize linked event from route params (coming from event submission success)
  useEffect(() => {
    if (params.linkedEventId && !draft.linkedEventId) {
      draft.setLinkedEvent(params.linkedEventId, {
        id: params.linkedEventId,
        title: params.linkedEventTitle || '',
        date: params.linkedEventDate || '',
        time: params.linkedEventTime || null,
        location: params.linkedEventLocation || '',
        image_url: params.linkedEventImageUrl || null,
        category: params.linkedEventCategory || null,
      });
    }
  }, [params.linkedEventId]);

  useEffect(() => {
    if (params.linkedListingId && !draft.linkedMarketplaceId) {
      const mediaUrls = params.linkedListingMediaUrls ? JSON.parse(params.linkedListingMediaUrls) : null;
      draft.setLinkedMarketplace(params.linkedListingId, {
        id: params.linkedListingId,
        title: params.linkedListingTitle || '',
        price: parseFloat(params.linkedListingPrice || '0'),
        price_type: (params.linkedListingPriceType as any) || 'fixed',
        category: params.linkedListingCategory || 'sonstiges',
        condition: (params.linkedListingCondition as any) || null,
        media_urls: mediaUrls,
        neighborhood: params.linkedListingNeighborhood || null,
      });
    }
  }, [params.linkedListingId]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setShowMore(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!params.feedType) return;
    const allowed: FeedType[] = ['main', 'rathaus', 'app'];
    if (allowed.includes(params.feedType as FeedType)) {
      draft.setFeedType(params.feedType as FeedType);
    }
  }, [params.feedType]);

  // Non-citizens can only post to 'main' — force it if the draft is anything else
  useEffect(() => {
    if (!isCitizen && draft.feedType !== 'main') {
      draft.setFeedType('main');
    }
  }, [isCitizen, draft.feedType]);

  const hasLinkedItem = !!draft.linkedEventId || !!draft.linkedMarketplaceId;

  const canProceed = postingAllowed && (draft.content.trim().length > 0 || hasLinkedItem);

  const handleClose = () => {
    if (draft.content.trim() || draft.images.length > 0 || draft.videoUrl) {
      Alert.alert('Verwerfen?', 'Dein Beitrag wird nicht gespeichert.', [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verwerfen',
          style: 'destructive',
          onPress: () => {
            draft.reset();
            router.back();
          },
        },
      ]);
    } else {
      router.back();
    }
  };

  const handleWeiter = () => {
    if (!canProceed) return;
    requireAuth(() => router.push('/create/review' as any));
  };

  const bottomOptions: BottomOption[] = [
    {
      key: 'marketplace',
      label: 'Verkaufe oder verschenke etwas',
      icon: <MarketsIcon width={24} height={24} color={colors.textSecondary} />,
      route: '/create-listing',
    },
    {
      key: 'event',
      label: 'Veranstaltung erstellen',
      icon: <CalendarIcon width={24} height={24} color={colors.textSecondary} />,
      route: '/ai-submit',
    },
    {
      key: 'poll',
      label: 'Befrage deine Nachbarn',
      icon: <CommunityIcon width={24} height={24} color={colors.textSecondary} />,
      route: '/create/poll',
    },
  ];

  const showBottomCards = (!keyboardVisible || showMore) && !hasLinkedItem;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>

          <View>
            <Pressable
              style={[styles.audiencePill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              onPress={() => isCitizen && setFeedDropdownOpen(!feedDropdownOpen)}
              disabled={!isCitizen}
            >
              <Ionicons name="globe-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.audienceText, { color: colors.textPrimary }]}>
                {FEED_TYPE_LABELS[draft.feedType]}
              </Text>
              {isCitizen && (
                <Ionicons name={feedDropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
              )}
            </Pressable>
            {feedDropdownOpen && isCitizen && (
              <View style={[styles.feedDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {(Object.keys(FEED_TYPE_LABELS) as FeedType[]).map((ft) => (
                  <Pressable
                    key={ft}
                    style={[
                      styles.feedDropdownItem,
                      draft.feedType === ft && { backgroundColor: colors.primaryLight },
                    ]}
                    onPress={() => {
                      draft.setFeedType(ft);
                      setFeedDropdownOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.feedDropdownText,
                        { color: draft.feedType === ft ? colors.primary : colors.textPrimary },
                      ]}
                    >
                      {FEED_TYPE_LABELS[ft]}
                    </Text>
                    {draft.feedType === ft && (
                      <Ionicons name="checkmark" size={16} color={colors.primary} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <Pressable
            onPress={handleWeiter}
            disabled={!canProceed}
            style={[
              styles.weiterBtn,
              { backgroundColor: canProceed ? colors.primary : colors.disabled },
            ]}
          >
            <Text
              style={[
                styles.weiterText,
                { color: canProceed ? colors.onPrimary : colors.disabledText },
              ]}
            >
              Weiter
            </Text>
          </Pressable>
        </View>

        {/* Posting permission gate — short-circuits to GPS/age/rate-limit UI
            when the wallet doesn't meet the tourist-tier requirements. Citizens
            and unknown_user fall through to the normal composer. */}
        <PostingGate status={postingStatus} refresh={refreshPosting}>
        {/* Scrollable content */}
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* Author row */}
          <View style={styles.authorRow}>
            <UserAvatarWithFrame
              size={40}
              uri={activeProfileImage.url}
              fallbackInitial={activeProfileImage.fallbackInitial}
              disabled={activeProfileImage.isOrg}
            />
            <View>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>
                {activeProfileImage.displayName}
              </Text>
              <Text style={[styles.authorLocation, { color: colors.textSecondary }]}>
                Röbel/Müritz
              </Text>
            </View>
          </View>

          {/* Text input */}
          <TextInput
            style={[styles.textInput, { color: colors.textPrimary }]}
            placeholder={hasLinkedItem ? 'Füge einen Kommentar hinzu...' : 'Was geht dir durch den Kopf, Nachbar?'}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_CONTENT_LENGTH}
            value={draft.content}
            onChangeText={draft.setContent}
            autoFocus
          />

          {/* Linked event/marketplace preview */}
          {draft.linkedEventData && (
            <View style={styles.linkedItemWrapper}>
              <PostLinkedEventCard event={draft.linkedEventData} />
              <Pressable
                onPress={draft.clearLinkedItem}
                style={[styles.linkedItemRemove, { backgroundColor: colors.error }]}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          )}

          {draft.linkedMarketplaceData && (
            <View style={styles.linkedItemWrapper}>
              <PostLinkedMarketplaceCard listing={draft.linkedMarketplaceData} />
              <Pressable
                onPress={draft.clearLinkedItem}
                style={[styles.linkedItemRemove, { backgroundColor: colors.error }]}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          )}

          {/* Image previews — feed-shaped grid + tap-to-zoom */}
          {(draft.images.length > 0 || draft.pendingUploads > 0) && (
            <View style={styles.imagePreviewWrapper}>
              <PostImageGrid
                imageUrls={draft.images}
                pendingCount={draft.pendingUploads}
                onPress={(i) => setZoomImageUrl(draft.images[i])}
                renderOverlay={(i) => (
                  <Pressable
                    onPress={() => draft.removeImage(i)}
                    style={[styles.removeImageBtn, { backgroundColor: colors.error }]}
                    hitSlop={8}
                    accessibilityLabel="Bild entfernen"
                  >
                    <Ionicons name="close" size={14} color="#ffffff" />
                  </Pressable>
                )}
              />
            </View>
          )}

          {/* Video preview */}
          {draft.videoUrl && (
            <View style={styles.videoPreviewWrapper}>
              <PostVideoPlayer videoUrl={draft.videoUrl} isVisible autoPlay />
              <Pressable
                onPress={draft.removeVideo}
                style={[styles.videoRemoveBtn, { backgroundColor: colors.error }]}
                accessibilityLabel="Video entfernen"
              >
                <Ionicons name="close" size={16} color="#ffffff" />
              </Pressable>
            </View>
          )}

          {/* Upload indicator (video only — image uploads show inline skeletons) */}
          {draft.isUploading && draft.pendingUploads === 0 && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>
                Wird hochgeladen...
              </Text>
            </View>
          )}

          {/* Sticker preview */}
          {draft.sticker && (
            <View style={styles.stickerPreviewRow}>
              <Image
                source={{ uri: draft.sticker.asset_url }}
                style={styles.stickerPreview}
                contentFit="contain"
              />
              <Pressable
                onPress={() => draft.setSticker(null)}
                style={[styles.stickerRemoveBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Ionicons name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}

          {/* Category chips */}
          {draft.feedType === 'main' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryContent}
            >
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => draft.setCategory(cat)}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: draft.category === cat ? colors.primary : colors.surface,
                      borderColor: draft.category === cat ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: draft.category === cat ? colors.onPrimary : colors.textSecondary },
                    ]}
                  >
                    {POST_CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </ScrollView>

        {/* Toolbar */}
        <View style={[styles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <View style={styles.toolbarLeft}>
            <Pressable
              style={styles.toolbarBtn}
              onPress={() => draft.addImages(walletAddress)}
              disabled={draft.images.length >= 4 || draft.isUploading || !!draft.videoUrl}
              accessibilityLabel="Bilder anhängen"
            >
              <ImageIcon
                width={22}
                height={22}
                color={
                  draft.images.length >= 4 || draft.videoUrl
                    ? colors.disabled
                    : colors.textSecondary
                }
              />
            </Pressable>
            <Pressable
              style={styles.toolbarBtn}
              onPress={() => draft.pickVideo(walletAddress)}
              disabled={!!draft.videoUrl || draft.images.length > 0 || draft.isUploading}
              accessibilityLabel="Video anhängen"
            >
              <VideoIcon
                width={22}
                height={22}
                color={
                  draft.videoUrl || draft.images.length > 0
                    ? colors.disabled
                    : colors.textSecondary
                }
              />
            </Pressable>
            <Pressable
              style={styles.toolbarBtn}
              onPress={() => {
                Keyboard.dismiss();
                setShowPicker((p) => !p);
              }}
              accessibilityLabel="Emoji oder Sticker öffnen"
            >
              <EmojiIcon width={22} height={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {keyboardVisible && (
            <Pressable
              style={[styles.moreBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => {
                setShowMore(!showMore);
                Keyboard.dismiss();
              }}
            >
              <Ionicons name="grid-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.moreBtnText, { color: colors.textSecondary }]}>Mehr</Text>
            </Pressable>
          )}
        </View>

        {/* Bottom option cards */}
        {showBottomCards && (
          <View style={[styles.bottomOptions, { backgroundColor: colors.background }]}>
            {bottomOptions.map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.bottomCard, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => requireAuth(() => router.push(opt.route as any))}
              >
                {opt.icon}
                <Text style={[styles.bottomCardLabel, { color: colors.textPrimary }]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        </PostingGate>
        {showPicker && (
          <StickerEmojiPicker
            onPickEmoji={(emoji) => {
              draft.setContent(draft.content + emoji);
              setShowPicker(false);
            }}
            onPickSticker={(reward) => {
              draft.setSticker(reward);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </KeyboardAvoidingView>

      <ImageZoomModal
        visible={!!zoomImageUrl}
        imageUrl={zoomImageUrl ?? ''}
        onClose={() => setZoomImageUrl(null)}
      />
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
  audiencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  audienceText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  feedDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 10,
    minWidth: 140,
  },
  feedDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feedDropdownText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  weiterBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  weiterText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  scrollContent: {
    paddingBottom: 16,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  authorName: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  authorLocation: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  textInput: {
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  linkedItemWrapper: {
    position: 'relative',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  linkedItemRemove: {
    position: 'absolute',
    top: -4,
    right: 12,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  imagePreviewWrapper: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPreviewWrapper: {
    position: 'relative',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  videoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  stickerPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  stickerPreview: {
    width: 120,
    height: 120,
  },
  stickerRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  categoryScroll: {
    maxHeight: 40,
    marginTop: 16,
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolbarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  moreBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  bottomOptions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  bottomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 12,
  },
  bottomCardLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
