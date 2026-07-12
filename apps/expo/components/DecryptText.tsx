import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

// Pixel-block glyphs the text "decrypts" out of, character by character — the
// same monospace-decode motion the Röbel Münzen reward loading label uses,
// reused across DMs (every message reveals as if decrypted on arrival), the
// reward CTA, and the transaction-proof button.
const PIXEL_GLYPHS = '░▒▓█▚▞▙▟▛▜'.split('');

// Ids that have already played their reveal in the current run. Used only when
// `once` is set (message bubbles): scrolling a bubble off- and back on-screen
// shows its text instantly instead of re-scrambling.
const revealed = new Set<string>();

/**
 * Clear the once-per-id memory so the reveal replays. Called when a chat is
 * (re)opened so every message decrypts on load, in all chats.
 */
export function resetDecrypted(): void {
  revealed.clear();
}

function scramble(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    out += ch === ' ' || ch === '\n' ? ch : PIXEL_GLYPHS[Math.floor(Math.random() * PIXEL_GLYPHS.length)];
  }
  return out;
}

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  /**
   * true (default): play only the first time this `id` is seen (per run) — for
   * message bubbles. false: play on every mount — for buttons/labels that
   * should re-decrypt each time they appear.
   */
  once?: boolean;
  /** Dedup key when `once` is true (e.g. the message id). */
  id?: string;
} & Pick<TextProps, 'numberOfLines' | 'accessibilityLabel'>;

/**
 * Text that "decrypts" out of pixel-block glyphs — a short (~0.4s), fixed-
 * duration reveal regardless of length. Falls back to plain text under Reduce
 * Motion.
 */
export default function DecryptText({
  id,
  text,
  style,
  numberOfLines,
  accessibilityLabel,
  once = true,
}: Props) {
  const alreadyRevealed = once && !!id && revealed.has(id);
  const [display, setDisplay] = useState(() => (alreadyRevealed ? text : scramble(text)));

  useEffect(() => {
    if (once && id && revealed.has(id)) {
      setDisplay(text);
      return;
    }

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const finish = () => {
      if (once && id) revealed.add(id);
      if (!cancelled) setDisplay(text);
    };

    const run = (reduceMotion: boolean) => {
      if (cancelled) return;
      if (reduceMotion || text.length === 0) {
        finish();
        return;
      }
      const total = text.length;
      // Reveal several chars per frame for long text so a paragraph decodes in
      // ~0.4s just like a short label.
      const framesToReveal = Math.min(Math.max(6, Math.ceil(total * 0.7)), 16);
      let frame = 0;
      interval = setInterval(() => {
        frame += 1;
        const count = Math.floor((frame / framesToReveal) * total);
        if (count >= total) {
          if (interval) clearInterval(interval);
          finish();
          return;
        }
        let out = '';
        for (let i = 0; i < total; i += 1) {
          const ch = text[i];
          out +=
            i < count || ch === ' ' || ch === '\n'
              ? ch
              : PIXEL_GLYPHS[Math.floor(Math.random() * PIXEL_GLYPHS.length)];
        }
        if (!cancelled) setDisplay(out);
      }, 30);
    };

    setDisplay(scramble(text));
    AccessibilityInfo.isReduceMotionEnabled()
      .then(run)
      .catch(() => run(false));

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [id, text, once]);

  return (
    <Text style={style} numberOfLines={numberOfLines} accessibilityLabel={accessibilityLabel ?? text}>
      {display}
    </Text>
  );
}
