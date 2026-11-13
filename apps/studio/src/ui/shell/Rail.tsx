import logoUrl from '../../assets/logo.svg';
import { useOnAir } from '../studio';
import { SECTION_ICONS } from './icons';
import { SECTIONS, type Section } from './nav';
import { AccountMenu } from './AccountMenu';
import { Tip } from '../Tooltip';
import { shortcutHint, type ShortcutId } from './shortcuts';

const SECTION_KEYS: Partial<Record<Section, ShortcutId>> = { home: 'goHome', foryou: 'goForYou', skills: 'goSkills', wiki: 'goWiki', library: 'goLibrary' };

/** Left navigation rail. The livestream icon carries a red dot while the program is on air or recording. */
export function Rail({ section, onSelect }: { section: Section; onSelect: (s: Section) => void }) {
  const air = useOnAir();
  const live = air.phase !== 'off';
  return (
    <nav className="rail" aria-label="Bereiche">
      <img className="rail-logo" src={logoUrl} alt="Ortis Studio" width={24} height={24} />
      <div className="rail-items" role="tablist" aria-orientation="vertical">
        {SECTIONS.map((s) => {
          const Icon = SECTION_ICONS[s.id];
          return (
            <Tip key={s.id} label={s.soon ? `${s.label} (bald)` : s.label} keys={SECTION_KEYS[s.id] && shortcutHint(SECTION_KEYS[s.id]!)} side="right">
              <button className="rail-item" role="tab" aria-selected={section === s.id} aria-label={s.label} onClick={() => onSelect(s.id)}>
                <Icon />
                {s.id === 'live' && live && <span className="rail-dot" aria-label="Auf Sendung" />}
              </button>
            </Tip>
          );
        })}
      </div>
      <span className="rail-spacer" />
      <AccountMenu />
    </nav>
  );
}
