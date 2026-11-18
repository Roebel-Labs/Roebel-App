// Reads a dropped or picked people list as text. Excel on Windows saves CSV as Windows-1252, so a
// file that is not valid UTF-8 is decoded again as windows-1252 (umlauts arrive intact).
import { t } from '../i18n';

export const MAX_TEXT_BYTES = 1024 * 1024;

export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_TEXT_BYTES) throw new Error(t('Die Datei ist zu groß (höchstens 1 MB).'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.includes('�')) {
    // Only re-decode when the bytes really are not UTF-8 (a genuine U+FFFD stays).
    let valid = true;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      valid = false;
    }
    if (!valid) text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
