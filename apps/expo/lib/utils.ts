import { format, parseISO, isThisWeek, startOfWeek, endOfWeek, isToday, isFuture, startOfDay, addWeeks, addMonths, addYears, isAfter, isBefore } from 'date-fns';
import { de } from 'date-fns/locale';

export function formatDate(dateISO: string): string {
  return format(parseISO(dateISO), 'EEE, d. MMM yyyy', { locale: de });
}

// Format date for event cards - shows day for this week, month for others
export function formatEventCardDate(dateISO: string): string {
  const date = parseISO(dateISO);
  
  if (isThisWeek(date, { locale: de, weekStartsOn: 1 })) {
    // This week: show "DD DDD" format (e.g., "26 Mo")
    return format(date, 'd EEE', { locale: de });
  } else {
    // Other weeks: show "DD MMM" format (e.g., "6 Sep")
    return format(date, 'd MMM', { locale: de });
  }
}

// Format date for event card overlay - returns number and label separately
export function formatEventCardDateSplit(dateISO: string): { day: string; label: string } {
  const date = parseISO(dateISO);

  if (isThisWeek(date, { locale: de, weekStartsOn: 1 })) {
    // This week: show abbreviated day name as main value (Mo, Di, etc.)
    return {
      day: format(date, 'EE', { locale: de }), // Short weekday (Mo, Di, Mi)
      label: format(date, 'd', { locale: de }) // Day number as label
    };
  } else {
    // Other weeks: show day number and abbreviated month
    return {
      day: format(date, 'd'),
      label: format(date, 'MMM', { locale: de })
    };
  }
}

// Long-form date subtitle for linked event previews: "26. Mai · Montag"
export function formatEventDateLong(dateISO: string): string {
  const date = parseISO(dateISO);
  return format(date, "d. MMMM '·' EEEE", { locale: de });
}

// Check if event is in current week
export function isEventThisWeek(dateISO: string): boolean {
  return isThisWeek(parseISO(dateISO), { locale: de, weekStartsOn: 1 });
}

// Check if event is today or in the future
export function isEventTodayOrFuture(dateISO: string): boolean {
  const eventDate = startOfDay(parseISO(dateISO));
  const today = startOfDay(new Date());
  return isToday(eventDate) || isFuture(eventDate);
}

// Check if event location is in Röbel/Müritz (17207 postal code)
export function isEventInRoebel(
  location: string | null,
  formattedAddress?: string | null,
  addressComponents?: any[] | null
): boolean {
  // Helper to check if a string contains Röbel indicators
  const containsRoebel = (str: string | null | undefined): boolean => {
    if (!str) return false;
    const s = str.toLowerCase();
    return (
      str.includes('17207') ||
      s.includes('röbel') ||
      s.includes('roebel') ||
      s.includes('müritz') ||
      s.includes('mueritz')
    );
  };

  // Check location string
  if (containsRoebel(location)) return true;

  // Check formatted_address
  if (containsRoebel(formattedAddress)) return true;

  // Check address_components for postal code or locality
  if (addressComponents && Array.isArray(addressComponents)) {
    for (const component of addressComponents) {
      const value = component.long_name || component.short_name || '';
      if (containsRoebel(value)) return true;
    }
  }

  return false;
}

// Get week boundaries (Monday to Sunday)
export function getCurrentWeekBounds(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startOfWeek(now, { locale: de, weekStartsOn: 1 }),
    end: endOfWeek(now, { locale: de, weekStartsOn: 1 })
  };
}

