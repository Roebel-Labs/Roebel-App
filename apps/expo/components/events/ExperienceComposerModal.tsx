import React from 'react';
import {
  Modal,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  StyleSheet,
} from 'react-native';
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
        <View style={styles.inputDock}>
          <ExperienceInput
            eventId={eventId}
            walletAddress={walletAddress}
            autoFocus
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
