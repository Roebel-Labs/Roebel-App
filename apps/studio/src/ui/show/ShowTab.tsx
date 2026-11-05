import { Monitors } from './Monitors';
import { OverlayRow } from './OverlayRow';
import { SourceRow } from './SourceRow';

export function ShowTab() {
  return (
    <div className="show">
      <Monitors />
      <SourceRow />
      <OverlayRow />
    </div>
  );
}
