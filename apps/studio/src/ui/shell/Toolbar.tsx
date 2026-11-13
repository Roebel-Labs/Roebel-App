import { emitCommand } from '../../workspace/desktop';
import { hms, useOnAir, useTick } from '../studio';
import { IconCapture, IconMic, IconSearch, IconSidebar } from './line-icons';
import type { Section } from './nav';
import { SettingsDialog } from './SettingsDialog';
import { Tip } from '../Tooltip';
import { shortcutHint } from './shortcuts';

/** Window toolbar on the glass (Town layout): list toggle left, quick actions centred, on-air state right. */
export function Toolbar({ section, onSection }: { section: Section; onSection: (s: Section) => void }) {
  const air = useOnAir();
  const now = useTick(1000);
  const live = air.phase !== 'off';
  const toHome = (fn: () => void) => () => {
    if (section !== 'home') onSection('home');
    fn();
  };
  return (
    <header className="toolbar">
      <div className="toolbar-start">
        <Tip label="Seitenleiste" keys={shortcutHint('toggleList')} side="bottom">
          <button className="tb-icon" aria-label="Seitenleiste" onClick={toHome(() => emitCommand({ kind: 'toggleList' }))}>
              <IconSidebar size={16} />
          </button>
        </Tip>
      </div>
      <div className="toolbar-center">
        <Tip label="Unterhaltungen durchsuchen" keys={shortcutHint('search')} side="bottom">
          <button className="tb-action" onClick={toHome(() => emitCommand({ kind: 'search' }))}>
            <IconSearch size={15} /> Suchen
          </button>
        </Tip>
        <button className="tb-action" onClick={toHome(() => emitCommand({ kind: 'dictate' }))}>
          <IconMic size={15} /> Aufnehmen
        </button>
        {window.studio?.desktop && (
          <button className="tb-action" onClick={toHome(() => void window.studio.desktop?.capture())}>
            <IconCapture size={15} /> Bildschirmfoto
          </button>
        )}
      </div>
      <div className="toolbar-end">
        {live && (
          <Tip label="Zum Livestream" side="bottom">
            <button className="tb-live" onClick={() => onSection('live')}>
              <span className="pill-dot" /> {air.status?.recordOnly ? 'Aufnahme' : 'Live'} {hms(now - (air.startedAt ?? now))}
            </button>
          </Tip>
        )}
        <SettingsDialog />
      </div>
    </header>
  );
}
