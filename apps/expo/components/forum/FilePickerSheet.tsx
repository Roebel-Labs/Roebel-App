import React, { useMemo } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ALLOWED_ATTACHMENT_MIMES } from '@/lib/forum-attachments';
import { buildFilePickerHtml, parsePickedFileMessage } from '@/lib/file-picker-html';

export type PickedFile = { name: string; mime: string; size: number; base64: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onPicked: (file: PickedFile) => void;
  onError?: (message: string) => void;
};

/**
 * File picking without a native module: a modal WebView hosts a file input
 * (the OS document picker opens from it) and posts the chosen file back as
 * base64. Ships by OTA in the current binary.
 */
export default function FilePickerSheet({ visible, onClose, onPicked, onError }: Props) {
  const { colors } = useTheme();
  const html = useMemo(() => buildFilePickerHtml(ALLOWED_ATTACHMENT_MIMES), []);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Datei anhängen</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Schließen">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            PDF, Word, Excel, PowerPoint, Text oder Bild · max. 15 MB
          </Text>
          {visible && (
            <WebView
              originWhitelist={['*']}
              source={{ html }}
              style={styles.web}
              javaScriptEnabled
              onMessage={(e) => {
                const message = parsePickedFileMessage(e.nativeEvent.data);
                if (!message) return;
                if (message.type === 'file') {
                  onPicked(message);
                  onClose();
                } else if (message.type === 'error') {
                  onError?.(message.message);
                  onClose();
                } else {
                  onClose();
                }
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8, height: 280 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontFamily: fontFamily.semiBold },
  hint: { fontSize: 12, fontFamily: fontFamily.regular },
  web: { flex: 1, backgroundColor: 'transparent' },
});
