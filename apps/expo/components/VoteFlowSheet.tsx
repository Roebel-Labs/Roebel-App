import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomDrawer from '@/components/BottomDrawer';
import StoryProgress from '@/components/StoryProgress';
import { useTheme } from '@/context/ThemeContext';
import type { AgeAnswer, VoteFlowStep } from '@/lib/vote-flow';

export interface VoteFlowError {
  message: string;
  /** The citizen's original voting key is gone → support must help. */
  lostKey?: boolean;
}

interface VoteFlowSheetProps {
  visible: boolean;
  onClose: () => void;
  step: VoteFlowStep | 'checking';
  position: { index: number; total: number } | null;
  /** "Dafür" / "Dagegen" / "Enthalten" — the remembered choice. */
  choiceLabel: string;
  /** "Jünger als 16" was answered in this run of the sheet. */
  underAgeBlocked: boolean;
  /** A citizenship request is already pending. */
  citizenPending: boolean;
  busy: boolean;
  /** Label for the primary button while busy (key / signup substates). */
  busyLabel?: string;
  error: VoteFlowError | null;
  onLogin: () => void;
  onCitizen: () => void;
  onAge: (answer: AgeAnswer) => void;
  onGenerateKey: () => void;
  onSignUp: () => void;
  onVote: () => void;
  onHelp: () => void;
  /** Optional inline slot below the step body (the passkey ThirdwebConfirm). */
  children?: React.ReactNode;
  /** Hide the step's primary button (the inline slot carries the action). */
  hidePrimary?: boolean;
}

/**
 * Multi-step bottom sheet behind the always-visible vote options. Shows ONE
 * step at a time — only the missing prerequisites — each with a single
 * primary action. Logic lives in VoteButtons + lib/vote-flow.ts.
 */
