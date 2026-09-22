import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Pressable,
  FlatList,
  Share,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { SvgXml } from 'react-native-svg';
import { useGoBack } from '@/hooks/useGoBack';
import { ArrowLeftIcon, UserIcon, MailIcon, CallIcon, ShareIcon, CalendarIcon, ChevronRight } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import type { Account, EventRecord, EventDateRecord, OrgSubType } from '@/lib/types';
import { currency, formatDate, formatTime, formatLocationFull, getNextUpcomingDate } from '@/lib/utils';
import { useSnackbar } from '@/context/SnackbarContext';
import { EventDetailSkeleton } from '@/components/SkeletonLoader';
import EventWeatherWidget from '@/components/EventWeatherWidget';
import ImageZoomModal from '@/components/ImageZoomModal';
import { logEventView, logEvent, logCalendarSave } from '@/lib/firebase';
import { requestCalendarPermission, saveEventToCalendar } from '@/lib/calendar';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useInterest } from '@/context/InterestContext';
import { useInterestPreviews } from '@/hooks/useInterestPreviews';
import YouTubeEmbed from '@/components/YouTubeEmbed';
import ExperienceSection, { type ExperienceSectionHandle } from '@/components/events/ExperienceSection';
import ExperienceComposerModal from '@/components/events/ExperienceComposerModal';
import InterestCTA, { INTEREST_CTA_HEIGHT } from '@/components/InterestCTA';
import InterestOrbs from '@/components/InterestOrbs';
import InterestSocialRow from '@/components/InterestSocialRow';
import HorizontalEventCard from '@/components/HorizontalEventCard';
import EventCancelledScrim from '@/components/EventCancelledScrim';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import MeckyNotFound from '@/components/MeckyNotFound';
import { QualityStampSection } from '@/components/QualityStampSection';
import { recordView } from '@/lib/supabase-event-views';
import { fetchAccountById } from '@/lib/supabase-accounts';
import { fontFamily } from '@/constants/theme';
import { POSTER_ASPECT_RATIO } from '@/constants/poster';
import { isTicketSalesEnabled } from '@/lib/supabase-app-settings';
import { fetchTicketTypes, formatCents, type TicketTypeRow } from '@/lib/tickets';

const EVENT_PUBLISHER_SUB_TYPE_LABELS: Record<OrgSubType, string> = {
  verein: '🏛️ Verein',
  restaurant: '🍽️ Restaurant',
  stadt: '🏛️ Stadt',
  fraktion: '📋 Fraktion',
  unternehmen: '🏢 Unternehmen',
  journalist: '📝 Journalist:in',
};

const GUTTER = 16;
const FLYER_RADIUS = 12;
/** The ambient blur keeps running this far below the flyer block so it
 *  fades out underneath the organizer row and title, not at a hard edge. */
const AMBIENT_TAIL = 160;
/** How much of the screen a very tall flyer may take before it shrinks. */
const FLYER_MAX_HEIGHT_RATIO = 0.6;

const PlayIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#ffffff" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

