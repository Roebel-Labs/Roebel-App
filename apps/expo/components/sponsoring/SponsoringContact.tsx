import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { openSponsoringChat, SPONSORING_CONTACT_NAME, sponsoringWhatsAppUrl } from '@/lib/sponsoring';

type Props = {
  /** The viewer's active account (org or personal); null → only WhatsApp works. */
  myAccountId: string | null;
  orgName: string;
  packageName: string | null;
  booked: boolean;
};

/** "Fragen?" block: chat with Max in the app, WhatsApp as the fallback. Same contact before and after a purchase. */
export default function SponsoringContact({ myAccountId, orgName, packageName, booked }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const [opening, setOpening] = useState(false);

  const openWhatsApp = () => {
    Linking.openURL(sponsoringWhatsAppUrl(orgName, packageName, booked)).catch(() =>
      Alert.alert('WhatsApp nicht verfügbar', `Ihr erreicht ${SPONSORING_CONTACT_NAME} unter +49 176 82275490.`));
  };

  const openChat = async () => {
    if (!myAccountId || opening) return;
    setOpening(true);
    const id = await openSponsoringChat(myAccountId).catch(() => null);
    setOpening(false);
    if (id) router.push(`/messages/${id}` as any);
    else openWhatsApp();
  };

  return (
    <View style={[styles.box, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Fragen? Schreibt mir direkt</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Ich bin {SPONSORING_CONTACT_NAME} und mache den Livestream. Vor und nach dem Kauf bin ich euer Ansprechpartner.
      </Text>
      {myAccountId ? (
        <Pressable onPress={openChat} disabled={opening} style={[styles.primary, { backgroundColor: colors.primary }]}
          accessibilityRole="button" accessibilityLabel={`Nachricht an ${SPONSORING_CONTACT_NAME} in der App`}>
          {opening ? <ActivityIndicator color={colors.onPrimary} /> : (
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Nachricht an {SPONSORING_CONTACT_NAME}</Text>
          )}
        </Pressable>
      ) : null}
      <Pressable onPress={openWhatsApp} style={styles.whatsapp} accessibilityRole="button" accessibilityLabel="Fragen per WhatsApp stellen">
        <Text style={styles.whatsappText}>Per WhatsApp schreiben</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, padding: 16, gap: 10 },
  title: { fontFamily: fontFamily.heading, fontSize: 19 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  primary: { borderRadius: 999, paddingVertical: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  whatsapp: { borderRadius: 999, paddingVertical: 13, alignItems: 'center', backgroundColor: '#128C7E' },
  whatsappText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#FFFFFF' },
});
