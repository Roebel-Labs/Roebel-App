import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput } from 'react-native';
import { Skeleton } from '@/components/SkeletonLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { ArrowLeftIcon } from '@/components/Icons';
import SideSelectionGroup from '@/components/SideSelectionGroup';
import VariantSelectionGroup from '@/components/VariantSelectionGroup';
import MenuItemThumbs from '@/components/MenuItemThumbs';
import MeckyNotFound from '@/components/MeckyNotFound';
import { useMenuItemDetail } from '@/hooks/useMenuItemDetail';
import { supabase } from '@/lib/supabase';
import type { MenuItemRecord, MenuItemVoteSummary } from '@/lib/types';
import { fetchMenuItemVoteSummaries } from '@/lib/supabase-menu';

export default function MenuItemDetailScreen() {
  const router = useRouter();
  const { id: accountId, itemId } = useLocalSearchParams<{ id: string; itemId: string }>();
  const { colors } = useTheme();
  const { item, loading, userVote, isSignedIn, setVote, clearVote } = useMenuItemDetail(itemId);
  const [selectedSide, setSelectedSide] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [related, setRelated] = useState<MenuItemRecord[]>([]);
  const [relatedVotes, setRelatedVotes] = useState<Record<string, MenuItemVoteSummary>>({});

  useEffect(() => {
    if (!item) return;
    const defaultSide = item.sides.find((s) => s.is_default) ?? item.sides[0];
    if (defaultSide) setSelectedSide(defaultSide.id);
    const defaultVariant = item.variants.find((v) => v.is_default) ?? item.variants[0];
    if (defaultVariant) setSelectedVariant(defaultVariant.id);
  }, [item]);

  const displayPrice = React.useMemo(() => {
    if (!item) return 0;
    if (item.variants.length && selectedVariant) {
      const v = item.variants.find((x) => x.id === selectedVariant);
      if (v) return Number(v.price);
    }
    return item.price;
  }, [item, selectedVariant]);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', item.restaurant_id)
        .neq('id', item.id)
        .eq('is_available', true)
        .limit(6);
      if (cancelled) return;
      const items = (data ?? []) as MenuItemRecord[];
      setRelated(items);
      const votes = await fetchMenuItemVoteSummaries(items.map((i) => i.id));
      if (!cancelled) setRelatedVotes(votes);
    })();
    return () => { cancelled = true; };
  }, [item]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} scrollEnabled={false}>
          <Skeleton width="100%" height={280} borderRadius={0} />
          <View style={styles.headBlock}>
            <Skeleton width="70%" height={26} />
            <Skeleton width={80} height={18} style={{ marginTop: 8 } as any} />
            <Skeleton width="100%" height={14} style={{ marginTop: 16 } as any} />
            <Skeleton width="85%" height={14} style={{ marginTop: 6 } as any} />
            <View style={[styles.thumbsRow, { marginTop: 20 }]}>
              <Skeleton width={80} height={32} borderRadius={9999} />
              <Skeleton width={48} height={32} borderRadius={9999} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.floatingBack}>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.background }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} />
          </Pressable>
        </View>
        <MeckyNotFound title="Gericht nicht gefunden" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Hero */}
        <View style={[styles.heroWrap, { backgroundColor: colors.surfaceSecondary }]}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.hero} contentFit="cover" />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-Medium', fontSize: 16 }}>
                Kein Bild
              </Text>
            </View>
          )}
          <View style={styles.floatingBack}>
            <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.background }]}>
              <ArrowLeftIcon size={24} color={colors.tabIconActive} />
            </Pressable>
          </View>
        </View>

        {/* Title + price + description */}
        <View style={styles.headBlock}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{item.name}</Text>
          <Text style={[styles.price, { color: colors.textPrimary }]}>
            {item.variants.length > 0 ? `ab €${item.price.toFixed(2)}` : `€${displayPrice.toFixed(2)}`}
          </Text>
          {!!item.description && (
            <Text style={[styles.description, { color: colors.textPrimary }]}>{item.description}</Text>
          )}
          <View style={styles.thumbsRow}>
            <MenuItemThumbs summary={item.vote_summary} />
            <MenuItemThumbs
              summary={item.vote_summary}
              interactive
              userVote={(userVote?.vote as 1 | -1 | undefined) ?? null}
              onVote={(v) => {
                if (!isSignedIn) return;
                if (userVote?.vote === v) clearVote();
                else setVote(v);
              }}
            />
          </View>
          {!isSignedIn && (
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Melde dich an, um zu bewerten.
            </Text>
          )}
        </View>

        {/* Variants (size, portion) */}
        {item.variants.length > 0 && (
          <VariantSelectionGroup
            label={item.variants_label || 'Größe wählen'}
            variants={item.variants}
            value={selectedVariant}
            onChange={setSelectedVariant}
          />
        )}

        {/* Sides */}
        {item.sides.length > 0 && (
          <SideSelectionGroup
            label={item.sides_label || 'Wähle deine Beilage'}
            required={item.sides_required}
            sides={item.sides}
            value={selectedSide}
            onChange={setSelectedSide}
          />
        )}

        {/* Special Instructions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Special Instructions</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note"
            placeholderTextColor={colors.textTertiary}
            multiline
            style={[styles.noteInput, { borderColor: colors.borderSecondary, color: colors.textPrimary, backgroundColor: colors.surface }]}
          />
          <Text style={[styles.hint, { color: colors.textTertiary }]}>You may be charged for extras.</Text>
        </View>

        {/* Frequently bought together */}
        {related.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Häufig zusammen gekauft</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
              {related.map((rel) => (
                <Pressable
                  key={rel.id}
                  onPress={() => router.replace(`/account/${accountId}/menu/${rel.id}`)}
                  style={styles.relCard}
                >
                  {rel.image_url ? (
                    <Image source={{ uri: rel.image_url }} style={styles.relImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.relImg, { backgroundColor: colors.surfaceSecondary }]} />
                  )}
                  <Text style={[styles.relName, { color: colors.textPrimary }]} numberOfLines={1}>{rel.name}</Text>
                  <View style={styles.relMeta}>
                    <Text style={[styles.relPrice, { color: colors.textPrimary }]}>€{rel.price.toFixed(2)}</Text>
                    <MenuItemThumbs summary={relatedVotes[rel.id] ?? null} />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroWrap: { width: '100%', height: 280, position: 'relative' },
  hero: { width: '100%', height: '100%' },
  heroPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  floatingBack: { position: 'absolute', top: 16, left: 16, zIndex: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 9999, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  headBlock: { paddingHorizontal: 16, paddingTop: 24 },
  title: { fontSize: 26, fontFamily: 'Inter-Medium' },
  price: { fontSize: 17, fontFamily: 'Inter-Medium', marginTop: 6 },
  description: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20, marginTop: 12 },
  thumbsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 },
  hint: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 8 },
  section: { paddingHorizontal: 16, paddingTop: 28 },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter-Medium', marginBottom: 12 },
  noteInput: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80, fontFamily: 'Inter-Regular', fontSize: 14, textAlignVertical: 'top' },
  relCard: { width: 140 },
  relImg: { width: 140, height: 140, borderRadius: 12 },
  relName: { fontSize: 14, fontFamily: 'Inter-Medium', marginTop: 8 },
  relMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  relPrice: { fontSize: 13, fontFamily: 'Inter-Regular' },
});
