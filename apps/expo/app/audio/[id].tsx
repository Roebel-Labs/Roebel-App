import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { fontFamily } from '@/constants/theme';
import {
  AUDIO_KIND_LABEL,
  AUDIO_LANGUAGE_LABEL,
  DEFAULT_AUDIO_ACCENT,
  fetchAudioShow,
  formatListenLength,
  formatRelativeDay,
  latestEpisode,
  shadeHex,
  type AudioEpisode,
  type AudioShowWithEpisodes,
} from '@/lib/audio-content';
import {
  useAudioPlayerControls,
  useAudioPlaybackStatus,
  useSavedAudioProgress,
  type SavedProgress,
} from '@/context/AudioPlayerContext';
import MiniPlayer from '@/components/audio/MiniPlayer';

const WHITE_60 = 'rgba(255,255,255,0.6)';
const WHITE_12 = 'rgba(255,255,255,0.12)';

export default function AudioShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: show, isPending, isError, refetch } = useQuery({
    queryKey: ['audio-show', id],
    queryFn: () => fetchAudioShow(String(id)),
    enabled: Boolean(id),
  });

  const accent = show?.accent_color ?? DEFAULT_AUDIO_ACCENT;

  return (
    <View style={[styles.root, { backgroundColor: shadeHex(accent, 0.35) }]}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[accent, shadeHex(accent, 0.35)]}
        locations={[0, 0.6]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <CircleButton icon="chevron-back" label="Zurück" onPress={() => router.back()} />
        {show ? (
          <CircleButton
            icon="share-outline"
            label="Teilen"
            onPress={() => {
              Share.share({ message: `${show.title} – jetzt in der Röbel App anhören` }).catch(() => {});
            }}
          />
        ) : null}
      </View>

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : isError || !show ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{isError ? 'Konnte nicht geladen werden' : 'Nicht gefunden'}</Text>
          {isError ? (
            <Pressable onPress={() => refetch()} style={styles.retry}>
              <Text style={styles.retryText}>Erneut versuchen</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ShowContent show={show} bottomInset={insets.bottom} />
      )}

      <MiniPlayer style={[styles.mini, { bottom: insets.bottom + 8 }]} />
    </View>
  );
}

