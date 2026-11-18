import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from '../save-file';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('saveBlob', () => {
  it('saveBlob clicks an anchor with the download name and revokes the URL', () => {
    vi.useFakeTimers();
    const anchor = { href: '', download: '', rel: '', style: {} as Record<string, string>, click: vi.fn(), remove: vi.fn() };
    const appended: unknown[] = [];
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => (tag === 'a' ? anchor : null)),
      body: { appendChild: (n: unknown) => appended.push(n) },
    });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ortis/1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    // The browser build has no window.studio; nothing here may need it.
    vi.stubGlobal('window', {});

    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    saveBlob(blob, 'ausweise-2026-11-18.pdf');

    expect(create).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe('blob:ortis/1');
    expect(anchor.download).toBe('ausweise-2026-11-18.pdf');
    expect(appended).toEqual([anchor]);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:ortis/1');
    expect(anchor.remove).toHaveBeenCalled();
  });
});
