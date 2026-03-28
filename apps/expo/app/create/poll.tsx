import React, { useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useCreatePost } from '@/context/CreatePostContext';

const MAX_POLL_OPTIONS = 4;
const MAX_CONTENT_LENGTH = 500;

export default function PollScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const draft = useCreatePost();

  // Initialize poll mode
  useEffect(() => {
    draft.setIsPoll(true);
    if (draft.pollOptions.length < 2) {
      draft.setPollOptions(['', '']);
    }
  }, []);

  const validOptions = draft.pollOptions.filter((o) => o.trim().length > 0);
  const canProceed = draft.content.trim().length > 0 && validOptions.length >= 2;

  const handleClose = () => {
    if (draft.content.trim() || validOptions.length > 0) {
      Alert.alert('Verwerfen?', 'Deine Umfrage wird nicht gespeichert.', [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verwerfen',
          style: 'destructive',
          onPress: () => {
            draft.reset();
            router.back();
          },
        },
      ]);
    } else {
      draft.setIsPoll(false);
      router.back();
    }
  };

  const handleWeiter = () => {
    if (!canProceed) return;
    router.push('/create/review' as any);
  };

  const updateOption = (index: number, value: string) => {
    const next = [...draft.pollOptions];
    next[index] = value;
    draft.setPollOptions(next);
  };

  const addOption = () => {
    if (draft.pollOptions.length < MAX_POLL_OPTIONS) {
      draft.setPollOptions([...draft.pollOptions, '']);
    }
  };

  const removeOption = (index: number) => {
    if (draft.pollOptions.length > 2) {
      draft.setPollOptions(draft.pollOptions.filter((_, i) => i !== index));
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Umfrage</Text>
          <Pressable
            onPress={handleWeiter}
            disabled={!canProceed}
            style={[
              styles.weiterBtn,
              { backgroundColor: canProceed ? colors.primary : colors.disabled },
            ]}
          >
            <Text
              style={[
                styles.weiterText,
                { color: canProceed ? colors.onPrimary : colors.disabledText },
              ]}
            >
              Weiter
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* Author row */}
          <View style={styles.authorRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {user?.username?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
            <View>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>
                {user?.username || 'Unbekannt'}
              </Text>
              <Text style={[styles.authorLocation, { color: colors.textSecondary }]}>
                Röbel/Müritz
              </Text>
            </View>
          </View>

          {/* Question input */}
          <TextInput
            style={[styles.questionInput, { color: colors.textPrimary }]}
            placeholder="Stelle eine Frage..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_CONTENT_LENGTH}
            value={draft.content}
            onChangeText={draft.setContent}
            autoFocus
          />

          {/* Poll options */}
          <View style={styles.optionsSection}>
            <Text style={[styles.optionsLabel, { color: colors.textSecondary }]}>Optionen</Text>
            {draft.pollOptions.map((option, i) => (
              <View key={i} style={styles.optionRow}>
                <TextInput
                  style={[
                    styles.optionInput,
                    {
                      color: colors.textPrimary,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor={colors.textTertiary}
                  value={option}
                  onChangeText={(val) => updateOption(i, val)}
                  maxLength={60}
                />
                {draft.pollOptions.length > 2 && (
                  <Pressable onPress={() => removeOption(i)} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
                  </Pressable>
                )}
              </View>
            ))}

            {draft.pollOptions.length < MAX_POLL_OPTIONS && (
              <Pressable onPress={addOption} style={styles.addOptionBtn}>
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={[styles.addOptionText, { color: colors.primary }]}>
                  Option hinzufügen
                </Text>
              </Pressable>
            )}
          </View>

          {/* Poll type toggle */}
          <View style={styles.pollTypeSection}>
            <Text style={[styles.optionsLabel, { color: colors.textSecondary }]}>Abstimmungstyp</Text>
            <View style={styles.pollTypeRow}>
              <Pressable
                onPress={() => draft.setPollType('single')}
                style={[
                  styles.pollTypeBtn,
                  {
                    backgroundColor: draft.pollType === 'single' ? colors.primaryLight : colors.surface,
                    borderColor: draft.pollType === 'single' ? colors.primary : colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="radio-button-on"
                  size={16}
                  color={draft.pollType === 'single' ? colors.primary : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.pollTypeText,
                    { color: draft.pollType === 'single' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Einzelwahl
                </Text>
              </Pressable>
              <Pressable
                onPress={() => draft.setPollType('multi')}
                style={[
                  styles.pollTypeBtn,
                  {
                    backgroundColor: draft.pollType === 'multi' ? colors.primaryLight : colors.surface,
                    borderColor: draft.pollType === 'multi' ? colors.primary : colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="checkbox"
                  size={16}
                  color={draft.pollType === 'multi' ? colors.primary : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.pollTypeText,
                    { color: draft.pollType === 'multi' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Mehrfachwahl
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  weiterBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  weiterText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  authorName: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  authorLocation: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  questionInput: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 24,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  optionsSection: {
    gap: 10,
  },
  optionsLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  addOptionText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  pollTypeSection: {
    gap: 10,
  },
  pollTypeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pollTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  pollTypeText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
