import { useStudio } from '../studio';
import { AudioStrip } from './AudioStrip';
import { Monitors } from './Monitors';
import { OverlayRow } from './OverlayRow';
import { SourceRow } from './SourceRow';
import { SponsorPanel } from './SponsorPanel';

/** Layout A: monitors + TAKE on top; sources and overlays left, audio right underneath (meters always visible). */
export function ShowTab() {
  const { mixer } = useStudio();
  return (
    <div className="show">
      <Monitors />
      <div className="show-lower">
        <div className="show-rows">
          <SourceRow />
          <OverlayRow />
        </div>
        <div className="show-side">
          <AudioStrip mixer={mixer} />
          <SponsorPanel />
        </div>
      </div>
    </div>
  );
}
