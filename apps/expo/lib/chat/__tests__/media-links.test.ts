import { formatClock, mediaLinkKind, mediaSubtitle, mediaTitle, splitSources } from '../media-links';

const BASE = 'https://abc.supabase.co/storage/v1/object/public/images/chat/agents/1f2e/media';

describe('mediaLinkKind', () => {
  it('detects generated audio and video', () => {
    expect(mediaLinkKind({ title: 'Sprachaufnahme', url: `${BASE}/speech-1.mp3` })).toBe('audio');
    expect(mediaLinkKind({ title: 'Musik 2', url: `${BASE}/music-2.MP3` })).toBe('audio');
    expect(mediaLinkKind({ title: 'Video', url: `${BASE}/clip.mp4` })).toBe('video');
    expect(mediaLinkKind({ title: '', url: `${BASE}/clip.mp4?download=1#t=3` })).toBe('video');
  });

  it('leaves every other link alone', () => {
    expect(mediaLinkKind({ title: 'Musik', url: 'https://example.com/song.mp3' })).toBeNull();
    expect(mediaLinkKind({ title: 'Video', url: 'https://example.com/media/clip.mp4' })).toBeNull();
    expect(mediaLinkKind({ title: 'Bild', url: `${BASE}/bild.png` })).toBeNull();
    expect(mediaLinkKind({ title: 'x', url: `http://abc/chat/agents/1/media/a.mp3` })).toBeNull();
    expect(mediaLinkKind({ title: 'x', url: 'https://example.com/a?next=/chat/agents/1/media/a.mp3' })).toBeNull();
    expect(mediaLinkKind({ title: 'x', url: `${BASE}/a.mp3.html` })).toBeNull();
    expect(mediaLinkKind(null)).toBeNull();
    expect(mediaLinkKind({ title: 'x' })).toBeNull();
  });
});

describe('splitSources', () => {
  it('keeps the order of both lists', () => {
    const items = [
      { title: 'Quelle A', url: 'https://a.example' },
      { title: 'Sprachaufnahme', url: `${BASE}/s.mp3` },
      { title: 'Quelle B', url: 'https://b.example' },
      { title: 'Video', url: `${BASE}/v.mp4` },
    ];
    const { media, links } = splitSources(items);
    expect(media).toEqual([
      { title: 'Sprachaufnahme', url: `${BASE}/s.mp3`, kind: 'audio' },
      { title: 'Video', url: `${BASE}/v.mp4`, kind: 'video' },
    ]);
    expect(links).toEqual([items[0], items[2]]);
  });

  it('survives broken input', () => {
    expect(splitSources(null)).toEqual({ media: [], links: [] });
    expect(splitSources([null as never, { title: 'x' } as never])).toEqual({ media: [], links: [] });
  });
});

describe('labels', () => {
  it('uses the server title, else a label by kind', () => {
    expect(mediaTitle({ title: ' Musik 2 ', kind: 'audio' })).toBe('Musik 2');
    expect(mediaTitle({ title: '', kind: 'audio' })).toBe('Audio');
    expect(mediaTitle({ title: '', kind: 'video' })).toBe('Video');
    expect(mediaSubtitle('audio')).toBe('Audio · KI-erzeugt');
    expect(mediaSubtitle('video')).toBe('Video · KI-erzeugt');
  });

  it('formats the clock', () => {
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(NaN)).toBe('0:00');
    expect(formatClock(3599.9)).toBe('59:59');
  });
});
