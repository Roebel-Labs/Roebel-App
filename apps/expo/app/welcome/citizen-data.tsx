import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useWelcomeWizard } from '@/context/WelcomeWizardContext';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

const DEFAULT_PICKER_DATE = new Date(1990, 0, 1);
const MIN_BIRTHDATE = new Date(1900, 0, 1);
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatGerman = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function WelcomeCitizenDataScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useWelcomeWizard();

  const [firstName, setFirstName] = useState(state.citizenData?.firstName ?? '');
  const [lastName, setLastName] = useState(state.citizenData?.lastName ?? '');
  const [birthDate, setBirthDate] = useState<Date | null>(
    state.citizenData?.birthdate ? new Date(state.citizenData.birthdate) : null,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [address, setAddress] = useState(state.citizenData?.address ?? '');

  const complete =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !!birthDate && address.trim().length > 0;

  const handleNext = () => {
    if (!complete || !birthDate) return;
    dispatch({
      type: 'SET_CITIZEN_DATA',
      payload: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthdate: toIsoDate(birthDate),
        address: address.trim(),
      },
    });
    router.push('/welcome/consent' as any);
  };

  const handleSkip = () => {
    dispatch({ type: 'SET_CITIZEN_DATA', payload: null });
    router.push('/welcome/consent' as any);
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        showsVerticalScrollIndicator={false}
        extraScrollHeight={100}
      >
        <StoryProgress step={3} totalSteps={4} />
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Werde verifizierte:r Bürger:in</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Mit diesen Angaben startet dein Bürger-Antrag automatisch. Sie bleiben auf deinem Gerät —
          gespeichert wird nur ein nicht umkehrbarer Fingerabdruck, aus dem niemand deinen Namen lesen kann.
        </Text>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Vorname</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Anna"
            placeholderTextColor={colors.textTertiary}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>Teil deines persönlichen Fingerabdrucks.</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Nachname</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Müller"
            placeholderTextColor={colors.textTertiary}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>Teil deines persönlichen Fingerabdrucks.</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Geburtsdatum</Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={[styles.input, styles.dateField, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
            accessibilityRole="button"
            accessibilityLabel="Geburtsdatum auswählen"
          >
            <Text style={[styles.dateText, { color: birthDate ? colors.textPrimary : colors.textTertiary }]}>
              {birthDate ? formatGerman(birthDate) : 'TT.MM.JJJJ'}
            </Text>
            <Ionicons name="calendar-outline" size={20} color={colors.textTertiary} />
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={birthDate ?? DEFAULT_PICKER_DATE}
              mode="date"
              display="default"
              maximumDate={new Date()}
              minimumDate={MIN_BIRTHDATE}
              onChange={(event, date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (date) setBirthDate(date);
                if (Platform.OS === 'android') setShowDatePicker(false);
              }}
            />
          )}
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>Sichert: eine Person, eine Stimme.</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Adresse in Röbel/Müritz</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Musterstraße 123, 17207 Röbel"
            placeholderTextColor={colors.textTertiary}
            value={address}
            onChangeText={setAddress}
            autoCapitalize="words"
          />
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>Belegt deinen Wohnsitz in Röbel/Müritz.</Text>
        </View>

        <Pressable onPress={handleSkip} style={styles.skipButton} accessibilityRole="button">
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>Später ausfüllen</Text>
        </Pressable>
      </KeyboardAwareScrollView>

      <WizardFooter onBack={() => router.back()} onNext={handleNext} nextDisabled={!complete} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  heading: { fontSize: 26, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subheading: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 28, lineHeight: 22 },
  formGroup: { marginBottom: 20 },
  label: { fontFamily: 'Inter-Medium', fontSize: 14, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: 'Inter-Regular' },
  dateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { fontSize: 15, fontFamily: 'Inter-Regular' },
  fieldHint: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 6 },
  skipButton: { alignSelf: 'center', paddingVertical: 16 },
  skipText: { fontSize: 14, fontFamily: 'Inter-Medium', textDecorationLine: 'underline' },
});
