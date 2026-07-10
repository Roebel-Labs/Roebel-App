import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { MessagePayment } from '@/lib/supabase-messages';

type Props = {
  payment: MessagePayment;
  isOwn: boolean;
};

/**
 * In-chat Röbel Münzen payment receipt. Shows the amount and direction —
 * never the tx hash or any chain jargon (the transfer is already gasless and
 * settled when this bubble exists).
 */
export default function PaymentBubble({ payment, isOwn }: Props) {
  const { colors } = useTheme();

  const amountLabel = payment.amount.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <View
      style={[
        styles.card,
        isOwn
          ? [styles.cardOwn, { backgroundColor: colors.primary }]
          : [styles.cardOther, { backgroundColor: colors.surface, borderColor: colors.border }],
      ]}
    >
      <Text style={styles.coin}>🪙</Text>
      <View style={styles.textCol}>
        <Text
          style={[styles.amount, { color: isOwn ? colors.onPrimary : colors.textPrimary }]}
          numberOfLines={1}
        >
          {amountLabel} Röbel Münzen
        </Text>
        <Text style={[styles.direction, { color: isOwn ? colors.onPrimary : colors.textSecondary }]}>
          {isOwn ? 'Gesendet' : 'Empfangen'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    minWidth: 180,
  },
  cardOwn: {
    borderBottomRightRadius: 4,
  },
  cardOther: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  coin: {
    fontSize: 26,
  },
  textCol: {
    flexShrink: 1,
  },
  amount: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  direction: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
    opacity: 0.85,
  },
});
