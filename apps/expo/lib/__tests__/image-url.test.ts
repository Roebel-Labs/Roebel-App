import { transformedImageUrl } from '../image-url';

const SB = 'https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/images/posts/foo.jpg';

describe('transformedImageUrl', () => {
  it('rewrites a Supabase public object URL to the render endpoint with width and quality', () => {
    expect(transformedImageUrl(SB, { width: 1080 })).toBe(
      'https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/render/image/public/images/posts/foo.jpg?width=1080&quality=75&resize=cover'
    );
  });

  it('respects an explicit quality', () => {
    expect(transformedImageUrl(SB, { width: 640, quality: 60 })).toContain('quality=60');
  });

  it('passes through non-Supabase URLs unchanged', () => {
    const other = 'https://example.com/a.jpg';
    expect(transformedImageUrl(other, { width: 500 })).toBe(other);
  });

  it('passes through videos, gifs and svgs unchanged', () => {
    const mp4 = SB.replace('foo.jpg', 'clip.mp4');
    const gif = SB.replace('foo.jpg', 'anim.gif');
    const svg = SB.replace('foo.jpg', 'icon.svg');
    expect(transformedImageUrl(mp4, { width: 500 })).toBe(mp4);
    expect(transformedImageUrl(gif, { width: 500 })).toBe(gif);
    expect(transformedImageUrl(svg, { width: 500 })).toBe(svg);
  });

  it('returns null for null/undefined input', () => {
    expect(transformedImageUrl(null, { width: 100 })).toBeNull();
    expect(transformedImageUrl(undefined, { width: 100 })).toBeNull();
  });

  it('preserves an existing query string', () => {
    const withQ = `${SB}?t=123`;
    const out = transformedImageUrl(withQ, { width: 320 })!;
    expect(out).toContain('t=123');
    expect(out).toContain('width=320');
    expect(out).toContain('/render/image/public/');
  });
});
