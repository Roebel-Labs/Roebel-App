import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  Image,
  Platform,
  Modal,
  ScrollView,
  Switch,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { MinimalAIChat } from '@/components/ai/MinimalAIChat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/constants';
import { ArrowLeftIcon } from '@/components/Icons';
import MultiDatePicker from '@/components/MultiDatePicker';
import { format } from 'date-fns';
import { geocodeLocation } from '@/lib/utils/geocoding';
import { logEventSubmission } from '@/lib/firebase';
import { Events, track } from '@/lib/analytics';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import { claimReward, rewardAmountToMuenzen } from '@/lib/rewards-claim';
import { useRewardCelebration } from '@/context/RewardCelebrationContext';
import type { ColorTokens } from '@/constants/theme';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Validation helper functions
const validateEmail = (email: string): string | null => {
  if (!email.trim()) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return 'Bitte geben Sie eine gültige E-Mail-Adresse ein (z.B. name@beispiel.de)';
  }
  return null;
};

const validateURL = (url: string): string | null => {
  if (!url.trim()) return null;
  const urlRegex = /^https?:\/\/.+\..+/;
  if (!urlRegex.test(url.trim())) {
    return 'Bitte geben Sie eine gültige URL ein (z.B. https://beispiel.de)';
  }
  return null;
};

const validatePhone = (phone: string): string | null => {
  if (!phone.trim()) return null;
  // German phone format: allow various formats (with/without country code, spaces, dashes)
  const phoneRegex = /^[\d\s\-+()]{6,}$/;
  if (!phoneRegex.test(phone.trim())) {
    return 'Bitte geben Sie eine gültige Telefonnummer ein';
  }
  return null;
};

const validatePrice = (price: string): string | null => {
  if (!price.trim()) return null;
  const priceValue = parseFloat(price.replace(',', '.'));
  if (isNaN(priceValue) || priceValue < 0) {
    return 'Bitte geben Sie einen gültigen Preis ein (z.B. 10.50)';
  }
  return null;
};

const validateMaxAttendees = (attendees: string): string | null => {
  if (!attendees.trim()) return null;
  const attendeesValue = parseInt(attendees);
  if (isNaN(attendeesValue) || attendeesValue < 1) {
    return 'Bitte geben Sie eine gültige Anzahl ein (mindestens 1)';
  }
  return null;
};

const validateDateInFuture = (dateString: string): string | null => {
  if (!dateString) return null;
  const eventDate = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (eventDate < today) {
    return 'Das Event-Datum muss in der Zukunft liegen';
  }
  return null;
};

const validateEndTimeAfterStart = (startTime: string, endTime: string): string | null => {
  if (!startTime || !endTime) return null;

  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (endMinutes <= startMinutes) {
    return 'Die Endzeit muss nach der Startzeit liegen';
  }
  return null;
};

