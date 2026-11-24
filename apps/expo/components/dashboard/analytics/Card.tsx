import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

/** Dashboard section: title + optional subtitle, loading / error states built in. No border (tiles inside have one). */
export default function Card({
  title,
  subtitle,
  loading,
  error,
  children,
}: {
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.card}>
      {title ? <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text> : null}
      {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      {error ? (
        <Text style={[styles.error, { color: colors.textSecondary }]}>{error}</Text>
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.textTertiary} />
        </View>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // No frame of its own: sections sit on the page, only the tiles inside carry a border.
  card: { paddingVertical: 8, gap: 12, marginHorizontal: 16 },
  title: { fontFamily: fontFamily.heading, fontSize: 20 },
  subtitle: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: -8 },
  error: { fontFamily: fontFamily.regular, fontSize: 14, paddingVertical: 24, textAlign: 'center' },
  loading: { height: 140, alignItems: 'center', justifyContent: 'center' },
});
