/**
 * The sheet a map category opens: the places behind Essen, Cafés, Bars and
 * the rest, as a tappable list. Which places belong where is decided in
 * lib/map/category-items — this component only lays them out.
 *
 * Tapping a row hands the place to the map screen, which selects it and
 * opens the place sheet; this sheet comes back when that one closes.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { categoryByKey, type MapCategoryKey } from '@/lib/map/categories';
import { accountIdForPin, EMPTY_ORG_INDEX, type OrgIndex } from '@/lib/map/org-lookup';
import { placeKey, type PlaceItem } from '@/lib/map/place-item';
import PlaceListRow from './PlaceListRow';

type Props = {
  categoryKey: MapCategoryKey;
  items: PlaceItem[];
  onSelectPlace: (item: PlaceItem) => void;
  onClose: () => void;
  /** Pin → org resolution, used to show the community count in Empfehlungen. */
  orgIndex?: OrgIndex;
  /** Community score per `accounts.id`. */
  scores?: Record<string, number>;
};

const EMPTY_COPY: Record<MapCategoryKey, string> = {
  empfehlungen: 'Noch keine Empfehlungen.',
  essen: 'Noch kein Restaurant eingetragen.',
  cafes: 'Noch kein Café eingetragen.',
  bars: 'Noch keine Bar eingetragen.',
  ausgehen: 'Gerade keine anstehenden Veranstaltungen.',
  shops: 'Noch kein Geschäft eingetragen.',
  uebernachten: 'Noch keine Unterkunft eingetragen.',
};

function countLabel(key: MapCategoryKey, count: number): string {
  if (key === 'ausgehen') return count === 1 ? '1 Termin' : `${count} Termine`;
  return count === 1 ? '1 Ort' : `${count} Orte`;
}

export default function MapCategorySheet({
  categoryKey,
  items,
  onSelectPlace,
  onClose,
  orgIndex = EMPTY_ORG_INDEX,
  scores = {},
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['55%', '92%'], []);
  const category = categoryByKey(categoryKey);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} />
    ),
    []
  );

  const trailingFor = useCallback(
    (item: PlaceItem): string | null => {
      if (categoryKey !== 'empfehlungen') return null;
      const accountId = accountIdForPin(orgIndex, item.entityType, item.id);
      const score = accountId ? (scores[accountId] ?? 0) : 0;
      return score > 0 ? `👍 ${score}` : null;
    },
    [categoryKey, orgIndex, scores]
  );

  const renderItem = useCallback(
    ({ item }: { item: PlaceItem }) => (
      <PlaceListRow item={item} onPress={onSelectPlace} trailing={trailingFor(item)} />
    ),
    [onSelectPlace, trailingFor]
  );

  if (!category) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      // Two fixed stops; a measured content height as a third would make the
      // sheet land somewhere different for every category.
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <BottomSheetFlatList
        data={items}
        keyExtractor={placeKey}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.icon}>{category.icon}</Text>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{category.label}</Text>
            </View>
            <Text style={[styles.count, { color: colors.textSecondary }]}>
              {countLabel(categoryKey, items.length)}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {EMPTY_COPY[categoryKey]}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              Orte aus Röbel erscheinen hier, sobald sie in der App eingetragen sind.
            </Text>
          </View>
        }
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4 },
  header: { paddingBottom: 6, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 26 },
  title: { fontFamily: fontFamily.heading, fontSize: 26 },
  count: { fontFamily: fontFamily.medium, fontSize: 13 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  empty: {
    marginTop: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
});
