import React from 'react';
import { View, StyleSheet } from 'react-native';
import YouTubeEmbed from '@/components/YouTubeEmbed';
import { extractYouTubeVideoId } from '@/lib/utils/youtube';

const PLAYER_HEIGHT = 200;

type Props = {
  youtubeUrl: string;
};

/**
 * Inline YouTube preview for posts. Renders the actual player immediately (no
 * thumbnail / custom play button) so the video can be watched directly in the
 * feed. The wrapping View claims the touch responder so taps reach the player's
 * WebView and do NOT bubble up to the surrounding post card's navigation.
 */
export default function PostYouTubePreview({ youtubeUrl }: Props) {
  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) return null;

  return (
    <View
      style={styles.wrapper}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
    >
      <YouTubeEmbed youtubeUrl={youtubeUrl} height={PLAYER_HEIGHT} autoplay={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
});
