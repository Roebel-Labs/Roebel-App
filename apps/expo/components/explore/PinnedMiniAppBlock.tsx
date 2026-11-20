/**
 * A mini app the user pinned to Erkunden (layout id `miniapp:<slug>`).
 * One wide card: icon, name, description, "Öffnen". Same launch rules as
 * MiniAppsEntry — installed apps open straight into the host, others go to
 * the store page. A slug that is no longer live renders nothing. A locked app
 * (required audience not matched on this device) shows "Gesperrt" and opens
 * its detail page, never the host.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { fetchLiveMiniApps } from '@/lib/miniapps';
import { useInstalledMiniApps } from '@/lib/miniapp-installs';
import MiniAppHost from '@/components/miniapp/MiniAppHost';
import { LockIcon } from '@/components/miniapp/hostIcons';
import { useMatchCredentials } from '@/lib/miniapp-credentials';
import { openDecision } from '@/lib/miniapp-open';

export default function PinnedMiniAppBlock({ slug }: { slug: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isInstalled } = useInstalledMiniApps();
  const { held, ready } = useMatchCredentials();
  const [hostVisible, setHostVisible] = useState(false);
  const [hostMounted, setHostMounted] = useState(false);

  // Same key as MiniAppsEntry/explore.tsx: served from the shared cache.
  const { data } = useQuery({
    queryKey: ['explore', 'mini-apps'],
    queryFn: fetchLiveMiniApps,
    meta: { persist: true },
  });
  const app = data?.find((a) => a.slug === slug);
  const decision = app ? openDecision(app, held, ready) : 'wait';
  const locked = decision === 'locked';

  const open = useCallback(() => {
    if (!app) return;
    if (isInstalled(app.slug) && decision === 'open') {
      setHostMounted(true);
      setHostVisible(true);
    } else {
      router.push(`/mini-app/${app.slug}` as any);
    }
  }, [app, decision, isInstalled, router]);

  const closeHost = useCallback(() => setHostVisible(false), []);

  if (!app) return null;

  return (
    <View style={styles.section}>
      <Pressable
        onPress={open}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.borderSecondary },
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${app.name} öffnen`}
      >
        {app.iconUrl ? (
          <Image source={{ uri: app.iconUrl }} style={styles.icon} contentFit="cover" />
        ) : (
          <View style={[styles.icon, { backgroundColor: app.primaryColor }]} />
        )}
        <View style={styles.text}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{app.name}</Text>
          {app.description ? (
            <Text style={[styles.desc, { color: colors.textSecondary }]} numberOfLines={2}>{app.description}</Text>
          ) : null}
        </View>
        {locked ? (
          <View style={[styles.cta, { backgroundColor: colors.surfaceSecondary }]}>
            <LockIcon size={14} color={colors.textPrimary} />
            <Text style={[styles.ctaText, { color: colors.textPrimary }]}>Gesperrt</Text>
          </View>
        ) : (
          <View style={[styles.cta, { backgroundColor: colors.primary }]}>
            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Öffnen</Text>
          </View>
        )}
      </Pressable>
      {hostMounted && !locked && <MiniAppHost app={app} visible={hostVisible} onClose={closeHost} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16, marginBottom: 8, paddingHorizontal: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  icon: { width: 52, height: 52, borderRadius: 12 },
  text: { flex: 1 },
  name: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  desc: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 2 },
  cta: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
});
