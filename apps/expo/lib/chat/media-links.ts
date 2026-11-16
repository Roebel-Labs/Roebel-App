// Generated audio and video arrive as items of a `sources` part (harness pack "media"): links to MP3/MP4
// files stored under …/chat/agents/<threadId>/media/. These helpers pick them out so the chat can show a
// player row instead of a plain link. Pure (tested).

export type MediaKind = 'audio' | 'video';

export interface SourceItem {
  title: string;
  url: string;
}

export interface MediaLink extends SourceItem {
  kind: MediaKind;
}

/** 'audio' for a generated .mp3, 'video' for a generated .mp4, null for every other link. */
export function mediaLinkKind(item: Partial<SourceItem> | null | undefined): MediaKind | null {
  const url = typeof item?.url === 'string' ? item.url.trim() : '';
  if (!/^https:\/\//i.test(url)) return null;
  // Path only: a query string or fragment must not hide or fake the extension.
  const path = url.split(/[?#]/)[0];
  if (!path.includes('/chat/agents/') || !path.includes('/media/')) return null;
  const lower = path.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio';
  if (lower.endsWith('.mp4')) return 'video';
  return null;
}

/** Splits a sources list into generated media and ordinary links; both keep their order. */
export function splitSources(items: SourceItem[] | null | undefined): { media: MediaLink[]; links: SourceItem[] } {
  const media: MediaLink[] = [];
  const links: SourceItem[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.url !== 'string') continue;
    const kind = mediaLinkKind(item);
    if (kind) media.push({ title: item.title ?? '', url: item.url, kind });
    else links.push(item);
  }
  return { media, links };
}

/** Row title: the server's title ("Sprachaufnahme", "Musik 2", "Video"), else a label by kind. */
export function mediaTitle(link: Pick<MediaLink, 'title' | 'kind'>): string {
  const title = (link.title ?? '').trim();
  if (title) return title;
  return link.kind === 'audio' ? 'Audio' : 'Video';
}

/** Second line of the row. */
export function mediaSubtitle(kind: MediaKind): string {
  return kind === 'audio' ? 'Audio · KI-erzeugt' : 'Video · KI-erzeugt';
}

/** 75 → "1:15"; negative or NaN → "0:00". */
export function formatClock(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
