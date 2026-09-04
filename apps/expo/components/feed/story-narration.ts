// apps/expo/components/feed/story-narration.ts
// Pure helpers for the Wochen-Radio narration inside StoryViewer: which clips
// play on a slide, and how far along the slide is. No React, no expo-audio.
import type { RadioSegment } from '@/lib/event-radio-select';

export const NARRATION_TAIL_MS = 900; // breathing room after the last clip
export const BED_FULL = 1;
export const BED_DUCK = 0.22;
export const BED_FADE_IN_MS = 1200;
export const BED_DUCK_MS = 350;
export const BED_UNDUCK_MS = 700;
export const BED_FADE_OUT_MS = 400;
export const NARRATION_LOAD_TIMEOUT_MS = 4000;
export const AUDIO_DISCLOSURE_LABEL = 'Mecky · KI-Stimme · Musik: Eleven Music';

export type NarrationClip = RadioSegment & { role: 'intro' | 'slide' | 'outro' };

/**
 * Intro only when the viewer was opened at the first slide and has not played
 * it yet. Outro after the last slide's clip, once. A slide without its own
 * clip gets no narration at all (the timer runs instead).
 */
export function buildNarrationQueue(input: {
  slide: RadioSegment | null | undefined;
  intro?: RadioSegment | null;
  outro?: RadioSegment | null;
  slideIndex: number;
  slideCount: number;
  openedAtSlideIndex: number;
  introPlayed: boolean;
  outroPlayed: boolean;
}): NarrationClip[] {
  if (!input.slide) return [];
  const queue: NarrationClip[] = [];
  if (input.intro && input.slideIndex === 0 && input.openedAtSlideIndex === 0 && !input.introPlayed) {
    queue.push({ ...input.intro, role: 'intro' });
  }
  queue.push({ ...input.slide, role: 'slide' });
  if (input.outro && input.slideIndex === input.slideCount - 1 && !input.outroPlayed) {
    queue.push({ ...input.outro, role: 'outro' });
  }
  return queue;
}

/** 0..1 across the whole queue plus the tail, from the current clip's position in seconds. */
export function narrationProgress(
  queue: NarrationClip[],
  clipIndex: number,
  clipCurrentTimeSec: number,
): number {
  if (queue.length === 0) return 0;
  const total = queue.reduce((sum, c) => sum + c.durationMs, 0) + NARRATION_TAIL_MS;
  const before = queue.slice(0, clipIndex).reduce((sum, c) => sum + c.durationMs, 0);
  const current = Math.max(0, clipCurrentTimeSec) * 1000;
  return Math.max(0, Math.min(1, (before + current) / total));
}