function ShowContent({ show, bottomInset }: { show: AudioShowWithEpisodes; bottomInset: number }) {
  const { available, track, playEpisode, toggle } = useAudioPlayerControls();
  const progress = useSavedAudioProgress();
  const [expanded, setExpanded] = useState(false);

  const playable = show.episodes.filter((e) => e.audio_url);
  const isPodcast = show.kind === 'podcast';

  // "Fortsetzen" picks the episode last listened to, else the first unheard one.
  const resumeTarget = useMemo(() => {
    const started = playable
      .map((e) => ({ e, p: progress[e.id] }))
      .filter(({ p }) => p && !p.finished && p.position > 0)
      .sort((a, b) => (b.p?.updatedAt ?? 0) - (a.p?.updatedAt ?? 0))[0];
    if (started) return { episode: started.e, resume: true };
    const unheard = playable.find((e) => !progress[e.id]?.finished);
    return unheard ? { episode: unheard, resume: false } : playable[0] ? { episode: playable[0], resume: false } : null;
  }, [playable, progress]);

  const latest = latestEpisode(playable);
  const isCurrentShow = track?.show.id === show.id;

  const primary = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (isCurrentShow) {
      toggle();
      return;
    }
    if (resumeTarget) playEpisode(resumeTarget.episode, show);
  };

  const meta = [
    show.author ? { label: isPodcast ? 'Host' : 'Autor:in', value: show.author } : null,
    { label: 'Sprache', value: AUDIO_LANGUAGE_LABEL[show.language] ?? show.language.toUpperCase() },
    { label: 'Art', value: AUDIO_KIND_LABEL[show.kind] },
    { label: show.kind === 'audiobook' ? 'Kapitel' : 'Folgen', value: String(playable.length) },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: bottomInset + 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.coverShadow}>
          <View style={styles.cover}>
            {show.cover_url ? (
              <Image source={{ uri: show.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            ) : (
              <Ionicons name="headset" size={64} color={WHITE_60} />
            )}
          </View>
        </View>
        <Text style={styles.showTitle}>{show.title}</Text>
        {show.author ? <Text style={styles.showAuthor}>{show.author}</Text> : null}
      </View>

      {available && resumeTarget ? (
        <View style={styles.actions}>
          <PrimaryButton
            isCurrentShow={isCurrentShow}
            label={resumeTarget.resume ? 'Fortsetzen' : 'Abspielen'}
            onPress={primary}
          />
          {isPodcast && latest ? (
            <Pressable
              onPress={() => playEpisode(latest, show, { startAt: 0 })}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="pulse" size={18} color="#fff" />
              <Text style={styles.secondaryLabel}>Neueste Folge</Text>
            </Pressable>
          ) : resumeTarget.resume ? (
            <Pressable
              onPress={() => playable[0] && playEpisode(playable[0], show, { startAt: 0 })}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.secondaryLabel}>Von vorn</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {show.description ? (
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.descriptionWrap}>
          <Text style={styles.description} numberOfLines={expanded ? undefined : 4}>
            {show.description}
          </Text>
          {!expanded && show.description.length > 180 ? <Text style={styles.more}>Mehr</Text> : null}
        </Pressable>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metaRow}>
        {meta.map((m, i) => (
          <View key={m.label} style={[styles.metaItem, i > 0 && styles.metaDivider]}>
            <Text style={styles.metaLabel}>{m.label}</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {m.value}
            </Text>
          </View>
        ))}
      </ScrollView>

      <Text style={styles.listHeading}>{show.kind === 'audiobook' ? 'Kapitel' : 'Folgen'}</Text>
      {playable.map((episode) => (
        <EpisodeRow
          key={episode.id}
          episode={episode}
          show={show}
          saved={progress[episode.id]}
          isCurrent={track?.episode.id === episode.id}
        />
      ))}
    </ScrollView>
  );
}

function PrimaryButton({ isCurrentShow, label, onPress }: { isCurrentShow: boolean; label: string; onPress: () => void }) {
  const { playing } = useAudioPlaybackStatus();
  const showPause = isCurrentShow && playing;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
      <Ionicons name={showPause ? 'pause' : 'play'} size={18} color="#000" />
      <Text style={styles.primaryLabel}>{showPause ? 'Pause' : isCurrentShow ? 'Weiter' : label}</Text>
    </Pressable>
  );
}

function EpisodeRow({
  episode,
  show,
  saved,
  isCurrent,
}: {
  episode: AudioEpisode;
  show: AudioShowWithEpisodes;
  saved: SavedProgress | undefined;
  isCurrent: boolean;
}) {
  const router = useRouter();
  const { playEpisode, toggle } = useAudioPlayerControls();
  const meta = [
    episode.episode_number ? `Nr. ${episode.episode_number}` : null,
    formatRelativeDay(episode.published_at),
    formatListenLength(episode.duration_seconds),
  ]
    .filter(Boolean)
    .join(' · ');
  const ratio = saved && !saved.finished && saved.duration > 0 ? saved.position / saved.duration : 0;

  return (
    <Pressable
      onPress={() => {
        if (isCurrent) router.push('/audio/player' as never);
        else playEpisode(episode, show);
      }}
      style={({ pressed }) => [styles.episode, pressed && styles.episodePressed]}
      accessibilityRole="button"
      accessibilityLabel={`${episode.title} abspielen`}
    >
      <View style={styles.episodeText}>
        <Text style={styles.episodeMeta}>{meta}</Text>
        <Text style={[styles.episodeTitle, isCurrent && styles.episodeTitleActive]} numberOfLines={2}>
          {episode.title}
        </Text>
        {episode.description ? (
          <Text style={styles.episodeDescription} numberOfLines={2}>
            {episode.description}
          </Text>
        ) : null}
        <View style={styles.episodeFooter}>
          {saved?.finished ? (
            <View style={styles.heard}>
              <Ionicons name="checkmark-circle" size={14} color={WHITE_60} />
              <Text style={styles.heardText}>Gehört</Text>
            </View>
          ) : ratio > 0 ? (
            <View style={styles.rowProgress}>
              <View style={[styles.rowProgressFill, { width: `${ratio * 100}%` }]} />
            </View>
          ) : null}
        </View>
      </View>
      <EpisodePlayButton isCurrent={isCurrent} onPlay={() => playEpisode(episode, show)} onToggle={toggle} />
    </Pressable>
  );
}

function EpisodePlayButton({ isCurrent, onPlay, onToggle }: { isCurrent: boolean; onPlay: () => void; onToggle: () => void }) {
  const { playing } = useAudioPlaybackStatus();
  const showPause = isCurrent && playing;
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (isCurrent) onToggle();
        else onPlay();
      }}
      hitSlop={8}
      style={styles.episodePlay}
      accessibilityRole="button"
      accessibilityLabel={showPause ? 'Pausieren' : 'Abspielen'}
    >
      <Ionicons name={showPause ? 'pause' : 'play'} size={18} color="#000" style={showPause ? undefined : { marginLeft: 2 }} />
    </Pressable>
  );
}

function CircleButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.circle, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyTitle: { color: '#fff', fontSize: 17, fontFamily: fontFamily.semiBold },
  retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: WHITE_12 },
  retryText: { color: '#fff', fontFamily: fontFamily.medium },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    zIndex: 2,
  },
  circle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  hero: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 12 },
  coverShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    borderRadius: 14,
  },
  cover: {
    width: 248,
    height: 248,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: WHITE_12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showTitle: {
    marginTop: 24,
    color: '#fff',
    fontSize: 28,
    lineHeight: 32,
    textAlign: 'center',
    fontFamily: fontFamily.heading,
  },
  showAuthor: { marginTop: 6, color: WHITE_60, fontSize: 15, fontFamily: fontFamily.regular },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 22 },
  primaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryLabel: { color: '#000', fontSize: 16, fontFamily: fontFamily.semiBold },
  secondaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    backgroundColor: WHITE_12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryLabel: { color: '#fff', fontSize: 16, fontFamily: fontFamily.semiBold },
  descriptionWrap: { paddingHorizontal: 16, marginTop: 22 },
  description: { color: 'rgba(255,255,255,0.78)', fontSize: 16, lineHeight: 23, fontFamily: fontFamily.regular },
  more: { color: '#fff', marginTop: 4, fontFamily: fontFamily.semiBold, fontSize: 15 },
  metaRow: { paddingHorizontal: 16, marginTop: 24, gap: 0 },
  metaItem: { paddingRight: 18 },
  metaDivider: { paddingLeft: 18, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.25)' },
  metaLabel: { color: WHITE_60, fontSize: 13, fontFamily: fontFamily.regular },
  metaValue: { color: '#fff', fontSize: 16, marginTop: 4, fontFamily: fontFamily.semiBold, maxWidth: 180 },
  listHeading: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    paddingHorizontal: 16,
    marginTop: 32,
    marginBottom: 4,
  },
  episode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  episodePressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  episodeText: { flex: 1, minWidth: 0 },
  episodeMeta: { color: WHITE_60, fontSize: 12, fontFamily: fontFamily.medium },
  episodeTitle: { color: '#fff', fontSize: 16, lineHeight: 21, marginTop: 4, fontFamily: fontFamily.semiBold },
  episodeTitleActive: { textDecorationLine: 'underline' },
  episodeDescription: { color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 19, marginTop: 4, fontFamily: fontFamily.regular },
  episodeFooter: { marginTop: 8, minHeight: 4 },
  heard: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heardText: { color: WHITE_60, fontSize: 12, fontFamily: fontFamily.medium },
  rowProgress: { height: 3, borderRadius: 2, width: 120, backgroundColor: 'rgba(255,255,255,0.18)' },
  rowProgressFill: { height: 3, borderRadius: 2, backgroundColor: '#fff' },
  episodePlay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mini: { position: 'absolute', left: 0, right: 0 },
});
