import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, Pressable, FlatList, Share, Platform, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack, useNavigation } from 'expo-router';
import Transition from 'react-native-screen-transitions';
import { useGoBack } from '@/hooks/useGoBack';
import { sharedImageDetail } from '@/lib/navigation/transitionPresets';
import { ArrowLeftIcon, LocationIcon, CalendarIcon, UserIcon, MailIcon, CallIcon, TicketIcon, LocationSmallIcon, ShareIcon, ChevronRight } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import { EventRecord, EventDateRecord } from '@/lib/types';
import { currency, formatDate, formatTime, formatLocationFull, formatEventCardDateSplit, formatLocation, getNextUpcomingDate } from '@/lib/utils';
import { useSnackbar } from '@/context/SnackbarContext';
import { EventDetailSkeleton } from '@/components/SkeletonLoader';
import EventWeatherWidget from '@/components/EventWeatherWidget';
import ImageZoomModal from '@/components/ImageZoomModal';
import { logEventView, logEvent, logCalendarSave } from '@/lib/firebase';
import { requestCalendarPermission, saveEventToCalendar } from '@/lib/calendar';
import { useTheme } from '@/context/ThemeContext';
import YouTubeEmbed from '@/components/YouTubeEmbed';
import { SvgXml } from 'react-native-svg';
import ExperienceSection from '@/components/events/ExperienceSection';
import InterestCTA from '@/components/InterestCTA';
import InterestButton from '@/components/InterestButton';
import { recordView } from '@/lib/supabase-event-views';
import { useActiveAccount } from 'thirdweb/react';

const PlayIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#ffffff" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

