/**
 * Open/closed status + day formatting for `accounts.opening_hours`.
 *
 * NOTE: account opening hours use ENGLISH day keys (monday…sunday) with
 * { open, close, closed }, unlike business.ts `isBusinessOpen` which expects
 * German keys. This mirrors apps/expo/lib/utils.ts `isRestaurantOpen`.
 */

import type { OpeningHours } from "@/types/business";

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

// JS getDay(): 0 = Sunday … 6 = Saturday
const DAYS_MAP: DayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const DAY_LABELS: { key: DayKey; label: string }[] = [
  { key: "monday", label: "Mo" },
  { key: "tuesday", label: "Di" },
  { key: "wednesday", label: "Mi" },
  { key: "thursday", label: "Do" },
  { key: "friday", label: "Fr" },
  { key: "saturday", label: "Sa" },
  { key: "sunday", label: "So" },
];

const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mo",
  tuesday: "Di",
  wednesday: "Mi",
  thursday: "Do",
  friday: "Fr",
  saturday: "Sa",
  sunday: "So",
};

export interface OpenStatus {
  isOpen: boolean;
  closesAt?: string;
  opensAt?: string;
}

function findNextOpenDay(
  hours: OpeningHours,
  currentDayIndex: number
): { day: DayKey; open: string } | null {
  for (let i = 1; i <= 7; i++) {
    const day = DAYS_MAP[(currentDayIndex + i) % 7];
    const entry = hours[day];
    if (entry && !entry.closed && entry.open) {
      return { day, open: entry.open };
    }
  }
  return null;
}

export function getOpenStatus(hours: OpeningHours | null): OpenStatus | null {
  if (!hours) return null;

  const now = new Date();
  const dayIndex = now.getDay();
  const today = hours[DAYS_MAP[dayIndex]];

  if (!today || today.closed || !today.open) {
    const next = findNextOpenDay(hours, dayIndex);
    return {
      isOpen: false,
      opensAt: next ? `${DAY_SHORT[next.day]} ${next.open}` : undefined,
    };
  }

  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  const isOpen = currentTime >= today.open && currentTime < today.close;

  return {
    isOpen,
    closesAt: isOpen ? today.close : undefined,
    opensAt: !isOpen && currentTime < today.open ? today.open : undefined,
  };
}
