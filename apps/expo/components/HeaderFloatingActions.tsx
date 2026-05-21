import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
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
  const { colors } = useTheme();
  return (
    <View style={styles.row} pointerEvents="box-none">
      {actions.map((a, i) => (
        <Pressable
          key={`${a.kind}-${i}`}
          onPress={a.onPress}
          accessibilityLabel={a.accessibilityLabel ?? a.kind}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: 'rgba(20,20,20,0.55)', opacity: pressed ? 0.8 : 1 },
          ]}
        >
          {a.kind === 'search' && <SearchIcon size={18} color="#fff" />}
          {a.kind === 'rate' && <StarIcon size={18} color={a.active ? '#FFB400' : '#fff'} />}
          {a.kind === 'favorite' && <HeartIcon size={18} color={a.active ? '#FF5A5F' : '#fff'} />}
        </Pressable>
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
  btn: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
