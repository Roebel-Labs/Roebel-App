import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { MenuItemVariant } from '@/lib/types';

type Props = {
  label: string;
  variants: MenuItemVariant[];
  value: string | null;
  onChange: (variantId: string) => void;
};

export default function VariantSelectionGroup({ label, variants, value, onChange }: Props) {
  const { colors } = useTheme();
  if (!variants.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
        <View style={[styles.requiredPill, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.requiredText, { color: colors.textSecondary }]}>Erforderlich</Text>
        </View>
      </View>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>Wähle 1</Text>
      <View style={{ marginTop: 8 }}>
        {variants.map((variant, idx) => {
          const selected = value === variant.id;
          return (
            <Pressable
              key={variant.id}
              onPress={() => onChange(variant.id)}
              style={[
                styles.row,
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{variant.name}</Text>
              </View>
              <Text style={[styles.price, { color: colors.textPrimary }]}>
                €{Number(variant.price).toFixed(2)}
              </Text>
              <View
                style={[
                  styles.radio,
                  { borderColor: selected ? colors.primary : colors.borderSecondary },
                ]}
              >
                {selected && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 18, fontFamily: 'Inter-Medium' },
  requiredPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  requiredText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  hint: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  name: { fontSize: 15, fontFamily: 'Inter-Medium' },
  price: { fontSize: 14, fontFamily: 'Inter-Medium' },
  radio: { width: 22, height: 22, borderRadius: 9999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 9999 },
});
