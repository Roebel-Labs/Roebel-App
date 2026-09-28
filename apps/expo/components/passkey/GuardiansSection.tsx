/**
 * "Vertrauenspersonen" on the passkey screen: current guardians by name, "2 von 3 müssen
 * zustimmen", the one-tap suggestion (the people who confirmed your citizenship), add by code or
 * name, remove, and change how many must agree. Each change = one fingerprint.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveWallet } from 'thirdweb/react';
import type { Address } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { MigrationRecord } from '@/lib/passkey/migration';
import { clampThreshold, thresholdLabel } from '@/lib/passkey/guardian-plan';
import { isPasskeyWallet } from '@/lib/passkey/active';
import GuardianPicker from './GuardianPicker';
import HelperLogin from './HelperLogin';
import { BigButton, Card, Initials, Notice, passkeyStyles } from './PasskeyUi';
import { useGuardianManager } from './useGuardianManager';

export default function GuardiansSection({ record }: { record: MigrationRecord }) {
  const { colors } = useTheme();
  const router = useRouter();
  const m = useGuardianManager(record);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Address | null>(null);
  const [draftThreshold, setDraftThreshold] = useState(m.threshold);
  const [helperOpen, setHelperOpen] = useState(false);
  // The helper login runs beside the active session; it must never touch a thirdweb session in use.
  const onPasskeySession = isPasskeyWallet(useActiveWallet());

  useEffect(() => setDraftThreshold(m.threshold), [m.threshold]);

  const count = m.guardians.length;
  const working = m.busy !== null;

  return (
    <View style={styles.wrap}>
      <Text style={[passkeyStyles.sectionHeading, { color: colors.textSecondary }]}>VERTRAUENSPERSONEN</Text>
      <Card>
        <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
          Verlierst du dein Handy, helfen dir diese Menschen, wieder an dein Konto zu kommen.
        </Text>

        {m.loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {count > 0 ? (
              <Text style={[styles.thresholdLine, { color: colors.textPrimary }]}>{thresholdLabel(m.threshold, count)}</Text>
            ) : null}

            {m.guardians.map((g) => {
              const person = m.people.get(g.toLowerCase());
              const name = person?.name ?? 'Unbekannte Person';
              const helperDetail = m.helpers[g.toLowerCase()]?.masked ?? null;
              const asking = confirmRemove?.toLowerCase() === g.toLowerCase();
              return (
                <View key={g} style={[styles.row, { borderColor: colors.borderSecondary }]}>
                  <View style={styles.rowTop}>
                    <Initials name={name} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {name}
                      </Text>
                      {helperDetail ? (
                        <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]} numberOfLines={1}>
                          {helperDetail}
                        </Text>
                      ) : null}
                    </View>
                    {!asking ? (
                      <Pressable
                        onPress={() => setConfirmRemove(g)}
                        disabled={working}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`${name} entfernen`}
                      >
                        <Text style={[styles.remove, { color: colors.error }]}>Entfernen</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {asking ? (
                    <View style={styles.confirm}>
                      <Text style={[passkeyStyles.bodySmall, { color: colors.textPrimary }]}>{name} wirklich entfernen?</Text>
                      <View style={styles.confirmButtons}>
                        <BigButton
                          label="Ja, entfernen"
                          kind="danger"
                          busy={m.busy === 'remove'}
                          onPress={async () => {
                            await m.removeGuardian(g);
                            setConfirmRemove(null);
                          }}
                          style={styles.flex}
                        />
                        <BigButton label="Nein" kind="secondary" onPress={() => setConfirmRemove(null)} style={styles.flex} />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {m.allAttesters ? (
              <Notice
                tone="warning"
                text="Alle deine Vertrauenspersonen haben deine Bürgerschaft bestätigt. Nimm am besten auch jemanden aus deiner Familie dazu."
              />
            ) : null}

            {m.pending.length > 0 ? (
              <View style={[styles.suggestion, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[passkeyStyles.label, { color: colors.textPrimary }]}>Unser Vorschlag</Text>
                <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
                  Die Menschen, die deine Bürgerschaft bestätigt haben:{' '}
                  {m.pending.map((g) => m.people.get(g.toLowerCase())?.name ?? 'Unbekannte Person').join(', ')}.
                  {count === 0 ? ' 2 von ihnen müssen zustimmen.' : ''}
                </Text>
                <BigButton
                  label="Vorschlag übernehmen"
                  kind={count === 0 ? 'primary' : 'secondary'}
                  busy={m.busy === 'suggestion'}
                  disabled={working}
                  onPress={() => m.adoptSuggestion()}
                />
              </View>
            ) : null}

            <BigButton
              label="Familienmitglied hinzufügen"
              kind={count === 0 && m.pending.length === 0 ? 'primary' : 'secondary'}
              busy={m.busy === 'add'}
              disabled={working}
              onPress={() => setPickerOpen(true)}
            />

            <BigButton
              label="E-Mail oder Google als Helfer hinzufügen"
              kind="secondary"
              busy={m.busy === 'helper'}
              disabled={working}
              onPress={() => setHelperOpen((v) => !v)}
            />
            {helperOpen ? (
              <View style={[styles.suggestion, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[passkeyStyles.label, { color: colors.textPrimary }]}>Helfer-Konto</Text>
                <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
                  Ein Google-, Apple- oder E-Mail-Konto hilft dir, dein Konto auf einem neuen Handy zurückzuholen. Es ist kein
                  zweiter Login: Mit ihm kann niemand dein Konto benutzen oder Münzen senden.
                </Text>
                {count === 0 ? (
                  <Text style={[passkeyStyles.bodySmall, { color: colors.textPrimary }]}>
                    Solange es deine einzige Vertrauensperson ist, reicht seine Bestätigung. Danach dauert es 3 Tage, bis die
                    Wiederherstellung greift. In dieser Zeit kannst du sie auf diesem Handy abbrechen. Nimm später am besten
                    noch Menschen aus deiner Familie dazu.
                  </Text>
                ) : (
                  <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
                    Es zählt wie eine weitere Vertrauensperson. Wie viele zustimmen müssen, bleibt wie eingestellt.
                  </Text>
                )}
                {!onPasskeySession ? (
                  <Notice tone="info" text="Melde dich zuerst mit deinem Passkey an. Dann kannst du hier ein Helfer-Konto hinzufügen." />
                ) : !m.mode ? (
                  <Notice tone="info" text="Das geht, sobald dein Passkey mit deinem Bürgerkonto verbunden ist." />
                ) : (
                  <HelperLogin
                    busy={m.busy === 'helper'}
                    disabled={working}
                    onLogin={async (login) => {
                      const ok = await m.addHelper(login);
                      if (ok) setHelperOpen(false);
                    }}
                  />
                )}
              </View>
            ) : null}

            {count > 1 ? (
              <View style={styles.stepperWrap}>
                <Text style={[passkeyStyles.label, { color: colors.textPrimary }]}>Wie viele müssen zustimmen?</Text>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setDraftThreshold((t) => clampThreshold(t - 1, count))}
                    disabled={working || draftThreshold <= 1}
                    style={[styles.stepButton, { borderColor: colors.border, opacity: draftThreshold <= 1 ? 0.4 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Weniger"
                  >
                    <Text style={[styles.stepText, { color: colors.textPrimary }]}>−</Text>
                  </Pressable>
                  <Text style={[styles.stepValue, { color: colors.textPrimary }]}>
                    {draftThreshold} von {count}
                  </Text>
                  <Pressable
                    onPress={() => setDraftThreshold((t) => clampThreshold(t + 1, count))}
                    disabled={working || draftThreshold >= count}
                    style={[styles.stepButton, { borderColor: colors.border, opacity: draftThreshold >= count ? 0.4 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Mehr"
                  >
                    <Text style={[styles.stepText, { color: colors.textPrimary }]}>+</Text>
                  </Pressable>
                </View>
                {draftThreshold !== m.threshold ? (
                  <BigButton
                    label="Speichern"
                    kind="secondary"
                    busy={m.busy === 'threshold'}
                    disabled={working}
                    onPress={() => m.changeThreshold(draftThreshold)}
                  />
                ) : null}
              </View>
            ) : null}

            {!m.mode ? (
              <Notice tone="info" text="Änderungen sind möglich, sobald dein Passkey mit deinem Bürgerkonto verbunden ist." />
            ) : null}
          </>
        )}

        {m.notice?.text ? <Notice tone={m.notice.tone} text={m.notice.text} /> : null}
      </Card>

      <Card>
        <Pressable onPress={() => router.push('/passkey/code' as any)} accessibilityRole="button" style={styles.linkRow}>
          <Text style={[passkeyStyles.label, { color: colors.primary }]}>Mein Konto-Code</Text>
          <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
            Zeig ihn jemandem, der dich als Vertrauensperson eintragen möchte.
          </Text>
        </Pressable>
      </Card>

      <GuardianPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        exclude={m.exclude}
        onPick={async (g) => {
          setPickerOpen(false);
          await m.addGuardian(g.address, g.name);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  thresholdLine: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  remove: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  confirm: { gap: 10 },
  confirmButtons: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  suggestion: { borderRadius: 14, padding: 14, gap: 10 },
  stepperWrap: { gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepButton: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fontFamily.semiBold, fontSize: 26 },
  stepValue: { fontFamily: fontFamily.heading, fontSize: 22 },
  linkRow: { gap: 4, minHeight: 48 },
});