export default function SubmitEventScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const { user } = useUser();
  const { celebrate } = useRewardCelebration();
  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdEventData, setCreatedEventData] = useState<{
    id: string;
    title: string;
    date: string;
    time: string | null;
    location: string;
    image_url: string | null;
    category: string | null;
  } | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<{
    description: string;
    place_id?: string;
    latitude?: number;
    longitude?: number;
    formatted_address?: string;
    address_components?: any[];
  } | null>(null);

  // Date/Time picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<Date | undefined>(undefined);
  const [selectedEndTime, setSelectedEndTime] = useState<Date | undefined>(undefined);

  // Recurring events state
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    end_time: '',
    location: '',
    organizer_name: '',
    organizer_email: '',
    organizer_phone: '',
    category: '',
    website_url: '',
    ticket_price: '',
    max_attendees: '',
  });

  // Auto-populate organizer fields from active account and user profile
  useEffect(() => {
    setForm((f) => ({
      ...f,
      organizer_name: activeAccount?.name ?? f.organizer_name,
      organizer_email: user?.email ?? f.organizer_email,
      organizer_phone: user?.phone_number ?? f.organizer_phone,
    }));
  }, [activeAccount?.id, user?.email, user?.phone_number]);

  // Error tracking state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Fullscreen image preview state
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [tempImageUri, setTempImageUri] = useState<string | null>(null);

  // AI description generation state
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Location geocoding state
  const [isGeocodingLocation, setIsGeocodingLocation] = useState(false);

  const googleMapsApiKey =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    '';

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear field error when user types
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
  }

  // Validation functions that update error state
  const validateField = (fieldName: string, value: string) => {
    let error: string | null = null;

    switch (fieldName) {
      case 'title':
        if (!value.trim()) error = 'Bitte geben Sie einen Event-Titel ein';
        break;
      case 'date':
        if (!value) {
          error = 'Bitte wählen Sie ein Datum aus';
        } else {
          error = validateDateInFuture(value);
        }
        break;
      case 'end_time':
        error = validateEndTimeAfterStart(form.time, value);
        break;
      case 'organizer_name':
        if (!value.trim()) error = 'Bitte geben Sie Ihren Namen ein';
        break;
      case 'organizer_email':
        if (!value.trim()) {
          error = 'Bitte geben Sie Ihre E-Mail-Adresse ein';
        } else {
          error = validateEmail(value);
        }
        break;
      case 'organizer_phone':
        error = validatePhone(value);
        break;
      case 'website_url':
        error = validateURL(value);
        break;
      case 'ticket_price':
        error = validatePrice(value);
        break;
      case 'max_attendees':
        error = validateMaxAttendees(value);
        break;
    }

    if (error) {
      setFieldErrors((prev) => ({ ...prev, [fieldName]: error! }));
    } else {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[fieldName];
        return updated;
      });
    }
  };

  const handleBlur = (fieldName: string, value: string) => {
    setTouchedFields((prev) => ({ ...prev, [fieldName]: true }));
    validateField(fieldName, value);
  };

  const validateAllFields = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const newFieldErrors: Record<string, string> = {};

    // Required fields
    if (!form.title.trim()) {
      errors.push('Event Titel');
      newFieldErrors.title = 'Bitte geben Sie einen Event-Titel ein';
    }

    // Validate dates based on recurring mode
    if (isRecurring) {
      if (selectedDates.length === 0) {
        errors.push('Event Termine');
        newFieldErrors.date = 'Bitte wählen Sie mindestens einen Termin aus';
      }
    } else {
      if (!form.date) {
        errors.push('Event Datum');
        newFieldErrors.date = 'Bitte wählen Sie ein Datum aus';
      } else {
        const dateError = validateDateInFuture(form.date);
        if (dateError) {
          errors.push('Event Datum');
          newFieldErrors.date = dateError;
        }
      }
    }

    if (!form.location.trim()) {
      errors.push('Ort');
      newFieldErrors.location = 'Bitte geben Sie einen Ort ein';
    }

    if (!form.organizer_name.trim()) {
      errors.push('Ihr Name');
      newFieldErrors.organizer_name = 'Bitte geben Sie Ihren Namen ein';
    }

    if (!form.organizer_email.trim()) {
      errors.push('Ihre E-Mail');
      newFieldErrors.organizer_email = 'Bitte geben Sie Ihre E-Mail-Adresse ein';
    } else {
      const emailError = validateEmail(form.organizer_email);
      if (emailError) {
        errors.push('Ihre E-Mail');
        newFieldErrors.organizer_email = emailError;
      }
    }

    // Optional fields with format validation
    if (form.organizer_phone) {
      const phoneError = validatePhone(form.organizer_phone);
      if (phoneError) {
        errors.push('Telefonnummer');
        newFieldErrors.organizer_phone = phoneError;
      }
    }

    if (form.website_url) {
      const urlError = validateURL(form.website_url);
      if (urlError) {
        errors.push('Event Website');
        newFieldErrors.website_url = urlError;
      }
    }

    if (form.ticket_price) {
      const priceError = validatePrice(form.ticket_price);
      if (priceError) {
        errors.push('Ticketpreis');
        newFieldErrors.ticket_price = priceError;
      }
    }

    if (form.max_attendees) {
      const attendeesError = validateMaxAttendees(form.max_attendees);
      if (attendeesError) {
        errors.push('Max. Teilnehmer');
        newFieldErrors.max_attendees = attendeesError;
      }
    }

    if (form.time && form.end_time) {
      const timeError = validateEndTimeAfterStart(form.time, form.end_time);
      if (timeError) {
        errors.push('Endzeit');
        newFieldErrors.end_time = timeError;
      }
    }

    setFieldErrors(newFieldErrors);
    return { isValid: errors.length === 0, errors };
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlaube den Zugriff auf deine Fotobibliothek.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1.0,
    });

    if (!result.canceled && result.assets[0]) {
      // Show fullscreen preview first
      setTempImageUri(result.assets[0].uri);
      setShowImagePreview(true);
    }
  };

  const confirmImage = () => {
    if (tempImageUri) {
      setUploadedImage(tempImageUri);
      setShowImagePreview(false);
      setTempImageUri(null);
    }
  };

  const cancelImagePreview = () => {
    setShowImagePreview(false);
    setTempImageUri(null);
  };

  const removeImage = () => {
    setUploadedImage(null);
  };

  // AI Description Generation
  const generateDescription = async () => {
    if (!form.title.trim()) {
      Alert.alert('Titel erforderlich', 'Bitte geben Sie zuerst einen Event-Titel ein.');
      return;
    }

    setIsGeneratingDescription(true);

    try {
      const anthropicApiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_ANTHROPIC_API_KEY ||
                              process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

      if (!anthropicApiKey) {
        throw new Error('API key not configured');
      }

      const prompt = form.description.trim()
        ? `Erweitere und verbessere diese Event-Beschreibung für "${form.title}". Die bestehende Beschreibung: "${form.description}". Schreibe eine ansprechende, informative Beschreibung auf Deutsch (2-3 Sätze). Gib NUR die Beschreibung zurück, ohne zusätzliche Erklärungen.`
        : `Schreibe eine kurze, ansprechende Event-Beschreibung für "${form.title}" auf Deutsch (2-3 Sätze). Gib NUR die Beschreibung zurück, ohne zusätzliche Erklärungen.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      const generatedText = data.content?.[0]?.text || '';

      if (generatedText) {
        set('description', generatedText.trim());
      }
    } catch (error) {
      console.error('Error generating description:', error);
      Alert.alert('Fehler', 'Die Beschreibung konnte nicht generiert werden. Bitte versuchen Sie es erneut.');
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const uploadImageToSupabase = async (imageUri: string): Promise<string | null> => {
    try {
      // Read file as base64 using FileSystem API (reliable for local URIs)
      const base64Data = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert to ArrayBuffer
      const arrayBuffer = decode(base64Data);

      // Generate filename
      const fileExtension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
      const filename = `event-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
      const filePath = `event-images/${filename}`;

      // Determine content type
      const extensionMap: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'heic': 'image/heic',
        'heif': 'image/heif',
      };
      const contentType = extensionMap[fileExtension] || 'image/jpeg';

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('images')
        .upload(filePath, arrayBuffer, {
          contentType,
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Supabase upload error:', error);
        throw error;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Image upload error:', error);
      return null;
    }
  };

  async function handleSubmit() {
    // Clear previous submission error
    setSubmissionError(null);

    // Validate all fields
    const validation = validateAllFields();

    if (!validation.isValid) {
      const errorMessage = validation.errors.length === 1
        ? `Bitte korrigieren Sie das folgende Feld: ${validation.errors[0]}`
        : `Bitte korrigieren Sie die folgenden Felder:\n${validation.errors.map(e => `• ${e}`).join('\n')}`;

      setSubmissionError(errorMessage);

      // Scroll to top to show error banner
      scrollViewRef.current?.scrollToPosition(0, 0, true);
      return;
    }

    setIsSubmitting(true);
    setIsGeocodingLocation(true);

    try {
      // Geocode the location text input
      let placeDetails = selectedPlace;

      if (form.location.trim()) {
        console.log('Geocoding location:', form.location);
        const geocoded = await geocodeLocation(form.location, googleMapsApiKey);

        if (geocoded) {
          placeDetails = {
            description: form.location,
            place_id: geocoded.place_id,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            formatted_address: geocoded.formatted_address,
            address_components: geocoded.address_components,
          };
          setSelectedPlace(placeDetails);
        } else {
          setIsGeocodingLocation(false);
          throw new Error('Konnte den Ort nicht finden. Bitte geben Sie eine genauere Adresse ein (z.B. "Marktplatz, Röbel").');
        }
      }

      setIsGeocodingLocation(false);

      let imageUrl = null;
      if (uploadedImage) {
        imageUrl = await uploadImageToSupabase(uploadedImage);
        if (!imageUrl) {
          throw new Error('Bild konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut oder wählen Sie ein anderes Bild.');
        }
      }

      // Determine dates to submit
      const datesToSubmit = isRecurring ? selectedDates : [form.date];
      const primaryDate = datesToSubmit[0]; // First date is primary

      // Insert event
      const { data: eventData, error: eventError } = await supabase.from('events').insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        date: primaryDate,
        time: form.time || null,
        end_time: form.end_time || null,
        location: placeDetails!.description,
        // Google Maps location data
        latitude: placeDetails!.latitude || null,
        longitude: placeDetails!.longitude || null,
        place_id: placeDetails!.place_id || null,
        formatted_address: placeDetails!.formatted_address || null,
        address_components: placeDetails!.address_components || null,
        // Organizer info
        organizer_name: form.organizer_name.trim(),
        organizer_email: form.organizer_email.trim(),
        organizer_phone: form.organizer_phone.trim() || null,
        category: form.category || null,
        image_url: imageUrl,
        website_url: form.website_url.trim() || null,
        ticket_price: form.ticket_price ? Number(form.ticket_price.replace(',', '.')) : 0,
        max_attendees: form.max_attendees ? Number(form.max_attendees) : null,
        status: 'pending',
        is_recurring: isRecurring,
        account_id: activeAccount?.id || null,
      }).select().single();

      if (eventError) {
        // Parse Supabase errors
        if (eventError.message.includes('network') || eventError.message.includes('fetch')) {
          throw new Error('Keine Internetverbindung. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.');
        } else if (eventError.message.includes('constraint')) {
          throw new Error('Es gab ein Problem mit den eingegebenen Daten. Bitte überprüfen Sie alle Felder und versuchen Sie es erneut.');
        } else {
          throw new Error(`Fehler beim Speichern: ${eventError.message}`);
        }
      }

      // Insert all dates into event_dates table
      const eventDates = datesToSubmit.map(date => ({
        event_id: eventData.id,
        date: date,
      }));

      const { error: datesError } = await supabase.from('event_dates').insert(eventDates);

      if (datesError) {
        console.error('Error inserting event dates:', datesError);
        // Don't fail the whole submission, event was created successfully
      }

      setCreatedEventData({
        id: eventData.id,
        title: eventData.title,
        date: eventData.date,
        time: eventData.time,
        location: eventData.location,
        image_url: eventData.image_url,
        category: eventData.category,
      });
      setIsSuccess(true);
      // Reward submitting an event in Röbel Münzen. Celebrate once the funder
      // actually pays (idempotent; a quiet no-op until it's live).
      if (user?.wallet_address)
        void claimReward(user.wallet_address, 'event_submit', eventData.id)
          .then((r) => {
            if (r.status === 'paid')
              celebrate(rewardAmountToMuenzen(r.amountAtto), {
                subtitle: 'Danke, dass du Röbel belebst! Für deinen Event gibt es Röbel Münzen.',
              });
          })
          .catch(() => {});
      logEventSubmission(true, 'manual');
      track(Events.EVENT_SUBMITTED, {
        event_id: eventData.id,
        category: eventData.category ?? null,
        is_recurring: isRecurring,
        has_image: !!imageUrl,
        method: 'manual',
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
      setSubmissionError(errorMessage);
      logEventSubmission(false, 'manual');
      scrollViewRef.current?.scrollToPosition(0, 0, true);
    } finally {
      setIsSubmitting(false);
    }
  }

  // AI mode - early return
  if (mode === 'ai') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Event einreichen</Text>
          <View style={styles.modeToggleContainer}>
            <Text style={[styles.modeToggleLabel, { color: colors.primary }]}>KI</Text>
            <Switch
              value={false}
              onValueChange={() => setMode('manual')}
              trackColor={{ false: colors.primary, true: colors.primary }}
              thumbColor={colors.textInverted}
              style={styles.modeToggleSwitch}
            />
            <Text style={[styles.modeToggleLabel, { color: colors.textTertiary }]}>Form</Text>
          </View>
        </View>
        <MinimalAIChat />
      </SafeAreaView>
    );
  }

  if (isSuccess) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.successContainer}>
          <Text style={[styles.successIcon, { color: colors.success }]}>✓</Text>
          <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Event erfolgreich eingereicht!</Text>
          <Text style={[styles.successText, { color: colors.textSecondary }]}>
            Vielen Dank für Ihre Einreichung! Wir werden Ihr Event sorgfältig prüfen und Sie per E-Mail über den Status informieren.
          </Text>
          {createdEventData && (
            <Pressable
              style={[styles.primarySuccessButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                router.replace({
                  pathname: '/create',
                  params: {
                    linkedEventId: createdEventData.id,
                    linkedEventTitle: createdEventData.title,
                    linkedEventDate: createdEventData.date,
                    linkedEventTime: createdEventData.time || '',
                    linkedEventLocation: createdEventData.location,
                    linkedEventImageUrl: createdEventData.image_url || '',
                    linkedEventCategory: createdEventData.category || '',
                  },
                } as any);
              }}
            >
              <Text style={[styles.primarySuccessButtonText, { color: colors.onPrimary }]}>Im Feed teilen</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.secondarySuccessButton, { borderColor: colors.border }]}
            onPress={() => {
              setIsSuccess(false);
              setCreatedEventData(null);
              router.push('/profile');
            }}
          >
            <Text style={[styles.secondarySuccessButtonText, { color: colors.textPrimary }]}>Zum Profil</Text>
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Event einreichen</Text>
        <View style={styles.modeToggleContainer}>
          <Text style={[styles.modeToggleLabel, { color: colors.textTertiary }]}>KI</Text>
          <Switch
            value={true}
            onValueChange={() => setMode('ai')}
            trackColor={{ false: colors.primary, true: colors.primary }}
            thumbColor={colors.textInverted}
            style={styles.modeToggleSwitch}
          />
          <Text style={[styles.modeToggleLabel, { color: colors.primary }]}>Form</Text>
        </View>
      </View>

      <KeyboardAwareScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={100}
        extraHeight={150}
      >
        {/* Error Banner */}
        {submissionError && (
          <ErrorBanner
            message={submissionError}
            onDismiss={() => setSubmissionError(null)}
            colors={colors}
          />
        )}

        {/* Title */}
        <Field label="Event Titel" required error={fieldErrors.title} colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }, fieldErrors.title && { borderColor: colors.error, borderWidth: 2 }]}
            value={form.title}
            onChangeText={(t) => set('title', t)}
            onBlur={() => handleBlur('title', form.title)}
            placeholder="Event Titel eingeben"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        {/* Description */}
        <Field label="Beschreibung" colors={colors}>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            value={form.description}
            onChangeText={(t) => set('description', t)}
            placeholder="Beschreiben Sie Ihr Event..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
          />
          <Pressable
            style={[styles.aiButton, { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight }, isGeneratingDescription && styles.aiButtonDisabled]}
            onPress={generateDescription}
            disabled={isGeneratingDescription}
          >
            {isGeneratingDescription ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.aiButtonText, { color: colors.primary }]}>
                ✨ {form.description.trim() ? 'Beschreibung erweitern' : 'Beschreibung generieren'}
              </Text>
            )}
          </Pressable>
        </Field>

        {/* Event Image */}
        <Field label="Event Bild" colors={colors}>
          <View style={styles.imageContainer}>
            {uploadedImage ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: uploadedImage }} style={styles.image} />
                <Pressable style={[styles.removeImageButton, { backgroundColor: colors.error }]} onPress={removeImage}>
                  <Text style={[styles.removeImageText, { color: colors.textInverted }]}>×</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={[styles.imagePicker, { borderColor: colors.borderSecondary, backgroundColor: colors.pressedOverlay }]} onPress={pickImage}>
                <Text style={styles.imagePickerIcon}>📷</Text>
                <Text style={[styles.imagePickerText, { color: colors.textSecondary }]}>Bild hochladen</Text>
              </Pressable>
            )}
          </View>
        </Field>

        {/* Recurring Event Toggle */}
        <Field label="Event wiederholt sich" colors={colors}>
          <Pressable
            style={styles.toggleContainer}
            onPress={() => {
              const newIsRecurring = !isRecurring;
              setIsRecurring(newIsRecurring);
              if (newIsRecurring && form.date) {
                // When enabling recurring, keep existing date as first date
                setSelectedDates([form.date]);
              } else if (!newIsRecurring && selectedDates.length > 0) {
                // When disabling, use first date as single date
                set('date', selectedDates[0]);
                setSelectedDate(new Date(selectedDates[0]));
              }
            }}
          >
            <View style={[styles.toggle, { backgroundColor: colors.borderSecondary }, isRecurring && { backgroundColor: colors.primary }]}>
              <View style={[styles.toggleThumb, { backgroundColor: colors.textInverted }, isRecurring && styles.toggleThumbActive]} />
            </View>
            <Text style={[styles.toggleLabel, { color: colors.tabIconActive }]}>
              {isRecurring ? 'Ja, mehrere Termine' : 'Nein, nur ein Termin'}
            </Text>
          </Pressable>
        </Field>

        {/* Date Selection - Single or Multi */}
        {isRecurring ? (
          <Field label="Termine auswählen" required error={fieldErrors.date} colors={colors}>
            <MultiDatePicker
              selectedDates={selectedDates}
              onDatesChange={setSelectedDates}
              minDate={format(new Date(), 'yyyy-MM-dd')}
            />
          </Field>
        ) : (
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Field label="Event Datum" required error={fieldErrors.date} colors={colors}>
                <Pressable
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }, fieldErrors.date && { borderColor: colors.error, borderWidth: 2 }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={selectedDate ? [styles.pickerText, { color: colors.textPrimary }] : [styles.pickerPlaceholder, { color: colors.textTertiary }]}>
                    {selectedDate
                      ? selectedDate.toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })
                      : 'Datum auswählen'}
                  </Text>
                </Pressable>
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={(event, date) => {
                      setShowDatePicker(Platform.OS === 'ios'); // Keep open on iOS until dismissed
                      if (event.type === 'set' && date) {
                        setSelectedDate(date);
                        const dateString = date.toISOString().split('T')[0];
                        set('date', dateString); // YYYY-MM-DD
                        // Validate date immediately after selection
                        setTouchedFields((prev) => ({ ...prev, date: true }));
                        validateField('date', dateString);
                      }
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                      }
                    }}
                  />
                )}
              </Field>
            </View>
            <View style={styles.halfField}>
              <Field label="Kategorie" colors={colors}>
                <View style={[styles.pickerContainer, { borderColor: colors.borderSecondary, backgroundColor: colors.background }]}>
                  <Pressable
                    style={styles.picker}
                    onPress={() => setShowCategoryModal(true)}
                  >
                    <Text style={form.category ? [styles.pickerText, { color: colors.textPrimary }] : [styles.pickerPlaceholder, { color: colors.textTertiary }]}>
                      {form.category || 'Kategorie auswählen'}
                    </Text>
                  </Pressable>
                </View>
              </Field>
            </View>
          </View>
        )}

        {/* Category (shown separately when recurring) */}
        {isRecurring && (
          <Field label="Kategorie" colors={colors}>
            <View style={[styles.pickerContainer, { borderColor: colors.borderSecondary, backgroundColor: colors.background }]}>
              <Pressable
                style={styles.picker}
                onPress={() => setShowCategoryModal(true)}
              >
                <Text style={form.category ? [styles.pickerText, { color: colors.textPrimary }] : [styles.pickerPlaceholder, { color: colors.textTertiary }]}>
                  {form.category || 'Kategorie auswählen'}
                </Text>
              </Pressable>
            </View>
          </Field>
        )}

        {/* Time Row */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Field label="Startzeit" colors={colors}>
              <Pressable
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={selectedTime ? [styles.pickerText, { color: colors.textPrimary }] : [styles.pickerPlaceholder, { color: colors.textTertiary }]}>
                  {selectedTime
                    ? selectedTime.toLocaleTimeString('de-DE', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Zeit auswählen'}
                </Text>
              </Pressable>
              {showTimePicker && (
                <DateTimePicker
                  value={selectedTime || new Date()}
                  mode="time"
                  is24Hour={true}
                  display="default"
                  onChange={(event, time) => {
                    setShowTimePicker(Platform.OS === 'ios');
                    if (event.type === 'set' && time) {
                      setSelectedTime(time);
                      const hours = time.getHours().toString().padStart(2, '0');
                      const minutes = time.getMinutes().toString().padStart(2, '0');
                      set('time', `${hours}:${minutes}:00`); // HH:MM:SS
                    }
                    if (Platform.OS === 'android') {
                      setShowTimePicker(false);
                    }
                  }}
                />
              )}
            </Field>
          </View>
          <View style={styles.halfField}>
            <Field label="Endzeit" error={fieldErrors.end_time} colors={colors}>
              <Pressable
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }, fieldErrors.end_time && { borderColor: colors.error, borderWidth: 2 }]}
                onPress={() => setShowEndTimePicker(true)}
              >
                <Text style={selectedEndTime ? [styles.pickerText, { color: colors.textPrimary }] : [styles.pickerPlaceholder, { color: colors.textTertiary }]}>
                  {selectedEndTime
                    ? selectedEndTime.toLocaleTimeString('de-DE', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Zeit auswählen'}
                </Text>
              </Pressable>
              {showEndTimePicker && (
                <DateTimePicker
                  value={selectedEndTime || new Date()}
                  mode="time"
                  is24Hour={true}
                  display="default"
                  onChange={(event, time) => {
                    setShowEndTimePicker(Platform.OS === 'ios');
                    if (event.type === 'set' && time) {
                      setSelectedEndTime(time);
                      const hours = time.getHours().toString().padStart(2, '0');
                      const minutes = time.getMinutes().toString().padStart(2, '0');
                      const timeString = `${hours}:${minutes}:00`;
                      set('end_time', timeString); // HH:MM:SS
                      // Validate time immediately after selection
                      setTouchedFields((prev) => ({ ...prev, end_time: true }));
                      validateField('end_time', timeString);
                    }
                    if (Platform.OS === 'android') {
                      setShowEndTimePicker(false);
                    }
                  }}
                />
              )}
            </Field>
          </View>
        </View>

        {/* Location Text Input */}
        <Field label="Ort" required error={fieldErrors.location} colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }, fieldErrors.location && { borderColor: colors.error, borderWidth: 2 }]}
            value={form.location}
            onChangeText={(t) => {
              set('location', t);
              // Clear selectedPlace when user types
              if (selectedPlace) {
                setSelectedPlace(null);
              }
            }}
            onBlur={() => handleBlur('location', form.location)}
            placeholder="z.B. Marktplatz, Rathaus, Müritzeum..."
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={[styles.locationHint, { color: colors.textSecondary }]}>
            Die genauen Koordinaten werden beim Speichern automatisch ermittelt.
          </Text>
          {selectedPlace && selectedPlace.latitude && selectedPlace.longitude && (
            <View style={styles.selectedPlaceDetails}>
              <Text style={[styles.selectedPlace, { color: colors.primary }]}>
                📍 {selectedPlace.formatted_address || selectedPlace.description}
              </Text>
              <Text style={[styles.selectedCoordinates, { color: colors.success }]}>
                ✓ Koordinaten: {selectedPlace.latitude.toFixed(4)}, {selectedPlace.longitude.toFixed(4)}
              </Text>
            </View>
          )}
        </Field>

        {/* Organizer Fields - Single Column */}
        {(activeAccount?.name || user?.email || user?.phone_number) && (
          <Text style={[styles.prefillHint, { color: colors.textTertiary }]}>
            Veranstalter-Informationen wurden aus deinem Profil vorausgefüllt – bitte prüfen und bei Bedarf ändern.
          </Text>
        )}
        <Field label="Ihr Name" required error={fieldErrors.organizer_name} colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }, fieldErrors.organizer_name && { borderColor: colors.error, borderWidth: 2 }]}
            value={form.organizer_name}
            onChangeText={(t) => set('organizer_name', t)}
            onBlur={() => handleBlur('organizer_name', form.organizer_name)}
            placeholder="Ihr vollständiger Name"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Field label="Ihre E-Mail" required error={fieldErrors.organizer_email} colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }, fieldErrors.organizer_email && { borderColor: colors.error, borderWidth: 2 }]}
            value={form.organizer_email}
            onChangeText={(t) => set('organizer_email', t)}
            onBlur={() => handleBlur('organizer_email', form.organizer_email)}
            placeholder="ihre.email@beispiel.de"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Field>

        <Field label="Ihre Telefonnummer" error={fieldErrors.organizer_phone} colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }, fieldErrors.organizer_phone && { borderColor: colors.error, borderWidth: 2 }]}
            value={form.organizer_phone}
            onChangeText={(t) => set('organizer_phone', t)}
            onBlur={() => handleBlur('organizer_phone', form.organizer_phone)}
            placeholder="0123 456789"
            placeholderTextColor={colors.textTertiary}
            keyboardType="phone-pad"
          />
        </Field>

        <Field label="Event Website" error={fieldErrors.website_url} colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }, fieldErrors.website_url && { borderColor: colors.error, borderWidth: 2 }]}
            value={form.website_url}
            onChangeText={(t) => set('website_url', t)}
            onBlur={() => handleBlur('website_url', form.website_url)}
            placeholder="https://beispiel.de"
            placeholderTextColor={colors.textTertiary}
            keyboardType="url"
            autoCapitalize="none"
          />
        </Field>

        {/* Max Attendees and Ticket Price Row */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Field label="Max. Teilnehmer" error={fieldErrors.max_attendees} colors={colors}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }, fieldErrors.max_attendees && { borderColor: colors.error, borderWidth: 2 }]}
                value={form.max_attendees}
                onChangeText={(t) => set('max_attendees', t)}
                onBlur={() => handleBlur('max_attendees', form.max_attendees)}
                placeholder="Unbegrenzt"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
              />
            </Field>
          </View>
          <View style={styles.halfField}>
            <Field label="Ticketpreis (€)" error={fieldErrors.ticket_price} colors={colors}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }, fieldErrors.ticket_price && { borderColor: colors.error, borderWidth: 2 }]}
                value={form.ticket_price}
                onChangeText={(t) => set('ticket_price', t)}
                onBlur={() => handleBlur('ticket_price', form.ticket_price)}
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </Field>
          </View>
        </View>

        {/* Submit and Cancel Buttons */}
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.submitButton, { backgroundColor: colors.primary }, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
              {isSubmitting ? 'Wird eingereicht...' : 'Event einreichen'}
            </Text>
          </Pressable>
          <Pressable style={[styles.cancelButton, { borderColor: colors.borderSecondary }]} onPress={() => router.back()}>
            <Text style={[styles.cancelButtonText, { color: colors.textPrimary }]}>Abbrechen</Text>
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>* Pflichtfelder. Ihr Event wird vor der Veröffentlichung überprüft.</Text>
      </KeyboardAwareScrollView>

      {/* Fullscreen Image Preview Modal */}
      <Modal
        visible={showImagePreview}
        transparent
        animationType="fade"
        onRequestClose={cancelImagePreview}
      >
        <View style={styles.imagePreviewModal}>
          <Pressable style={styles.imagePreviewCloseButton} onPress={cancelImagePreview}>
            <Text style={styles.imagePreviewCloseText}>×</Text>
          </Pressable>
          {tempImageUri && (
            <Image
              source={{ uri: tempImageUri }}
              style={styles.imagePreviewFullImage}
              resizeMode="contain"
            />
          )}
          <View style={styles.imagePreviewActions}>
            <Pressable style={styles.imagePreviewCancelButton} onPress={cancelImagePreview}>
              <Text style={styles.imagePreviewCancelText}>Abbrechen</Text>
            </Pressable>
            <Pressable style={[styles.imagePreviewConfirmButton, { backgroundColor: colors.primary }]} onPress={confirmImage}>
              <Text style={styles.imagePreviewConfirmText}>Bild verwenden</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Category Selection Modal */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.categoryModal, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Kategorie auswählen</Text>
            <ScrollView style={styles.categoryList}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={({ pressed }) => [
                    styles.categoryItem,
                    { borderBottomColor: colors.border },
                    form.category === cat && { backgroundColor: colors.primaryLight },
                    pressed && { backgroundColor: colors.pressedOverlay },
                  ]}
                  onPress={() => {
                    set('category', cat);
                    setShowCategoryModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.categoryItemText,
                      { color: colors.textPrimary },
                      form.category === cat && { fontFamily: 'Inter-Medium', color: colors.primary },
                    ]}
                  >
                    {cat}
                  </Text>
                  {form.category === cat && <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.modalCloseButton, { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => setShowCategoryModal(false)}
            >
              <Text style={[styles.modalCloseButtonText, { color: colors.textPrimary }]}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Error display components
function ErrorText({ message, colors }: { message: string; colors: ColorTokens }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={[styles.errorIcon, { color: colors.error }]}>⚠</Text>
      <Text style={[styles.errorText, { color: colors.error }]}>{message}</Text>
    </View>
  );
}

