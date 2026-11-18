// Drop zone and file picker for a people list (.csv / .txt). The text goes to the server unparsed:
// the server parses it the same way for the preview and the batch (plan 4 Task 3).
import { useRef, useState } from 'react';
import { t } from '../i18n';
import { readTextFile } from './read-text';

export function ImportDrop({ onText, onError }: { onText: (text: string, fileName: string) => void; onError: (message: string) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) return onError(t('Bitte eine .csv- oder .txt-Datei wählen.'));
    try {
      onText(await readTextFile(file), file.name);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  return (
    <div
      className={`cr-drop${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer.files?.[0]);
      }}
    >
      <span>{t('Liste hierher ziehen (Name und E-Mail je Zeile)')}</span>
      <button type="button" className="w-btn" onClick={() => input.current?.click()}>
        {t('Datei wählen')}
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
