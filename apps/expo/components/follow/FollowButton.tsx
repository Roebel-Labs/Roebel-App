import React, { useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useRelations } from '@/context/RelationsContext';
import BottomDrawer from '@/components/BottomDrawer';

type Props = { accountId: string; muteWallet: string | null; ownAccountIds?: string[] };

/** Folgen / Folgst du pill; long-press offers Stummschalten (silent, like X). */
export default function FollowButton({ accountId, muteWallet, ownAccountIds = [] }: Props) {
  const { colors } = useTheme();
  const { user } = useUser();
  const { isFollowing, isMuted, follow, unfollow, mute, unmute } = useRelations();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user || ownAccountIds.includes(accountId)) return null;
  const following = isFollowing(accountId);
  const muted = isMuted(accountId);
  // The same lowercased wallet must reach mute and unmute for personal accounts.
  const wallet = muteWallet ? muteWallet.toLowerCase() : null;
  const muteLabel = muted ? 'Stummschaltung aufheben' : 'Stummschalten';

  return (
    <>
      <Pressable
        onPress={() => void (following ? unfollow([accountId]) : follow([accountId], 'manual'))}
        onLongPress={() => setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={following ? 'Entfolgen' : 'Folgen'}
        accessibilityHint="Lange drücken für Stummschalten"
        style={[
          styles.pill,
          following
            ? { backgroundColor: 'transparent', borderColor: colors.border }
            : { backgroundColor: colors.primary, borderColor: colors.primary },
        ]}
      >
        <Text style={[styles.label, { color: following ? colors.textPrimary : colors.onPrimary }]}>
          {muted ? 'Stummgeschaltet' : following ? 'Folgst du' : 'Folgen'}
        </Text>
      </Pressable>
      <BottomDrawer visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <Pressable
          onPress={() => {
            setMenuOpen(false);
            void (muted ? unmute(accountId, wallet) : mute(accountId, wallet));
          }}
          accessibilityRole="button"
          style={styles.menuRow}
        >
          <Text style={[styles.menuText, { color: colors.textPrimary }]}>{muteLabel}</Text>
        </Pressable>
        <Pressable onPress={() => setMenuOpen(false)} accessibilityRole="button" style={styles.menuRow}>
          <Text style={[styles.menuText, { color: colors.textSecondary }]}>Abbrechen</Text>
        </Pressable>
      </BottomDrawer>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start' },
  label: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  menuRow: { paddingHorizontal: 20, paddingVertical: 16 },
  menuText: { fontSize: 16, fontFamily: 'Inter-Medium' },
});
