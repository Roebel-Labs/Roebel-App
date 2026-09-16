import { buildFilePickerHtml, parsePickedFileMessage } from '../file-picker-html';

describe('file picker html', () => {
  it('embeds the accept list and the size guard', () => {
    const html = buildFilePickerHtml(['application/pdf', 'text/plain'], 1024);
    expect(html).toContain('accept="application/pdf,text/plain"');
    expect(html).toContain('f.size>1024');
    expect(html).toContain('ReactNativeWebView');
  });
  it('parses only known message shapes', () => {
    expect(parsePickedFileMessage(JSON.stringify({ type: 'file', name: 'a.pdf', mime: 'application/pdf', size: 3, base64: 'AAA=' }))?.type).toBe('file');
    expect(parsePickedFileMessage(JSON.stringify({ type: 'cancel' }))).toEqual({ type: 'cancel' });
    expect(parsePickedFileMessage('{"type":"other"}')).toBeNull();
    expect(parsePickedFileMessage('not json')).toBeNull();
  });
});