export default function VoteFlowSheet(props: VoteFlowSheetProps) {
  const { colors } = useTheme();
  const { visible, onClose, step, position, busy, error } = props;

  const content = getStepContent(props);

  return (
    <BottomDrawer visible={visible} onClose={busy ? () => {} : onClose}>
      <View style={styles.container}>
        {position && !props.underAgeBlocked ? (
          <View style={styles.progressWrap}>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
              {`Schritt ${position.index} von ${position.total}`}
            </Text>
            {position.total > 1 ? (
              <StoryProgress step={position.index} totalSteps={position.total} />
            ) : null}
          </View>
        ) : null}

        {step === 'checking' ? (
          <View style={styles.checking}>
            <ActivityIndicator color={colors.textSecondary} />
            <Text style={[styles.body, { color: colors.textSecondary }]}>Einen Moment…</Text>
          </View>
        ) : step === 'vote' && !error ? (
          // The tapped option is the decision: no second "abgeben" tap, the
          // sheet casts it and only shows the progress.
          <View style={styles.checking}>
            <ActivityIndicator color={colors.textSecondary} />
            <Text style={[styles.headline, { color: colors.textPrimary }]}>Stimme wird verschlüsselt…</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {`Deine Auswahl „${props.choiceLabel}“ wird versiegelt und abgegeben.`}
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.headline, { color: colors.textPrimary }]}>{content.title}</Text>
            {content.body ? (
              <Text style={[styles.body, { color: colors.textSecondary }]}>{content.body}</Text>
            ) : null}

            {props.children}

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
                <Text style={[styles.errorText, { color: colors.textPrimary }]}>{error.message}</Text>
              </View>
            ) : null}

            {error?.lostKey ? (
              <PrimaryButton label="Hilfe erhalten" onPress={props.onHelp} />
            ) : content.primary && !props.hidePrimary ? (
              <PrimaryButton
                label={busy && props.busyLabel ? props.busyLabel : content.primary.label}
                onPress={content.primary.onPress}
                loading={busy}
              />
            ) : null}

            {content.secondary && !error?.lostKey ? (
              <Pressable
                onPress={content.secondary.onPress}
                disabled={busy}
                style={({ pressed }) => [
                  styles.secondary,
                  { borderColor: colors.border, opacity: busy ? 0.5 : pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={content.secondary.label}
              >
                <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>
                  {content.secondary.label}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}

        {content.hideCancel || (step === 'vote' && !error && busy) ? null : (
          <Pressable
            onPress={onClose}
            disabled={busy}
            style={styles.closeBtn}
            accessibilityRole="button"
          >
            <Text style={[styles.closeText, { color: colors.textSecondary, opacity: busy ? 0.5 : 1 }]}>
              Abbrechen
            </Text>
          </Pressable>
        )}
      </View>
    </BottomDrawer>
  );
}

interface StepContent {
  title: string;
  body?: string;
  primary?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  hideCancel?: boolean;
}

function getStepContent(p: VoteFlowSheetProps): StepContent {
  const choice = `„${p.choiceLabel}“`;
  switch (p.step) {
    case 'checking':
      return { title: '' };
    case 'login':
      return {
        title: 'Anmelden, um abzustimmen',
        body: `Deine Auswahl ${choice} haben wir uns gemerkt. Melde dich an, dann geht es direkt weiter.`,
        primary: { label: 'Anmelden', onPress: p.onLogin },
      };
    case 'citizen':
      return {
        title: 'Nur Bürger:innen von Röbel können abstimmen',
        body: p.citizenPending
          ? `Deine Verifizierung läuft noch. Deine Auswahl ${choice} bleibt gemerkt — sobald du bestätigt bist, kannst du sie hier abgeben.`
          : `Werde als Bürger:in von Röbel bestätigt. Deine Auswahl ${choice} bleibt gemerkt — danach kannst du sie hier abgeben.`,
        primary: {
          label: p.citizenPending ? 'Status ansehen' : 'Bürger werden',
          onPress: p.onCitizen,
        },
      };
    case 'age':
      if (p.underAgeBlocked) {
        return {
          title: 'Du kannst bei dieser Bürgerumfrage leider noch nicht abstimmen.',
          body: 'Abstimmen können alle ab 16 Jahren.',
          primary: { label: 'Schließen', onPress: p.onClose },
          hideCancel: true,
        };
      }
      return {
        title: 'Bist du 16 Jahre oder älter?',
        body: 'Bei dieser Bürgerumfrage können alle ab 16 Jahren abstimmen.',
        primary: { label: 'Ich bin 16 Jahre oder älter', onPress: () => p.onAge('16-plus') },
        secondary: { label: 'Ich bin jünger als 16', onPress: () => p.onAge('under-16') },
      };
    case 'key':
      return {
        title: 'Wahlschlüssel erstellen',
        body:
          'Dein persönlicher Wahlschlüssel bleibt auf deinem Gerät und versiegelt jede deiner Stimmen — wie ein Briefumschlag, den niemand allein öffnen kann. Nicht die Stadt, nicht die App. Niemand.',
        primary: { label: 'Schlüssel erstellen', onPress: p.onGenerateKey },
      };
    case 'signup':
      return {
        title: 'Zur Bürgerumfrage anmelden',
        body:
          'Einmalig anmelden. Danach gilt: ein Mensch, eine Stimme — egal wie viele Geräte du nutzt. Keine Bots, keine Doppelten, keine gekauften Meinungen.',
        primary: { label: 'Zur Bürgerumfrage anmelden', onPress: p.onSignUp },
      };
    case 'vote':
      // Only rendered after a failed cast (the progress state has no copy
      // here): retry the SAME remembered choice — still no confirmation step.
      return {
        title: `Stimme ${choice} wurde nicht abgegeben`,
        primary: { label: 'Erneut versuchen', onPress: p.onVote },
      };
  }
}

function PrimaryButton({
  label,
  onPress,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: colors.primary, opacity: loading ? 0.7 : pressed ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#ffffff" />
          <Text style={[styles.primaryText, styles.loadingText]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  progressWrap: {
    gap: 4,
  },
  progressLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    textAlign: 'center',
  },
  checking: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  headline: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  primary: {
    width: '100%',
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 4,
  },
  primaryText: {
    color: '#ffffff',
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    flexShrink: 1,
  },
  secondary: {
    width: '100%',
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  closeBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
});
