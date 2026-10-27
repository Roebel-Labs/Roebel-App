/**
 * Mecky's Erkunden layout proposal (tool proposeExploreLayout).
 * Shows the resulting visible order + what gets hidden. Nothing is saved
 * until the user taps "Übernehmen" — the AI proposes, the person decides.
 * The proposal is re-sanitised here, so a restored or tampered message
 * cannot write anything the block registry does not know.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { fetchLiveMiniApps } from '@/lib/miniapps';
import {
  getExploreBlock,
  miniAppSlugOf,
  sanitizeLayout,
  saveExploreLayout,
  visibleBlockIds,
} from '@/lib/explore-layout';

type Proposal = { order: string[]; hidden: string[]; presetId?: string | null; summary?: string };

export default function LayoutProposalCard({ proposal }: { proposal: Proposal }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [applied, setApplied] = useState(false);
  const layout = useMemo(() => sanitizeLayout(proposal), [proposal]);

  const { data: miniApps } = useQuery({
    queryKey: ['explore', 'mini-apps'],
    queryFn: fetchLiveMiniApps,
    meta: { persist: true },
  });

  if (!layout) return null;

  const labelOf = (id: string) => {
    const slug = miniAppSlugOf(id);
    if (slug) return miniApps?.find((a) => a.slug === slug)?.name ?? null;
    return getExploreBlock(id)?.label ?? null;
  };
  const visible = visibleBlockIds(layout).map(labelOf).filter((l): l is string => !!l);
  const hidden = layout.hidden.map(labelOf).filter((l): l is string => !!l);

  const apply = async () => {
    await saveExploreLayout(layout, proposal.presetId ?? null);
    setApplied(true);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Vorschlag für Erkunden</Text>
      {proposal.summary ? (
        <Text style={[styles.summary, { color: colors.textSecondary }]}>{proposal.summary}</Text>
      ) : null}

      {visible.map((label, i) => (
        <Text key={`${label}-${i}`} style={[styles.item, { color: colors.textPrimary }]}>
          {i + 1}. {label}
        </Text>
      ))}
      {hidden.length > 0 && (
        <Text style={[styles.hidden, { color: colors.textSecondary }]}>Ausgeblendet: {hidden.join(', ')}</Text>
      )}

      {applied ? (
        <View style={styles.actions}>
          <Text style={[styles.done, { color: colors.textSecondary }]}>Übernommen ✓</Text>
          <Pressable onPress={() => router.push('/explore' as any)} hitSlop={8} accessibilityRole="link">
            <Text style={[styles.link, { color: colors.primary }]}>Erkunden ansehen</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            onPress={() => void apply()}
            style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Übernehmen</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/settings/darstellung' as any)} hitSlop={8} accessibilityRole="link">
            <Text style={[styles.link, { color: colors.primary }]}>Selbst anpassen</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 8, gap: 4 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 15, marginBottom: 2 },
  summary: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: 6 },
  item: { fontFamily: fontFamily.regular, fontSize: 14 },
  hidden: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  button: { paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  link: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  done: { fontFamily: fontFamily.medium, fontSize: 14 },
});
