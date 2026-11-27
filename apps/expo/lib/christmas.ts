// Christmas season: garland deco + the "Röbel App unterstützen" card.
//
// On between 15 Nov and 6 Jan by default, so it switches itself off after Heilige Drei Könige.
// `app_settings.christmas_season_enabled` overrides the window without an app update:
// 'true' = on all year, 'false' = off, missing = the date window.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function isInChristmasWindow(now: Date = new Date()): boolean {
  const m = now.getMonth(); // 0 = Jan
  const d = now.getDate();
  return (m === 10 && d >= 15) || m === 11 || (m === 0 && d <= 6);
}

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();

async function loadSeason(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'christmas_season_enabled')
      .maybeSingle();
    const v = (data as { value: string | null } | null)?.value;
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch {
    // Offline or table unreachable: fall back to the date window.
  }
  return isInChristmasWindow();
}

/**
 * One fetch per app start, shared by every garland and card on screen. Starts from the date window
 * so the deco paints on the first frame instead of popping in.
 */
export function useChristmasSeason(): boolean {
  const [on, setOn] = useState<boolean>(cached ?? isInChristmasWindow());
  useEffect(() => {
    listeners.add(setOn);
    if (cached !== null) setOn(cached);
    else if (!inflight) {
      inflight = loadSeason().then((v) => {
        cached = v;
        listeners.forEach((l) => l(v));
        return v;
      });
    }
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}

/** Feed: the support card after the 3rd post, then after every 15 more. */
export const SUPPORT_CARD_FIRST_AFTER = 3;
export const SUPPORT_CARD_EVERY = 15;
