import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { fontFamily } from '@/constants/theme';
import {
  DEFAULT_AUDIO_ACCENT,
  fetchAudioShow,
  findActiveSegment,
  formatListenLength,
  formatPlayerClock,
  formatRelativeDay,
  shadeHex,
  type TranscriptSegment,
} from '@/lib/audio-content';
import {
  PLAYBACK_RATES,
  SKIP_BACK_SECONDS,
  SKIP_FORWARD_SECONDS,
  useAudioPlaybackStatus,
  useAudioPlayerControls,
} from '@/context/AudioPlayerContext';

const W60 = 'rgba(255,255,255,0.6)';
const W12 = 'rgba(255,255,255,0.12)';
const SHEET_BG = '#1C1C1E';

const RATE_LABEL: Record<number, string> = {
  0.8: 'Langsam',
  1: 'Normal',
  1.1: 'Entspannt',
  1.2: 'Zügig',
  1.5: 'Schnell',
  1.75: 'Sehr schnell',
  2: 'Doppelt',
};
const SLEEP_OPTIONS = [5, 10, 15, 30, 45, 60];

type Sheet = 'speed' | 'sleep' | 'info' | null;

function tap(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  Haptics.impactAsync(style).catch(() => {});
}

export default function AudioPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { track } = useAudioPlayerControls();
  const [mode, setMode] = useState<'player' | 'transcript'>('player');
  const [sheet, setSheet] = useState<Sheet>(null);

  // The rail loads series without transcripts; the full series (same cache
  // key as the series page) carries them.
  const showId = track?.show.id;
  const { data: fullShow } = useQuery({
    queryKey: ['audio-show', showId],
    queryFn: () => fetchAudioShow(String(showId)),
    enabled: Boolean(showId),
  });
  const transcript = useMemo<TranscriptSegment[]>(() => {
    if (!track) return [];
    if (track.episode.transcript.length > 0) return track.episode.transcript;
    return fullShow?.episodes.find((e) => e.id === track.episode.id)?.transcript ?? [];
  }, [track, fullShow]);

  // Closing playback from elsewhere leaves nothing to show.
  useEffect(() => {
    if (!track && router.canGoBack()) router.back();
  }, [track, router]);

  if (!track) return <View style={[styles.root, { backgroundColor: DEFAULT_AUDIO_ACCENT }]} />;

  const accent = track.show.accent_color ?? DEFAULT_AUDIO_ACCENT;
  const deep = shadeHex(accent, 0.45);

  return (
    <View style={[styles.root, { backgroundColor: deep }]}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[accent, deep]} locations={[0, 0.75]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.grabberWrap, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.grabber} />
      </View>

      {mode === 'player' ? (
        <PlayerView
          transcript={transcript}
          accent={accent}
          bottomInset={insets.bottom}
          onOpenTranscript={() => setMode('transcript')}
          onSheet={setSheet}
          onDismiss={() => router.back()}
        />
      ) : (
        <TranscriptView transcript={transcript} accent={accent} bottomInset={insets.bottom} onClose={() => setMode('player')} />
      )}

      <SpeedSheet visible={sheet === 'speed'} onClose={() => setSheet(null)} />
      <SleepSheet visible={sheet === 'sleep'} onClose={() => setSheet(null)} />
      <InfoSheet visible={sheet === 'info'} onClose={() => setSheet(null)} />
    </View>
  );
}

// ─── Player view ──────────────────────────────────────────────

