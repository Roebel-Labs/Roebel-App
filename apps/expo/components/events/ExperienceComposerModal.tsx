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
import ExperienceInput, { type ExperienceInputHandle } from './ExperienceInput';

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
  const inputRef = useRef<ExperienceInputHandle>(null);
  const skipNextHideRef = useRef(false);
  const isSubmittingRef = useRef(false);

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
      if (isSubmittingRef.current) {
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

  const handleShow = () => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
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
            onImagePickStart={() => {
              skipNextHideRef.current = true;
            }}
            onSubmitStateChange={(submitting) => {
              isSubmittingRef.current = submitting;
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
