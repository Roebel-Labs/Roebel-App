import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatSupportAmount, SUPPORT_MAX_CENTS, SUPPORT_MESSAGE_MAX, SUPPORT_MIN_CENTS } from '@/lib/live';
import LiveSheet from './LiveSheet';
import { F, LIVE } from './tokens';

const PRESETS = [200, 500, 1000, 2000];

export type SupportDraft = { amountCents: number; message: string; showName: boolean; displayName: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  defaultName: string;
  busy: boolean;
  error: string | null;
  onSubmit: (draft: SupportDraft) => void;
  /** Test show: the payment is real (to test Stripe end to end), so say so. */
  testMode?: boolean;
};

function parseEuro(text: string): number | null {
  const n = Number(text.replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export default function SupportSheet({ visible, onClose, defaultName, busy, error, onSubmit, testMode = false }: Props) {
  const [preset, setPreset] = useState<number | null>(500);
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState('');
  const [showName, setShowName] = useState(true);
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (visible) setName((cur) => cur || defaultName);
  }, [visible, defaultName]);

  const amount = preset ?? parseEuro(custom);
  const amountValid = amount != null && amount >= SUPPORT_MIN_CENTS && amount <= SUPPORT_MAX_CENTS;
  const nameValid = !showName || name.trim().length > 0;
  const canSubmit = amountValid && nameValid && !busy;

  return (
    <LiveSheet
      visible={visible}
      onClose={onClose}
      title="Übertragung unterstützen"
      subtitle="Dein Beitrag hilft, den Livestream möglich zu machen. Auf Wunsch erscheint dein Gruß im Chat und auf dem Bildschirm."
      maxHeight="90%"
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.chips}>
          {PRESETS.map((c) => {
            const active = preset === c;
            return (
              <Pressable
                key={c}
                onPress={() => { setPreset(c); setCustom(''); }}
                style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{formatSupportAmount(c)}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.inputBox, preset == null && custom ? styles.inputBoxActive : null]}>
          <TextInput
            value={custom}
            onChangeText={(t) => { setCustom(t.replace(/[^0-9,.]/g, '')); setPreset(null); }}
            onFocus={() => setPreset(null)}
            placeholder="Eigener Betrag"
            placeholderTextColor={LIVE.textTertiary}
            keyboardType="decimal-pad"
            style={styles.input}
            maxLength={7}
          />
          <Text style={styles.euro}>€</Text>
        </View>
        {preset == null && custom && !amountValid ? (
          <Text style={styles.hint}>{`Zwischen ${formatSupportAmount(SUPPORT_MIN_CENTS)} und ${formatSupportAmount(SUPPORT_MAX_CENTS)}.`}</Text>
        ) : null}

        <Text style={styles.label}>Gruß (optional)</Text>
        <View style={styles.inputBox}>
          <TextInput
            value={message}
            onChangeText={(t) => setMessage(t.slice(0, SUPPORT_MESSAGE_MAX))}
            placeholder="Viel Erfolg an alle Paare!"
            placeholderTextColor={LIVE.textTertiary}
            style={[styles.input, styles.multiline]}
            multiline
            maxLength={SUPPORT_MESSAGE_MAX}
          />
        </View>
        <Text style={styles.counter}>{`${message.length}/${SUPPORT_MESSAGE_MAX}`}</Text>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Meinen Namen zeigen</Text>
            <Text style={styles.switchSub}>{showName ? 'Dein Name erscheint im Chat.' : 'Im Chat steht „Jemand“.'}</Text>
          </View>
          <Switch
            value={showName}
            onValueChange={setShowName}
            trackColor={{ false: LIVE.surfaceRaised, true: LIVE.navyBright }}
            thumbColor="#fff"
          />
        </View>
        {showName ? (
          <View style={styles.inputBox}>
            <TextInput
              value={name}
              onChangeText={(t) => setName(t.slice(0, 40))}
              placeholder="Dein Name"
              placeholderTextColor={LIVE.textTertiary}
              style={styles.input}
              maxLength={40}
              autoCapitalize="words"
            />
          </View>
        ) : null}

        {testMode ? (
          <View style={styles.testNote}>
            <Ionicons name="construct-outline" size={14} color={LIVE.gold} />
            <Text style={styles.testNoteText}>Testlauf: Das ist eine echte Zahlung über Stripe, damit der ganze Ablauf getestet werden kann. Ab 1 € möglich.</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={() => {
            if (!canSubmit || amount == null) return;
            onSubmit({ amountCents: amount, message: message.trim(), showName, displayName: name.trim() });
          }}
          disabled={!canSubmit}
          style={({ pressed }) => [styles.cta, !canSubmit && styles.ctaDisabled, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#1B1B1B" />
          ) : (
            <>
              <Ionicons name="heart" size={17} color="#1B1B1B" />
              <Text style={styles.ctaText}>{amountValid && amount != null ? `Mit ${formatSupportAmount(amount)} unterstützen` : 'Betrag wählen'}</Text>
            </>
          )}
        </Pressable>
        <View style={styles.secureRow}>
          <Ionicons name="lock-closed" size={12} color={LIVE.textTertiary} />
          <Text style={styles.secure}>Sichere Kartenzahlung über Stripe. Kein Konto nötig.</Text>
        </View>
      </ScrollView>
    </LiveSheet>
  );
}

const styles = StyleSheet.create({
  testNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 12, backgroundColor: LIVE.goldSoft,
  },
  testNoteText: { flex: 1, color: LIVE.gold, fontSize: 13, lineHeight: 18, fontFamily: F.medium },
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: LIVE.surfaceRaised,
    borderWidth: 1, borderColor: 'transparent',
  },
  chipActive: { backgroundColor: 'rgba(242,193,78,0.14)', borderColor: LIVE.gold },
  chipText: { color: LIVE.text, fontSize: 16, fontFamily: F.semiBold },
  chipTextActive: { color: LIVE.gold },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: LIVE.surfaceRaised, borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'transparent',
  },
  inputBoxActive: { borderColor: LIVE.gold },
  input: { flex: 1, color: LIVE.text, fontSize: 16, fontFamily: F.medium, paddingVertical: 12 },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  euro: { color: LIVE.textSecondary, fontSize: 16, fontFamily: F.semiBold },
  hint: { color: LIVE.textTertiary, fontSize: 12, fontFamily: F.medium },
  label: { color: LIVE.textSecondary, fontSize: 13, fontFamily: F.semiBold, marginTop: 6 },
  counter: { color: LIVE.textTertiary, fontSize: 11, fontFamily: F.medium, alignSelf: 'flex-end', marginTop: -4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  switchTitle: { color: LIVE.text, fontSize: 15, fontFamily: F.semiBold },
  switchSub: { color: LIVE.textTertiary, fontSize: 12, fontFamily: F.regular },
  error: { color: '#FF8A8A', fontSize: 13, fontFamily: F.medium },
  cta: {
    marginTop: 8, height: 54, borderRadius: 27, backgroundColor: LIVE.gold, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#1B1B1B', fontSize: 16, fontFamily: F.bold },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secure: { color: LIVE.textTertiary, fontSize: 12, fontFamily: F.regular },
});
