import { buildImageBlocks } from '../ai/image-blocks';

const URL_A = 'https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/images/event-images/a.jpg';
const URL_B = 'https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/images/event-images/b.jpg';

describe('buildImageBlocks', () => {
  it('uses URL sources for uploaded images and never reads local files', async () => {
    const toBase64 = jest.fn();
    const blocks = await buildImageBlocks([URL_A, URL_B], ['file:///a.jpg', 'file:///b.jpg'], toBase64);
    expect(blocks).toEqual([
      { type: 'image', source: { type: 'url', url: URL_A } },
      { type: 'image', source: { type: 'url', url: URL_B } },
    ]);
    expect(toBase64).not.toHaveBeenCalled();
  });

  it('falls back to base64 from local files when there is no public URL', async () => {
    const toBase64 = jest.fn(async (u: string) => (u.endsWith('bad.jpg') ? null : { base64: `b64:${u}`, mediaType: 'image/jpeg' }));
    const blocks = await buildImageBlocks(undefined, ['file:///a.jpg', 'file:///bad.jpg'], toBase64);
    expect(blocks).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'b64:file:///a.jpg' } },
    ]);
  });

  it('treats non-https remote entries as local (base64 path)', async () => {
    const toBase64 = jest.fn(async () => ({ base64: 'x', mediaType: 'image/png' }));
    const blocks = await buildImageBlocks(['file:///only-local.png'], undefined, toBase64);
    expect(blocks[0].source.type).toBe('base64');
  });

  it('returns nothing for a message without images', async () => {
    expect(await buildImageBlocks([], [], jest.fn())).toEqual([]);
  });
});
