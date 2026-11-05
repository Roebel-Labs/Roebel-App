// "Video spiegeln". iOS: the system AirPlay route picker from expo-video (AVRoutePickerView).
// Android: no Chromecast without a native module, so a sheet offers the YouTube app (its own cast
// button mirrors to the TV) or the system screen-cast settings (Smart View / Bildschirm übertragen).
import React, { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoAirPlayButton } from 'expo-video';
import type { LiveShow } from '@/lib/live';
import LiveSheet from '../LiveSheet';
import { F, liveStyles, useLivePalette, type LivePalette } from '../tokens';
import { ChromeButton, haptic, youtubeUrlOf } from './chrome';

async function openCastSettings() {
  try {
    await Linking.sendIntent('android.settings.CAST_SETTINGS');
    return;
  } catch { /* not offered on this device */ }
  try {
    await Linking.sendIntent('android.settings.WIFI_DISPLAY_SETTINGS');
    return;
  } catch { /* not offered either */ }
  try { await Linking.openSettings(); } catch { /* nothing left */ }
}

/** Opens the Android cast sheet; the caller renders <CastSheet> (inside its own Modal tree when fullscreen). */
export function CastButton({ onOpenSheet, disc }: { onOpenSheet: () => void; disc?: boolean }) {
  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.airplayWrap, disc && styles.disc]} accessibilityLabel="AirPlay" accessibilityRole="button">
        <VideoAirPlayButton tint="#FFFFFF" activeTint="#7ABBF2" prioritizeVideoDevices style={styles.airplay} />
      </View>
    );
  }
  return <ChromeButton icon="tv-outline" label="Auf dem Fernseher ansehen" onPress={() => { haptic(); onOpenSheet(); }} size={20} disc={disc} />;
}

export function CastSheet({ visible, onClose, show }: { visible: boolean; onClose: () => void; show: LiveShow }) {
  const L = useLivePalette();
  const s = liveStyles(makeStyles, L);
  const youtube = youtubeUrlOf(show);
  const [busy, setBusy] = useState(false);

  const openYoutube = async () => {
    if (!youtube) return;
    setBusy(true);
    try { await Linking.openURL(youtube); } catch { /* no handler */ }
    setBusy(false);
    onClose();
  };

  return (
    <LiveSheet visible={visible} onClose={onClose} title="Auf dem Fernseher ansehen" maxHeight="60%">
      <View style={s.content}>
        {youtube ? (
          <>
            <Text style={s.body}>
              Öffne die Übertragung in YouTube und tippe dort auf das Cast-Symbol, um sie auf deinem Fernseher zu zeigen.
            </Text>
            <Pressable
              onPress={() => { void openYoutube(); }}
              disabled={busy}
              style={({ pressed }) => [s.primary, (pressed || busy) && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Ionicons name="logo-youtube" size={20} color={L.onNavy} />
              <Text style={s.primaryText}>In YouTube öffnen</Text>
            </Pressable>
            <Text style={s.or}>oder</Text>
          </>
        ) : null}
        <Text style={s.body}>
          Bildschirm über die Systemeinstellungen spiegeln (z. B. „Smart View“ oder „Bildschirm übertragen“). Fernseher und Handy müssen im selben WLAN sein.
        </Text>
        <Pressable
          onPress={() => { onClose(); void openCastSettings(); }}
          style={({ pressed }) => [youtube ? s.secondary : s.primary, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Ionicons name="tv-outline" size={20} color={youtube ? L.text : L.onNavy} />
          <Text style={youtube ? s.secondaryText : s.primaryText}>Bildschirm übertragen</Text>
        </Pressable>
      </View>
    </LiveSheet>
  );
}

const styles = StyleSheet.create({
  airplayWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.38)' },
  airplay: { width: 30, height: 30 },
});

const makeStyles = (L: LivePalette) => StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  body: { color: L.textSecondary, fontSize: 14, fontFamily: F.regular, lineHeight: 20 },
  or: { color: L.textTertiary, fontSize: 12, fontFamily: F.medium, textAlign: 'center' },
  primary: {
    height: 48, borderRadius: 24, backgroundColor: L.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryText: { color: L.onNavy, fontSize: 15, fontFamily: F.semiBold },
  secondary: {
    height: 48, borderRadius: 24, backgroundColor: L.surfaceRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  secondaryText: { color: L.text, fontSize: 15, fontFamily: F.semiBold },
});
