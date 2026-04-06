import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Dimensions,
  Animated,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import Markdown from 'react-native-markdown-display';
import { supabase } from '@/lib/supabase';
import { geocodeLocation } from '@/lib/utils/geocoding';
import PencilIcon from '@/assets/icons/pencil.svg';
import FlyerIcon from '@/assets/icons/flyer.svg';
import UploadIcon from '@/assets/icons/profile/upload.svg';
import CheckIcon from '@/assets/icons/check.svg';
import { useTheme } from '@/context/ThemeContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  localUri?: string;
  isLoading?: boolean;
}

const SYSTEM_PROMPT = `Du bist ein hilfreicher KI-Assistent für die Einreichung von Events in Röbel/Müritz.

Deine Aufgabe ist es, Nutzer durch den Prozess der Event-Einreichung zu führen. Stelle freundliche Fragen und sammle folgende Informationen:

**Pflichtfelder:**
- Event-Titel
- Datum (im Format JJJJ-MM-TT) ODER mehrere Termine für wiederkehrende Events
- Ort/Adresse in Röbel oder Umgebung
- Name des Veranstalters
- E-Mail-Adresse des Veranstalters

**Optionale Felder:**
- Beschreibung
- Uhrzeit (Beginn im Format HH:MM)
- Endzeit (im Format HH:MM)
- Kategorie (Musik, Kultur, Sport, Fest, Natur, Mittelalter, Lesung, Sonstiges)
- Webseite
- Eintrittspreis (0 für kostenlos)
- Maximale Teilnehmerzahl
- Telefonnummer

**Bilder/Flyer:**
- Nutzer können Event-Flyer oder Bilder hochladen
- Hochgeladene Bilder werden AUTOMATISCH mit dem Event gespeichert
- Wenn ein Bild hochgeladen wurde, extrahiere die sichtbaren Event-Informationen daraus
- Du musst dich NICHT um das Speichern des Bildes kümmern - das passiert automatisch im Hintergrund
- Erwähne in der Zusammenfassung, dass das hochgeladene Bild mit dem Event gespeichert wird

**Für wiederkehrende Events:**
- Frage ob das Event einmalig oder wiederkehrend ist
- Bei wiederkehrenden Events: Frage nach dem Muster (wöchentlich, zweiwöchentlich, monatlich, jährlich)
- Frage nach Start- und Enddatum für die Serie
- Generiere alle Termine und setze is_recurring auf true
- Übergebe die Termine als dates Array im Format JJJJ-MM-TT

Stelle die Fragen einzeln und natürlich. Bestätige die Eingaben des Nutzers.

**WICHTIG:** Wenn ALLE Pflichtfelder gesammelt wurden:
1. Rufe SOFORT das prepare_event_submission Tool auf mit allen gesammelten Daten - dies zeigt dem Nutzer automatisch den Einreichen-Button
2. Fasse dann die gesammelten Informationen übersichtlich zusammen (inkl. Hinweis auf hochgeladenes Bild falls vorhanden)
3. Sage dem Nutzer: "Wische nach oben um dein Event einzureichen!"

Antworte immer auf Deutsch und sei freundlich und hilfsbereit.`;

// Tools definition for Claude to prepare event submission
const TOOLS = [
  {
    name: 'prepare_event_submission',
    description: 'Call this when you have collected ALL required fields (title, date, location, organizer_name, organizer_email). This will show the submit button to the user so they can swipe up to submit. Call this BEFORE showing the summary.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        date: { type: 'string', description: 'Single event date in YYYY-MM-DD format (for non-recurring events)' },
        dates: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of dates in YYYY-MM-DD format for recurring events'
        },
        is_recurring: {
          type: 'boolean',
          description: 'Set to true if the event occurs on multiple dates'
        },
        location: { type: 'string', description: 'Event location/address in Röbel or surrounding area' },
        organizer_name: { type: 'string', description: 'Name of the event organizer' },
        organizer_email: { type: 'string', description: 'Email address of the organizer' },
        description: { type: 'string', description: 'Event description (optional)' },
        time: { type: 'string', description: 'Start time in HH:MM format (optional)' },
        end_time: { type: 'string', description: 'End time in HH:MM format (optional)' },
        organizer_phone: { type: 'string', description: 'Organizer phone number (optional)' },
        category: {
          type: 'string',
          enum: ['Kultur', 'Musik', 'Essen & Trinken', 'Kirchliches', 'Ausstellungen', 'Stadt', 'Sport', 'Sonstige'],
          description: 'Event category (optional)',
        },
        website_url: { type: 'string', description: 'Event website URL (optional)' },
        ticket_price: { type: 'number', description: 'Ticket price in euros, use 0 for free events (optional)' },
        max_attendees: { type: 'number', description: 'Maximum number of attendees (optional)' },
      },
      required: ['title', 'location', 'organizer_name', 'organizer_email'],
    },
  },
];

