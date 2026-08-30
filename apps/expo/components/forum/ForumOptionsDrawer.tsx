import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';

/** The node's public index — where anyone can verify a signed post. */
const INDEX_BASE = 'https://index.roebel.app';

type Props = {
  visible: boolean;
  onClose: () => void;
  targetType: 'thread' | 'reply';
  targetId: string;
  isOwner: boolean;
  onShare: () => void;
  onCopy: () => void;
  onReport: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Enables the subscription row when this thread is on the public record. */
  isSubscribed?: boolean;
  onToggleSubscription?: () => void;
};

export default function ForumOptionsDrawer({
  visible,
  onClose,
  targetType,
  targetId,
  isOwner,
  onShare,
  onCopy,
  onReport,
  onEdit,
  onDelete,
  isSubscribed = false,
  onToggleSubscription,
}: Props) {
  const { colors } = useTheme();

  // Looked up lazily when the drawer opens: a forum post that reached the relay has
  // a published event id in the ledger, and that id IS the proof — the hash of
  // the signed content, resolvable by anyone on the public index.
  const [proofEventId, setProofEventId] = useState<string | null>(null);
  useEffect(() => {
    if (!visible || !targetId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase
          .from('nostr_publications')
          .select('event_id')
          .eq('source_type', targetType === 'thread' ? 'forum_thread' : 'forum_reply')
          .eq('source_id', targetId)
          .eq('status', 'published')
          .maybeSingle();
        if (!cancelled) setProofEventId((data?.event_id as string | null) ?? null);
      } catch {
        if (!cancelled) setProofEventId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, targetId, targetType]);

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        {proofEventId && (
          <Pressable
            onPress={() => {
              onClose();
              void Linking.openURL(`${INDEX_BASE}/events?ids=${proofEventId}`);
            }}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.pressedOverlay },
            ]}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.rowText, { color: colors.textPrimary }]}>Digitaler Nachweis</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            onClose();
            onShare();
          }}
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: colors.border },
            pressed && { backgroundColor: colors.pressedOverlay },
          ]}
        >
          <Ionicons name="share-social-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.rowText, { color: colors.textPrimary }]}>Teilen</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            onClose();
            onCopy();
          }}
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: colors.border },
            pressed && { backgroundColor: colors.pressedOverlay },
          ]}
        >
          <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.rowText, { color: colors.textPrimary }]}>Text kopieren</Text>
        </Pressable>

        {targetType === 'thread' && onToggleSubscription && (
          <Pressable
            onPress={() => {
              onClose();
              onToggleSubscription();
            }}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.pressedOverlay },
            ]}
          >
            <Ionicons
              name={isSubscribed ? 'notifications-off-outline' : 'notifications-outline'}
              size={20}
              color={colors.textPrimary}
            />
            <Text style={[styles.rowText, { color: colors.textPrimary }]}>
              {isSubscribed ? 'Benachrichtigungen deaktivieren' : 'Benachrichtigungen aktivieren'}
            </Text>
          </Pressable>
        )}

        {isOwner ? (
          <>
            <Pressable
              onPress={() => {
                onClose();
                onEdit();
              }}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.pressedOverlay },
              ]}
            >
              <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>Bearbeiten</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onClose();
                onDelete();
              }}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.pressedOverlay },
              ]}
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
              <Text style={[styles.rowText, { color: colors.error }]}>Löschen</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => {
              onClose();
              onReport();
            }}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.pressedOverlay },
            ]}
          >
            <Ionicons name="flag-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.rowText, { color: colors.textPrimary }]}>Melden</Text>
          </Pressable>
        )}
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
