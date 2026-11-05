import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { formatRelativeTimestamp } from '@/lib/utils';
import {
  createDishComment,
  fetchDishComments,
  type DishComment,
  type DishTarget,
} from '@/lib/supabase-dish-comments';

const AVATAR = 32;
const MAX_LENGTH = 1000;

type Props = { target: DishTarget };

/** "Kommentare" block for every dish page: newest first, inline composer for signed-in users. */
export default function DishComments({ target }: Props) {
  const { colors } = useTheme();
  const { user } = useUser();
  const [comments, setComments] = useState<DishComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDishComments(target).then((rows) => {
      if (cancelled) return;
      setComments(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [target.kind, target.id]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !user?.wallet_address || sending) return;
    setSending(true);
    setFailed(false);
    const saved = await createDishComment(target, user.wallet_address, text);
    setSending(false);
    if (!saved) {
      setFailed(true);
      return;
    }
    setComments((prev) => [saved, ...prev]);
    setDraft('');
  }, [draft, user?.wallet_address, sending, target]);

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Kommentare{comments.length > 0 ? ` (${comments.length})` : ''}
      </Text>

      {user?.wallet_address ? (
        <View style={[styles.composer, { borderColor: colors.borderSecondary, backgroundColor: colors.surface }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Wie war's? Schreib einen Kommentar"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_LENGTH}
            style={[styles.input, { color: colors.textPrimary }]}
            accessibilityLabel="Kommentar schreiben"
          />
          <Pressable
            onPress={send}
            disabled={!canSend}
            style={[styles.sendBtn, { backgroundColor: canSend ? colors.primary : colors.surfaceSecondary }]}
            accessibilityRole="button"
            accessibilityLabel="Kommentar senden"
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="send" size={16} color={canSend ? '#ffffff' : colors.textTertiary} />
            )}
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>Melde dich an, um zu kommentieren.</Text>
      )}
      {failed ? (
        <Text style={[styles.hint, { color: colors.error }]}>
          Kommentar konnte nicht gesendet werden. Bitte versuche es erneut.
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.textTertiary} />
      ) : comments.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>Noch keine Kommentare.</Text>
      ) : (
        comments.map((c) => {
          const name = c.author?.username || 'Röbeler*in';
          return (
            <View key={c.id} style={styles.row}>
              {c.author?.profile_picture_url ? (
                <Image source={{ uri: c.author.profile_picture_url }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.avatarText, { color: colors.textSecondary }]}>
                    {name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.body}>
                <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{name}</Text>
                  {'  ·  '}
                  {formatRelativeTimestamp(c.created_at)}
                </Text>
                <Text style={[styles.content, { color: colors.textPrimary }]}>{c.content}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 28 },
  title: { fontSize: 18, fontFamily: 'MonaSansSemiCondensed-Medium', marginBottom: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingVertical: 8,
    fontFamily: 'MonaSans-Regular',
    fontSize: 15,
    textAlignVertical: 'top',
  },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, fontFamily: 'MonaSans-Regular', marginTop: 8 },
  loading: { marginTop: 16 },
  empty: { fontSize: 14, fontFamily: 'MonaSans-Regular', marginTop: 16 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontFamily: 'MonaSans-SemiBold' },
  body: { flex: 1 },
  meta: { fontSize: 13, fontFamily: 'MonaSans-Regular' },
  name: { fontFamily: 'MonaSans-SemiBold' },
  content: { fontSize: 15, fontFamily: 'MonaSans-Regular', lineHeight: 21, marginTop: 2 },
});
