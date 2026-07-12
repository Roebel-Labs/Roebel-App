import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

// Pixel-block glyphs the text "decrypts" out of, character by character — the
// same monospace-decode motion the Röbel Münzen reward screen uses for its
// loading label, reused here so every DM message reveals as if it's being
// decrypted on arrival.
const PIXEL_GLYPHS = '░▒▓█▚▞▙▟▛▜'.split('');

// A message only plays the decrypt reveal the FIRST time it appears this
// session. Scrolling a bubble off- and back on-screen (FlatList remount) shows
// its text instantly instead of re-scrambling.
const revealed = new Set<string>();

function scramble(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    out += ch === ' ' || ch === '\n' ? ch : PIXEL_GLYPHS[Math.floor(Math.random() * PIXEL_GLYPHS.length)];
  }
  return out;
}

type Props = {
  /** Stable id (message id) used to play the reveal only once per session. */
  id: string;
  text: string;
  style?: StyleProp<TextStyle>;
} & Pick<TextProps, 'numberOfLines' | 'accessibilityLabel'>;

/**
 * Text that "decrypts" out of pixel-block glyphs the first time it mounts —
 * a short (~0.4s), fixed-duration reveal regardless of message length. Falls
 * back to plain text when Reduce Motion is on or the message was already
 * revealed earlier this session.
 */
export default function DecryptText({ id, text, style, numberOfLines, accessibilityLabel }: Props) {
  const [display, setDisplay] = useState(() => (revealed.has(id) ? text : scramble(text)));
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    // Already shown once, or same run already animating this id → nothing to do.
    if (revealed.has(id)) {
      setDisplay(text);
      return;
    }
    if (startedFor.current === id) return;
    startedFor.current = id;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const run = (reduceMotion: boolean) => {
      if (cancelled) return;
      if (reduceMotion || text.length === 0) {
        revealed.add(id);
        setDisplay(text);
        return;
      }
      const total = text.length;
      // Fixed-ish duration: reveal several chars per frame for long messages so
      // a paragraph decodes in ~0.4s just like a short "hi".
      const framesToReveal = Math.min(Math.max(6, Math.ceil(total * 0.7)), 16);
      let frame = 0;
      interval = setInterval(() => {
        frame += 1;
        const count = Math.floor((frame / framesToReveal) * total);
        if (count >= total) {
          if (interval) clearInterval(interval);
          revealed.add(id);
          setDisplay(text);
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
        setDisplay(out);
      }, 30);
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then(run)
      .catch(() => run(false));

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [id, text]);

  return (
    <Text style={style} numberOfLines={numberOfLines} accessibilityLabel={accessibilityLabel ?? text}>
      {display}
    </Text>
  );
}
