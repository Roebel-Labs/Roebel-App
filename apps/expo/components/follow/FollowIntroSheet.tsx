import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useRelations } from '@/context/RelationsContext';
import BottomDrawer from '@/components/BottomDrawer';
import FollowList from './FollowList';
import { fetchFollowSuggestions, type FollowSuggestion } from '@/lib/supabase-follows';
import { submitFollowSelection } from '@/lib/follow-selection';

const FOLLOW_INTRO_SEEN_PREFIX = '@roebel/follow-intro-seen';

/** Seen flag per wallet: another account on the same device still gets its own intro. */
export function followIntroSeenKey(wallet: string): string {
  return `${FOLLOW_INTRO_SEEN_PREFIX}/${wallet.toLowerCase()}`;
}

/** One-time "Neu: Folgen & Stummschalten" sheet for existing users who follow nobody yet. */
export default function FollowIntroSheet() {
  const { colors } = useTheme();
  const { user } = useUser();
  const { ready, serverLoaded, snapshot, follow, unfollow } = useRelations();
  const wallet = user?.wallet_address?.toLowerCase() ?? null;
  const [visible, setVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<FollowSuggestion[] | null>(null);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // serverLoaded: an empty snapshot that was never synced (new device, reinstall) is not "follows
  // nobody" — showing the sheet there and saving would re-follow everything the user unfollowed.
  const eligible =
    !!wallet &&
    !!user?.onboarding_completed_at &&
    ready &&
    serverLoaded &&
    snapshot.following.length === 0 &&
    snapshot.unfollowed.length === 0;

  useEffect(() => {
    if (!eligible || !wallet) return;
    let alive = true;
    (async () => {
      try {
        if (await AsyncStorage.getItem(followIntroSeenKey(wallet))) return;
      } catch {
        return;
      }
      const list = await fetchFollowSuggestions().catch(() => []);
      if (!alive || list.length === 0) return;
      setSuggestions(list);
      setVisible(true);
    })();
    return () => {
      alive = false;
    };
  }, [eligible, wallet]);

  const markSeen = useCallback(async () => {
    if (!wallet) return;
    try {
      await AsyncStorage.setItem(followIntroSeenKey(wallet), '1');
    } catch {
      // best-effort; worst case the sheet shows once more
    }
  }, [wallet]);

  const close = useCallback(() => {
    setVisible(false);
    void markSeen();
  }, [markSeen]);

  const save = async () => {
    if (saving || !suggestions) return;
    setSaving(true);
    // On failure RelationsContext already shows its own snackbar; keep the sheet open for a retry.
    const ok = await submitFollowSelection(suggestions.map((s) => s.account_id), unticked, 'intro', follow, unfollow);
    setSaving(false);
    if (ok) close();
  };

  const allIds = useMemo(() => (suggestions ?? []).map((s) => s.account_id), [suggestions]);
  const toggle = (id: string) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!suggestions) return null;

  return (
    <BottomDrawer visible={visible} onClose={close} snapPoint={0.7}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Neu: Folgen & Stummschalten</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Wähle, wessen Beiträge du sehen möchtest. Stummgeschaltete Konten siehst du nirgends mehr – sie erfahren davon nichts.
        </Text>
        <View style={styles.list}>
          <FollowList
            suggestions={suggestions}
            unticked={unticked}
            onToggle={toggle}
            onAll={() => setUnticked(new Set())}
            onNone={() => setUnticked(new Set(allIds))}
          />
        </View>
        <Pressable
          onPress={() => void save()}
          disabled={saving}
          style={[styles.button, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Speichern</Text>
          )}
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 20, fontFamily: 'Inter-Bold', marginBottom: 6 },
  body: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20, marginBottom: 12 },
  list: { flex: 1 },
  button: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { fontSize: 15, fontFamily: 'Inter-Medium' },
});
