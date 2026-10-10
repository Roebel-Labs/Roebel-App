import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWelcomeWizard } from '@/context/WelcomeWizardContext';
import { useRelations } from '@/context/RelationsContext';
import { useTheme } from '@/context/ThemeContext';
import { isSingleStep } from '@/lib/profile-completion';
import { fetchFollowSuggestions, type FollowSuggestion } from '@/lib/supabase-follows';
import { submitFollowSelection } from '@/lib/follow-selection';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';
import FollowList from '@/components/follow/FollowList';

export default function WelcomeFollowScreen() {
  const router = useRouter();
  const { state, dispatch } = useWelcomeWizard();
  const { colors } = useTheme();
  const { follow, unfollow } = useRelations();
  const single = isSingleStep(useLocalSearchParams<{ single?: string }>().single);
  const [suggestions, setSuggestions] = useState<FollowSuggestion[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchFollowSuggestions()
      .then((list) => {
        if (!alive) return;
        setSuggestions(list);
        dispatch({ type: 'SET_FOLLOW_ALL', payload: list.map((s) => s.account_id) });
      })
      .catch(() => alive && setSuggestions([]));
    return () => {
      alive = false;
    };
  }, [dispatch]);

  const unticked = useMemo(() => new Set(state.followUnticked), [state.followUnticked]);
  const setUnticked = (s: Set<string>) => dispatch({ type: 'SET_FOLLOW_UNTICKED', payload: [...s] });
  const toggle = (id: string) => {
    const next = new Set(unticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setUnticked(next);
  };

  const next = async () => {
    if (!single) {
      router.push('/welcome/consent' as any);
      return;
    }
    if (saving || !suggestions) return;
    setSaving(true);
    try {
      await submitFollowSelection(suggestions.map((s) => s.account_id), unticked, 'onboarding', follow, unfollow);
    } finally {
      setSaving(false);
      router.back();
    }
  };

  const header = (
    <View>
      {!single && <StoryProgress step={state.preferredRole === 'buerger' ? 4 : 3} totalSteps={state.preferredRole === 'buerger' ? 5 : 4} />}
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Wem möchtest du folgen?</Text>
      <Text style={[styles.subheading, { color: colors.textSecondary }]}>
        Du siehst trotzdem alle Beiträge – außer von Konten, denen du nicht folgst. Du kannst das jederzeit ändern.
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        {suggestions === null ? (
          <View style={styles.center}>{header}<ActivityIndicator color={colors.primary} /></View>
        ) : suggestions.length === 0 ? (
          <View>
            {header}
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Noch keine Konten in Röbel.</Text>
          </View>
        ) : (
          <FollowList
            suggestions={suggestions}
            unticked={unticked}
            onToggle={toggle}
            onAll={() => setUnticked(new Set())}
            onNone={() => setUnticked(new Set(suggestions.map((s) => s.account_id)))}
            header={header}
          />
        )}
      </View>
      <WizardFooter
        onBack={() => router.back()}
        onNext={() => void next()}
        nextLabel={single ? 'Speichern' : 'Weiter'}
        nextDisabled={saving || (single && suggestions === null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  center: { gap: 24 },
  heading: { fontSize: 26, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subheading: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 20, lineHeight: 22 },
  empty: { fontSize: 15, fontFamily: 'Inter-Regular' },
});
