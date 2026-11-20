// What a guest sees over their own camera while on air (Max, 2026-11-06): a small live view of the
// broadcast (muted: its sound would go into the guest's microphone) and the live chat, read-only.
// No LiveKit here: the join screen renders this into GuestStage's `overlay` slot.
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchChat, subscribeShowChanges, type ChatMessage } from '@/lib/live';
import ChatRow from '../ChatRow';
import { F } from '../tokens';

const MAX_MESSAGES = 40;
const VIEW_W = 168;

type Props = {
  showId: string;
  hlsUrl: string | null;
  topInset: number;
  bottomInset: number;
};

export default function GuestCompanion({ showId, hlsUrl, topInset, bottomInset }: Props) {
  // Own muted player for the live view (the room's shared player stays paused while the guest is on air).
  const player = useVideoPlayer(hlsUrl ?? '', (p) => {
    p.muted = true;
    p.loop = false;
    if (hlsUrl) p.play();
  });

  const [chat, setChat] = useState<ChatMessage[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchChat(showId).then((h) => { if (alive) setChat(h.slice(-MAX_MESSAGES)); });
    const unsubscribe = subscribeShowChanges(showId, {
      onChatInsert: (m) => {
        if (m.hidden_at) return;
        setChat((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m].slice(-MAX_MESSAGES)));
      },
      onChatUpdate: (m) => {
        setChat((cur) => (m.hidden_at ? cur.filter((x) => x.id !== m.id) : cur.map((x) => (x.id === m.id ? m : x))));
      },
      onResubscribed: () => { void fetchChat(showId).then((h) => { if (alive) setChat(h.slice(-MAX_MESSAGES)); }); },
    });
    return () => { alive = false; unsubscribe(); };
  }, [showId]);

  const listData = useMemo(() => [...chat].reverse(), [chat]);
  // Above GuestStage's control row (52 px buttons + paddings).
  const chatBottom = Math.max(bottomInset, 16) + 8 + 52 + 16 + 10;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {hlsUrl ? (
        <View style={[styles.liveView, { top: topInset + 52 }]} pointerEvents="none">
          <VideoView player={player} style={styles.fill} contentFit="cover" nativeControls={false} />
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTagText}>Sendung</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.chat, { bottom: chatBottom }]} pointerEvents="box-none">
        <FlatList
          data={listData}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <ChatRow m={item} own={false} animate={false} variant="overlay" />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chatContent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  liveView: {
    position: 'absolute', left: 12, width: VIEW_W, height: Math.round((VIEW_W * 9) / 16), borderRadius: 10, overflow: 'hidden',
    backgroundColor: '#000', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)',
  },
  liveTag: {
    position: 'absolute', left: 6, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3040' },
  liveTagText: { color: '#fff', fontSize: 10, fontFamily: F.bold, letterSpacing: 0.4 },
  chat: { position: 'absolute', left: 8, right: 48, height: 240 },
  chatContent: { paddingVertical: 4 },
});