// Direct Anthropic API call with tools support
async function callAnthropicAPI(
  apiKey: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  tools: any[]
): Promise<any> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools: tools,
      messages: messages,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API call failed');
  }

  return response.json();
}

// Helper function to convert image to base64 for API
async function imageToBase64(uri: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
    let mediaType = 'image/jpeg';
    if (extension === 'png') mediaType = 'image/png';
    else if (extension === 'webp') mediaType = 'image/webp';
    else if (extension === 'gif') mediaType = 'image/gif';

    return { base64, mediaType };
  } catch (error) {
    console.error('Error converting image to base64:', error);
    return null;
  }
}

// Message bubble component with image and markdown support
function MessageBubbleInner({
  role,
  content,
  imageUrl,
  localUri,
  isLoading
}: {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  localUri?: string;
  isLoading?: boolean;
}) {
  const { colors } = useTheme();
  const isUser = role === 'user';
  const displayUri = localUri || imageUrl;

  const markdownStyles = StyleSheet.create({
    body: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 22,
    },
    strong: {
      fontFamily: 'Inter-SemiBold',
      color: colors.textPrimary,
    },
    em: {
      fontStyle: 'italic',
    },
    paragraph: {
      marginVertical: 4,
    },
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    list_item: {
      marginVertical: 2,
    },
  });

  return (
    <View style={[
      styles.messageBubble,
      isUser
        ? [styles.userBubble, { backgroundColor: colors.primary }]
        : [styles.assistantBubble, { backgroundColor: colors.surface }],
    ]}>
      {displayUri && (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: displayUri }}
            style={styles.messageImage}
            resizeMode="cover"
          />
          {isLoading && (
            <View style={styles.imageLoadingOverlay}>
              <ActivityIndicator size="small" color={colors.textInverted} />
            </View>
          )}
        </View>
      )}
      {content ? (
        isUser ? (
          <Text style={[styles.messageText, { color: colors.onPrimary }]}>{content}</Text>
        ) : (
          <Markdown style={markdownStyles}>{content}</Markdown>
        )
      ) : null}
    </View>
  );
}

