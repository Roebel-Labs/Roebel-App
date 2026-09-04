/**
 * Shared chrome for every merchant-onboarding step: a progress rail, a title,
 * body content and exactly ONE primary action.
 *
 * The single-action rule is the Uber-Eats bar from the spec -- a step that needs
 * two buttons is two steps. Keeping it here means no individual step screen
 * re-invents spacing, the rail, or the busy state.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

type Props = {
  stepIndex: number;
  stepTotal: number;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  busy?: boolean;
  error?: string | null;
  children?: React.ReactNode;
};

export function OnboardingStep({
  stepIndex,
  stepTotal,
  title,
  body,
  actionLabel,
  onAction,
  actionDisabled,
  busy,
  error,
  children,
}: Props) {
  const { colors } = useTheme();
  const blocked = Boolean(actionDisabled) || Boolean(busy);

  return (
    <View style={styles.container}>
      <View style={styles.rail} accessibilityRole="progressbar">
        {Array.from({ length: stepTotal }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.railSegment,
              { backgroundColor: index < stepIndex ? colors.primary : colors.border },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.step, { color: colors.textSecondary }]}>
        Schritt {stepIndex} von {stepTotal}
      </Text>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text> : null}

      <View style={styles.content}>{children}</View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.errorBackground }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}

      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked, busy: Boolean(busy) }}
          onPress={onAction}
          disabled={blocked}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: blocked ? colors.disabled : colors.primary },
            pressed && !blocked && { opacity: 0.85 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text
              style={[
                styles.actionLabel,
                { color: blocked ? colors.disabledText : colors.onPrimary },
              ]}
            >
              {actionLabel}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  rail: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  railSegment: { flex: 1, height: 4, borderRadius: 2 },
  step: { fontFamily: 'Inter-Regular', fontSize: 13 },
  title: { fontFamily: 'Inter-Bold', fontSize: 24, lineHeight: 30 },
  body: { fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 22 },
  content: { flex: 1, gap: 12 },
  errorBox: { borderRadius: 10, padding: 12 },
  errorText: { fontFamily: 'Inter-Medium', fontSize: 14, lineHeight: 20 },
  action: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: 'Inter-SemiBold', fontSize: 16 },
});
