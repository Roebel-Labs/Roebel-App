import React, { useEffect, memo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';

type Props = {
  videoUrl: string;
  isVisible?: boolean;
  autoPlay?: boolean;
};

function PostVideoPlayer({ videoUrl, isVisible = true, autoPlay = true }: Props) {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted, oldMuted: player.muted });

  useEffect(() => {
    if (!autoPlay) return;
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, autoPlay, player]);

  const toggleMute = () => {
    player.muted = !player.muted;
  };

  return (
    <View style={styles.container}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls
        allowsPictureInPicture
        contentFit="cover"
      />

      <Pressable
        onPress={toggleMute}
        hitSlop={8}
        style={[styles.muteBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
        accessibilityLabel={muted ? 'Ton einschalten' : 'Ton ausschalten'}
      >
        <Ionicons
          name={muted ? 'volume-mute' : 'volume-high'}
          size={16}
          color="#ffffff"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  muteBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(PostVideoPlayer);
