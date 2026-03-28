import React, { createContext, useContext, useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import type { PostCategory, FeedType, PostType } from '@/lib/types/feed';
import type { EventRecord, MarketplaceListingRecord } from '@/lib/types';

const MAX_IMAGES = 4;

type LinkedEventData = Pick<EventRecord, 'id' | 'title' | 'date' | 'time' | 'location' | 'image_url' | 'category'>;
type LinkedMarketplaceData = Pick<MarketplaceListingRecord, 'id' | 'title' | 'price' | 'price_type' | 'category' | 'condition' | 'media_urls' | 'neighborhood'>;

type CreatePostState = {
  content: string;
  images: string[];
  videoUrl: string | null;
  category: PostCategory;
  feedType: FeedType;
  postType: PostType;
  isPoll: boolean;
  pollOptions: string[];
  pollType: 'single' | 'multi';
  isUploading: boolean;
  linkedEventId: string | null;
  linkedEventData: LinkedEventData | null;
  linkedMarketplaceId: string | null;
  linkedMarketplaceData: LinkedMarketplaceData | null;
};

type CreatePostActions = {
  setContent: (content: string) => void;
  setCategory: (category: PostCategory) => void;
  setFeedType: (feedType: FeedType) => void;
  addImages: (walletAddress: string) => Promise<void>;
  removeImage: (index: number) => void;
  pickVideo: (walletAddress: string) => Promise<void>;
  removeVideo: () => void;
  setIsPoll: (isPoll: boolean) => void;
  setPollOptions: (options: string[]) => void;
  setPollType: (type: 'single' | 'multi') => void;
  setLinkedEvent: (id: string, data: LinkedEventData) => void;
  setLinkedMarketplace: (id: string, data: LinkedMarketplaceData) => void;
  clearLinkedItem: () => void;
  reset: () => void;
};

type CreatePostContextType = CreatePostState & CreatePostActions;

const CreatePostContext = createContext<CreatePostContextType | null>(null);

const initialState: CreatePostState = {
  content: '',
  images: [],
  videoUrl: null,
  category: 'generell',
  feedType: 'main',
  postType: 'user',
  isPoll: false,
  pollOptions: ['', ''],
  pollType: 'single',
  isUploading: false,
  linkedEventId: null,
  linkedEventData: null,
  linkedMarketplaceId: null,
  linkedMarketplaceData: null,
};

async function uploadFile(
  uri: string,
  walletAddress: string,
  type: 'image' | 'video'
): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = type === 'video' ? 'mp4' : 'jpg';
    const fileName = `post-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = `posts/${walletAddress}/${fileName}`;

    const { error } = await supabase.storage.from('post-media').upload(filePath, blob, {
      contentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
    });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data } = supabase.storage.from('post-media').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.error('Upload failed:', err);
    return null;
  }
}

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

  const addImages = useCallback(async (walletAddress: string) => {
    const remaining = MAX_IMAGES - state.images.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });

    if (result.canceled) return;

    setState((prev) => ({ ...prev, isUploading: true }));

    const newUrls: string[] = [];
    for (const asset of result.assets) {
      const url = await uploadFile(asset.uri, walletAddress, 'image');
      if (url) newUrls.push(url);
    }

    setState((prev) => ({
      ...prev,
      images: [...prev.images, ...newUrls].slice(0, MAX_IMAGES),
      isUploading: false,
    }));
  }, [state.images.length]);

  const removeImage = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  }, []);

  const pickVideo = useCallback(async (walletAddress: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (result.canceled) return;

    setState((prev) => ({ ...prev, isUploading: true }));

    const url = await uploadFile(result.assets[0].uri, walletAddress, 'video');

    setState((prev) => ({
      ...prev,
      videoUrl: url,
      isUploading: false,
    }));
  }, []);

  const removeVideo = useCallback(() => {
    setState((prev) => ({ ...prev, videoUrl: null }));
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
    }));
  }, []);

  const clearLinkedItem = useCallback(() => {
    setState((prev) => ({
      ...prev,
      linkedEventId: null,
      linkedEventData: null,
      linkedMarketplaceId: null,
      linkedMarketplaceData: null,
      postType: 'user',
    }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return (
    <CreatePostContext.Provider
      value={{
        ...state,
        setContent,
        setCategory,
        setFeedType,
        addImages,
        removeImage,
        pickVideo,
        removeVideo,
        setIsPoll,
        setPollOptions,
        setPollType,
        setLinkedEvent,
        setLinkedMarketplace,
        clearLinkedItem,
        reset,
      }}
    >
      {children}
    </CreatePostContext.Provider>
  );
}

export function useCreatePost() {
  const ctx = useContext(CreatePostContext);
  if (!ctx) throw new Error('useCreatePost must be used within CreatePostProvider');
  return ctx;
}
