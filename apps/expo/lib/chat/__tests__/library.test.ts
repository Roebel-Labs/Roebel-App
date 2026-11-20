import {
  chunkRows,
  documentFileId,
  filterLibrary,
  formatFileSize,
  formatLibraryDate,
  libraryCounts,
  libraryMeta,
  normalizeLibrary,
  type LibraryFile,
} from '../library';

const file = (over: Partial<LibraryFile>): LibraryFile => ({
  id: 'f1', name: 'wochenplan.md', ext: 'md', size: 3174, kind: 'document', url: null, threadId: 't1',
  threadTitle: 'Essensplan', routineTitle: null, createdAt: '2026-11-16T08:00:00Z', ...over,
});

const FILES = [
  file({}),
  file({ id: 'img:1', name: 'Windmühle am See', ext: 'jpg', size: 0, kind: 'image', url: 'https://x.y/a.jpg', threadId: 't2', threadTitle: 'Bilder' }),
  file({ id: 'f2', name: 'bericht.md', routineTitle: 'Wochenbericht' }),
];

describe('normalizeLibrary', () => {
  it('is empty for nothing', () => {
    expect(normalizeLibrary(null)).toEqual({ files: [], collections: [] });
  });

  it('drops broken files and images without a usable url', () => {
    const lib = normalizeLibrary({
      files: [
        FILES[0],
        null as never,
        { id: 'x' } as never,
        file({ id: 'img:2', kind: 'image', url: null }),
        file({ id: 'img:3', kind: 'image', url: 'http://insecure/a.jpg' }),
        file({ id: 'f9', name: '', ext: 'MD', threadTitle: '', kind: 'weird' as never }),
      ],
    });
    expect(lib.files.map((f) => f.id)).toEqual(['f1', 'f9']);
    expect(lib.files[1]).toMatchObject({ name: 'Datei', ext: 'md', threadTitle: 'Chat', kind: 'document' });
  });
});

describe('library helpers', () => {
  it('filters by kind and words', () => {
    expect(filterLibrary(FILES, 'all', '').map((f) => f.id)).toEqual(['f1', 'img:1', 'f2']);
    expect(filterLibrary(FILES, 'image', '').map((f) => f.id)).toEqual(['img:1']);
    expect(filterLibrary(FILES, 'document', 'wochen').map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(filterLibrary(FILES, 'all', 'see WIND').map((f) => f.id)).toEqual(['img:1']);
    expect(filterLibrary(FILES, 'all', 'gibtsnicht')).toEqual([]);
  });

  it('counts per kind', () => {
    expect(libraryCounts(FILES)).toEqual({ all: 3, document: 2, image: 1 });
    expect(libraryCounts([])).toEqual({ all: 0, document: 0, image: 0 });
  });

  it('formats sizes with a decimal comma', () => {
    expect(formatFileSize(0)).toBe('');
    expect(formatFileSize(NaN)).toBe('');
    expect(formatFileSize(812)).toBe('812 B');
    expect(formatFileSize(3174)).toBe('3,1 KB');
    expect(formatFileSize(20 * 1024)).toBe('20 KB');
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1,3 MB');
  });

  it('formats dates, with the year only for other years', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    expect(formatLibraryDate('2026-11-14T08:00:00Z', now)).toMatch(/^14\. Nov\.?$/);
    expect(formatLibraryDate('2025-01-03T08:00:00Z', now)).toMatch(/^3\. Jan\.? 2025$/);
    expect(formatLibraryDate('', now)).toBe('');
  });

  it('builds the meta line', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    expect(libraryMeta(FILES[0], now)).toMatch(/^Essensplan · 16\. Nov\.? · 3,1 KB$/);
    expect(libraryMeta(FILES[1], now)).toMatch(/^Bilder · 16\. Nov\.?$/);
    expect(libraryMeta(FILES[2], now)).toMatch(/^Wochenbericht · /);
  });

  it('knows which entries the file endpoint can load', () => {
    expect(documentFileId(FILES[0])).toBe('f1');
    expect(documentFileId(FILES[1])).toBeNull();
    expect(documentFileId(file({ id: 'img:9' }))).toBeNull();
  });

  it('chunks rows for the grid', () => {
    expect(chunkRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(chunkRows([], 3)).toEqual([]);
    expect(chunkRows([1, 2], 0)).toEqual([[1], [2]]);
  });
});
