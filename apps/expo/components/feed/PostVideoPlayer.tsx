import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Text,
  ActivityIndicator,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useTheme } from '@/context/ThemeContext';
import { useAutoHideControls } from '@/hooks/useAutoHideControls';
import VideoScrubber from './VideoScrubber';

type Props = {
  videoUrl: string;
  isVisible?: boolean;
  autoPlay?: boolean;
  /**
   * Start with sound on. Post detail, create/preview and fullscreen pass this;
   * the feed leaves it off so scrolling cards autoplay muted.
   */
  startUnmuted?: boolean;
};

const DOUBLE_TAP_MS = 280;
const SEEK_STEP = 10;

const formatTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function PostVideoPlayer({
  videoUrl,
  isVisible = true,
  autoPlay = true,
  startUnmuted = false,
}: Readonly<Props>) {
  const { colors } = useTheme();
  const videoViewRef = useRef<VideoView>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = !startUnmuted;
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
  const { currentTime, bufferedPosition } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const { videoTrack } = useEvent(player, 'videoTrackChange', {
    videoTrack: null,
    oldVideoTrack: null,
  });
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
    oldStatus: player.status,
    error: null,
  });

  const {
    visible: controlsVisible,
    show: showControls,
    toggle: toggleControls,
  } = useAutoHideControls(isPlaying);

  const trackSize = videoTrack?.size;
  const aspectRatio =
    trackSize && trackSize.width > 0 && trackSize.height > 0
      ? trackSize.width / trackSize.height
      : 16 / 9;

  const duration = player.duration || 0;

  // While scrubbing, show the dragged time instead of the live playhead.
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const displayTime = scrubTime ?? currentTime ?? 0;
  const progress = duration > 0 ? Math.min(1, displayTime / duration) : 0;
  const buffered = duration > 0 ? Math.min(1, (bufferedPosition || 0) / duration) : 0;
  const isBuffering = status === 'loading';

  useEffect(() => {
    if (!autoPlay) return;
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, autoPlay, player]);

  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
    showControls();
  }, [player, showControls]);

  const toggleMute = useCallback(() => {
    player.muted = !player.muted;
    showControls();
  }, [player, showControls]);

  const handleFullscreen = useCallback(() => {
    player.muted = false; // fullscreen always plays with sound
    videoViewRef.current?.enterFullscreen();
  }, [player]);

  const handlePictureInPicture = useCallback(() => {
    videoViewRef.current?.startPictureInPicture();
  }, []);

  // Double-tap seek ripple feedback.
  const [seekFlash, setSeekFlash] = useState<null | 'back' | 'forward'>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSeek = useCallback(
    (delta: number) => {
      player.seekBy(delta);
      setSeekFlash(delta < 0 ? 'back' : 'forward');
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSeekFlash(null), 550);
      showControls();
    },
    [player, showControls]
  );

  // Tap layer: single tap toggles controls, double tap on the left/right
  // half seeks ∓10s (the signature YouTube gesture).
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTapArea = useCallback(
    (e: GestureResponderEvent) => {
      const now = Date.now();
      const x = e.nativeEvent.locationX;
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        if (singleTapTimer.current) {
          clearTimeout(singleTapTimer.current);
          singleTapTimer.current = null;
        }
        const toLeft = containerWidth > 0 && x < containerWidth / 2;
        doSeek(toLeft ? -SEEK_STEP : SEEK_STEP);
      } else {
        lastTap.current = now;
        if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
        singleTapTimer.current = setTimeout(() => {
          toggleControls();
          singleTapTimer.current = null;
        }, DOUBLE_TAP_MS);
      }
    },
    [containerWidth, doSeek, toggleControls]
  );

  useEffect(
    () => () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );

  const onScrubStart = useCallback(() => showControls(), [showControls]);
  const onScrub = useCallback((t: number) => setScrubTime(t), []);
  const onScrubEnd = useCallback(
    (t: number) => {
      player.currentTime = t;
      setScrubTime(null);
      showControls();
    },
    [player, showControls]
  );

  return (
    <View
      style={[styles.container, { aspectRatio }]}
      onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <VideoView
        ref={videoViewRef}
        style={styles.video}
        player={player}
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically={false}
        contentFit="contain"
      />

      {/* Tap layer: single tap = toggle controls, double tap L/R = seek ∓10s */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTapArea} />

      {/* Double-tap seek ripple */}
      {seekFlash && (
        <View
          pointerEvents="none"
          style={[
            styles.seekFlash,
            seekFlash === 'back' ? styles.seekFlashLeft : styles.seekFlashRight,
          ]}
        >
          <Ionicons
            name={seekFlash === 'back' ? 'play-back' : 'play-forward'}
            size={26}
            color="#fff"
          />
          <Text style={styles.seekFlashText}>{SEEK_STEP}s</Text>
        </View>
      )}

      {/* Buffering spinner (only when controls are hidden, to avoid clutter) */}
      {isBuffering && !controlsVisible && (
        <View pointerEvents="none" style={styles.centerHit}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {/* Persistent mute affordance — always tappable so "tap for sound" is discoverable */}
      <Pressable
        onPress={toggleMute}
        hitSlop={8}
        style={styles.muteBtn}
        accessibilityLabel={muted ? 'Ton einschalten' : 'Ton ausschalten'}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
        {muted && <Text style={styles.muteLabel}>Ton</Text>}
      </Pressable>

      {controlsVisible && (
        <>
          {/* Top + bottom scrims for legibility */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.45)', 'transparent'] as const}
            style={styles.scrimTop}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', 'rgba(0,0,0,0.55)'] as const}
            style={styles.scrimBottom}
          />

          {/* Center play / pause */}
          <View pointerEvents="box-none" style={styles.centerHit}>
            <Pressable
              onPress={togglePlay}
              hitSlop={16}
              style={styles.centerBtn}
              accessibilityLabel={isPlaying ? 'Pause' : 'Abspielen'}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#fff" />
            </Pressable>
          </View>

          {/* Bottom control bar */}
          <View pointerEvents="box-none" style={styles.bottomBar}>
            <View pointerEvents="box-none" style={styles.scrubRow}>
              <VideoScrubber
                progress={progress}
                buffered={buffered}
                duration={duration}
                accent={colors.primary}
                onScrubStart={onScrubStart}
                onScrub={onScrub}
                onScrubEnd={onScrubEnd}
              />
            </View>
            <View pointerEvents="box-none" style={styles.metaRow}>
              <Text style={styles.timeText}>
                {formatTime(displayTime)} / {formatTime(duration)}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  onPress={handlePictureInPicture}
                  hitSlop={10}
                  accessibilityLabel="Bild-in-Bild"
                >
                  <Ionicons name="albums-outline" size={18} color="#fff" />
                </Pressable>
                <Pressable onPress={handleFullscreen} hitSlop={10} accessibilityLabel="Vollbild">
                  <Ionicons name="expand" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        </>
      )}
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
  centerBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  muteLabel: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'MonaSans-SemiBold',
  },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 104,
  },
  bottomBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 8,
  },
  scrubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  timeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'MonaSans-Medium',
  },
  seekFlash: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '35%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  seekFlashLeft: {
    left: 0,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  seekFlashRight: {
    right: 0,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  seekFlashText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'MonaSans-SemiBold',
    marginTop: 2,
  },
});

export default memo(PostVideoPlayer);
