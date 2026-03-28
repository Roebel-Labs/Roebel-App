import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

const REPORT_REASONS = [
  { key: 'inappropriate', label: 'Unangemessener Inhalt' },
  { key: 'spam', label: 'Spam' },
  { key: 'harassment', label: 'Belästigung' },
  { key: 'misinformation', label: 'Falschinformation' },
  { key: 'other', label: 'Sonstiges' },
] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onReport: (reason: string) => Promise<void>;
};

export default function ReportDrawer({ visible, onClose, onReport }: Props) {
  const { colors } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  const handleSelect = async (reason: string) => {
    setSelectedReason(reason);
    setIsSubmitting(true);
    try {
      await onReport(reason);
      onClose();
    } catch {
      // Error handled by parent via snackbar
    } finally {
      setIsSubmitting(false);
      setSelectedReason(null);
    }
  };

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.45}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Beitrag melden</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Warum möchtest du diesen Beitrag melden?
        </Text>

        {REPORT_REASONS.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => handleSelect(key)}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.reasonRow,
              { borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.pressedOverlay },
            ]}
          >
            <Text style={[styles.reasonText, { color: colors.textPrimary }]}>{label}</Text>
            {isSubmitting && selectedReason === key && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </Pressable>
        ))}
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reasonText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
});
