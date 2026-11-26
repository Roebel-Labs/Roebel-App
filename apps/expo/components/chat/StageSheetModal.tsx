import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * Hosts an in-screen gorhom sheet in its own transparent window, so the app-wide sheet stage can
 * shrink the page behind it (the account-switch pattern) without shrinking the sheet itself.
 * The sheet decides when it is mounted; this window lives exactly as long as the sheet.
 */
export function StageSheetModal({ onRequestClose, children }: { onRequestClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onRequestClose}>
      <GestureHandlerRootView style={styles.fill}>{children}</GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
