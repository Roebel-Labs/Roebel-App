import React from 'react';
import { View, StyleSheet } from 'react-native';
import GlassIconButton from '@/components/GlassIconButton';
import { SearchIcon, StarIcon, HeartIcon } from '@/components/Icons';

type ActionKind = 'search' | 'rate' | 'favorite';

type Props = {
  actions: Array<{
    kind: ActionKind;
    onPress: () => void;
    active?: boolean;
    accessibilityLabel?: string;
  }>;
};

export default function HeaderFloatingActions({ actions }: Props) {
  return (
    <View style={styles.row} pointerEvents="box-none">
      {actions.map((a, i) => (
        <GlassIconButton
          key={`${a.kind}-${i}`}
          onPress={a.onPress}
          accessibilityLabel={a.accessibilityLabel ?? a.kind}
          tone="dark"
        >
          {a.kind === 'search' && <SearchIcon size={20} color="#fff" />}
          {a.kind === 'rate' && <StarIcon size={20} color={a.active ? '#FFB400' : '#fff'} />}
          {a.kind === 'favorite' && <HeartIcon size={20} color={a.active ? '#FF5A5F' : '#fff'} />}
        </GlassIconButton>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    top: 50,
    right: 16,
    flexDirection: 'row',
    gap: 10,
    zIndex: 10,
  },
});
