import { emitCommand } from '../../workspace/desktop';
import { hms, useOnAir, useTick } from '../studio';
import { IconCapture, IconMic, IconSearch, IconSidebar } from './line-icons';
import type { Section } from './nav';
import { SettingsMenu } from './SettingsMenu';

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
        <button className="tb-icon" title="Seitenleiste" aria-label="Seitenleiste" onClick={toHome(() => emitCommand({ kind: 'toggleList' }))}>
          <IconSidebar />
        </button>
      </div>
      <div className="toolbar-center">
        <button className="tb-action" onClick={toHome(() => emitCommand({ kind: 'search' }))}>
          <IconSearch size={16} /> Suchen
        </button>
        <button className="tb-action" onClick={toHome(() => emitCommand({ kind: 'dictate' }))}>
          <IconMic size={16} /> Aufnehmen
        </button>
        {window.studio?.desktop && (
          <button className="tb-action" onClick={toHome(() => void window.studio.desktop?.capture())}>
            <IconCapture size={16} /> Bildschirmfoto
          </button>
        )}
      </div>
      <div className="toolbar-end">
        {live && (
          <button className="tb-live" onClick={() => onSection('live')} title="Zum Livestream">
            <span className="pill-dot" /> {air.status?.recordOnly ? 'Aufnahme' : 'Live'} {hms(now - (air.startedAt ?? now))}
          </button>
        )}
        <SettingsMenu />
      </div>
    </header>
  );
}
