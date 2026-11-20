import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
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
    <View style={styles.box}>
      <Image source={require('@/assets/images/sponsoring/contact.png')} style={styles.image} contentFit="contain" accessible={false} />
      <Text style={styles.title}>Fragen? Schreibt uns direkt</Text>
      <View style={styles.buttons}>
        {myAccountId ? (
          <Pressable onPress={openChat} disabled={opening} style={styles.primary}
            accessibilityRole="button" accessibilityLabel={`Frage an ${SPONSORING_CONTACT_NAME} in der App stellen`}>
            {opening ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Frage stellen</Text>}
          </Pressable>
        ) : null}
        <Pressable onPress={openWhatsApp} style={styles.whatsapp} accessibilityRole="button" accessibilityLabel="Fragen per WhatsApp stellen">
          <Text style={styles.buttonText}>Per WhatsApp schreiben</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Dark band in both themes, as in the design.
const styles = StyleSheet.create({
  box: { backgroundColor: '#171A1F', paddingHorizontal: 16, paddingVertical: 32, gap: 16, alignItems: 'center' },
  image: { width: 157, height: 157 },
  title: { fontFamily: fontFamily.heading, fontSize: 28, color: '#FFFFFF', textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: 8 },
  primary: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center', backgroundColor: '#00498B' },
  whatsapp: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#FFFFFF' },
});
