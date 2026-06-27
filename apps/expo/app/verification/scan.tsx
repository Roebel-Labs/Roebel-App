/**
 * QR Scanner Screen
 *
 * Full-screen QR code scanner for verification requests
 */

import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import QRScanner from '@/components/QRScanner';
import { ArrowLeftIcon } from '@/components/Icons';

export default function ScanScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeftIcon size={24} color="#ffffff" />
        </Pressable>
        <Text style={styles.headerTitle}>QR-Code scannen</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Scanner */}
      <QRScanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    color: '#ffffff',
  },
});
