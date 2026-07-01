import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { submitFeedback } from '@/lib/supabase-feedback';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import type { ColorTokens } from '@/constants/theme';

const FEEDBACK_TYPES = [
  { value: 'bug_report', label: 'Fehlerbericht' },
  { value: 'feature_request', label: 'Feature-Wunsch' },
  { value: 'improvement', label: 'Verbesserungsvorschlag' },
  { value: 'general', label: 'Allgemeines Feedback' },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const account = useActiveAccount();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);

  const [form, setForm] = useState({
    feedback_type: '',
    subject: '',
    message: '',
    contact_email: '',
    contact_phone: '',
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const getDeviceInfo = () => {
    return {
      os: Platform.OS,
      appVersion: Constants.expoConfig?.version || 'unknown',
      deviceModel: Device.modelName || Device.brand || 'unknown',
    };
  };

  const getFeedbackTypeLabel = (value: string) => {
    const type = FEEDBACK_TYPES.find((t) => t.value === value);
    return type?.label || '';
  };

  async function handleSubmit() {
    // Validation
    if (!form.feedback_type || !form.subject || !form.message) {
      Alert.alert('Erforderliche Felder fehlen', 'Bitte fülle alle Pflichtfelder (*) aus.');
      return;
    }

    setIsSubmitting(true);

    try {
      const deviceInfo = getDeviceInfo();

      await submitFeedback({
        user_wallet_address: account?.address || null,
        feedback_type: form.feedback_type as 'bug_report' | 'feature_request' | 'general' | 'improvement',
        subject: form.subject.trim(),
        message: form.message.trim(),
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        device_info: deviceInfo,
      });

      setIsSuccess(true);

      // Reset form after 3 seconds
      setTimeout(() => {
        setForm({
          feedback_type: '',
          subject: '',
          message: '',
          contact_email: '',
          contact_phone: '',
        });
        setIsSuccess(false);
      }, 3000);
    } catch (error: any) {
      Alert.alert('Einreichung fehlgeschlagen', error.message ?? 'Bitte versuche es später erneut.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.successContainer}>
          <Text style={[styles.successIcon, { color: colors.success }]}>✓</Text>
          <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Feedback erfolgreich gesendet!</Text>
          <Text style={[styles.successText, { color: colors.textSecondary }]}>
            Vielen Dank für Ihr Feedback. Wir werden es prüfen und uns bei Bedarf bei Ihnen melden.
          </Text>
          <Pressable style={[styles.successButton, { backgroundColor: colors.surfaceSecondary }]} onPress={() => setIsSuccess(false)}>
            <Text style={[styles.successButtonText, { color: colors.textPrimary }]}>Weiteres Feedback senden</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}>
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Feedback geben</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={100}
        extraHeight={150}
      >
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Ihre Meinung ist uns wichtig! Teilen Sie uns Ihre Gedanken, Vorschläge oder Probleme mit.
        </Text>

        {/* Feedback Type */}
        <Field label="Feedback-Art" required colors={colors}>
          <View style={[styles.pickerContainer, { borderColor: colors.borderSecondary, backgroundColor: colors.background }]}>
            <Pressable
              style={styles.picker}
              onPress={() => setShowTypeModal(true)}
            >
              <Text style={form.feedback_type ? [styles.pickerText, { color: colors.textPrimary }] : [styles.pickerPlaceholder, { color: colors.textTertiary }]}>
                {form.feedback_type ? getFeedbackTypeLabel(form.feedback_type) : 'Art auswählen'}
              </Text>
            </Pressable>
          </View>
        </Field>

        {/* Subject */}
        <Field label="Betreff" required colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            value={form.subject}
            onChangeText={(t) => set('subject', t)}
            placeholder="Kurzer Betreff"
            placeholderTextColor={colors.textTertiary}
            maxLength={100}
          />
        </Field>

        {/* Message */}
        <Field label="Nachricht" required colors={colors}>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            value={form.message}
            onChangeText={(t) => set('message', t)}
            placeholder="Beschreiben Sie Ihr Feedback ausführlich..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={6}
            maxLength={1000}
          />
          <Text style={[styles.characterCount, { color: colors.textTertiary }]}>{form.message.length}/1000</Text>
        </Field>

        {/* Contact Information */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Kontaktinformationen (Optional)</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          Falls wir Rückfragen haben oder Sie über Fortschritte informieren möchten
        </Text>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Field label="E-Mail" colors={colors}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
                value={form.contact_email}
                onChangeText={(t) => set('contact_email', t)}
                placeholder="ihre.email@beispiel.de"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>
          </View>
          <View style={styles.halfField}>
            <Field label="Telefonnummer" colors={colors}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
                value={form.contact_phone}
                onChangeText={(t) => set('contact_phone', t)}
                placeholder="0123 456789"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
              />
            </Field>
          </View>
        </View>

        {/* User Info Display (if logged in) */}
        {account && (
          <View style={[styles.infoBox, { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight }]}>
            <Text style={[styles.infoText, { color: colors.primary }]}>
              📱 Angemeldet als: {account.address.slice(0, 6)}...{account.address.slice(-4)}
            </Text>
          </View>
        )}

        {/* Submit and Cancel Buttons */}
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.submitButton, { backgroundColor: colors.primary }, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
              {isSubmitting ? 'Wird gesendet...' : 'Feedback senden'}
            </Text>
          </Pressable>
          <Pressable style={[styles.cancelButton, { borderColor: colors.borderSecondary }]} onPress={() => router.back()}>
            <Text style={[styles.cancelButtonText, { color: colors.textPrimary }]}>Abbrechen</Text>
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          * Pflichtfelder. Ihre Daten werden vertraulich behandelt und nur zur Bearbeitung Ihres
          Feedbacks verwendet.
        </Text>
      </KeyboardAwareScrollView>

      {/* Feedback Type Selection Modal */}
      <Modal
        visible={showTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.typeModal, { backgroundColor: colors.background, paddingBottom: Math.max(40, insets.bottom) }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Feedback-Art auswählen</Text>
            <ScrollView style={styles.typeList}>
              {FEEDBACK_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  style={({ pressed }) => [
                    styles.typeItem,
                    { borderBottomColor: colors.border },
                    form.feedback_type === type.value && { backgroundColor: colors.primaryLight },
                    pressed && { backgroundColor: colors.pressedOverlay },
                  ]}
                  onPress={() => {
                    set('feedback_type', type.value);
                    setShowTypeModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.typeItemText,
                      { color: colors.textPrimary },
                      form.feedback_type === type.value && { fontFamily: 'Inter-Medium', color: colors.primary },
                    ]}
                  >
                    {type.label}
                  </Text>
                  {form.feedback_type === type.value && <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.modalCloseButton, { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => setShowTypeModal(false)}
            >
              <Text style={[styles.modalCloseButtonText, { color: colors.textPrimary }]}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
  required = false,
  colors,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  colors: ColorTokens;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>
        {label} {required && <Text style={{ color: colors.error }}>*</Text>}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginBottom: 24,
    lineHeight: 22,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'right',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginBottom: 4,
    marginTop: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 16,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 12,
  },
  picker: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  pickerPlaceholder: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  buttonRow: {
    gap: 12,
    marginTop: 24,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    textAlign: 'center',
  },
  successText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  successButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  successButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  typeModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  typeList: {
    maxHeight: 300,
  },
  typeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  typeItemText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  checkmark: {
    fontSize: 18,
  },
  modalCloseButton: {
    marginTop: 16,
    marginHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
