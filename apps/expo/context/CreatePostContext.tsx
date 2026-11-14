import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadMediaFile } from '@/lib/upload-media';
import { probeStreamConfigured, uploadVideoToStream } from '@/lib/stream-upload';
import type { PostCategory, FeedType, PostType, StadtkasseSnapshot, PostRecord, LinkedMiniAppRef } from '@/lib/types/feed';
import type { EventRecord, MarketplaceListingRecord } from '@/lib/types';
import type { LootboxReward } from '@/lib/supabase-rewards';
import type { PostMediaItem } from '@/lib/utils/post-media';

/** Images + videos per post, shown as a slider when mixed or > 4. */
export const MAX_MEDIA = 10;
const STREAM_MAX_SECONDS = 900;
const LEGACY_MAX_SECONDS = 60;

/** One slot of the draft's ordered media list; `url` is null while uploading. */
export type DraftMedia = {
  key: string;
  type: 'image' | 'video';
  url: string | null;
  /** Upload fraction 0..1 for Stream videos, null when unknown. */
  progress: number | null;
};

type LinkedEventData = Pick<EventRecord, 'id' | 'title' | 'date' | 'time' | 'location' | 'image_url' | 'category'>;
type LinkedMarketplaceData = Pick<MarketplaceListingRecord, 'id' | 'title' | 'price' | 'price_type' | 'category' | 'condition' | 'media_urls' | 'neighborhood'>;

type CreatePostState = {
  content: string;
  /** Ordered images + videos, including slots still uploading. */
  media: DraftMedia[];
  category: PostCategory;
  feedType: FeedType;
  postType: PostType;
  isPoll: boolean;
  pollOptions: string[];
  pollType: 'single' | 'multi';
  linkedEventId: string | null;
  linkedEventData: LinkedEventData | null;
  linkedMarketplaceId: string | null;
  linkedMarketplaceData: LinkedMarketplaceData | null;
  linkedMiniAppId: string | null;
  linkedMiniAppData: LinkedMiniAppRef | null;
  sticker: LootboxReward | null;
  stadtkasseSnapshot: StadtkasseSnapshot | null;
  /** Quote mode: id + preview data of the post being quoted. */
  quotedPostId: string | null;
  quotedPostData: PostRecord | null;
};

type CreatePostActions = {
  setContent: (content: string) => void;
  setCategory: (category: PostCategory) => void;
  setFeedType: (feedType: FeedType) => void;
  /** Pick any mix of images and videos (multi-select). */
  addMedia: (walletAddress: string, kinds?: ('images' | 'videos')[]) => Promise<void>;
  removeMedia: (key: string) => void;
  setIsPoll: (isPoll: boolean) => void;
  setPollOptions: (options: string[]) => void;
  setPollType: (type: 'single' | 'multi') => void;
  setLinkedEvent: (id: string, data: LinkedEventData) => void;
  setLinkedMarketplace: (id: string, data: LinkedMarketplaceData) => void;
  setLinkedMiniApp: (id: string, data: LinkedMiniAppRef) => void;
  clearLinkedItem: () => void;
  setSticker: (reward: LootboxReward | null) => void;
  setStadtkasseSnapshot: (snapshot: StadtkasseSnapshot | null) => void;
  setQuotedPost: (id: string, data: PostRecord | null) => void;
  reset: () => void;
};

type CreatePostDerived = {
  /** Uploaded items in order — what the post will contain. */
  mediaItems: PostMediaItem[];
  /** Uploaded image URLs only (zoom modal). */
  images: string[];
  isUploading: boolean;
};

type CreatePostContextType = CreatePostState & CreatePostDerived & CreatePostActions;

const CreatePostContext = createContext<CreatePostContextType | null>(null);

const initialState: CreatePostState = {
  content: '',
  media: [],
  category: 'generell',
  feedType: 'main',
  postType: 'user',
  isPoll: false,
  pollOptions: ['', ''],
  pollType: 'single',
  linkedEventId: null,
  linkedEventData: null,
  linkedMarketplaceId: null,
  linkedMarketplaceData: null,
  linkedMiniAppId: null,
  linkedMiniAppData: null,
  sticker: null,
  stadtkasseSnapshot: null,
  quotedPostId: null,
  quotedPostData: null,
};

