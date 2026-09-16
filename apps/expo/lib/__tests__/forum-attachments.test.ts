import { formatFileSize, isAllowedAttachmentMime, kindForMime, safeFileName } from '../forum-attachments';

describe('forum attachment helpers', () => {
  it('classifies mimes', () => {
    expect(kindForMime('image/png')).toBe('image');
    expect(kindForMime('application/pdf')).toBe('pdf');
    expect(kindForMime('text/csv')).toBe('file');
  });
  it('allows the documented list only', () => {
    expect(isAllowedAttachmentMime('application/pdf')).toBe(true);
    expect(isAllowedAttachmentMime('IMAGE/JPEG')).toBe(true);
    expect(isAllowedAttachmentMime('application/x-msdownload')).toBe(false);
  });
  it('formats sizes in German style', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(20 * 1024)).toBe('20 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2,5 MB');
    expect(formatFileSize(null)).toBe('');
  });
  it('sanitises file names', () => {
    expect(safeFileName(' Plan:2026/*.pdf ')).toBe('Plan_2026__.pdf');
    expect(safeFileName('')).toBe('datei');
  });
});
