import logoUrl from '../../assets/logo.svg';
import { useOnAir } from '../studio';
import { SECTION_ICONS } from './icons';
import { SECTIONS, type Section } from './nav';

/** Left navigation rail. The livestream icon carries a red dot while the program is on air or recording. */
export function Rail({ section, onSelect }: { section: Section; onSelect: (s: Section) => void }) {
  const air = useOnAir();
  const live = air.phase !== 'off';
  return (
    <nav className="rail" aria-label="Bereiche">
      <img className="rail-logo" src={logoUrl} alt="Ortis Studio" width={26} height={26} />
      <div className="rail-items" role="tablist" aria-orientation="vertical">
        {SECTIONS.map((s) => {
          const Icon = SECTION_ICONS[s.id];
          return (
            <button
              key={s.id}
              className="rail-item"
              role="tab"
              aria-selected={section === s.id}
              aria-label={s.label}
              title={s.soon ? `${s.label} (bald)` : s.label}
              onClick={() => onSelect(s.id)}
            >
              <Icon />
              <span className="rail-label">{s.label}</span>
              {s.id === 'live' && live && <span className="rail-dot" aria-label="Auf Sendung" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