export function CreatePostProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CreatePostState>(initialState);

  const setContent = useCallback((content: string) => {
    setState((prev) => ({ ...prev, content }));
  }, []);

  const setCategory = useCallback((category: PostCategory) => {
    setState((prev) => ({ ...prev, category }));
  }, []);

  const setFeedType = useCallback((feedType: FeedType) => {
    setState((prev) => ({ ...prev, feedType }));
  }, []);

  const patchMedia = useCallback((key: string, patch: Partial<DraftMedia> | null) => {
    setState((prev) => ({
      ...prev,
      media:
        patch === null
          ? prev.media.filter((m) => m.key !== key)
          : prev.media.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    }));
  }, []);

  const addMedia = useCallback(
    async (walletAddress: string, kinds: ('images' | 'videos')[] = ['images', 'videos']) => {
      const remaining = MAX_MEDIA - state.media.length;
      if (remaining <= 0) return;

      // Stream configured → long videos + direct-to-Cloudflare tus upload.
      // Not configured → the legacy 60 s cap via Supabase Storage.
      const useStream = kinds.includes('videos') ? await probeStreamConfigured() : false;
      const maxSeconds = useStream ? STREAM_MAX_SECONDS : LEGACY_MAX_SECONDS;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kinds,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
        videoMaxDuration: maxSeconds,
      });
      if (result.canceled) return;

      // The library picker ignores videoMaxDuration for existing clips.
      const tooLong = result.assets.filter(
        (a) => a.type === 'video' && (a.duration ?? 0) > maxSeconds * 1000,
      );
      const assets = result.assets
        .filter((a) => !tooLong.includes(a))
        .slice(0, remaining);
      if (tooLong.length > 0) {
        const limit = maxSeconds >= 60 ? `${Math.round(maxSeconds / 60)} Minuten` : `${maxSeconds} Sekunden`;
        Alert.alert('Video zu lang', `Videos dürfen höchstens ${limit} lang sein.`);
      }
      if (assets.length === 0) return;

      const slots: DraftMedia[] = assets.map((a, i) => ({
        key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        type: a.type === 'video' ? 'video' : 'image',
        url: null,
        progress: a.type === 'video' && useStream ? 0 : null,
      }));
      setState((prev) => ({ ...prev, media: [...prev.media, ...slots].slice(0, MAX_MEDIA) }));

      let failed = 0;
      // Uploads run side by side; each slot keeps its place in the order.
      await Promise.all(
        assets.map(async (asset, i) => {
          const slot = slots[i];
          let url: string | null = null;
          if (slot.type === 'video') {
            url = useStream
              ? await uploadVideoToStream(asset.uri, walletAddress, (fraction) =>
                  patchMedia(slot.key, { progress: fraction }),
                )
              : await uploadMediaFile(asset.uri, walletAddress, 'video', 'posts', asset.mimeType || undefined);
          } else {
            url = await uploadMediaFile(asset.uri, walletAddress, 'image', 'posts', asset.mimeType || undefined);
          }
          if (url) {
            patchMedia(slot.key, { url, progress: null });
          } else {
            failed++;
            patchMedia(slot.key, null);
          }
        }),
      );
      if (failed > 0) {
        Alert.alert(
          'Upload fehlgeschlagen',
          failed === 1
            ? 'Eine Datei konnte nicht hochgeladen werden.'
            : `${failed} Dateien konnten nicht hochgeladen werden.`,
        );
      }
    },
    [state.media.length, patchMedia],
  );

  const removeMedia = useCallback((key: string) => {
    setState((prev) => ({ ...prev, media: prev.media.filter((m) => m.key !== key) }));
  }, []);

  const setIsPoll = useCallback((isPoll: boolean) => {
    setState((prev) => ({ ...prev, isPoll }));
  }, []);

  const setPollOptions = useCallback((pollOptions: string[]) => {
    setState((prev) => ({ ...prev, pollOptions }));
  }, []);

  const setPollType = useCallback((pollType: 'single' | 'multi') => {
    setState((prev) => ({ ...prev, pollType }));
  }, []);

  const setLinkedEvent = useCallback((id: string, data: LinkedEventData) => {
    setState((prev) => ({
      ...prev,
      linkedEventId: id,
      linkedEventData: data,
      postType: 'event_share',
      linkedMarketplaceId: null,
      linkedMarketplaceData: null,
      linkedMiniAppId: null,
      linkedMiniAppData: null,
    }));
  }, []);

  const setLinkedMarketplace = useCallback((id: string, data: LinkedMarketplaceData) => {
    setState((prev) => ({
      ...prev,
      linkedMarketplaceId: id,
      linkedMarketplaceData: data,
      postType: 'marketplace_share',
      linkedEventId: null,
      linkedEventData: null,
      linkedMiniAppId: null,
      linkedMiniAppData: null,
    }));
  }, []);

  const setLinkedMiniApp = useCallback((id: string, data: LinkedMiniAppRef) => {
    setState((prev) => ({
      ...prev,
      linkedMiniAppId: id,
      linkedMiniAppData: data,
      postType: 'mini_app_share',
      linkedEventId: null,
      linkedEventData: null,
      linkedMarketplaceId: null,
      linkedMarketplaceData: null,
    }));
  }, []);

  const clearLinkedItem = useCallback(() => {
    setState((prev) => ({
      ...prev,
      linkedEventId: null,
      linkedEventData: null,
      linkedMarketplaceId: null,
      linkedMarketplaceData: null,
      linkedMiniAppId: null,
      linkedMiniAppData: null,
      postType: 'user',
    }));
  }, []);

  const setSticker = useCallback((reward: LootboxReward | null) => {
    setState((prev) => ({ ...prev, sticker: reward }));
  }, []);

  const setStadtkasseSnapshot = useCallback((snapshot: StadtkasseSnapshot | null) => {
    setState((prev) => ({ ...prev, stadtkasseSnapshot: snapshot }));
  }, []);

  // Quotes always land in the main feed ("Für Alle") — the whole point is
  // promoting an App-feed post into the town-wide timeline.
  const setQuotedPost = useCallback((id: string, data: PostRecord | null) => {
    setState((prev) => ({ ...prev, quotedPostId: id, quotedPostData: data, feedType: 'main' }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const mediaItems = useMemo<PostMediaItem[]>(
    () =>
      state.media
        .filter((m): m is DraftMedia & { url: string } => !!m.url)
        .map((m) => ({ type: m.type, url: m.url })),
    [state.media],
  );

  const value = useMemo<CreatePostContextType>(
    () => ({
      ...state,
      mediaItems,
      images: mediaItems.filter((m) => m.type === 'image').map((m) => m.url),
      isUploading: state.media.some((m) => !m.url),
      setContent,
      setCategory,
      setFeedType,
      addMedia,
      removeMedia,
      setIsPoll,
      setPollOptions,
      setPollType,
      setLinkedEvent,
      setLinkedMarketplace,
      setLinkedMiniApp,
      clearLinkedItem,
      setSticker,
      setStadtkasseSnapshot,
      setQuotedPost,
      reset,
    }),
    [
      state,
      mediaItems,
      setContent,
      setCategory,
      setFeedType,
      addMedia,
      removeMedia,
      setIsPoll,
      setPollOptions,
      setPollType,
      setLinkedEvent,
      setLinkedMarketplace,
      setLinkedMiniApp,
      clearLinkedItem,
      setSticker,
      setStadtkasseSnapshot,
      setQuotedPost,
      reset,
    ]
  );

  return (
    <CreatePostContext.Provider value={value}>
      {children}
    </CreatePostContext.Provider>
  );
}

export function useCreatePost() {
  const ctx = useContext(CreatePostContext);
  if (!ctx) throw new Error('useCreatePost must be used within CreatePostProvider');
  return ctx;
}
