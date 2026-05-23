// 7-day approved-revenue bar chart for the partner dashboard.
//
// Bucketed client-side from the same charges list the dashboard already
// loads (no extra round-trip). Each bar = one calendar day, oldest left
// → today right. Today's bar is full opacity; previous days at 0.55.
// Empty days render as a thin baseline so the axis stays visible.
//
// Pure react-native-svg, no animations, no chart library. SVG viewBox is
// used so all bar math works in unit coordinates regardless of the
// rendered width.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import type { PartnerChargeRow } from '@/lib/supabase-roebel-card-partners';

const DAY_COUNT = 7;
const WEEKDAY_LETTERS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;

// viewBox dimensions — pure unit math, decoupled from rendered px size.
const VB_WIDTH = 100;
const VB_HEIGHT = 100;
const BAR_WIDTH_FRACTION = 0.55;
const SLOT_WIDTH = VB_WIDTH / DAY_COUNT;
const BAR_WIDTH = SLOT_WIDTH * BAR_WIDTH_FRACTION;

type Props = {
  charges: PartnerChargeRow[];
  height?: number;
};

export default function PartnerRevenueChart({ charges, height = 96 }: Props) {
  const { colors } = useTheme();

  const buckets = useMemo(() => bucketByDay(charges, DAY_COUNT), [charges]);
  const max = Math.max(...buckets.map((b) => b.cents), 0);

  return (
    <View style={styles.container}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        preserveAspectRatio="none"
      >
        {buckets.map((bucket, i) => {
          const slotCenter = i * SLOT_WIDTH + SLOT_WIDTH / 2;
          const x = slotCenter - BAR_WIDTH / 2;
          const isToday = i === DAY_COUNT - 1;
          const barHeight =
            max > 0 ? Math.max(1.5, (bucket.cents / max) * VB_HEIGHT) : 1;
          const y = VB_HEIGHT - barHeight;

          return (
            <React.Fragment key={bucket.iso}>
              <Line
                x1={slotCenter - BAR_WIDTH / 2}
                x2={slotCenter + BAR_WIDTH / 2}
                y1={VB_HEIGHT - 0.5}
                y2={VB_HEIGHT - 0.5}
                stroke={colors.border}
                strokeWidth={0.7}
              />
              <Rect
                x={x}
                y={y}
                width={BAR_WIDTH}
                height={barHeight}
                rx={1.5}
                ry={1.5}
                fill={colors.primary}
                opacity={isToday ? 1 : 0.55}
              />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.labelsRow}>
        {buckets.map((bucket, i) => {
          const isToday = i === DAY_COUNT - 1;
          return (
            <Text
              key={bucket.iso}
              style={[
                styles.label,
                {
                  color: isToday ? colors.textPrimary : colors.textTertiary,
                  fontFamily: isToday ? 'Inter-SemiBold' : 'Inter-Medium',
                },
              ]}
            >
              {WEEKDAY_LETTERS_DE[bucket.weekday]}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

type Bucket = {
  iso: string;
  weekday: number;
  cents: number;
};

function bucketByDay(charges: PartnerChargeRow[], days: number): Bucket[] {
  const out: Bucket[] = [];
  const today = startOfLocalDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      weekday: d.getDay(),
      cents: 0,
    });
  }
  const byIso = new Map(out.map((b) => [b.iso, b]));
  for (const c of charges) {
    if (c.status !== 'approved') continue;
    const iso = startOfLocalDay(new Date(c.created_at))
      .toISOString()
      .slice(0, 10);
    const bucket = byIso.get(iso);
    if (bucket) bucket.cents += c.amount_cents;
  }
  return out;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Pick the hour bucket (0-23) with the most approved charges. Returns null
 * when there's not enough signal to be useful (< 3 approved rows). Used by
 * the dashboard to render "Stoßzeit: 12–14 Uhr" alongside the chart.
 */
export function peakHourLabel(charges: PartnerChargeRow[]): string | null {
  const approved = charges.filter((c) => c.status === 'approved');
  if (approved.length < 3) return null;
  const counts = new Array(24).fill(0);
  for (const c of approved) {
    const h = new Date(c.created_at).getHours();
    counts[h] += 1;
  }
  let peak = 0;
  let peakCount = 0;
  for (let i = 0; i < 24; i++) {
    if (counts[i] > peakCount) {
      peakCount = counts[i];
      peak = i;
    }
  }
  if (peakCount === 0) return null;
  const start = String(peak).padStart(2, '0');
  const end = String((peak + 2) % 24).padStart(2, '0');
  return `${start}–${end} Uhr`;
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  label: {
    fontSize: 11,
    width: 24,
    textAlign: 'center',
  },
});