function PlayerView({
  transcript,
  accent,
  bottomInset,
  onOpenTranscript,
  onSheet,
  onDismiss,
}: {
  transcript: TranscriptSegment[];
  accent: string;
  bottomInset: number;
  onOpenTranscript: () => void;
  onSheet: (s: Sheet) => void;
  onDismiss: () => void;
}) {
  const { width } = useWindowDimensions();
  const { track } = useAudioPlayerControls();
  if (!track) return null;
  const { episode, show } = track;
  const cover = episode.cover_url ?? show.cover_url;
  const coverSize = Math.min(width - 48, 380);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 32 }} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <RoundIcon icon="chevron-down" label="Player schließen" onPress={onDismiss} />
        <Text style={styles.headerLabel} numberOfLines={1}>
          {show.title}
        </Text>
        <RoundIcon icon="information-circle-outline" label="Über diese Folge" onPress={() => onSheet('info')} />
      </View>

      <View style={styles.coverWrap}>
        <View style={[styles.coverShadow, { width: coverSize, height: coverSize }]}>
          <View style={styles.coverInner}>
            {cover ? (
              <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            ) : (
              <Ionicons name="headset" size={80} color={W60} />
            )}
          </View>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.episodeTitle} numberOfLines={2}>
          {episode.title}
        </Text>
        <Text style={styles.showTitle} numberOfLines={1}>
          {show.title}
          {show.author ? ` · ${show.author}` : ''}
        </Text>
      </View>

      <View style={styles.side}>
        <Scrubber />
      </View>
      <Controls onSheet={onSheet} />

      {transcript.length > 0 ? (
        <TranscriptCard transcript={transcript} accent={accent} onOpen={onOpenTranscript} />
      ) : null}

      {episode.description ? (
        <View style={[styles.aboutCard, { backgroundColor: 'rgba(0,0,0,0.18)' }]}>
          <Text style={styles.cardKicker}>Über diese Folge</Text>
          <Text style={styles.aboutText}>{episode.description}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

/** Seek bar. Drag uses the responder system and refuses to hand the touch
 * to the parent ScrollView, so scrubbing never scrolls the page. */
function Scrubber({ compact = false }: { compact?: boolean }) {
  const { currentTime, duration } = useAudioPlaybackStatus();
  const { seekTo } = useAudioPlayerControls();
  const [scrub, setScrub] = useState<number | null>(null);
  const trackRef = useRef<View>(null);
  const geometry = useRef({ x: 0, width: 1 });

  const ratioFrom = (e: GestureResponderEvent) =>
    Math.max(0, Math.min(1, (e.nativeEvent.pageX - geometry.current.x) / geometry.current.width));

  const onGrant = (e: GestureResponderEvent) => {
    const pageX = e.nativeEvent.pageX;
    trackRef.current?.measure((_x, _y, w, _h, px) => {
      geometry.current = { x: px, width: Math.max(1, w) };
      setScrub(Math.max(0, Math.min(1, (pageX - px) / Math.max(1, w))));
    });
  };

  const ratio = scrub ?? (duration > 0 ? Math.min(1, currentTime / duration) : 0);
  const shownTime = scrub !== null ? scrub * duration : currentTime;

  return (
    <View>
      <View
        ref={trackRef}
        style={styles.scrubHit}
        onStartShouldSetResponder={() => duration > 0}
        onMoveShouldSetResponder={() => duration > 0}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={(e) => setScrub(ratioFrom(e))}
        onResponderRelease={(e) => {
          const r = ratioFrom(e);
          setScrub(null);
          seekTo(r * duration);
          tap();
        }}
        onResponderTerminate={() => setScrub(null)}
        accessibilityRole="adjustable"
        accessibilityLabel="Wiedergabeposition"
        accessibilityValue={{ text: formatPlayerClock(currentTime) }}
      >
        <View style={[styles.scrubTrack, scrub !== null && styles.scrubTrackActive]}>
          <View style={[styles.scrubFill, { width: `${ratio * 100}%` }]} />
        </View>
      </View>
      {!compact ? (
        <View style={styles.times}>
          <Text style={styles.time}>{formatPlayerClock(shownTime)}</Text>
          <Text style={styles.time}>-{formatPlayerClock(Math.max(0, duration - shownTime))}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Controls({ onSheet, compact = false }: { onSheet?: (s: Sheet) => void; compact?: boolean }) {
  const { toggle, skip, rate, sleepTimer } = useAudioPlayerControls();
  const { playing, isBuffering } = useAudioPlaybackStatus();
  const big = compact ? 60 : 78;

  return (
    <View style={[styles.controls, compact && styles.controlsCompact]}>
      {onSheet ? (
        <Pressable onPress={() => onSheet('speed')} hitSlop={10} style={styles.sideControl} accessibilityLabel="Geschwindigkeit">
          <Text style={styles.rateText}>{rate === 1 ? '1×' : `${rate}×`}</Text>
        </Pressable>
      ) : (
        <View style={styles.sideControl} />
      )}
      <Pressable
        onPress={() => {
          tap();
          skip(-SKIP_BACK_SECONDS);
        }}
        style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
        accessibilityLabel={`${SKIP_BACK_SECONDS} Sekunden zurück`}
      >
        <Ionicons name="play-back" size={18} color="#fff" style={styles.skipIcon} />
        <Text style={styles.skipText}>{SKIP_BACK_SECONDS}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          tap(Haptics.ImpactFeedbackStyle.Medium);
          toggle();
        }}
        style={({ pressed }) => [
          styles.play,
          { width: big, height: big, borderRadius: big / 2 },
          pressed && styles.pressed,
        ]}
        accessibilityLabel={playing ? 'Pausieren' : 'Abspielen'}
      >
        <Ionicons
          name={playing ? 'pause' : isBuffering ? 'ellipsis-horizontal' : 'play'}
          size={compact ? 28 : 36}
          color="#000"
          style={!playing && !isBuffering ? { marginLeft: 4 } : undefined}
        />
      </Pressable>
      <Pressable
        onPress={() => {
          tap();
          skip(SKIP_FORWARD_SECONDS);
        }}
        style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
        accessibilityLabel={`${SKIP_FORWARD_SECONDS} Sekunden vor`}
      >
        <Ionicons name="play-forward" size={18} color="#fff" style={styles.skipIcon} />
        <Text style={styles.skipText}>{SKIP_FORWARD_SECONDS}</Text>
      </Pressable>
      {onSheet ? (
        <Pressable onPress={() => onSheet('sleep')} hitSlop={10} style={styles.sideControl} accessibilityLabel="Schlaf-Timer">
          <Ionicons name={sleepTimer ? 'moon' : 'moon-outline'} size={22} color={sleepTimer ? '#fff' : W60} />
        </Pressable>
      ) : (
        <View style={styles.sideControl} />
      )}
    </View>
  );
}

/** Spotify-style lyrics card under the controls: a live window of the
 * transcript, tap to open the full reader. */
function TranscriptCard({ transcript, accent, onOpen }: { transcript: TranscriptSegment[]; accent: string; onOpen: () => void }) {
  const { currentTime } = useAudioPlaybackStatus();
  const active = findActiveSegment(transcript, currentTime);
  const from = Math.max(0, active - 1);
  const windowed = transcript.slice(from, from + 4);

  return (
    <Pressable
      onPress={() => {
        tap();
        onOpen();
      }}
      style={({ pressed }) => [styles.transcriptCard, { backgroundColor: shadeHex(accent, 0.2) }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Text mitlesen"
    >
      <View style={styles.transcriptCardHeader}>
        <Text style={styles.cardKicker}>Mitlesen</Text>
        <View style={styles.expandPill}>
          <Ionicons name="expand" size={14} color="#fff" />
        </View>
      </View>
      {windowed.map((seg, i) => {
        const index = from + i;
        return (
          <Text
            key={index}
            numberOfLines={3}
            style={[styles.cardLine, { color: index === active ? '#fff' : index < active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.32)' }]}
          >
            {seg.text}
          </Text>
        );
      })}
    </Pressable>
  );
}

// ─── Full transcript reader ───────────────────────────────────

const MANUAL_SCROLL_GRACE_MS = 4000;

function TranscriptView({
  transcript,
  accent,
  bottomInset,
  onClose,
}: {
  transcript: TranscriptSegment[];
  accent: string;
  bottomInset: number;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const { track, seekTo } = useAudioPlayerControls();
  const { currentTime } = useAudioPlaybackStatus();
  const active = findActiveSegment(transcript, currentTime);

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const userScrolledAt = useRef(0);
  const [detached, setDetached] = useState(false);
  const initialScrollDone = useRef(false);

  const scrollToActive = useCallback(
    (animated: boolean) => {
      const y = offsets.current[Math.max(0, active)];
      if (y === undefined) return;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - height * 0.22), animated });
    },
    [active, height],
  );

  // Follow the playhead unless the reader scrolled away on purpose.
  useEffect(() => {
    if (Date.now() - userScrolledAt.current < MANUAL_SCROLL_GRACE_MS) return;
    setDetached(false);
    scrollToActive(true);
  }, [active, scrollToActive]);

  const onLineLayout = useCallback((index: number, e: LayoutChangeEvent) => {
    offsets.current[index] = e.nativeEvent.layout.y;
  }, []);

  const onSeekLine = useCallback(
    (index: number) => {
      tap();
      userScrolledAt.current = 0;
      seekTo(transcript[index].start);
    },
    [seekTo, transcript],
  );

  const onUserScroll = (_e: NativeSyntheticEvent<NativeScrollEvent>) => {
    userScrolledAt.current = Date.now();
    setDetached(true);
  };

  if (!track) return null;
  const cover = track.episode.cover_url ?? track.show.cover_url;

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.flex}>
      <View style={styles.readerHeader}>
        <View style={styles.readerCover}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        </View>
        <View style={styles.flex}>
          <Text style={styles.readerTitle} numberOfLines={2}>
            {track.episode.title}
          </Text>
          <Text style={styles.readerShow} numberOfLines={1}>
            {track.show.title}
          </Text>
        </View>
        <RoundIcon icon="close" label="Text schließen" onPress={onClose} />
      </View>

      <View style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.readerContent, { paddingBottom: height * 0.45 }]}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={onUserScroll}
          scrollEventThrottle={64}
          onContentSizeChange={() => {
            // Lines measure after the first frame; jump (no animation) to the current one once.
            if (initialScrollDone.current) return;
            initialScrollDone.current = true;
            requestAnimationFrame(() => scrollToActive(false));
          }}
        >
          {transcript.map((seg, i) => (
            <TranscriptLine
              key={i}
              index={i}
              text={seg.text}
              state={i === active ? 'active' : i < active ? 'past' : 'future'}
              onLayout={onLineLayout}
              onPress={onSeekLine}
            />
          ))}
        </ScrollView>
        <LinearGradient
          colors={[`${accent}00`, shadeHex(accent, 0.45)]}
          style={styles.readerFade}
          pointerEvents="none"
        />
        {detached ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.followPillWrap}>
            <Pressable
              onPress={() => {
                userScrolledAt.current = 0;
                setDetached(false);
                scrollToActive(true);
              }}
              style={styles.followPill}
            >
              <Ionicons name="locate" size={14} color="#000" />
              <Text style={styles.followPillText}>Zur aktuellen Stelle</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      <View style={[styles.readerControls, { paddingBottom: bottomInset + 12 }]}>
        <Scrubber />
        <Controls compact />
      </View>
    </Animated.View>
  );
}

const TranscriptLine = memo(function TranscriptLine({
  index,
  text,
  state,
  onLayout,
  onPress,
}: {
  index: number;
  text: string;
  state: 'active' | 'past' | 'future';
  onLayout: (index: number, e: LayoutChangeEvent) => void;
  onPress: (index: number) => void;
}) {
  return (
    <Pressable onLayout={(e) => onLayout(index, e)} onPress={() => onPress(index)} style={styles.lineHit}>
      <Text
        style={[
          styles.line,
          state === 'active' ? styles.lineActive : state === 'past' ? styles.linePast : styles.lineFuture,
        ]}
      >
        {text}
      </Text>
    </Pressable>
  );
});

// ─── Sheets ───────────────────────────────────────────────────

function BottomSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Schließen" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.sheetGrabber} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderSide} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <View style={styles.sheetHeaderSide}>
            <RoundIcon icon="close" label="Schließen" onPress={onClose} />
          </View>
        </View>
        {children}
      </View>
    </Modal>
  );
}

function SpeedSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { rate, setRate } = useAudioPlayerControls();
  return (
    <BottomSheet visible={visible} title="Geschwindigkeit" onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rateRow}>
        {PLAYBACK_RATES.map((r) => {
          const selected = r === rate;
          return (
            <Pressable
              key={r}
              onPress={() => {
                tap();
                setRate(r);
              }}
              style={[styles.rateChip, selected && styles.rateChipSelected]}
              accessibilityState={{ selected }}
            >
              <Text style={styles.rateChipValue}>{r}×</Text>
              <Text style={styles.rateChipLabel}>{RATE_LABEL[r] ?? ''}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.sheetNote}>Gilt für alle Folgen und bleibt gespeichert.</Text>
    </BottomSheet>
  );
}

function SleepSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { sleepTimer, setSleepTimer } = useAudioPlayerControls();
  const now = useNow(visible && sleepTimer?.kind === 'minutes');
  const remaining = sleepTimer?.kind === 'minutes' ? Math.max(0, Math.round((sleepTimer.endsAt - now) / 1000)) : null;

  const choose = (value: { minutes: number } | 'episode' | null) => {
    tap();
    setSleepTimer(value);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Schlaf-Timer" onClose={onClose}>
      {sleepTimer ? (
        <View style={styles.sleepActive}>
          <Text style={styles.sleepBig}>{remaining !== null ? formatPlayerClock(remaining) : 'Folgenende'}</Text>
          <Text style={styles.sheetNote}>
            {remaining !== null ? 'bis die Wiedergabe pausiert' : 'Pausiert, wenn diese Folge zu Ende ist'}
          </Text>
        </View>
      ) : null}
      <View style={styles.sleepGrid}>
        {SLEEP_OPTIONS.map((m) => (
          <Pressable key={m} onPress={() => choose({ minutes: m })} style={({ pressed }) => [styles.sleepOption, pressed && styles.pressed]}>
            <Text style={styles.sleepValue}>{m}</Text>
            <Text style={styles.sleepUnit}>Min.</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => choose('episode')} style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}>
        <Text style={styles.sheetRowText}>Am Ende der Folge</Text>
        {sleepTimer?.kind === 'episode' ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
      </Pressable>
      {sleepTimer ? (
        <Pressable onPress={() => choose(null)} style={({ pressed }) => [styles.sheetButton, pressed && styles.pressed]}>
          <Text style={styles.sheetButtonText}>Timer ausschalten</Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}

/** Wall clock that ticks once a second while `active` (countdown display). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Refresh right away: the sheet stays mounted while hidden, so the last value can be minutes old.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active]);
  return now;
}

function InfoSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { track } = useAudioPlayerControls();
  if (!track) return null;
  const { episode, show } = track;
  const cover = episode.cover_url ?? show.cover_url;
  const meta = [formatRelativeDay(episode.published_at), formatListenLength(episode.duration_seconds)].filter(Boolean).join(' · ');
  return (
    <BottomSheet visible={visible} title={show.kind === 'audiobook' ? 'Kapitel' : 'Folge'} onClose={onClose}>
      <ScrollView style={styles.infoScroll} contentContainerStyle={styles.infoContent}>
        <View style={styles.infoCover}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        </View>
        <Text style={styles.infoShow}>{show.title}</Text>
        <Text style={styles.infoTitle}>{episode.title}</Text>
        {meta ? <Text style={styles.infoMeta}>{meta}</Text> : null}
        {episode.description || show.description ? (
          <>
            <View style={styles.infoDivider} />
            <Text style={styles.infoKicker}>Shownotes</Text>
            <Text style={styles.infoBody}>{episode.description ?? show.description}</Text>
          </>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

function RoundIcon({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.round, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  grabberWrap: { alignItems: 'center', paddingBottom: 4 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  headerLabel: { flex: 1, textAlign: 'center', color: W60, fontSize: 13, fontFamily: fontFamily.semiBold, letterSpacing: 0.3 },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverWrap: { alignItems: 'center', marginTop: 12 },
  coverShadow: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  coverInner: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: W12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { paddingHorizontal: 24, marginTop: 28 },
  episodeTitle: { color: '#fff', fontSize: 24, lineHeight: 29, fontFamily: fontFamily.heading },
  showTitle: { color: W60, fontSize: 15, marginTop: 4, fontFamily: fontFamily.regular },
  side: { paddingHorizontal: 24, marginTop: 22 },
  scrubHit: { paddingVertical: 12, justifyContent: 'center' },
  scrubTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  scrubTrackActive: { height: 10, borderRadius: 5 },
  scrubFill: { height: '100%', backgroundColor: '#fff' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { color: W60, fontSize: 13, fontFamily: fontFamily.mono },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 18,
  },
  controlsCompact: { marginTop: 4, paddingHorizontal: 0 },
  sideControl: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rateText: { color: '#fff', fontSize: 16, fontFamily: fontFamily.semiBold },
  skip: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: W12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipIcon: { marginBottom: -2 },
  skipText: { color: '#fff', fontSize: 12, fontFamily: fontFamily.semiBold },
  play: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  transcriptCard: { marginHorizontal: 16, marginTop: 32, borderRadius: 18, padding: 18, gap: 10 },
  transcriptCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cardKicker: { color: '#fff', fontSize: 15, fontFamily: fontFamily.semiBold },
  expandPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLine: { fontSize: 21, lineHeight: 27, fontFamily: fontFamily.heading },
  aboutCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 18, padding: 18, gap: 8 },
  aboutText: { color: 'rgba(255,255,255,0.8)', fontSize: 15, lineHeight: 22, fontFamily: fontFamily.regular },
  readerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  readerCover: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: W12 },
  readerTitle: { color: '#fff', fontSize: 17, lineHeight: 21, fontFamily: fontFamily.heading },
  readerShow: { color: W60, fontSize: 13, marginTop: 2, fontFamily: fontFamily.regular },
  readerContent: { paddingHorizontal: 20, paddingTop: 16 },
  readerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80 },
  lineHit: { paddingVertical: 8 },
  line: { fontSize: 28, lineHeight: 35, fontFamily: fontFamily.heading },
  lineActive: { color: '#fff' },
  linePast: { color: 'rgba(255,255,255,0.45)' },
  lineFuture: { color: 'rgba(255,255,255,0.22)' },
  followPillWrap: { position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center' },
  followPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  followPillText: { color: '#000', fontSize: 14, fontFamily: fontFamily.semiBold },
  readerControls: { paddingHorizontal: 24, paddingTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: SHEET_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 },
  sheetGrabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  sheetHeaderSide: { width: 44, alignItems: 'flex-end' },
  sheetTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontFamily: fontFamily.semiBold },
  sheetNote: { color: W60, fontSize: 14, paddingHorizontal: 20, marginTop: 12, fontFamily: fontFamily.regular },
  rateRow: { paddingHorizontal: 16, gap: 10, paddingVertical: 8 },
  rateChip: {
    width: 92,
    height: 76,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateChipSelected: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.14)' },
  rateChipValue: { color: '#fff', fontSize: 22, fontFamily: fontFamily.bold },
  rateChipLabel: { color: W60, fontSize: 12, marginTop: 2, fontFamily: fontFamily.medium },
  sleepActive: { alignItems: 'center', paddingVertical: 12 },
  sleepBig: { color: '#fff', fontSize: 48, fontFamily: fontFamily.semiBold },
  sleepGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginTop: 8 },
  sleepOption: {
    width: '31%',
    flexGrow: 1,
    height: 72,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepValue: { color: '#fff', fontSize: 24, fontFamily: fontFamily.semiBold },
  sleepUnit: { color: W60, fontSize: 12, fontFamily: fontFamily.medium },
  sheetRow: {
    marginHorizontal: 16,
    marginTop: 10,
    height: 56,
    borderRadius: 18,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetRowText: { color: '#fff', fontSize: 16, fontFamily: fontFamily.medium },
  sheetButton: {
    marginHorizontal: 16,
    marginTop: 14,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetButtonText: { color: '#000', fontSize: 16, fontFamily: fontFamily.semiBold },
  infoScroll: { maxHeight: 520 },
  infoContent: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 },
  infoCover: { width: 160, height: 160, borderRadius: 20, overflow: 'hidden', backgroundColor: W12 },
  infoShow: { color: W60, fontSize: 15, marginTop: 16, fontFamily: fontFamily.medium },
  infoTitle: { color: '#fff', fontSize: 22, lineHeight: 27, marginTop: 4, textAlign: 'center', fontFamily: fontFamily.heading },
  infoMeta: { color: W60, fontSize: 14, marginTop: 8, fontFamily: fontFamily.regular },
  infoDivider: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 18 },
  infoKicker: { alignSelf: 'flex-start', color: W60, fontSize: 14, fontFamily: fontFamily.medium },
  infoBody: { alignSelf: 'flex-start', color: '#fff', fontSize: 16, lineHeight: 24, marginTop: 8, fontFamily: fontFamily.regular },
});