export default function EventDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const navigation = useNavigation();

  // Shared-element hero image transition from EventCard → event/[id] hero.
  // The matching sharedBoundTag is set on EventCard.tsx for the same event id.
  useLayoutEffect(() => {
    if (!id) return;
    navigation.setOptions(sharedImageDetail(`event-image-${id}`) as any);
  }, [navigation, id]);

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [moreEvents, setMoreEvents] = useState<EventRecord[]>([]);
  const [eventDates, setEventDates] = useState<EventDateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageZoomVisible, setImageZoomVisible] = useState(false);
  const { showSnackbar } = useSnackbar();
  const activeAccount = useActiveAccount();
  const scrollRef = useRef<ScrollView>(null);

  const handleShare = async () => {
    if (!event) return;

    try {
      await Share.share({
        message: `${event.title}\n\n${event.location ? `📍 ${event.location}\n` : ''}https://www.roebel.app/events/${id}`,
        title: event.title,
      });
      logEvent('share_event', { event_id: event.id, event_title: event.title });
    } catch (error) {
      console.error('Error sharing event:', error);
    }
  };

  const handleSaveToCalendar = async () => {
    if (!event) return;

    try {
      const granted = await requestCalendarPermission();
      if (!granted) {
        showSnackbar({
          message: 'Kalender-Zugriff wurde nicht erlaubt',
          duration: 4000,
        });
        return;
      }

      const dateToSave = eventDates.length > 0
        ? getNextUpcomingDate(eventDates.map(d => d.date)) || event.date
        : event.date;

      await saveEventToCalendar({
        title: event.title,
        description: event.description,
        date: dateToSave,
        time: event.time,
        endTime: event.end_time,
        location: event.location,
      });

      logCalendarSave(event.id, event.title);

      showSnackbar({
        message: 'Zum Kalender hinzugefügt',
        duration: 4000,
      });
    } catch (error) {
      console.error('Error saving to calendar:', error);
      showSnackbar({
        message: 'Fehler beim Speichern in den Kalender',
        duration: 4000,
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      // Fetch current event
      const { data, error } = await supabase.from('events').select('*').eq('id', id).single();

      if (!cancelled) {
        if (error) {
          // eslint-disable-next-line no-console
          console.error(error);
          setEvent(null);
        } else {
          setEvent(data as EventRecord);
          logEventView(data.id, data.title, data.category || undefined);

          // Record unique view in Supabase
          if (activeAccount?.address) {
            recordView(data.id, activeAccount.address).catch(() => {});
          }

          // Fetch event dates for recurring events
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayString = today.toISOString().split('T')[0];

          const { data: datesData } = await supabase
            .from('event_dates')
            .select('*')
            .eq('event_id', id)
            .eq('is_cancelled', false)
            .gte('date', todayString)
            .order('date', { ascending: true });

          if (datesData) {
            setEventDates(datesData as EventDateRecord[]);
          }

          // Fetch more events (same category if available, otherwise recent events)
          // Only show events happening today or in the future
          const currentEvent = data as EventRecord;

          let moreEventsQuery = supabase
            .from('events')
            .select('*')
            .eq('status', 'approved')
            .neq('id', id)
            .gte('date', todayString)
            .order('date', { ascending: true })
            .limit(5);

          // Prioritize same category
          if (currentEvent.category) {
            moreEventsQuery = moreEventsQuery.eq('category', currentEvent.category);
          }

          const { data: moreEventsData, error: moreEventsError } = await moreEventsQuery;

          if (!moreEventsError && moreEventsData) {
            setMoreEvents(moreEventsData as EventRecord[]);
          } else {
            // Fallback: get any recent events if no same-category events found
            const { data: fallbackData } = await supabase
              .from('events')
              .select('*')
              .eq('status', 'approved')
              .neq('id', id)
              .gte('date', todayString)
              .order('date', { ascending: true })
              .limit(5);

            if (fallbackData) {
              setMoreEvents(fallbackData as EventRecord[]);
            }
          }
        }
        setLoading(false);
      }
    }
    if (id) load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <EventDetailSkeleton />
      </ScrollView>
    );
  }
  if (!event) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: colors.textPrimary }}>Veranstaltung nicht gefunden.</Text>
      </View>
    );
  }

  // Determine which date to display
  const displayDate = eventDates.length > 0
    ? getNextUpcomingDate(eventDates.map(d => d.date)) || event.date
    : event.date;
  const isRecurring = event.is_recurring && eventDates.length > 1;
  const start = `${formatDate(displayDate)}${formatTime(event.time) ? ` • ${formatTime(event.time)}` : ''}`;
  const end = formatTime(event.end_time);

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {event.livestream_active && event.livestream_url ? (
        <View style={[styles.livestreamSection, { backgroundColor: colors.background }]}>
          <View style={styles.livestreamNavRow}>
            <Pressable onPress={goBack} style={[styles.navBtn, { backgroundColor: colors.surface }]}>
              <ArrowLeftIcon size={24} color={colors.tabIconActive} strokeWidth={1.5} />
            </Pressable>
            <View style={styles.navBtn} />
          </View>
          <YouTubeEmbed youtubeUrl={event.livestream_url} height={Dimensions.get('window').width * 9 / 16} borderRadius={0} />
        </View>
      ) : (
        <View style={[styles.imageSection, { backgroundColor: colors.cardPlaceholder }]}>
          {event.image_url ? (
            <Pressable onPress={() => setImageZoomVisible(true)} style={StyleSheet.absoluteFill}>
              <Image
                source={{ uri: event.image_url }}
                style={styles.heroBlurred}
                contentFit="cover"
                blurRadius={20}
              />
              <Transition.View
                sharedBoundTag={`event-image-${id}`}
                style={StyleSheet.absoluteFill}
              >
                <Image
                  source={{ uri: event.image_url }}
                  style={styles.hero}
                  contentFit="contain"
                  accessibilityIgnoresInvertColors
                />
              </Transition.View>
            </Pressable>
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
          )}

          <Pressable onPress={goBack} style={[styles.backBtn, { backgroundColor: colors.background }]}>
            <ArrowLeftIcon size={24} color={colors.tabIconActive} strokeWidth={1.5} />
          </Pressable>

          <View style={styles.pageIndicator} />
        </View>
      )}

      <View style={[styles.contentOverlay, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
            <View style={styles.titleSection}>
              {event.category && (
                <View style={styles.categoryBadge}>
                  <Text style={[styles.categoryText, { color: colors.primary }]}>{event.category}</Text>
                </View>
              )}
              <Text style={[styles.title, { color: colors.textPrimary }]}>{event.title}</Text>
            </View>

            {event.livestream_active && event.livestream_url && (
              <Pressable
                style={[styles.livestreamCta, { backgroundColor: colors.primary }]}
                onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
              >
                <PlayIcon size={20} color={colors.onPrimary} />
                <Text style={[styles.livestreamCtaText, { color: colors.onPrimary }]}>Livestream ansehen</Text>
              </Pressable>
            )}

            <InterestCTA eventId={id as string} />

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <Pressable style={[styles.actionButton, { backgroundColor: colors.surfaceSecondary }]} onPress={handleSaveToCalendar}>
                <CalendarIcon size={18} color={colors.textSecondary} strokeWidth={1.5} />
                <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>Zum Kalender</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, { backgroundColor: colors.surfaceSecondary }]} onPress={handleShare}>
                <ShareIcon size={18} color={colors.textSecondary} />
                <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>Teilen</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Über die Veranstaltung</Text>
              <Text style={[styles.sectionText, { color: colors.textPrimary }]}>
                {event.description || 'Lorem ipsum dolor sit amet, consectetur adipiscing elitr, sed diam nonumy eiusmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.'}
              </Text>
            </View>

            <View style={styles.infoCards}>
              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.infoIconContainer, { backgroundColor: colors.surfaceSecondary }]}>
                  <CalendarIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>
                    {isRecurring ? 'Nächster Termin' : 'Datum & Zeit'}
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{start}</Text>
                  {end && <Text style={[styles.infoSubValue, { color: colors.textSecondary }]}>bis {end}</Text>}
                  {isRecurring && (
                    <Pressable
                      onPress={() => router.push(`/event/${id}/dates`)}
                      style={styles.allDatesLink}
                    >
                      <Text style={[styles.allDatesText, { color: colors.primary }]}>
                        Alle {eventDates.length} Termine anzeigen
                      </Text>
                      <ChevronRight size={14} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.infoCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && [styles.infoCardPressed, { backgroundColor: colors.cardPlaceholder }]
                ]}
                onPress={() => router.push(`/location?selectedEventId=${event.id}`)}
              >
                <View style={[styles.infoIconContainer, { backgroundColor: colors.surfaceSecondary }]}>
                  <LocationIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Ort</Text>
                  <Text style={[styles.infoValueClickable, { color: colors.primary }]} numberOfLines={1} ellipsizeMode="tail">
                    {formatLocationFull(event.location)}
                  </Text>
                </View>
                <View style={styles.chevronContainer}>
                  <ChevronRight size={20} color={colors.primary} strokeWidth={1.5} />
                </View>
              </Pressable>

              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.infoIconContainer, { backgroundColor: colors.surfaceSecondary }]}>
                  <TicketIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Preis</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{currency(event.ticket_price)}</Text>
                </View>
              </View>
            </View>



            {/* Weather Widget - Only shows if event is within 10 days */}
            <View style={styles.section}>
              <EventWeatherWidget
                date={event.date}
                latitude={event.latitude}
                longitude={event.longitude}
              />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Veranstalter</Text>
              <View style={[styles.organizerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.organizerHeader}>
                  <View style={[styles.organizerIcon, { backgroundColor: colors.surfaceSecondary }]}>
                    <UserIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.organizerName, { color: colors.textPrimary }]}>{event.organizer_name}</Text>
                </View>
                <View style={styles.contactInfo}>
                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${event.organizer_email}`)}
                    style={styles.contactRow}
                  >
                    <MailIcon size={16} color={colors.primary} strokeWidth={1.5} />
                    <Text style={[styles.organizerEmail, { color: colors.primary }]}>{event.organizer_email}</Text>
                  </Pressable>
                  {event.organizer_phone ? (
                    <Pressable
                      onPress={() => Linking.openURL(`tel:${event.organizer_phone}`)}
                      style={styles.contactRow}
                    >
                      <CallIcon size={16} color={colors.tabIconActive} strokeWidth={1.5} />
                      <Text style={[styles.organizerPhone, { color: colors.textPrimary }]}>{event.organizer_phone}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Event Experiences Section */}
            <ExperienceSection eventId={id as string} />

            {/* More Events Section */}
            {moreEvents.length > 0 && (
              <View style={styles.moreEventsSection}>
                <Text style={[styles.moreEventsTitle, { color: colors.textPrimary }]}>Weitere Veranstaltungen</Text>
                <FlatList
                  horizontal
                  data={moreEvents}
                  renderItem={({ item }) => <CompactEventCard event={item} />}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.moreEventsList}
                />
              </View>
            )}

        </View>
      </View>

      {/* Image Zoom Modal */}
      {event.image_url && (
        <ImageZoomModal
          visible={imageZoomVisible}
          imageUrl={event.image_url}
          onClose={() => setImageZoomVisible(false)}
        />
      )}
    </ScrollView>
  );
}

// Compact Event Card Component for horizontal list
function CompactEventCard({ event }: { event: EventRecord }) {
  const router = useRouter();
  const { colors } = useTheme();
  const time = formatTime(event.time);
  const dateDisplay = formatEventCardDateSplit(event.date);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
      style={({ pressed }) => [styles.compactCard, { backgroundColor: colors.background }, pressed && styles.compactCardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Details für ${event.title} öffnen`}
    >
      <View style={styles.compactImageContainer}>
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={[styles.compactImage, { backgroundColor: colors.cardPlaceholder }]}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.compactImagePlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
        )}

        {/* Date overlay */}
        <View style={[styles.compactDateOverlay, { backgroundColor: colors.background }]}>
          <Text style={[styles.compactDateDay, { color: colors.textPrimary }]}>{dateDisplay.day}</Text>
          <Text style={[styles.compactDateLabel, { color: colors.textSecondary }]}>{dateDisplay.label}</Text>
        </View>
      </View>

      <View style={styles.compactContentContainer}>
        <View style={styles.compactHeaderRow}>
          <Text style={[styles.compactEventTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {event.title}
          </Text>
          <InterestButton eventId={event.id} iconOnly compact />
        </View>

        <View style={styles.compactMetaRow}>
          <View style={styles.compactLocationRow}>
            <LocationSmallIcon color={colors.tabIconActive} />
            <Text style={[styles.compactLocation, { color: colors.textPrimary }]} numberOfLines={1}>
              {formatLocation(event.location)}
            </Text>
          </View>
          {time && (
            <Text style={[styles.compactTimeText, { color: colors.textPrimary }]}>{time}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageSection: {
    height: 400,
    position: 'relative',
    overflow: 'hidden',
  },
  heroBlurred: {
    ...StyleSheet.absoluteFillObject,
  },
  hero: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
  },
  backBtn: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pageIndicator: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    width: 60,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 2,
  },
  contentOverlay: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    minHeight: 600,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontFamily: Platform.OS === 'android' ? 'Inter-Bold' : 'Inter-Semibold',
  },
  livestreamCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 24,
  },
  livestreamCtaText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  categoryBadge: {
    backgroundColor: 'rgba(24, 140, 252, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  infoCards: {
    marginBottom: 24,
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  infoCardPressed: {
    opacity: 0.8,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  infoValueClickable: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    flex: 1,
  },
  infoSubValue: {
    fontSize: 13,
    fontFamily: 'Inter',
    marginTop: 2,
  },
  allDatesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  allDatesText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 16,
    fontFamily: 'Inter',
    lineHeight: 22,
    opacity: 0.85,
  },
  organizerCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  organizerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  organizerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  organizerName: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  contactInfo: {
    gap: 8,
    marginLeft: 48,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  organizerEmail: {
    fontSize: 14,
    fontFamily: 'Inter',
    textDecorationLine: 'underline',
  },
  organizerPhone: {
    fontSize: 14,
    fontFamily: 'Inter',
  },
  moreEventsSection: {
    marginTop: 16,
    marginBottom: 0,
    marginHorizontal: -24,
  },
  moreEventsTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  moreEventsList: {
    gap: 12,
    paddingHorizontal: 24,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  // Compact Event Card Styles
  compactCard: {
    width: 240,
  },
  compactCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  compactImageContainer: {
    height: 140,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  compactImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  compactImagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  compactDateOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 42,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  compactDateDay: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
  compactDateLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    lineHeight: 13,
    marginTop: 1,
  },
  compactContentContainer: {
    paddingVertical: 12,
    gap: 6,
  },
  compactHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  compactEventTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    flex: 1,
    paddingRight: 8,
    lineHeight: 18,
  },
  compactMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  compactLocation: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    opacity: 0.7,
    flex: 1,
  },
  compactTimeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    opacity: 0.7,
  },
  chevronContainer: {
    marginLeft: 8,
    justifyContent: 'center',
  },
  livestreamSection: {
    paddingTop: 56,
  },
  livestreamNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
