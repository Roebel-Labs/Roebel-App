import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Switch, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import type { OpeningHours } from '@/lib/types';
import WizardFooter from '@/components/WizardFooter';

const DAYS: { key: keyof OpeningHours; label: string }[] = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '18:00';

export default function CreateOrgContactScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch, needsCategory } = useCreateOrgWizard();

  const [phone, setPhone] = useState(state.phone);
  const [email, setEmail] = useState(state.email);
  const [website, setWebsite] = useState(state.website);
  const [showHours, setShowHours] = useState(!!state.openingHours);
  const [hours, setHours] = useState<OpeningHours>(state.openingHours || {});

  const updateDay = (day: keyof OpeningHours, field: 'open' | 'close' | 'closed', value: any) => {
    setHours(prev => ({
      ...prev,
      [day]: { ...prev[day], open: prev[day]?.open || DEFAULT_OPEN, close: prev[day]?.close || DEFAULT_CLOSE, [field]: value },
    }));
  };

  const handleNext = () => {
    dispatch({
      type: 'SET_CONTACT',
      payload: {
        phone: phone.trim(),
        email: email.trim(),
        website: website.trim(),
        openingHours: showHours ? hours : null,
      },
    });
    router.push('/create-org/photos');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 4</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Wie erreicht man euch?</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Wie können Besucher dich erreichen?
        </Text>

        {/* Phone */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Telefon</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="z.B. 039931 12345"
          placeholderTextColor={colors.textTertiary}
          keyboardType="phone-pad"
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
        />

        {/* Email */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>E-Mail</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="kontakt@beispiel.de"
          placeholderTextColor={colors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
        />

        {/* Website */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Website</Text>
        <TextInput
          value={website}
          onChangeText={setWebsite}
          placeholder="www.beispiel.de"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
        />

        {/* Opening hours (conditional) */}
        {needsCategory && (
          <>
            <View style={styles.hoursToggleRow}>
              <Text style={[styles.hoursToggleLabel, { color: colors.textPrimary }]}>Öffnungszeiten angeben</Text>
              <Switch
                value={showHours}
                onValueChange={setShowHours}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            {showHours && DAYS.map(({ key, label }) => {
              const day = hours[key];
              const isClosed = day?.closed ?? false;

              return (
                <View key={key} style={[styles.dayRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.dayLabelContainer}>
                    <Text style={[styles.dayLabel, { color: isClosed ? colors.textTertiary : colors.textPrimary }]}>
                      {label}
                    </Text>
                  </View>
                  {isClosed ? (
                    <Text style={[styles.closedText, { color: colors.textTertiary }]}>Geschlossen</Text>
                  ) : (
                    <View style={styles.timeInputRow}>
                      <TextInput
                        value={day?.open || DEFAULT_OPEN}
                        onChangeText={(v) => updateDay(key, 'open', v)}
                        placeholder="09:00"
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.timeInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                      />
                      <Text style={[styles.timeSeparator, { color: colors.textSecondary }]}>–</Text>
                      <TextInput
                        value={day?.close || DEFAULT_CLOSE}
                        onChangeText={(v) => updateDay(key, 'close', v)}
                        placeholder="18:00"
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.timeInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                      />
                    </View>
                  )}
                  <Pressable onPress={() => updateDay(key, 'closed', !isClosed)} style={styles.toggleClosedButton}>
                    <Text style={[styles.toggleClosedText, { color: colors.primary }]}>
                      {isClosed ? 'Öffnen' : 'Zu'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        step={4}
        onBack={() => router.back()}
        onNext={handleNext}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heading: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 32,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 20,
  },
  hoursToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  hoursToggleLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  dayLabelContainer: {
    width: 96,
  },
  dayLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  closedText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    flex: 1,
    textAlign: 'center',
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  timeInput: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    width: 64,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: 13,
  },
  toggleClosedButton: {
    marginLeft: 8,
  },
  toggleClosedText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  bottomSpacer: {
    height: 96,
  },
});
