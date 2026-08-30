import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { createForumThread, fetchForumCategories } from '@/lib/supabase-forum';

export default function ForumNewScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isCitizen } = useUser();
  const { activeAccount } = useAccount();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['forum', 'categories'],
    queryFn: fetchForumCategories,
    staleTime: 5 * 60_000,
  });

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !user?.wallet_address) return;
    setSubmitting(true);
    setError(null);
    const thread = await createForumThread({
      wallet_address: user.wallet_address,
      account_id: activeAccount?.id,
      title,
      body,
      category_slug: categorySlug,
    });
    setSubmitting(false);
    if (!thread) {
      setError('Thema konnte nicht erstellt werden. Bitte versuche es erneut.');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['forum', 'threads'] });
    await queryClient.invalidateQueries({ queryKey: ['feed', 'sections', 'rathaus'] });
    router.replace(`/forum/thread/${thread.id}` as any);
  };

  if (!isCitizen) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Neues Thema</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={[styles.locked, { color: colors.textSecondary }]}>
          Nur verifizierte Bürger können Themen erstellen.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Neues Thema</Text>
          <Pressable onPress={handleSubmit} disabled={!canSubmit} hitSlop={12}>
            {submitting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text
                style={[
                  styles.submit,
                  { color: canSubmit ? colors.primary : colors.textTertiary },
                ]}
              >
                Erstellen
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Titel deines Themas"
            placeholderTextColor={colors.textTertiary}
            maxLength={200}
            style={[styles.titleInput, { color: colors.textPrimary, borderColor: colors.border }]}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Worum geht es? Beschreibe dein Anliegen …"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={10000}
            style={[styles.bodyInput, { color: colors.textPrimary, borderColor: colors.border }]}
          />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Kategorie (optional)
          </Text>
          <View style={styles.categoryRow}>
            {categories.map((c) => {
              const active = categorySlug === c.slug;
              return (
                <Pressable
                  key={c.slug}
                  onPress={() => setCategorySlug(active ? null : c.slug)}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: active ? colors.primaryForeground : colors.textPrimary },
                    ]}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error ? <Text style={[styles.error, { color: colors.error ?? '#d33' }]}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: fontFamily.semiBold },
  submit: { fontSize: 15, fontFamily: fontFamily.semiBold },
  locked: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 32,
  },
  form: { padding: 16, gap: 16 },
  titleInput: {
    fontSize: 17,
    fontFamily: fontFamily.semiBold,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  bodyInput: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    minHeight: 140,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  sectionLabel: { fontSize: 12, fontFamily: fontFamily.medium },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryChipText: { fontSize: 13, fontFamily: fontFamily.medium },
  error: { fontSize: 13, fontFamily: fontFamily.regular },
});
