import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { chatFont, useChatTokens } from './tokens';

export type DayStampProps = { label: string; style?: StyleProp<TextStyle> };

/** Centered light-grey timestamp, e.g. "Heute 16:29" (ref 4). */
export function DayStamp({ label, style }: DayStampProps) {
  const t = useChatTokens();
  return <Text style={[styles.text, { color: t.textTertiary }, style]}>{label}</Text>;
}

/** "Heute 16:29" / "Gestern 09:12" / "12. Sep. 16:29" (German). */
export function formatDayStamp(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return `Heute ${hm}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Gestern ${hm}`;
  return `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} ${hm}`;
}

const styles = StyleSheet.create({
  text: { fontFamily: chatFont.regular, fontSize: 14, textAlign: 'center', marginVertical: 12 },
});

export default DayStamp;
