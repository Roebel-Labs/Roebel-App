import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  StyleSheet,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import ExperienceInput from './ExperienceInput';

type Props = {
  visible: boolean;
  eventId: string;
  walletAddress: string;
  onClose: () => void;
  onCreated: () => void;
};

export default function ExperienceComposerModal({
  visible,
  eventId,
  walletAddress,
  onClose,
  onCreated,
}: Props) {
  const { colors } = useTheme();
  const onCloseRef = useRef(onClose);
  const skipNextHideRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (skipNextHideRef.current) {
        skipNextHideRef.current = false;
        return;
      }
      onCloseRef.current();
    });
    return () => sub.remove();
  }, [visible]);

  const handleScrimPress = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={handleScrimPress} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kbWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.inputDock, { backgroundColor: colors.background }]}>
          <ExperienceInput
            eventId={eventId}
            walletAddress={walletAddress}
            autoFocus
            onImagePickStart={() => {
              skipNextHideRef.current = true;
            }}
            onCreated={() => {
              onCreated();
              onClose();
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  kbWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  inputDock: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