// Typing indicator component with animated dots
function TypingIndicator() {
  const { colors } = useTheme();
  const dot1Opacity = useRef(new Animated.Value(0.4)).current;
  const dot2Opacity = useRef(new Animated.Value(0.4)).current;
  const dot3Opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animateDot = (dotAnim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dotAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 0.4, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    };

    animateDot(dot1Opacity, 0);
    animateDot(dot2Opacity, 150);
    animateDot(dot3Opacity, 300);
  }, []);

  return (
    <View style={styles.typingIndicator}>
      <Animated.View style={[styles.typingDot, { opacity: dot1Opacity, backgroundColor: colors.textSecondary }]} />
      <Animated.View style={[styles.typingDot, { opacity: dot2Opacity, backgroundColor: colors.textSecondary }]} />
      <Animated.View style={[styles.typingDot, { opacity: dot3Opacity, backgroundColor: colors.textSecondary }]} />
    </View>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Fullscreen image preview component (WhatsApp-style)
function FullScreenImagePreviewInner({
  visible,
  imageUri,
  onClose,
  onSend,
  isSending,
}: {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
  onSend: (message: string) => void;
  isSending?: boolean;
}) {
  const { colors } = useTheme();
  const [caption, setCaption] = useState('');

  // Reset caption when modal opens with new image
  useEffect(() => {
    if (visible) {
      setCaption('');
    }
  }, [visible, imageUri]);

  const handleSend = () => {
    onSend(caption);
    setCaption('');
  };

  if (!imageUri) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={previewStyles.container}>
        {/* Header */}
        <View style={previewStyles.header}>
          <TouchableOpacity onPress={onClose} style={previewStyles.closeButton}>
            <Ionicons name="close" size={28} color={colors.textInverted} />
          </TouchableOpacity>
          <Text style={[previewStyles.headerTitle, { color: colors.textInverted }]}>Bild anhängen</Text>
          <View style={previewStyles.headerSpacer} />
        </View>

        {/* Image */}
        <View style={previewStyles.imageContainer}>
          <Image
            source={{ uri: imageUri }}
            style={previewStyles.image}
            resizeMode="contain"
          />
        </View>

        {/* Caption input and send */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={previewStyles.bottomContainer}
        >
          <View style={previewStyles.inputContainer}>
            <TextInput
              style={previewStyles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Nachricht hinzufügen..."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
              editable={!isSending}
            />
            <TouchableOpacity
              style={[previewStyles.sendButton, { backgroundColor: colors.primary }, isSending && previewStyles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Ionicons name="send" size={22} color={colors.onPrimary} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const previewStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  headerSpacer: {
    width: 44,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.6,
  },
  bottomContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    backgroundColor: '#1f1f1f',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  captionInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

export function MinimalAIChat() {
  const { colors } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hallo! Ich helfe dir dabei, dein Event in Röbel/Müritz einzureichen. Erzähl mir von deinem Event oder sende einen Flyer ein.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedImageUri, setStagedImageUri] = useState<string | null>(null);
  const [lastUploadedImageUrl, setLastUploadedImageUrl] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [isSendingFromPreview, setIsSendingFromPreview] = useState(false);

  // New state for submission flow
  const [isReadyToSubmit, setIsReadyToSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [pendingEventData, setPendingEventData] = useState<any>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const iconBounceAnim = useRef(new Animated.Value(0)).current;
  const iconBounceAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const isReadyToSubmitRef = useRef(false);
  const pendingEventDataRef = useRef<any>(null);

  // Keep refs in sync with state for gesture handler
  useEffect(() => {
    isReadyToSubmitRef.current = isReadyToSubmit;
  }, [isReadyToSubmit]);

  useEffect(() => {
    pendingEventDataRef.current = pendingEventData;
  }, [pendingEventData]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Bounce animation for submit button icon only
  const startIconBounceAnimation = () => {
    const bounce = () => {
      iconBounceAnimRef.current = Animated.sequence([
        Animated.timing(iconBounceAnim, { toValue: -8, duration: 150, useNativeDriver: true }),
        Animated.timing(iconBounceAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(iconBounceAnim, { toValue: -8, duration: 150, useNativeDriver: true }),
        Animated.timing(iconBounceAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.delay(1000),
      ]);
      iconBounceAnimRef.current.start(() => bounce());
    };
    bounce();
  };

  const stopIconBounceAnimation = () => {
    if (iconBounceAnimRef.current) {
      iconBounceAnimRef.current.stop();
    }
    iconBounceAnim.setValue(0);
  };

  // PanGestureHandler event for swipe-to-submit
  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: translateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = async (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationY: gestureTranslationY } = event.nativeEvent;

      if (gestureTranslationY < -150 && pendingEventDataRef.current) {
        // Stop bounce animation
        stopIconBounceAnimation();

        // Animate chat off screen
        Animated.timing(translateY, {
          toValue: -SCREEN_HEIGHT,
          duration: 300,
          useNativeDriver: true,
        }).start();

        // Show loading state and submit
        setIsSubmitting(true);
        const success = await submitEventToSupabase(pendingEventDataRef.current);
        setIsSubmitting(false);

        if (success) {
          setShowSuccessScreen(true);
        } else {
          // Snap back on error
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          startIconBounceAnimation();
        }
      } else {
        // Snap back if not enough swipe
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    }
  };

  // Handle describe button tap
  const handleDescribe = () => {
    // Send a message to the AI to start the describe flow
    sendMessageWithImage('Ich möchte mein Event beschreiben.', null);
  };

  // Handle go to home
  const handleGoHome = () => {
    router.replace('/');
  };

  // Submit event to Supabase
  const submitEventToSupabase = async (eventData: any): Promise<boolean> => {
    setIsSubmittingEvent(true);

    try {
      // 1. Geocode location
      const googleApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      let placeData = null;

      if (googleApiKey) {
        placeData = await geocodeLocation(eventData.location, googleApiKey);
        if (!placeData) {
          console.warn('Geocoding failed, using raw location');
        }
      } else {
        console.warn('Google Maps API key not configured, skipping geocoding');
      }

      // 2. Determine dates to submit
      const isRecurring = eventData.is_recurring || (eventData.dates && eventData.dates.length > 1);
      const datesToSubmit = eventData.dates && eventData.dates.length > 0
        ? eventData.dates
        : [eventData.date];
      const primaryDate = datesToSubmit[0];

      // 3. Insert into Supabase with geocoded data
      const { data, error } = await supabase.from('events').insert({
        title: eventData.title,
        date: primaryDate,
        time: eventData.time || null,
        end_time: eventData.end_time || null,
        location: placeData?.formatted_address || eventData.location,
        latitude: placeData?.latitude || null,
        longitude: placeData?.longitude || null,
        place_id: placeData?.place_id || null,
        formatted_address: placeData?.formatted_address || null,
        address_components: placeData?.address_components || null,
        description: eventData.description || null,
        organizer_name: eventData.organizer_name,
        organizer_email: eventData.organizer_email,
        organizer_phone: eventData.organizer_phone || null,
        category: eventData.category || null,
        website_url: eventData.website_url || null,
        ticket_price: eventData.ticket_price || 0,
        max_attendees: eventData.max_attendees || null,
        image_url: eventData.image_url || null,
        status: 'pending',
        is_recurring: isRecurring,
      }).select().single();

      if (error) {
        console.error('Supabase insert error:', error);
        throw error;
      }

      // Insert all dates into event_dates table
      if (data) {
        const eventDates = datesToSubmit.map((date: string) => ({
          event_id: data.id,
          date: date,
        }));

        const { error: datesError } = await supabase.from('event_dates').insert(eventDates);

        if (datesError) {
          console.error('Error inserting event dates:', datesError);
        }
      }

      // Show success message
      const dateCount = datesToSubmit.length;
      const successMessage: Message = {
        id: `success-${Date.now()}`,
        role: 'assistant',
        content: isRecurring
          ? `🎉 **Perfekt!** Dein wiederkehrendes Event mit ${dateCount} Terminen wurde erfolgreich zur Überprüfung eingereicht. Du erhältst eine Benachrichtigung, sobald es freigegeben wurde.`
          : '🎉 **Perfekt!** Dein Event wurde erfolgreich zur Überprüfung eingereicht. Du erhältst eine Benachrichtigung, sobald es freigegeben wurde.',
      };

      setMessages((prev) => [...prev, successMessage]);
      return true;
    } catch (err: any) {
      console.error('Event submission error:', err);

      let errorMessage = '❌ Ein Fehler ist aufgetreten. ';
      if (err.message?.includes('email')) {
        errorMessage += 'Bitte überprüfe die E-Mail-Adresse.';
      } else if (err.message?.includes('date')) {
        errorMessage += 'Das Datum scheint ungültig zu sein.';
      } else {
        errorMessage += 'Bitte versuche es erneut.';
      }

      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: errorMessage,
      };

      setMessages((prev) => [...prev, errorMsg]);
      return false;
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  // Handle image selection - opens fullscreen preview
  const handleSelectImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlaube den Zugriff auf deine Fotobibliothek.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      setStagedImageUri(result.assets[0].uri);
      setShowImagePreview(true); // Open fullscreen preview
    } catch (error) {
      console.error('Image selection error:', error);
      Alert.alert('Fehler', 'Bild konnte nicht ausgewählt werden.');
    }
  };

  // Handle sending from fullscreen preview
  const handleSendFromPreview = async (caption: string) => {
    const localUri = stagedImageUri;
    setIsSendingFromPreview(true);
    setShowImagePreview(false);
    setStagedImageUri(null);

    // Call sendMessage with the caption and image
    await sendMessageWithImage(caption, localUri);
    setIsSendingFromPreview(false);
  };

  // Close preview without sending
  const handleClosePreview = () => {
    setShowImagePreview(false);
    setStagedImageUri(null);
  };

  // Core message sending logic - used by both regular send and preview send
  const sendMessageWithImage = async (messageText: string, imageUri: string | null) => {
    const trimmedInput = messageText.trim();
    const hasImage = !!imageUri;

    // Allow sending if there's text OR an image
    if (!trimmedInput && !hasImage) return;

    setIsLoading(true);
    setError(null);

    const userMessageId = `user-${Date.now()}`;

    // Create user message with image if present
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: trimmedInput || (hasImage ? 'Ich habe ein Bild hochgeladen.' : ''),
      localUri: imageUri || undefined,
      isLoading: hasImage,
    };

    setMessages((prev) => [...prev, userMessage]);

    let uploadedImageUrl: string | null = null;

    try {
      // Get API key from env
      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('Anthropic API key is not configured');
      }

      // Upload image to Supabase if present
      if (imageUri) {
        console.log('Uploading image to Supabase...');
        const base64Data = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const arrayBuffer = decode(base64Data);
        const fileExtension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
        const filePath = `event-images/${fileName}`;

        let contentType = 'image/jpeg';
        if (fileExtension === 'png') contentType = 'image/png';
        else if (fileExtension === 'webp') contentType = 'image/webp';
        else if (fileExtension === 'gif') contentType = 'image/gif';

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, arrayBuffer, { contentType, cacheControl: '3600', upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('images').getPublicUrl(filePath);
        if (!urlData?.publicUrl) throw new Error('Failed to get public URL');

        uploadedImageUrl = urlData.publicUrl;
        setLastUploadedImageUrl(uploadedImageUrl);
        console.log('Image uploaded:', uploadedImageUrl);

        // Update message with uploaded URL
        setMessages((prev) => prev.map(msg =>
          msg.id === userMessageId ? { ...msg, imageUrl: uploadedImageUrl || undefined } : msg
        ));
      }

      // Prepare message history for API with image support
      const filteredMessages = messages
        .filter((msg) => msg.id !== 'welcome')
        .concat([userMessage]);

      const apiMessages = await Promise.all(
        filteredMessages.map(async (msg) => {
          const uriToConvert = msg.localUri || msg.imageUrl;
          if (uriToConvert) {
            const imageData = await imageToBase64(uriToConvert);
            if (imageData) {
              return {
                role: msg.role,
                content: [
                  { type: 'text' as const, text: msg.content || 'Ich habe ein Bild hochgeladen.' },
                  {
                    type: 'image' as const,
                    source: {
                      type: 'base64' as const,
                      media_type: imageData.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                      data: imageData.base64,
                    },
                  },
                ],
              };
            }
          }
          return { role: msg.role, content: msg.content || ' ' };
        })
      );

      // Call Anthropic API with tools
      const response = await callAnthropicAPI(apiKey, SYSTEM_PROMPT, apiMessages, TOOLS);

      // Check if Claude wants to use a tool
      const toolUseBlock = response.content.find((block: any) => block.type === 'tool_use');

      if (toolUseBlock && toolUseBlock.name === 'prepare_event_submission') {
        const eventData = toolUseBlock.input;
        console.log('Event data extracted via tool:', eventData);

        // Store event data and show ready-to-submit state
        const imageUrlToSubmit = uploadedImageUrl || lastUploadedImageUrl;
        setPendingEventData({ ...eventData, image_url: imageUrlToSubmit });
        setIsReadyToSubmit(true);
        startIconBounceAnimation();

        // Get the text content from the response (AI's summary)
        const assistantContent = response.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => ('text' in block ? block.text : ''))
          .join('\n');

        const summaryMessage: Message = {
          id: `summary-${Date.now()}`,
          role: 'assistant',
          content: assistantContent || 'Alle Daten wurden erfasst. Wische nach oben, um dein Event einzureichen!',
        };

        setMessages((prev) => prev.map(msg =>
          msg.id === userMessageId ? { ...msg, isLoading: false } : msg
        ).concat([summaryMessage]));
      } else {
        const assistantContent = response.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => ('text' in block ? block.text : ''))
          .join('\n');

        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantContent || 'Entschuldigung, ich konnte keine Antwort generieren.',
        };

        setMessages((prev) => prev.map(msg =>
          msg.id === userMessageId ? { ...msg, isLoading: false } : msg
        ).concat([assistantMessage]));
      }
    } catch (err: any) {
      console.error('Error calling Anthropic API:', err);
      setError(err.message || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
      // Clear loading state on error
      setMessages((prev) => prev.map(msg =>
        msg.isLoading ? { ...msg, isLoading: false } : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // Regular send from text input (no image from preview)
  const sendMessage = async () => {
    if (isLoading) return;
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    setInput('');
    await sendMessageWithImage(trimmedInput, null);
  };

  // Check if we should show action buttons (only on initial state)
  const showActionButtons = messages.length === 1 && !isLoading && !isReadyToSubmit;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Blue background - ALWAYS rendered, revealed by swipe */}
      <View style={[styles.submissionScreen, { backgroundColor: colors.primary }]}>
        <ActivityIndicator size="large" color={colors.onPrimary} style={{ marginBottom: 24 }} />
        <Text style={[styles.loadingTitle, { color: colors.onPrimary }]}>Wird eingesendet</Text>
        <Text style={styles.loadingSubtitle}>Daten werden übermittelt</Text>
      </View>

      {/* Main chat content (animated) - wrapped in PanGestureHandler */}
      <PanGestureHandler
        enabled={isReadyToSubmit}
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetY={[-10, 10]}
      >
        <Animated.View style={[styles.chatContainer, { backgroundColor: colors.background }, { transform: [{ translateY }] }]}>
          <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <KeyboardAvoidingView
              behavior="padding"
              style={styles.keyboardView}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
            >
              {/* Messages */}
              <ScrollView
                ref={scrollViewRef}
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
              >
                {messages.map((message) => (
                  <MessageBubbleInner
                    key={message.id}
                    role={message.role}
                    content={message.content}
                    imageUrl={message.imageUrl}
                    localUri={message.localUri}
                    isLoading={message.isLoading}
                  />
                ))}

                {isSubmittingEvent && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Reiche Event ein...</Text>
                  </View>
                )}

                {isLoading && (
                  <View style={[styles.messageBubble, styles.assistantBubble, { backgroundColor: colors.surface }, styles.typingBubble]}>
                    <TypingIndicator />
                  </View>
                )}

                {error && (
                  <View style={[styles.errorContainer, { backgroundColor: colors.errorBackground }]}>
                    <Text style={[styles.errorText, { color: colors.error }]}>Fehler: {error}</Text>
                  </View>
                )}
              </ScrollView>

              {/* Action buttons (initial state only) */}
              {showActionButtons && (
                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.pressedOverlay }]} onPress={handleDescribe}>
                    <PencilIcon width={20} height={20} color={colors.textPrimary} />
                    <Text style={[styles.actionButtonTitle, { color: colors.textPrimary }]}>Beschreiben</Text>
                    <Text style={[styles.actionButtonSubtitle, { color: colors.textSecondary }]}>Gebe Name, Ort, Zeit und Veranstalter an.</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.pressedOverlay }]} onPress={handleSelectImage}>
                    <FlyerIcon width={20} height={20} color={colors.textPrimary} />
                    <Text style={[styles.actionButtonTitle, { color: colors.textPrimary }]}>Flyer einsenden</Text>
                    <Text style={[styles.actionButtonSubtitle, { color: colors.textSecondary }]}>Sende ganz einfach ein Bild von deinem Flyer</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Input Area OR Submit Button at BOTTOM */}
              {isReadyToSubmit ? (
                <View style={[styles.submitButtonContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                  <Animated.View style={{ transform: [{ translateY: iconBounceAnim }] }}>
                    <UploadIcon width={24} height={24} color={colors.primary} />
                  </Animated.View>
                  <Text style={[styles.submitButtonTitle, { color: colors.textPrimary }]}>Jetzt einsenden</Text>
                  <Text style={[styles.submitButtonSubtitle, { color: colors.textSecondary }]}>Wischen Sie einfach hoch</Text>
                </View>
              ) : (
                <View style={[styles.inputContainer, { backgroundColor: colors.background }]}>
                  <View style={styles.inputRow}>
                    {/* Image picker button */}
                    <TouchableOpacity
                      style={styles.attachButton}
                      onPress={handleSelectImage}
                      disabled={isLoading || isSubmittingEvent}
                    >
                      <Ionicons name="image-outline" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>

                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.pressedOverlay, color: colors.textPrimary }]}
                      value={input}
                      onChangeText={setInput}
                      placeholder="Schreibe eine Nachricht..."
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      maxLength={500}
                      editable={!isLoading && !isSubmittingEvent}
                      onSubmitEditing={() => sendMessage()}
                    />

                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        { backgroundColor: colors.primary },
                        (!input.trim() || isLoading || isSubmittingEvent) && styles.sendButtonDisabled,
                      ]}
                      onPress={() => sendMessage()}
                      disabled={!input.trim() || isLoading || isSubmittingEvent}
                    >
                      <Ionicons name="arrow-up" size={20} color={colors.onPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Animated.View>
      </PanGestureHandler>

      {/* Fullscreen Image Preview Modal */}
      <FullScreenImagePreviewInner
        visible={showImagePreview}
        imageUri={stagedImageUri}
        onClose={handleClosePreview}
        onSend={handleSendFromPreview}
        isSending={isSendingFromPreview}
      />

      {/* Full-screen loading overlay - covers entire screen including header */}
      {isSubmitting && !showSuccessScreen && (
        <View style={[styles.fullScreenLoading, { backgroundColor: colors.primary }]}>
          <ActivityIndicator size="large" color={colors.onPrimary} style={{ marginBottom: 24 }} />
          <Text style={[styles.loadingTitle, { color: colors.onPrimary }]}>Wird eingesendet</Text>
          <Text style={styles.loadingSubtitle}>Daten werden übermittelt</Text>
        </View>
      )}

      {/* Full-screen success overlay - covers entire screen including header */}
      {showSuccessScreen && (
        <View style={[styles.fullScreenSuccess, { backgroundColor: colors.primary }]}>
          <CheckIcon width={48} height={48} color={colors.onPrimary} style={{ marginBottom: 24 }} />
          <Text style={[styles.successTitle, { color: colors.onPrimary }]}>Veranstaltung eingesendet</Text>
          <Text style={styles.successSubtitle}>
            Ihre Veranstaltung wird nun von uns überprüft und erscheint in den nächsten Tagen in der App.
          </Text>
          <TouchableOpacity style={[styles.homeButton, { backgroundColor: colors.background }]} onPress={handleGoHome}>
            <Text style={[styles.homeButtonText, { color: colors.primary }]}>Zur Startseite</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
  },
  inputContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  attachButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  imageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  // New styles for redesigned chat
  chatContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
  },
  // Submission screen (loading + success)
  submissionScreen: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 8,
  },
  fullScreenLoading: {
    position: 'absolute',
    top: -100,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    paddingTop: 132,
  },
  fullScreenSuccess: {
    position: 'absolute',
    top: -100,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    paddingTop: 132,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 22,
  },
  homeButton: {
    position: 'absolute',
    bottom: 48,
    left: 24,
    right: 24,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  homeButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  // Submit button (at bottom, replacing input bar)
  submitButtonContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  submitButtonTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginTop: 12,
  },
  submitButtonSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  // Action buttons
  actionButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'flex-start',
  },
  actionButtonTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginTop: 8,
  },
  actionButtonSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  // Typing indicator styles
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
});
