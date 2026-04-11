// Step 4 — AGB text + dual consent checkboxes.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { usePartnerRegisterWizard } from '@/context/PartnerRegisterWizardContext';
import { AGREEMENT_VERSION } from '@/lib/roebel-card-agreement-metadata';
import WizardFooter from '@/components/WizardFooter';

const AGB_TEXT = `Röbel Card Partner-Vereinbarung (${AGREEMENT_VERSION})

Diese Vereinbarung regelt die Teilnahme deines Betriebs am Röbel Card Netzwerk.

1. GEGENSTAND
Die Röbel Card ist ein lokaler Gutschein (Closed-Loop) im Sinne von §2 Abs. 1 Nr. 10 ZAG. Als Partner akzeptierst du Zahlungen per Röbel Card in deinem Betrieb und erhältst die entsprechenden Umsätze über den Plattformbetreiber ausgezahlt.

2. AUSZAHLUNGEN
Wir zahlen deine Umsätze monatlich innerhalb der ersten fünf Bankarbeitstage des Folgemonats auf die von dir hinterlegte IBAN aus. Es fallen keine Setup-Gebühren an. Eine Transaktionsgebühr kann vom Plattformbetreiber einbehalten werden — die aktuelle Gebührenordnung findest du in deinem Partner Dashboard.

3. PFLICHTEN DES PARTNERS
Du verpflichtest dich, Röbel Card Zahlungen zum Nennwert zu akzeptieren, keine Barauszahlung zu gewähren und die Gutscheine ausschließlich für Waren und Dienstleistungen deines eigenen Betriebs einzulösen. Eine Weiterveräußerung an Dritte ist ausgeschlossen.

4. STEUERN UND RECHNUNGSSTELLUNG
Du bist selbst verantwortlich für die umsatzsteuerrechtliche Behandlung der ausgezahlten Beträge und für die Ausstellung ordnungsgemäßer Rechnungen an deine Kunden.

5. DATENSCHUTZ
Der Plattformbetreiber verarbeitet deine Stammdaten (Firma, Adresse, Kontaktdaten, IBAN, Rechtsform, ggf. USt-IdNr) zur Abwicklung dieses Vertrags gemäß Art. 6 Abs. 1 lit. b DSGVO. Eine Weitergabe an Dritte erfolgt nur, soweit dies zur Vertragserfüllung erforderlich ist (z. B. Zahlungsdienstleister).

6. LAUFZEIT UND KÜNDIGUNG
Die Vereinbarung läuft auf unbestimmte Zeit und kann von beiden Seiten mit einer Frist von 30 Tagen zum Monatsende in Textform gekündigt werden. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.

7. ÄNDERUNGEN
Änderungen dieser AGB werden dir mindestens 30 Tage vor Inkrafttreten in Textform mitgeteilt. Widersprichst du nicht innerhalb dieser Frist, gelten die Änderungen als angenommen.

8. GERICHTSSTAND
Für alle Streitigkeiten aus dieser Vereinbarung gilt deutsches Recht. Gerichtsstand ist, soweit gesetzlich zulässig, Röbel/Müritz.

Mit dem Absenden des Antrags bestätigst du, diese Vereinbarung gelesen und verstanden zu haben.`;

export default function PartnerRegisterAgreementScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = usePartnerRegisterWizard();

  const [agbAccepted, setAgbAccepted] = useState(state.agbAccepted);
  const [authorityAccepted, setAuthorityAccepted] = useState(state.authorityAccepted);

  const canContinue = agbAccepted && authorityAccepted;

  const handleNext = () => {
    if (!canContinue) return;
    dispatch({
      type: 'SET_AGREEMENT',
      payload: { agbAccepted, authorityAccepted },
    });
    router.push('/roebel-card/partner-register/review' as any);
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.headerSection}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 4 von 5</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>AGB bestätigen</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Lies die Partner-Vereinbarung und bestätige mit den beiden Kästchen unten.
        </Text>
      </View>

      <ScrollView
        style={[
          styles.agbScroll,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        contentContainerStyle={styles.agbContent}
      >
        <Text style={[styles.agbText, { color: colors.textPrimary }]}>{AGB_TEXT}</Text>
      </ScrollView>

      <View style={styles.checkboxesWrap}>
        <Checkbox
          checked={agbAccepted}
          label="Ich akzeptiere die AGB der Röbel Card in der vorliegenden Fassung."
          onToggle={() => setAgbAccepted((v) => !v)}
          colors={colors}
        />
        <Checkbox
          checked={authorityAccepted}
          label="Ich bin berechtigt, diesen Betrieb rechtsverbindlich zu vertreten."
          onToggle={() => setAuthorityAccepted((v) => !v)}
          colors={colors}
        />
      </View>

      <WizardFooter
        step={4}
        totalSteps={5}
        onBack={() => router.back()}
        onNext={handleNext}
        nextDisabled={!canContinue}
      />
    </SafeAreaView>
  );
}

function Checkbox({
  checked,
  label,
  onToggle,
  colors,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={styles.checkboxRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? colors.primary : colors.border,
            backgroundColor: checked ? colors.primary : 'transparent',
          },
        ]}
      >
        {checked && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerSection: { paddingHorizontal: 24, paddingTop: 24 },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { fontSize: 26, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 16 },
  agbScroll: {
    flex: 1,
    marginHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  agbContent: { padding: 16 },
  agbText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  checkboxesWrap: {
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
});
