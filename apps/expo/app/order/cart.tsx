import React from 'react';
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useOrderSession } from '@/context/OrderSessionContext';
import { formatMenuPrice } from '@/lib/utils';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function OrderCartScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { cart, removeFromCart, updateCartItem, cartTotal, guestName, setGuestName, submitOrder, isSubmitting } = useOrderSession();

  const handleSubmit = async () => {
    if (cart.length === 0) {
      Alert.alert('Warenkorb leer', 'Bitte fügen Sie mindestens ein Gericht hinzu.');
      return;
    }
    try {
      await submitOrder();
      router.replace('/order/status');
    } catch {
      Alert.alert('Fehler', 'Bestellung konnte nicht gesendet werden.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 18, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Warenkorb</Text>
      </View>

      <KeyboardAwareScrollView style={{ flex: 1, padding: 16 }} keyboardShouldPersistTaps="handled" enableOnAndroid={true} enableAutomaticScroll={true} extraScrollHeight={100} extraHeight={150}>
        {cart.length === 0 ? (
          <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>Dein Warenkorb ist leer</Text>
        ) : (
          cart.map((item, index) => (
            <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSecondary }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Inter-Regular', color: colors.textPrimary }}>{item.menuItem.name}</Text>
                {item.notes ? <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{item.notes}</Text> : null}
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginTop: 4 }}>{formatMenuPrice(item.menuItem.price * item.quantity)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => updateCartItem(index, item.quantity - 1)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: colors.textPrimary }}>-</Text>
                </Pressable>
                <Text style={{ fontSize: 15, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{item.quantity}</Text>
                <Pressable onPress={() => updateCartItem(index, item.quantity + 1)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: colors.textPrimary }}>+</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 8 }}>DEIN NAME (optional)</Text>
          <TextInput
            placeholder="z.B. Max"
            placeholderTextColor={colors.textTertiary}
            value={guestName || ''}
            onChangeText={setGuestName}
            style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter-Regular', color: colors.textPrimary }}
          />
        </View>

        <View style={{ height: 120 }} />
      </KeyboardAwareScrollView>

      {cart.length > 0 && (
        <View style={{ position: 'absolute', bottom: 32, left: 16, right: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Gesamt</Text>
            <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{formatMenuPrice(cartTotal)}</Text>
          </View>
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontSize: 16, fontFamily: 'Inter-Medium' }}>Bestellung senden</Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
