import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';

type AvatarUser = {
  avatar_url: string | null;
  username: string | null;
};

type AvatarStackProps = {
  users: AvatarUser[];
  maxVisible?: number;
  size?: 'small' | 'large';
  totalCount?: number;
};

const AVATAR_COLORS = ['#e8d5f5', '#d5e8f5', '#f5e8d5', '#d5f5e8', '#f5d5d5'];

function getInitials(username: string | null): string {
  if (!username) return '?';
  return username.slice(0, 2).toUpperCase();
}

export default function AvatarStack({
  users,
  maxVisible = 3,
  size = 'small',
  totalCount,
}: AvatarStackProps) {
  const { colors } = useTheme();
  const dim = size === 'small' ? 24 : 28;
  const overlap = Math.round(dim * 0.4);
  const fontSize = size === 'small' ? 9 : 10;

  const visible = users.slice(0, maxVisible);
  const remaining = (totalCount ?? users.length) - visible.length;

  return (
    <View style={[styles.container, { height: dim }]}>
      {visible.map((user, index) => (
        <View
          key={index}
          style={[
            styles.avatarWrap,
            {
              width: dim,
              height: dim,
              borderRadius: dim / 2,
              borderColor: colors.background,
              marginLeft: index === 0 ? 0 : -overlap,
              zIndex: maxVisible - index,
            },
          ]}
        >
          {user.avatar_url ? (
            <Image
              source={{ uri: user.avatar_url }}
              style={[styles.avatarImage, { width: dim - 4, height: dim - 4, borderRadius: (dim - 4) / 2 }]}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.initialsCircle,
                {
                  width: dim - 4,
                  height: dim - 4,
                  borderRadius: (dim - 4) / 2,
                  backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
                },
              ]}
            >
              <Text style={[styles.initialsText, { fontSize }]}>
                {getInitials(user.username)}
              </Text>
            </View>
          )}
        </View>
      ))}

      {remaining > 0 && (
        <View
          style={[
            styles.avatarWrap,
            {
              width: dim,
              height: dim,
              borderRadius: dim / 2,
              borderColor: colors.background,
              marginLeft: -overlap,
              zIndex: 0,
            },
          ]}
        >
          <View
            style={[
              styles.overflowCircle,
              {
                width: dim - 4,
                height: dim - 4,
                borderRadius: (dim - 4) / 2,
              },
            ]}
          >
            <Text style={[styles.overflowText, { fontSize: fontSize - 1 }]}>
              +{remaining}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {},
  initialsCircle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    fontFamily: 'Inter-Medium',
    color: '#333',
  },
  overflowCircle: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overflowText: {
    fontFamily: 'Inter-Medium',
    color: '#555',
  },
});
