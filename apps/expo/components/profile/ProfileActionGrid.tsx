import React from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useRouter } from 'expo-router';
import { useRequireAuth } from '@/context/AuthGateContext';
import type { ProfileAction, ProfileActionKey } from '@/lib/profile-actions';
import ProfileActionTile from './ProfileActionTile';

const ACTION_ART: Record<ProfileActionKey, ImageSourcePropType> = {
  abfallkalender: require('../../assets/illustration/profile/trash.png'),
  governance: require('../../assets/illustration/profile/02.png'),
  'create-org': require('../../assets/illustration/profile/03.png'),
  'submit-event': require('../../assets/illustration/profile/04.png'),
  'create-listing': require('../../assets/illustration/profile/05.png'),
  'create-service': require('../../assets/illustration/profile/06.png'),
  'create-product': require('../../assets/illustration/profile/05.png'),
  'org-ads': require('../../assets/illustration/profile/ads.png'),
  'org-dashboard': require('../../assets/illustration/profile/dashboard.png'),
};

type Props = {
  items: ProfileAction[];
};

/** Three-column grid of quick-action tiles. */
export default function ProfileActionGrid({ items }: Props) {
  const router = useRouter();
  const requireAuth = useRequireAuth();

  const navigate = (action: ProfileAction) => {
    const target = action.params ? { pathname: action.href, params: action.params } : action.href;
    const go = () => router.push(target as any);
    if (action.auth) requireAuth(go);
    else go();
  };

  return (
    <View style={styles.grid}>
      {items.map((action) => (
        <ProfileActionTile
          key={action.key}
          label={action.label}
          image={ACTION_ART[action.key]}
          onPress={() => navigate(action)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    paddingHorizontal: 12,
    marginTop: 24,
  },
});
