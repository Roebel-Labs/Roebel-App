import React, { useEffect, useRef, memo } from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';

type Props = {
  videoUrl: string;
  isVisible?: boolean;
  autoPlay?: boolean;
};

const formatTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function PostVideoPlayer({ videoUrl, isVisible = true, autoPlay = true }: Readonly<Props>) {
  const videoViewRef = useRef<VideoView>(null);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.25;
  });

  const { muted } = useEvent(player, 'mutedChange', {
    muted: player.muted,
    oldMuted: player.muted,
  });

  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
    oldIsPlaying: player.playing,
  });

  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  const { videoTrack } = useEvent(player, 'videoTrackChange', {
    videoTrack: null,
    oldVideoTrack: null,
  });

  const trackSize = videoTrack?.size;
  const aspectRatio =
    trackSize && trackSize.width > 0 && trackSize.height > 0
      ? trackSize.width / trackSize.height
      : 16 / 9;

  const duration = player.duration || 0;
  const progress = duration > 0 ? Math.min(1, (currentTime || 0) / duration) : 0;

  useEffect(() => {
    if (!autoPlay) return;
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, autoPlay, player]);

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const toggleMute = () => {
    player.muted = !player.muted;
  };

  const handleFullscreen = () => {
    videoViewRef.current?.enterFullscreen();
  };

  return (
    <View style={[styles.container, { aspectRatio }]}>
      <VideoView
        ref={videoViewRef}
        style={styles.video}
        player={player}
        nativeControls={false}
        allowsPictureInPicture
        contentFit="contain"
      />

      {/* Center play/pause — also receives taps anywhere on the video */}
      <Pressable onPress={togglePlay} style={styles.centerHit}>
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={56}
          color="#ffffff"
          style={styles.iconShadow}
        />
      </Pressable>

      {/* Mute toggle (top-right) */}
      <Pressable
        onPress={toggleMute}
        hitSlop={8}
        style={styles.muteBtn}
        accessibilityLabel={muted ? 'Ton einschalten' : 'Ton ausschalten'}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color="#ffffff" />
      </Pressable>

      {/* Time + fullscreen, sitting above the progress bar */}
      <View style={styles.bottomRow} pointerEvents="box-none">
        <Text style={styles.timeText}>
          {formatTime(currentTime || 0)} / {formatTime(duration)}
        </Text>
        <Pressable
          onPress={handleFullscreen}
          hitSlop={10}
          accessibilityLabel="Vollbild"
        >
          <Ionicons name="expand" size={18} color="#ffffff" style={styles.iconShadow} />
        </Pressable>
      </View>

      {/* 8px progress track at bottom edge */}
      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  centerHit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  bottomRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  iconShadow: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ffffff',
  },
});

export default memo(PostVideoPlayer);
