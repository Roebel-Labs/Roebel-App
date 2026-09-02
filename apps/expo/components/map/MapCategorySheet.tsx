/**
 * The sheet a map category opens.
 *
 * The shell is final — snap points, drag, backdrop and dismiss all behave as
 * they will once the categories carry content. The BODY is a placeholder in
 * this slice: the curated lists behind Empfehlungen and the restaurant grid
 * behind Essen need a data model that is being specified separately, and a
 * fake list now would be harder to replace than an honest gap.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { categoryByKey, type MapCategoryKey } from '@/lib/map/categories';

type Props = {
  categoryKey: MapCategoryKey;
  onClose: () => void;
};

export default function MapCategorySheet({ categoryKey, onClose }: Props) {
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['55%', '92%'], []);
  const category = categoryByKey(categoryKey);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} />
    ),
    []
  );

  if (!category) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.icon}>{category.icon}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{category.label}</Text>
        </View>

        <View style={[styles.placeholder, { borderColor: colors.border }]}>
          <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>
            Kommt bald
          </Text>
          <Text style={[styles.placeholderBody, { color: colors.textSecondary }]}>
            {category.key === 'empfehlungen'
              ? 'Hier erscheinen kuratierte Listen aus Röbel — zusammengestellt von Menschen aus der Stadt.'
              : `Hier erscheinen die beliebtesten Orte in der Kategorie ${category.label}.`}
          </Text>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 26 },
  title: { fontFamily: fontFamily.heading, fontSize: 26 },
  placeholder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  placeholderTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  placeholderBody: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
});