export function formatTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const [h, m] = time.split(':');
  const date = new Date();
  date.setHours(Number(h), Number(m), 0, 0);
  return new Intl.DateTimeFormat('de-DE', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export function addMinutesToTime(time: string | null | undefined, minutes: number): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  const date = new Date();
  date.setHours(newHours, newMins, 0, 0);
  return new Intl.DateTimeFormat('de-DE', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export function currency(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value === 0) return 'Kostenlos';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

// News-specific utility functions

// Format publish date for display
export function formatPublishDate(dateISO: string | null): string {
  if (!dateISO) return 'Nicht veröffentlicht';
  const date = parseISO(dateISO);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `vor ${diffDays} Tagen`;

  return format(date, 'd. MMM yyyy', { locale: de });
}

// Format relative timestamp for notification inbox (more granular than formatPublishDate)
export function formatRelativeTimestamp(dateISO: string): string {
  const date = parseISO(dateISO);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Gerade eben';
  if (diffMinutes < 60) return `vor ${diffMinutes} Min.`;
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `vor ${diffDays} Tagen`;

  return format(date, 'd. MMM yyyy', { locale: de });
}

// Estimate reading time based on content length
export function calculateReadTime(content: string): string {
  const wordsPerMinute = 200;
  const words = content.replace(/<[^>]*>/g, '').split(/\s+/).length;
  const minutes = Math.ceil(words / wordsPerMinute);
  return `${minutes} min`;
}

// Check if article was published this week
export function isArticleThisWeek(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  const articleDate = parseISO(publishedAt);
  return isThisWeek(articleDate, { locale: de, weekStartsOn: 1 });
}

// Format location to show only street and city (remove postal code and country)
export function formatLocation(location: string): string {
  if (!location) return '';

  // Split by comma and trim each part
  const parts = location.split(',').map(p => p.trim());

  // Filter out postal codes and country names
  const filtered = parts.filter(part => {
    // Remove if it starts with a postal code pattern (5 digits)
    if (/^\d{5}\s/.test(part)) return false;
    // Remove if it's "Deutschland" or "Germany"
    if (part === 'Deutschland' || part === 'Germany') return false;
    return true;
  });

  // Return first 2 parts (street + city) or whatever remains
  return filtered.slice(0, 2).join(', ') || location;
}

// Format location for full display (only remove country name, keep postal code)
export function formatLocationFull(location: string): string {
  if (!location) return '';

  // Split by comma and trim each part
  const parts = location.split(',').map(p => p.trim());

  // Filter out only country names, keep everything else including postal code
  const filtered = parts.filter(part => {
    // Remove if it's "Deutschland" or "Germany"
    if (part === 'Deutschland' || part === 'Germany') return false;
    return true;
  });

  return filtered.join(', ') || location;
}

// =============================================
// RECURRING EVENTS - Date Generation Utilities
// =============================================

import type { RecurrencePattern } from './types';

/**
 * Generate dates based on recurrence pattern
 * @param startDate - Starting date in YYYY-MM-DD format
 * @param pattern - Recurrence pattern (weekly, biweekly, monthly, yearly)
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Array of dates in YYYY-MM-DD format
 */
export function generateRecurringDates(
  startDate: string,
  pattern: RecurrencePattern,
  endDate: string
): string[] {
  const dates: string[] = [];
  let current = parseISO(startDate);
  const end = parseISO(endDate);

  while (!isAfter(current, end)) {
    dates.push(format(current, 'yyyy-MM-dd'));

    switch (pattern) {
      case 'weekly':
        current = addWeeks(current, 1);
        break;
      case 'biweekly':
        current = addWeeks(current, 2);
        break;
      case 'monthly':
        current = addMonths(current, 1);
        break;
      case 'yearly':
        current = addYears(current, 1);
        break;
    }
  }

  return dates;
}

/**
 * Get the next upcoming date from an array of dates
 * @param dates - Array of dates in YYYY-MM-DD format
 * @returns Next upcoming date or null if none
 */
export function getNextUpcomingDate(dates: string[]): string | null {
  const today = startOfDay(new Date());
  const futureDates = dates
    .map(d => parseISO(d))
    .filter(d => !isBefore(d, today))
    .sort((a, b) => a.getTime() - b.getTime());

  return futureDates.length > 0
    ? format(futureDates[0], 'yyyy-MM-dd')
    : null;
}

/**
 * Count remaining (future) dates for an event
 * @param dates - Array of dates in YYYY-MM-DD format
 * @returns Number of dates that are today or in the future
 */
export function countRemainingDates(dates: string[]): number {
  const today = startOfDay(new Date());
  return dates.filter(d => !isBefore(parseISO(d), today)).length;
}

/**
 * Format date count for German display
 * @param count - Number of remaining dates
 * @returns Formatted string in German
 */
export function formatDateCount(count: number): string {
  if (count === 0) return 'Keine weiteren Termine';
  if (count === 1) return '1 weiterer Termin';
  return `${count} weitere Termine`;
}

/**
 * Format full date for event dates list
 * @param dateISO - Date in YYYY-MM-DD format
 * @returns Formatted date like "Samstag, 15. März 2025"
 */
export function formatFullDate(dateISO: string): string {
  return format(parseISO(dateISO), 'EEEE, d. MMMM yyyy', { locale: de });
}

/**
 * Sort dates array in ascending order
 * @param dates - Array of dates in YYYY-MM-DD format
 * @returns Sorted array
 */
export function sortDates(dates: string[]): string[] {
  return [...dates].sort((a, b) =>
    parseISO(a).getTime() - parseISO(b).getTime()
  );
}

// =============================================
// RESTAURANT UTILITIES
// =============================================

import type { OpeningHours } from './types';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAYS_MAP: { [key: number]: DayOfWeek } = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

/**
 * Format menu price in German locale
 * @param price - Price in EUR
 * @returns Formatted string (e.g., "17,90 €" or "Kostenlos")
 */
export function formatMenuPrice(price: number | null): string {
  if (price === null || price === 0) return 'Kostenlos';
  return price.toFixed(2).replace('.', ',') + ' €';
}

/**
 * Check if restaurant is currently open based on opening hours
 * @param openingHours - Opening hours object
 * @returns Object with isOpen status and timing info
 */
export function isRestaurantOpen(openingHours: OpeningHours | null): {
  isOpen: boolean;
  closesAt?: string;
  opensAt?: string;
  todayHours?: string;
} {
  if (!openingHours) {
    return { isOpen: false };
  }

  const now = new Date();
  const currentDay = DAYS_MAP[now.getDay()];
  const todayHours = openingHours[currentDay];

  if (!todayHours || todayHours.closed) {
    // Find next open day
    const nextOpenDay = findNextOpenDay(openingHours, now.getDay());
    return {
      isOpen: false,
      opensAt: nextOpenDay ? `${getDayName(nextOpenDay.day)} ${nextOpenDay.hours.open}` : undefined,
    };
  }

  const currentTime = format(now, 'HH:mm');
  const isOpen = currentTime >= todayHours.open && currentTime < todayHours.close;

  return {
    isOpen,
    closesAt: isOpen ? todayHours.close : undefined,
    opensAt: !isOpen && currentTime < todayHours.open ? todayHours.open : undefined,
    todayHours: `${todayHours.open} - ${todayHours.close}`,
  };
}

function findNextOpenDay(
  openingHours: OpeningHours,
  currentDayIndex: number
): { day: DayOfWeek; hours: { open: string; close: string } } | null {
  for (let i = 1; i <= 7; i++) {
    const dayIndex = (currentDayIndex + i) % 7;
    const day = DAYS_MAP[dayIndex];
    const hours = openingHours[day];
    if (hours && !hours.closed) {
      return { day, hours };
    }
  }
  return null;
}

function getDayName(day: DayOfWeek): string {
  const names: { [key in DayOfWeek]: string } = {
    monday: 'Mo',
    tuesday: 'Di',
    wednesday: 'Mi',
    thursday: 'Do',
    friday: 'Fr',
    saturday: 'Sa',
    sunday: 'So',
  };
  return names[day];
}

/**
 * Check if a special menu is currently active
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns boolean
 */
export function isSpecialMenuActive(startDate: string | null, endDate: string | null): boolean {
  const today = startOfDay(new Date());

  if (!startDate && !endDate) return true;

  const start = startDate ? parseISO(startDate) : null;
  const end = endDate ? parseISO(endDate) : null;

  if (start && isBefore(today, start)) return false;
  if (end && isAfter(today, end)) return false;

  return true;
}