export default function EventDetails() {
  const { id, experienceId } = useLocalSearchParams<{ id: string; experienceId?: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [moreEvents, setMoreEvents] = useState<EventRecord[]>([]);
  const [eventDates, setEventDates] = useState<EventDateRecord[]>([]);
  const [publisherAccount, setPublisherAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageZoomVisible, setImageZoomVisible] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  // The flyer is shown uncropped at its own ratio; A4 until the image reports its size.
  const [flyerAspect, setFlyerAspect] = useState(POSTER_ASPECT_RATIO);
  // Measured height of the top block (chrome + flyer) — sizes the ambient backdrop.
  const [heroHeight, setHeroHeight] = useState(0);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeRow[]>([]);
  const [salesEnabled, setSalesEnabled] = useState(false);
  const { showSnackbar } = useSnackbar();
  const { user } = useUser();
  const activeAccount = useActiveAccount();
  const { loadPreviews } = useInterest();
  const scrollRef = useRef<ScrollView>(null);
  const experienceSectionRef = useRef<ExperienceSectionHandle>(null);

  // Count + avatars for the orbs and the social row; forced so a stale rail
  // preview never hides someone who just joined.
  useEffect(() => {
    if (id) loadPreviews([id], { force: true });
  }, [id, loadPreviews]);
  useInterestPreviews(moreEvents);

  // Ticket CTA: only fetched when the citizen-side sales gate is on, and
  // only rendered once there's at least one active ticket type to sell.
  useEffect(() => {
    let cancelled = false;
    async function loadTickets() {
      const enabled = await isTicketSalesEnabled();
      if (cancelled) return;
      setSalesEnabled(enabled);
      if (!enabled || !id) return;
      const types = await fetchTicketTypes(id);
      if (!cancelled) setTicketTypes(types);
    }
    loadTickets();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onHeroLayout = useCallback((e: LayoutChangeEvent) => {
    setHeroHeight(e.nativeEvent.layout.height);
  }, []);

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
          const record = data as EventRecord;
          setEvent(record);
          logEventView(record.id, record.title, record.category || undefined);

          // Record unique view in Supabase
          if (activeAccount?.address) {
            recordView(record.id, activeAccount.address).catch(() => {});
          }

          // Load publisher account (org that created the event) so the
          // organizer row can link to a public org profile.
          const publisherAccountId = (data as EventRecord).account_id;
          if (publisherAccountId) {
            fetchAccountById(publisherAccountId)
              .then((acc) => {
                if (!cancelled) setPublisherAccount(acc);
              })
              .catch(() => {});
          } else if (!cancelled) {
            setPublisherAccount(null);
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <EventDetailSkeleton />
      </View>
    );
  }
  if (!event) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <MeckyNotFound title="Veranstaltung nicht gefunden" />
      </View>
    );
  }

  // Determine which date to display
  const displayDate = eventDates.length > 0
    ? getNextUpcomingDate(eventDates.map(d => d.date)) || event.date
    : event.date;
  const isRecurring = event.is_recurring && eventDates.length > 1;
  const startTime = formatTime(event.time);
  const endTime = formatTime(event.end_time);
  const whenLine =
    formatDate(displayDate) +
    (startTime ? ` • ${startTime}${endTime ? ` – ${endTime}` : ''} Uhr` : '');
  const priceLine = event.ticket_price == null ? null : currency(event.ticket_price);
  const minTicketPrice = ticketTypes.length > 0 ? Math.min(...ticketTypes.map((t) => t.price_cents)) : 0;
  const showLivestream = !!(event.livestream_active && event.livestream_url);
  const hasAmbient = !!event.image_url;

  // Flyer box: full width inside the gutters unless that would make a tall
  // poster exceed FLYER_MAX_HEIGHT_RATIO of the screen.
  const maxFlyerWidth = screenWidth - GUTTER * 2;
  const flyerWidth = Math.min(maxFlyerWidth, screenHeight * FLYER_MAX_HEIGHT_RATIO * flyerAspect);
  const flyerHeight = flyerWidth / flyerAspect;

  // Chrome over the ambient blur reads white; without an image it sits on
  // the plain page and uses the text colour.
  const chromeColor = hasAmbient ? '#ffffff' : colors.textPrimary;
  const hostName = publisherAccount?.name ?? event.organizer_name;
  const hostAvatar = publisherAccount?.avatar_url ?? null;
  const hostIsOrg = publisherAccount?.account_type === 'organisation';
  const publisherId = publisherAccount?.id;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={{ paddingBottom: INTEREST_CTA_HEIGHT + insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Ambient backdrop: the flyer itself, blurred wide, fading into the
            page under the title block. Sized from the measured hero block. */}
        {hasAmbient && heroHeight > 0 && event.image_url && (
          <AmbientBackdrop uri={event.image_url} height={heroHeight + AMBIENT_TAIL} />
        )}

        <View style={[styles.hero, { paddingTop: insets.top + 6 }]} onLayout={onHeroLayout}>
          <View style={styles.topBar}>
            <Pressable
              onPress={goBack}
              hitSlop={8}
              style={({ pressed }) => [styles.chromeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Zurück"
            >
              <ArrowLeftIcon size={26} color={chromeColor} strokeWidth={1.8} />
            </Pressable>
            <Pressable
              onPress={handleShare}
              hitSlop={8}
              style={({ pressed }) => [styles.chromeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Veranstaltung teilen"
            >
              <ShareIcon size={24} color={chromeColor} />
            </Pressable>
          </View>

          {showLivestream ? (
            <View style={[styles.flyerWrap, { width: maxFlyerWidth }]}>
              <View style={styles.flyer}>
                <YouTubeEmbed
                  youtubeUrl={event.livestream_url as string}
                  height={maxFlyerWidth * 9 / 16}
                  borderRadius={FLYER_RADIUS}
                />
              </View>
            </View>
          ) : (
            <View style={[styles.flyerWrap, { width: flyerWidth, height: flyerHeight }]}>
              <Pressable
                onPress={() => setImageZoomVisible(true)}
                disabled={!event.image_url}
                style={[styles.flyer, { backgroundColor: colors.cardPlaceholder }]}
                accessibilityRole="imagebutton"
                accessibilityLabel="Flyer vergrößern"
              >
                {event.image_url ? (
                  <Image
                    source={{ uri: event.image_url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                    priority="high"
                    accessibilityIgnoresInvertColors
                    onLoad={(e) => {
                      const { width, height } = e.source;
                      if (width && height) setFlyerAspect(width / height);
                    }}
                  />
                ) : null}
                {event.is_cancelled && <EventCancelledScrim radius={FLYER_RADIUS} />}
              </Pressable>
              <InterestOrbs eventId={id as string} />
            </View>
          )}
        </View>

        <View style={styles.headerBlock}>
          <View style={styles.hostRow}>
            <Pressable
              onPress={
                hostIsOrg && publisherId
                  ? () => router.push({ pathname: '/account/[id]' as any, params: { id: publisherId } })
                  : undefined
              }
              disabled={!hostIsOrg}
              style={({ pressed }) => [styles.host, pressed && styles.pressed]}
              accessibilityRole={hostIsOrg ? 'button' : undefined}
              accessibilityLabel={hostIsOrg ? `Profil von ${hostName} öffnen` : undefined}
            >
              {hostAvatar ? (
                <Image
                  source={{ uri: hostAvatar }}
                  style={[styles.hostAvatar, { backgroundColor: colors.cardPlaceholder }]}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={[styles.hostAvatar, styles.hostAvatarFallback, { backgroundColor: colors.surfaceSecondary }]}>
                  <UserIcon size={14} color={colors.tabIconActive} strokeWidth={1.5} />
                </View>
              )}
              <Text style={[styles.hostName, { color: colors.textPrimary }]} numberOfLines={1}>
                {hostName}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSaveToCalendar}
              hitSlop={8}
              style={({ pressed }) => [styles.chromeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Zum Kalender hinzufügen"
            >
              <CalendarIcon size={22} color={colors.textPrimary} strokeWidth={1.5} />
            </Pressable>
          </View>

          {event.category && (
            <View style={[styles.categoryBadge, { backgroundColor: colors.categoryBackground }]}>
              <Text style={[styles.categoryText, { color: colors.primary }]}>{event.category}</Text>
            </View>
          )}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{event.title}</Text>

          <Pressable
            onPress={() => router.push(`/location?selectedEventId=${event.id}`)}
            hitSlop={4}
            style={({ pressed }) => pressed && styles.pressed}
            accessibilityRole="button"
            accessibilityLabel="Ort auf der Karte anzeigen"
          >
            <Text style={[styles.place, { color: colors.textPrimary }]} numberOfLines={2}>
              {formatLocationFull(event.location)}
            </Text>
          </Pressable>
          <Text style={[styles.when, { color: colors.textSecondary }]}>{whenLine}</Text>
          {isRecurring && (
            <Pressable
              onPress={() => router.push(`/event/${id}/dates`)}
              hitSlop={4}
              style={({ pressed }) => [styles.allDatesLink, pressed && styles.pressed]}
            >
              <Text style={[styles.allDatesText, { color: colors.primary }]}>
                Alle {eventDates.length} Termine anzeigen
              </Text>
              <ChevronRight size={14} color={colors.primary} />
            </Pressable>
          )}
          {priceLine && (
            <Text style={[styles.when, { color: colors.textSecondary }]}>
              {priceLine === 'Kostenlos' ? priceLine : `Eintritt ${priceLine}`}
            </Text>
          )}

          {salesEnabled && !event.is_cancelled && ticketTypes.length > 0 && (
            <Pressable
              onPress={() => router.push({ pathname: '/event/[id]/tickets' as any, params: { id } })}
              style={({ pressed }) => [styles.ticketCta, { backgroundColor: colors.primary }, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.ticketCtaText}>
                {minTicketPrice === 0 ? 'Platz sichern' : `Tickets ab ${formatCents(minTicketPrice)}`}
              </Text>
            </Pressable>
          )}

          <InterestSocialRow eventId={id as string} style={styles.socialRow} />
        </View>

        <View style={styles.sections}>
          {showLivestream && (
            <Pressable
              style={[styles.livestreamCta, { backgroundColor: colors.primary }]}
              onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
            >
              <PlayIcon size={20} color={colors.onPrimary} />
              <Text style={[styles.livestreamCtaText, { color: colors.onPrimary }]}>Livestream ansehen</Text>
            </Pressable>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Über die Veranstaltung</Text>
            <Text style={[styles.sectionText, { color: colors.textPrimary }]}>
              {event.description || 'Für diese Veranstaltung gibt es noch keine Beschreibung.'}
            </Text>
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
            {publisherAccount && hostIsOrg && (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/account/[id]' as any, params: { id: publisherAccount.id } })
                }
                style={({ pressed }) => [
                  styles.publisherRow,
                  { borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Profil von ${publisherAccount.name} öffnen`}
              >
                {publisherAccount.avatar_url ? (
                  <Image
                    source={{ uri: publisherAccount.avatar_url }}
                    style={styles.publisherAvatar}
                    contentFit="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View style={[styles.publisherAvatarPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
                    <UserIcon size={20} color={colors.tabIconActive} strokeWidth={1.5} />
                  </View>
                )}
                <View style={styles.publisherInfo}>
                  <Text style={[styles.publisherName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {publisherAccount.name}
                  </Text>
                  {publisherAccount.sub_type && (
                    <Text style={[styles.publisherSubType, { color: colors.textTertiary }]} numberOfLines={1}>
                      {EVENT_PUBLISHER_SUB_TYPE_LABELS[publisherAccount.sub_type]}
                    </Text>
                  )}
                </View>
                <ChevronRight size={20} color={colors.textTertiary} strokeWidth={1.5} />
              </Pressable>
            )}
            <View style={[styles.organizerCard, { borderColor: colors.border, marginTop: publisherAccount ? 12 : 0 }]}>
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
          <ExperienceSection
            ref={experienceSectionRef}
            eventId={id as string}
            highlightExperienceId={experienceId}
            scrollViewRef={scrollRef}
            onOpenComposer={() => setComposerOpen(true)}
          />
        </View>

        {/* More Events Section */}
        {moreEvents.length > 0 && (
          <View style={styles.moreEventsSection}>
            <Text style={[styles.moreEventsTitle, { color: colors.textPrimary }]}>Weitere Veranstaltungen</Text>
            <FlatList
              horizontal
              data={moreEvents}
              renderItem={({ item }) => <HorizontalEventCard event={item} />}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moreEventsList}
            />
          </View>
        )}

        <QualityStampSection title="Veranstaltungen sind geprüft auf Qualität" />
      </ScrollView>

      {/* Sticky footer: the primary action floats over the scrolling content. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <LinearGradient
          colors={[`${colors.background}00`, colors.background]}
          locations={[0, 0.55]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <InterestCTA eventId={id as string} />
      </View>

      {/* Image Zoom Modal */}
      {event.image_url && (
        <ImageZoomModal
          visible={imageZoomVisible}
          imageUrl={event.image_url}
          onClose={() => setImageZoomVisible(false)}
        />
      )}

      {user && (
        <ExperienceComposerModal
          visible={composerOpen}
          eventId={id as string}
          walletAddress={user.wallet_address}
          onClose={() => setComposerOpen(false)}
          onCreated={(created) => experienceSectionRef.current?.prepend(created)}
          onError={(message) => showSnackbar({ message, duration: 4000 })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  hero: {
    paddingHorizontal: GUTTER,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
  },
  chromeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flyerWrap: {
    alignSelf: 'center',
    marginTop: 10,
    // No overflow clipping here: the orbs sit half outside the flyer.
  },
  flyer: {
    ...StyleSheet.absoluteFill,
    borderRadius: FLYER_RADIUS,
    overflow: 'hidden',
  },
  headerBlock: {
    paddingHorizontal: GUTTER,
    paddingTop: 20,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  host: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hostAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  hostAvatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  hostName: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    fontFamily: fontFamily.heading,
    marginBottom: 12,
  },
  place: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: fontFamily.semiBold,
    marginBottom: 4,
  },
  when: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fontFamily.regular,
  },
  ticketCta: {
    marginTop: 12,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketCtaText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  allDatesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  allDatesText: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
  socialRow: {
    marginTop: 16,
  },
  sections: {
    paddingHorizontal: GUTTER,
    paddingTop: 28,
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
    fontFamily: fontFamily.heading,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    lineHeight: 22,
    opacity: 0.85,
  },
  publisherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  publisherAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  publisherAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publisherInfo: {
    flex: 1,
    gap: 2,
  },
  publisherName: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
  },
  publisherSubType: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
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
    fontFamily: fontFamily.medium,
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
    fontFamily: fontFamily.regular,
    textDecorationLine: 'underline',
  },
  organizerPhone: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
  },
  moreEventsSection: {
    marginTop: 16,
  },
  moreEventsTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginBottom: 12,
    paddingHorizontal: GUTTER,
  },
  moreEventsList: {
    gap: 12,
    paddingHorizontal: GUTTER,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 28,
    paddingHorizontal: GUTTER,
  },
});
