import { transformedImageUrl } from '../image-url';

const SB = 'https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/images/posts/foo.jpg';

// transformedImageUrl is now a pass-through: uploads are compressed to display
// size client-side, so the billed Supabase render endpoint is no longer used.
describe('transformedImageUrl', () => {
  it('passes Supabase public object URLs through unchanged (no render endpoint)', () => {
    expect(transformedImageUrl(SB, { width: 1080 })).toBe(SB);
    expect(transformedImageUrl(SB, { width: 320, height: 320 })).toBe(SB);
    expect(transformedImageUrl(SB, { width: 640, quality: 60 })).toBe(SB);
  });

  it('never emits the billed render/image endpoint', () => {
    expect(transformedImageUrl(SB, { width: 1080 })).not.toContain('/render/image/');
  });

  it('passes through non-Supabase URLs unchanged', () => {
    const other = 'https://example.com/a.jpg';
    expect(transformedImageUrl(other, { width: 500 })).toBe(other);
  });

  it('passes through videos, gifs and svgs unchanged', () => {
    const mp4 = SB.replace('foo.jpg', 'clip.mp4');
    expect(transformedImageUrl(mp4, { width: 500 })).toBe(mp4);
  });

  it('returns null for null/undefined input', () => {
    expect(transformedImageUrl(null, { width: 100 })).toBeNull();
    expect(transformedImageUrl(undefined, { width: 100 })).toBeNull();
  });

  it('preserves an existing query string', () => {
    const withQ = `${SB}?t=123`;
    expect(transformedImageUrl(withQ, { width: 320 })).toBe(withQ);
  });
});
