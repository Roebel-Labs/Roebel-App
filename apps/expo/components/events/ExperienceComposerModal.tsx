import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  BackHandler,
  StyleSheet,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import ExperienceInput, { type ExperienceInputHandle } from './ExperienceInput';
import type { EventExperience } from '@/lib/types/feed';

type Props = {
  visible: boolean;
  eventId: string;
  walletAddress: string;
  onClose: () => void;
  onCreated: (created: EventExperience) => void;
  onError?: (message: string) => void;
};

export default function ExperienceComposerModal({
  visible,
  eventId,
  walletAddress,
  onClose,
  onCreated,
  onError,
}: Props) {
  const { colors } = useTheme();
  const inputRef = useRef<ExperienceInputHandle>(null);

  // Android: single hardware-back press should dismiss the overlay (and any
  // open keyboard) rather than the system's default "first hide keyboard,
  // then close modal on next press".
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Keyboard.dismiss();
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const handleScrimPress = () => {
    Keyboard.dismiss();
    onClose();
  };

  const handleShow = () => {
    if (Platform.OS === 'ios') {
      inputRef.current?.focus();
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onShow={handleShow}
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
            ref={inputRef}
            eventId={eventId}
            walletAddress={walletAddress}
            onError={onError}
            onCreated={(created) => {
              onCreated(created);
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
