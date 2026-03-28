export type RecurrencePattern = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

/**
 * Generate recurring dates from a start date following a pattern until an end date
 */
export function generateRecurringDates(
  startDate: Date,
  pattern: RecurrencePattern,
  endDate: Date
): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    dates.push(formatDateToString(current));

    switch (pattern) {
      case 'weekly':
        current.setDate(current.getDate() + 7);
        break;
      case 'biweekly':
        current.setDate(current.getDate() + 14);
        break;
      case 'monthly':
        current.setMonth(current.getMonth() + 1);
        break;
      case 'yearly':
        current.setFullYear(current.getFullYear() + 1);
        break;
    }
  }

  return dates;
}

/**
 * Get the next upcoming date from an array of date strings
 * Returns null if all dates are in the past
 */
export function getNextUpcomingDate(dates: string[]): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sortedDates = [...dates].sort((a, b) =>
    new Date(a).getTime() - new Date(b).getTime()
  );

  for (const dateStr of sortedDates) {
    const date = new Date(dateStr);
    if (date >= today) {
      return dateStr;
    }
  }

  return null;
}

/**
 * Count how many dates are in the future (including today)
 */
export function countRemainingDates(dates: string[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return dates.filter(dateStr => {
    const date = new Date(dateStr);
    return date >= today;
  }).length;
}

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a date string to German locale display format (DD.MM.YYYY)
 */
export function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Check if a date string is in the past
 */
export function isDatePast(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr);
  return date < today;
}

/**
 * Check if a date string is today
 */
export function isDateToday(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  return date.getTime() === today.getTime();
}
