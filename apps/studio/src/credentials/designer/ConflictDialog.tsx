// The draft was saved on another device (e.g. the Röbel App) since this editor loaded it.
import { t } from '../../i18n';
import { Modal } from '../../persona/common';

export function ConflictDialog({ busy, onKeepMine, onLoadTheirs }: { busy?: boolean; onKeepMine: () => void; onLoadTheirs: () => void }) {
  return (
    <Modal
      title={t('Auf einem anderen Gerät geändert')}
      size="sm"
      onClose={() => undefined}
      footer={
        <>
          <button className="w-btn" disabled={busy} onClick={onLoadTheirs}>
            {t('Andere Version laden')}
          </button>
          <button className="w-btn green" disabled={busy} onClick={onKeepMine}>
            {t('Meine Version behalten')}
          </button>
        </>
      }
    >
      <div className="pz-confirm-text">{t('Dieser Entwurf wurde inzwischen auf einem anderen Gerät geändert. Welche Version soll bleiben? Die andere geht verloren.')}</div>
    </Modal>
  );
}
