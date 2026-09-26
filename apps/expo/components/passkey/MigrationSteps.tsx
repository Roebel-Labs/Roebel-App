import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { MigrationStep, RewrapStatus } from '@/lib/passkey/migration';

export type StepState = 'pending' | 'active' | 'done' | 'skipped' | 'failed';

type StepDef = { title: string; detail: string };

const STEP_ORDER: MigrationStep[] = ['creatingPasskey', 'rewrappingSecrets', 'signingHandover'];

/**
 * Maps the migration state onto the three visible steps. `submitting` belongs to the third step
 * ("Passkey-Konto verbinden"); `failedAt` marks the step that was running when an error hit.
 */
export function stepStates(p: {
  step: MigrationStep;
  failedAt: MigrationStep | null;
  rewrap?: RewrapStatus;
  hasPasskey: boolean;
  connected: boolean;
}): StepState[] {
  if (p.connected) return ['done', p.rewrap === 'skipped' ? 'skipped' : 'done', 'done'];
  const at = p.failedAt ?? p.step;
  const idx = at === 'submitting' ? 2 : STEP_ORDER.indexOf(at);
  return [0, 1, 2].map((i): StepState => {
    const passed =
      (i === 0 && p.hasPasskey) || (i === 1 && !!p.rewrap) || (idx >= 0 && i < idx);
    if (passed) return i === 1 && p.rewrap === 'skipped' ? 'skipped' : 'done';
    if (i === idx) return p.failedAt ? 'failed' : 'active';
    return 'pending';
  });
}

export default function MigrationSteps({ states, rewrap }: { states: StepState[]; rewrap?: RewrapStatus }) {
  const { colors } = useTheme();

  const steps: StepDef[] = [
    {
      title: 'Passkey erstellen',
      detail: 'Face ID, Fingerabdruck oder Gerätesperre — kein neues Passwort.',
    },
    {
      title: 'Schlüssel schützen',
      detail:
        rewrap === 'skipped'
          ? 'Nicht durch den Passkey geschützt: Dein Gerät unterstützt das nicht. Deine Schlüssel bleiben wie bisher auf diesem Gerät.'
          : 'Deine Abstimmungs- und Nostr-Schlüssel werden zusätzlich mit dem Passkey verschlüsselt.',
    },
    {
      title: 'Passkey-Konto verbinden',
      detail: 'Dein Passkey-Konto wird zusätzlicher Verwalter deines Kontos. Kostenlos für dich.',
    },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {steps.map((step, index) => {
        const state = states[index] ?? 'pending';
        const dotColor =
          state === 'done'
            ? colors.success
            : state === 'skipped'
              ? colors.warning
              : state === 'failed'
                ? colors.error
                : state === 'active'
                  ? colors.primary
                  : colors.borderSecondary;
        const lineDone = state === 'done' || state === 'skipped';
        const emphasized = state !== 'pending';
        return (
          <View key={step.title} style={styles.step}>
            <View style={styles.stepRail}>
              <View style={[styles.stepDot, { backgroundColor: dotColor }]}>
                {state === 'done' && <Text style={styles.stepDotMark}>✓</Text>}
                {state === 'skipped' && <Text style={styles.stepDotMark}>–</Text>}
                {state === 'failed' && <Text style={styles.stepDotMark}>!</Text>}
              </View>
              {index < steps.length - 1 && (
                <View style={[styles.stepLine, { backgroundColor: lineDone ? colors.success : colors.borderSecondary }]} />
              )}
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepTitle, { color: emphasized ? colors.textPrimary : colors.textTertiary }]}>
                {step.title}
              </Text>
              <Text style={[styles.stepDetail, { color: colors.textSecondary }]}>{step.detail}</Text>
              {state === 'active' && (
                <View style={styles.inlineStatus}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.inlineStatusText, { color: colors.primary }]}>Läuft …</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16 },
  step: { flexDirection: 'row', gap: 14 },
  stepRail: { alignItems: 'center', width: 22 },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepDotMark: { color: '#fff', fontSize: 12, fontFamily: fontFamily.bold },
  stepLine: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1 },
  stepBody: { flex: 1, paddingBottom: 18 },
  stepTitle: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  stepDetail: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, marginTop: 2 },
  inlineStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  inlineStatusText: { fontFamily: fontFamily.medium, fontSize: 13 },
});
