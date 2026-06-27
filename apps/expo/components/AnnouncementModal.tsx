import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Linking, Dimensions } from 'react-native';
import { Image } from 'expo-image';

const SCREEN_HEIGHT = Dimensions.get('window').height;
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { AnnouncementRecord } from '@/lib/types';

type Props = {
  visible: boolean;
  announcement: AnnouncementRecord;
  onDismiss: () => void;
};

export default function AnnouncementModal({ visible, announcement, onDismiss }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const handleCta = () => {
    onDismiss();
    if (!announcement.cta_link) return;

    setTimeout(() => {
      if (announcement.cta_type === 'external_url') {
        Linking.openURL(announcement.cta_link!).catch(console.error);
      } else {
        router.push(announcement.cta_link as any);
      }
    }, 300);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Hero image */}
        <View style={styles.imageContainer}>
          {announcement.image_url ? (
            <Image source={{ uri: announcement.image_url }} style={styles.image} contentFit="cover" />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface }]} />
          )}

          {/* Close button */}
          <Pressable
            onPress={onDismiss}
            style={[styles.closeBtn, { top: insets.top + 12, backgroundColor: 'rgba(0,0,0,0.4)' }]}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* Content */}
        <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {announcement.title}
            </Text>
            {announcement.description && (
              <Text style={[styles.description, { color: colors.textPrimary }]}>
                {announcement.description}
              </Text>
            )}
          </View>

          <View style={styles.buttonContainer}>
            {announcement.cta_link && (
              <Pressable
                style={[styles.ctaButton, { backgroundColor: colors.primary }]}
                onPress={handleCta}
              >
                <Text style={styles.ctaButtonText}>
                  {announcement.cta_label || 'Mehr erfahren'}
                </Text>
              </Pressable>
            )}

            <Pressable style={styles.dismissButton} onPress={onDismiss}>
              <Text style={[styles.dismissButtonText, { color: colors.primary }]}>
                Vielleicht später
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageContainer: {
    height: SCREEN_HEIGHT / 3,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    marginBottom: 16,
  },
  buttonContainer: {
    gap: 12,
    marginTop: 8,
  },
  dismissButton: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  ctaButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
