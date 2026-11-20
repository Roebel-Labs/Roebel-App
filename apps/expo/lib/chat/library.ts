// "Bibliothek": files and generated images across the person's chats (GET /api/chat/library). Pure helpers (tested).

export interface LibraryFile {
  /** Document: chat file id. Generated image: "img:<imageId>". */
  id: string;
  name: string;
  ext: string;
  size: number;
  kind: 'document' | 'image';
  /** Public image URL; null for documents (their content comes from /api/chat/files/:id). */
  url: string | null;
  threadId: string;
  threadTitle: string;
  routineTitle: string | null;
  createdAt: string;
}

export interface LibraryCollection {
  id: string;
  label: string;
  count: number;
  kind: 'recent' | 'thread' | 'routine';
}

export interface Library {
  files: LibraryFile[];
  collections: LibraryCollection[];
}

export type LibraryKindFilter = 'all' | 'document' | 'image';

export function normalizeLibrary(raw: Partial<Library> | null | undefined): Library {
  const files: LibraryFile[] = [];
  for (const f of Array.isArray(raw?.files) ? raw.files : []) {
    if (!f || typeof f.id !== 'string' || typeof f.threadId !== 'string') continue;
    const kind = f.kind === 'image' ? 'image' : 'document';
    const url = typeof f.url === 'string' && /^https:\/\//.test(f.url) ? f.url : null;
    // An image without a usable URL cannot be shown.
    if (kind === 'image' && !url) continue;
    files.push({
      id: f.id,
      name: f.name || (kind === 'image' ? 'Bild' : 'Datei'),
      ext: (f.ext || '').toLowerCase(),
      size: Number(f.size) || 0,
      kind,
      url,
      threadId: f.threadId,
      threadTitle: f.threadTitle || 'Chat',
      routineTitle: f.routineTitle ?? null,
      createdAt: f.createdAt || '',
    });
  }
  return { files, collections: Array.isArray(raw?.collections) ? raw.collections.filter((c) => c && typeof c.id === 'string') : [] };
}

/** Kind chip plus the search field: every word must appear in the name, chat or routine title. */
export function filterLibrary(files: LibraryFile[], kind: LibraryKindFilter, query: string): LibraryFile[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return files.filter((f) => {
    if (kind !== 'all' && f.kind !== kind) return false;
    if (!words.length) return true;
    const hay = `${f.name} ${f.threadTitle} ${f.routineTitle ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function libraryCounts(files: LibraryFile[]): Record<LibraryKindFilter, number> {
  let document = 0;
  let image = 0;
  for (const f of files) {
    if (f.kind === 'image') image++;
    else document++;
  }
  return { all: files.length, document, image };
}

/** "812 B", "3,4 KB", "1,2 MB"; empty for 0 (generated images carry no size). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  const fmt = (n: number) => (n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace('.', ','));
  if (kb < 1024) return `${fmt(kb)} KB`;
  return `${fmt(kb / 1024)} MB`;
}

/** "16. Nov." this year, "3. Jan. 2025" otherwise; empty when invalid. */
export function formatLibraryDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Meta line of a row: where it came from, date, size. */
export function libraryMeta(f: LibraryFile, now: Date = new Date()): string {
  return [f.routineTitle || f.threadTitle, formatLibraryDate(f.createdAt, now), formatFileSize(f.size)].filter(Boolean).join(' · ');
}

/** The file id the file endpoint understands; null for generated images. */
export function documentFileId(f: LibraryFile): string | null {
  return f.kind === 'document' && !f.id.startsWith('img:') ? f.id : null;
}

/** Rows of `columns` tiles for the image grid (the last row may be shorter). */
export function chunkRows<T>(items: T[], columns: number): T[][] {
  const n = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return rows;
}
