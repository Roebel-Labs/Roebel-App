import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface QRScannerProps {
  onScan?: (data: string) => void;
}

export default function QRScanner({ onScan }: QRScannerProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.secondaryBackground }]}>
      <Text style={[styles.message, { color: colors.textSecondary }]}>
        QR-Scanner ist im Web nicht verfügbar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    padding: 32,
  },
});
