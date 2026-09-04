import {
  buildNarrationQueue,
  narrationProgress,
  NARRATION_TAIL_MS,
} from '@/components/feed/story-narration';

const clip = (url: string, durationMs = 10000) => ({ audioUrl: url, durationMs });

describe('buildNarrationQueue', () => {
  const base = {
    slide: clip('slide'),
    intro: clip('intro', 5000),
    outro: clip('outro', 3000),
    slideIndex: 0,
    slideCount: 3,
    openedAtSlideIndex: 0,
    introPlayed: false,
    outroPlayed: false,
  };

  it('plays intro then the slide when opened at the first event', () => {
    expect(buildNarrationQueue(base).map((c) => c.role)).toEqual(['intro', 'slide']);
  });

  it('skips the intro when opened in the middle', () => {
    const q = buildNarrationQueue({ ...base, slideIndex: 1, openedAtSlideIndex: 1 });
    expect(q.map((c) => c.role)).toEqual(['slide']);
  });

  it('skips the intro when returning to slide 0 after it played', () => {
    const q = buildNarrationQueue({ ...base, introPlayed: true });
    expect(q.map((c) => c.role)).toEqual(['slide']);
  });

  it('appends the outro on the last slide, once', () => {
    const last = { ...base, slideIndex: 2, openedAtSlideIndex: 2 };
    expect(buildNarrationQueue(last).map((c) => c.role)).toEqual(['slide', 'outro']);
    expect(buildNarrationQueue({ ...last, outroPlayed: true }).map((c) => c.role)).toEqual(['slide']);
  });

  it('single-slide group opened at 0 gets intro, slide, outro', () => {
    const q = buildNarrationQueue({ ...base, slideCount: 1 });
    expect(q.map((c) => c.role)).toEqual(['intro', 'slide', 'outro']);
  });

  it('returns an empty queue when the slide has no narration', () => {
    expect(buildNarrationQueue({ ...base, slide: null })).toEqual([]);
    expect(buildNarrationQueue({ ...base, slide: undefined, slideIndex: 0 })).toEqual([]);
  });
});

describe('narrationProgress', () => {
  const queue = [
    { audioUrl: 'a', durationMs: 4000, role: 'intro' as const },
    { audioUrl: 'b', durationMs: 6000, role: 'slide' as const },
  ];
  it('accumulates finished clips plus the current position over total + tail', () => {
    const total = 10000 + NARRATION_TAIL_MS;
    expect(narrationProgress(queue, 0, 2)).toBeCloseTo(2000 / total, 5);
    expect(narrationProgress(queue, 1, 3)).toBeCloseTo(7000 / total, 5);
  });
  it('clamps to [0, 1]', () => {
    expect(narrationProgress(queue, 1, 99)).toBe(1);
    expect(narrationProgress(queue, 0, -1)).toBe(0);
    expect(narrationProgress([], 0, 5)).toBe(0);
  });
});
