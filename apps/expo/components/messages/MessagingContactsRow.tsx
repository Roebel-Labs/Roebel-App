import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useActiveAccount } from 'thirdweb/react';
import { chatFont, useChatTokens } from '@/components/chat/tokens';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { fetchMessagingContacts, type MessagingContact } from '@/lib/supabase-messages';

const SIZE = 60;
const RADIUS = 22;

type Props = {
  /** Tap on a person: open (or start) the chat with that wallet. */
  onPress: (contact: MessagingContact) => void;
  /** Wallet currently being opened — dims that tile. */
  openingWallet?: string | null;
};

/**
 * Top row of the inbox: everyone who activated private messages, as a
 * horizontal strip of rounded-square faces with their name underneath.
 */
export default function MessagingContactsRow({ onPress, openingWallet }: Props) {
  const t = useChatTokens();
  const account = useActiveAccount();
  const [contacts, setContacts] = useState<MessagingContact[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchMessagingContacts(account?.address ?? null)
      .then((list) => {
        if (!cancelled) setContacts(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  if (contacts.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: t.textSecondary }]}>
          Private Nachrichten aktiv
        </Text>
        <Text style={[styles.count, { color: t.textTertiary }]}>{contacts.length}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {contacts.map((c) => (
          <Pressable
            key={c.wallet}
            style={({ pressed }) => [
              styles.tile,
              (pressed || openingWallet === c.wallet) && { opacity: 0.6 },
            ]}
            onPress={() => onPress(c)}
            disabled={!!openingWallet}
            accessibilityRole="button"
            accessibilityLabel={`Chat mit ${c.name}`}
          >
            <UserAvatarWithFrame
              size={SIZE}
              radius={RADIUS}
              uri={c.avatarUrl}
              fallbackInitial={(c.name[0] || '?').toUpperCase()}
              frameAssetUrl={null}
            />
            <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
    paddingBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontFamily: chatFont.medium,
  },
  count: {
    fontSize: 14,
    fontFamily: chatFont.regular,
  },
  strip: {
    paddingHorizontal: 14,
    gap: 6,
  },
  tile: {
    width: SIZE + 12,
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 13,
    fontFamily: chatFont.regular,
    maxWidth: SIZE + 8,
  },
});
