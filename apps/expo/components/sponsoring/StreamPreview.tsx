import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { fontFamily } from '@/constants/theme';

export type PreviewMode = 'banner' | 'spot';

type Props = {
  mode: PreviewMode;
  orgName: string;
  /** Square-ish logo for the banner (the org avatar); falls back to the ad card. */
  logoUrl: string | null;
  /** 16:9 ad card (AI creative or upload) for the full-screen break spot. */
  adUrl: string | null;
  /** Optional stage photo behind the banner mode. */
  stageUrl?: string | null;
};

/**
 * A mock frame of the DanceCup livestream with the org's own ad in it. Pure layout, no video:
 * it exists so an org sees "that is us, on air" before it decides.
 */
export default function StreamPreview({ mode, orgName, logoUrl, adUrl, stageUrl }: Props) {
  const bannerLogo = logoUrl ?? adUrl;
  return (
    <View style={styles.frame}>
      {mode === 'spot' && adUrl ? (
        <Image source={{ uri: adUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <>
          {stageUrl ? (
            <Image source={{ uri: stageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={['#1B1036', '#3A1450', '#0B0B1A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          {/* Stage lights */}
          <View style={[styles.spot, { left: '12%', backgroundColor: 'rgba(255,190,90,0.22)' }]} />
          <View style={[styles.spot, { left: '55%', backgroundColor: 'rgba(120,170,255,0.20)' }]} />
          <View style={styles.floor} />
          <Text style={styles.stageLabel}>Standardtänze · Runde 2</Text>
        </>
      )}

      <View style={styles.live}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      <Text style={styles.bug}>DanceCup Röbel</Text>

      {mode === 'banner' ? (
        <View style={styles.banner}>
          <Text style={styles.adLabel}>Werbung</Text>
          {bannerLogo ? (
            <Image source={{ uri: bannerLogo }} style={styles.bannerLogo} contentFit="contain" />
          ) : null}
          <Text style={styles.bannerName} numberOfLines={1}>{orgName}</Text>
        </View>
      ) : (
        <Text style={[styles.adLabel, styles.adLabelSpot]}>Werbung</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0B0B1A' },
  spot: { position: 'absolute', top: '-30%', width: '34%', height: '120%', borderRadius: 999, transform: [{ rotate: '12deg' }] },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '32%', backgroundColor: 'rgba(255,255,255,0.05)' },
  stageLabel: {
    position: 'absolute', left: 12, bottom: '36%', fontFamily: fontFamily.semiBold, fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
  },
  live: {
    position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E5252A', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  liveText: { fontFamily: fontFamily.bold, fontSize: 10, color: '#FFFFFF' },
  bug: { position: 'absolute', top: 10, right: 12, fontFamily: fontFamily.semiBold, fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  banner: {
    position: 'absolute', left: 10, right: 10, bottom: 10, height: 40, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8,
  },
  bannerLogo: { width: 52, height: 30 },
  bannerName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 13, color: '#0B0B1A' },
  adLabel: { fontFamily: fontFamily.medium, fontSize: 9, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  adLabelSpot: {
    position: 'absolute', bottom: 8, left: 10, color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
});