function ErrorBanner({ message, onDismiss, colors }: { message: string; onDismiss?: () => void; colors: ColorTokens }) {
  return (
    <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground, borderColor: colors.errorBackground }]}>
      <View style={styles.errorBannerContent}>
        <Text style={[styles.errorBannerIcon, { color: colors.error }]}>⚠</Text>
        <Text style={[styles.errorBannerText, { color: colors.error }]}>{message}</Text>
      </View>
      {onDismiss && (
        <Pressable onPress={onDismiss} style={[styles.errorBannerDismiss, { backgroundColor: colors.errorBackground }]}>
          <Text style={[styles.errorBannerDismissText, { color: colors.error }]}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

function Field({
  label,
  children,
  required = false,
  error,
  colors,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
  colors: ColorTokens;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>
        {label} {required && <Text style={{ color: colors.error }}>*</Text>}
      </Text>
      {children}
      {error && <ErrorText message={error} colors={colors} />}
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
  modeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modeToggleLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  modeToggleSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
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
  },
  field: {
    marginBottom: 20,
    zIndex: 1,
    overflow: 'visible',
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
    minHeight: 100,
    textAlignVertical: 'top',
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
  imageContainer: {
    marginTop: 8,
  },
  imagePicker: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  imagePickerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  imagePickerText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  imagePreview: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
  },
  selectedPlaceDetails: {
    marginTop: 8,
    gap: 4,
  },
  selectedPlace: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  selectedCoordinates: {
    fontSize: 11,
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
    fontFamily: 'Inter-Medium',
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
    fontFamily: 'Inter-Regular',
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 16,
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
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  primarySuccessButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  primarySuccessButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  secondarySuccessButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  secondarySuccessButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  // Category Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  categoryModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  categoryList: {
    maxHeight: 400,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  categoryItemText: {
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
    fontFamily: 'Inter-Medium',
  },
  // Error Styles
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  errorIcon: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  errorBanner: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  errorBannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  errorBannerIcon: {
    fontSize: 20,
  },
  errorBannerText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    flex: 1,
  },
  errorBannerDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  errorBannerDismissText: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
  // Toggle Styles for Recurring Events
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 2,
    marginRight: 12,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  // AI Button Styles
  aiButton: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiButtonDisabled: {
    opacity: 0.6,
  },
  aiButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  // Location Hint
  locationHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  prefillHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 8,
    marginTop: 4,
  },
  // Fullscreen Image Preview Modal Styles
  imagePreviewModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  imagePreviewCloseText: {
    fontSize: 28,
    color: '#ffffff',
    fontFamily: 'Inter-Regular',
  },
  imagePreviewFullImage: {
    width: screenWidth,
    height: screenHeight * 0.6,
  },
  imagePreviewActions: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 12,
  },
  imagePreviewCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  imagePreviewCancelText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  imagePreviewConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  imagePreviewConfirmText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
});
