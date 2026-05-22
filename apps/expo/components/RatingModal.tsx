import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { StarIcon } from '@/components/Icons';
import { useAccountRating } from '@/hooks/useAccountRating';

type Props = {
  visible: boolean;
  accountId: string;
  accountName: string;
  onClose: () => void;
};

export default function RatingModal({ visible, accountId, accountName, onClose }: Props) {
  const { colors } = useTheme();
  const { userRating, isSignedIn, setRating, loading } = useAccountRating(accountId);
  const [stars, setStars] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setStars(userRating?.stars ?? 0);
      setComment(userRating?.comment ?? '');
    }
  }, [visible, userRating]);

  async function onSubmit() {
    if (!stars) return;
    setSubmitting(true);
    await setRating(stars, comment.trim() ? comment.trim() : null);
    setSubmitting(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{accountName} bewerten</Text>
          {!isSignedIn ? (
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Bitte melde dich an, um eine Bewertung abzugeben.
            </Text>
          ) : (
            <>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
                    <StarIcon size={36} color={n <= stars ? '#FFB400' : colors.borderSecondary} />
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Optional: Schreibe etwas zu deinem Erlebnis"
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
              />
            </>
          )}
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={{ color: colors.textPrimary, fontFamily: 'Inter-Medium' }}>Abbrechen</Text>
            </Pressable>
            {isSignedIn && (
              <Pressable
                onPress={onSubmit}
                disabled={!stars || submitting || loading}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  { backgroundColor: colors.primary, opacity: !stars || submitting ? 0.5 : 1 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontFamily: 'Inter-Medium' }}>Speichern</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 28, gap: 16 },
  title: { fontSize: 18, fontFamily: 'Inter-Medium' },
  body: { fontSize: 14, fontFamily: 'Inter-Regular' },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80, fontFamily: 'Inter-Regular', fontSize: 14, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 9999, minWidth: 110, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent' },
  btnPrimary: {},
});
