import React from 'react';
import { Pressable, StyleSheet, Keyboard } from 'react-native';

type Props = {
  visible: boolean;
};

export default function CommentScrim({ visible }: Props) {
  if (!visible) return null;
  return (
    <Pressable
      onPress={Keyboard.dismiss}
      style={styles.scrim}
      accessibilityLabel="Tastatur schließen"
    />
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
    zIndex: 1,
  },
});
