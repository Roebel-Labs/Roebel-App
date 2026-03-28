import React, { useMemo, useState } from 'react';
import { View, TextInput, StyleSheet, Text, Pressable, Modal, Switch, Platform } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Filters } from '@/lib/types';
import { logFilterUsed } from '@/lib/firebase';
import { useTheme } from '@/context/ThemeContext';

const CATEGORY_ICONS: Record<string, string> = {
  'Fest': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.65784 11.0022L4.18747 14.3105C2.3324 18.4844 1.40486 20.5713 2.41719 21.5837C3.42951 22.596 5.51646 21.6685 9.69037 19.8134L12.9987 18.343C15.5161 17.2242 16.7748 16.6647 16.9751 15.586C17.1754 14.5073 16.2014 13.5333 14.2535 11.5854L12.4155 9.7474C10.4675 7.79944 9.49353 6.82546 8.41482 7.02575C7.33611 7.22604 6.77669 8.48475 5.65784 11.0022Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 10.5L13.5 17.5M4.5 15.5L8.5 19.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 8L19 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.1973 2C14.5963 2.66667 14.9156 4.4 13 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 9.80274C21.3333 9.40365 19.6 9.08438 18 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.0009 2V2.02" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M22.0009 6V6.02" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M21.0009 13V13.02" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.0009 3V3.02" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Kultur': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 8C15 9.65685 13.6569 11 12 11C10.3431 11 9 9.65685 9 8C9 6.34315 10.3431 5 12 5C13.6569 5 15 6.34315 15 8Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 4C17.6568 4 19 5.34315 19 7C19 8.22309 18.268 9.27523 17.2183 9.7423" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7143 14H10.2857C7.91878 14 6 15.9188 6 18.2857C6 19.2325 6.76751 20 7.71428 20H16.2857C17.2325 20 18 19.2325 18 18.2857C18 15.9188 16.0812 14 13.7143 14Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.7139 13C20.0808 13 21.9996 14.9188 21.9996 17.2857C21.9996 18.2325 21.2321 19 20.2853 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 4C6.34315 4 5 5.34315 5 7C5 8.22309 5.73193 9.27523 6.78168 9.7423" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.71429 19C2.76751 19 2 18.2325 2 17.2857C2 14.9188 3.91878 13 6.28571 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Lesung': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.5055 2.01874C12.8289 2.83455 12 7.5 12 7.5V22C12 22 12.8867 17.1272 18.0004 16.5588C18.5493 16.4978 19 16.0576 19 15.5058V3.39309C19 2.5654 18.3216 1.87638 17.5055 2.01874Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.33333 5.00001C7.79379 4.99657 10.1685 5.88709 12 7.5V22C10.1685 20.3871 7.79379 19.4966 5.33333 19.5C3.77132 19.5 2.99032 19.5 2.64526 19.2792C2.4381 19.1466 2.35346 19.0619 2.22086 18.8547C2 18.5097 2 17.8941 2 16.6629V8.40322C2 6.97543 2 6.26154 2.54874 5.68286C3.09748 5.10418 3.65923 5.07432 4.78272 5.0146C4.965 5.00491 5.14858 5.00001 5.33333 5.00001Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 22.001C13.8315 20.3881 16.2062 19.4976 18.6667 19.501C20.2287 19.501 21.0097 19.501 21.3547 19.2802C21.5619 19.1476 21.6465 19.0629 21.7791 18.8558C22 18.5107 22 17.8951 22 16.6639V8.40424C22 6.97645 22 6.26256 21.4513 5.68388C20.9025 5.1052 20.1235 5.05972 19 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Mittelalter': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.98651 9.49122L5.67712 7.51305C4.15399 6.20286 4.14889 4.30146 3.98633 3.01953C5.65267 3.09861 6.94342 3.24947 8.06745 4.19897L9.24332 5.53489L10.5158 6.96356M19.4573 18.4181L16.4925 15.4183M14.0215 18.4181C14.0441 18.1459 14.2223 17.4401 15.0408 16.6839C15.7751 16.0054 17.3676 14.3794 18.0832 13.6743C18.4886 13.2749 19.1532 12.9947 19.4573 12.9952M15.5683 12.8081L16.9049 14.2869M13.6763 14.4363L15.1705 15.7499M20.4616 17.9803C21.292 17.9819 22.0011 18.5952 21.9995 19.4251C21.9979 20.2549 21.292 20.9825 20.4616 20.981C19.6312 20.9794 18.9908 20.2492 18.9924 19.4194C19.046 18.5936 19.6568 18.0913 20.4616 17.9803Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.59593 18.393L7.5539 15.5007M4.56157 12.9871C4.83402 13.0092 5.59357 13.1911 6.274 14.0411C6.89872 14.8214 8.58371 16.3306 9.29062 17.0443C9.69102 17.4487 9.97105 18.0891 9.97105 18.393M7.2645 14.2299L15.5035 4.66412C16.8442 3.168 18.7179 3.13531 20.0036 2.99805C19.8918 4.66142 19.7155 5.9481 18.7435 7.05254L8.54959 15.9263M5.00618 19.4988C5.00618 20.3286 4.33301 21.0014 3.5026 21.0014C2.6722 21.0014 1.99902 20.3286 1.99902 19.4988C1.99902 18.6689 2.6722 17.9962 3.5026 17.9962C4.33301 17.9962 5.00618 18.6689 5.00618 19.4988Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Natur': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 21.1932C2.68524 22.2443 3.57104 22.2443 4.27299 21.1932C6.52985 17.7408 8.67954 23.6764 10.273 21.2321C12.703 17.5694 14.4508 23.9218 16.273 21.1932C18.6492 17.5582 20.1295 23.5776 22 21.5842" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3.57228 17L2.07481 12.6457C1.80373 11.8574 2.30283 11 3.03273 11H20.8582C23.9522 11 19.9943 17 17.9966 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 11L15.201 7.50122C14.4419 6.55236 13.2926 6 12.0775 6H8C6.89543 6 6 6.89543 6 8V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 6V3C10 2.44772 9.55228 2 9 2H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

type Props = {
  value: Filters;
  onChange: (next: Filters) => void;
  categories: string[];
};

export default function FilterBar({ value, onChange, categories }: Props) {
  const { colors } = useTheme();
  const [isOpen, setOpen] = useState(false);

  const selectedCategoryLabel = useMemo(() => {
    return value.category === 'all' ? 'Alle Kategorien' : value.category;
  }, [value.category]);

  return (
    <View style={styles.wrapper}>
      <TextInput
        placeholder="Suche nach Titel, Ort..."
        value={value.query}
        onChangeText={(t) => onChange({ ...value, query: t })}
        style={[styles.search, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
        returnKeyType="search"
        accessibilityLabel="Veranstaltungen suchen"
      />

      <View style={styles.row}>
        <Pressable onPress={() => setOpen(true)} style={styles.chip} accessibilityLabel="Filter öffnen">
          <Text style={[styles.chipText, { color: colors.primary }]}>{selectedCategoryLabel}</Text>
        </Pressable>
        <View style={styles.freeRow}>
          <Text style={[styles.freeText, { color: colors.tabIconActive }]}>Nur kostenlos</Text>
          <Switch value={value.freeOnly} onValueChange={(v) => {
            onChange({ ...value, freeOnly: v });
            logFilterUsed('free_only', v ? 'enabled' : 'disabled');
          }} />
        </View>
      </View>

      <Modal visible={isOpen} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modalContent, { backgroundColor: colors.pressedOverlay }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Filter</Text>

          <Text style={[styles.label, { color: colors.tabIconActive }]}>Kategorie</Text>
          <View style={styles.categories}>
            <CategoryPill
              label="Alle"
              selected={value.category === 'all'}
              onPress={() => {
                onChange({ ...value, category: 'all' });
                logFilterUsed('category', 'all');
              }}
            />
            {categories.map((c) => (
              <CategoryPill
                key={c}
                label={c}
                selected={value.category === c}
                onPress={() => {
                  onChange({ ...value, category: c });
                  logFilterUsed('category', c);
                }}
              />
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 16, color: colors.tabIconActive }]}>Zeitraum</Text>
          <View style={styles.row}>
            <TextInput
              placeholder="Beginn JJJJ-MM-TT"
              value={value.startDate ?? ''}
              onChangeText={(t) => onChange({ ...value, startDate: t || null })}
              style={[styles.input, { flex: 1, marginRight: 8, backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
              autoCapitalize="none"
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            />
            <TextInput
              placeholder="Ende JJJJ-MM-TT"
              value={value.endDate ?? ''}
              onChangeText={(t) => onChange({ ...value, endDate: t || null })}
              style={[styles.input, { flex: 1, backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
              autoCapitalize="none"
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            />
          </View>

          <View style={{ height: 16 }} />
          <Pressable style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={() => setOpen(false)}>
            <Text style={[styles.applyText, { color: colors.onPrimary }]}>Schließen</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function CategoryPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const iconSvg = CATEGORY_ICONS[label];

  return (
    <Pressable onPress={onPress} style={[styles.pill, { borderColor: colors.borderSecondary }, selected && [styles.pillSelected, { backgroundColor: colors.primary, borderColor: colors.primary }]]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={styles.pillContent}>
        {iconSvg && (
          <SvgXml
            xml={iconSvg}
            width={16}
            height={16}
            color={selected ? colors.onPrimary : colors.tabIconActive}
          />
        )}
        <Text style={[styles.pillText, { color: colors.tabIconActive }, selected && [styles.pillTextSelected, { color: colors.onPrimary }]]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  search: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { backgroundColor: '#e6f7fb', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontFamily: 'Inter-SemiBold' },
  freeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  freeText: {},
  modalContent: { flex: 1, padding: 20 },
  modalTitle: { fontSize: 20, fontFamily: 'Inter-SemiBold', marginBottom: 16 },
  label: { marginBottom: 6 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10 },
  applyBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  applyText: { fontFamily: 'Inter-SemiBold' },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillSelected: {},
  pillContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillText: {},
  pillTextSelected: {},
});
