import { useEffect, useRef, type ReactNode } from 'react';

/** Centered modal with a backdrop. Escape cancels; focus starts on the cancel button. */
export function Dialog({
  title,
  children,
  onCancel,
  actions,
}: {
  title: string;
  children?: ReactNode;
  onCancel: () => void;
  actions: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Parents pass inline callbacks; keep the latest in a ref so focus is set only once, on mount.
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancel.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const auto = ref.current?.querySelector<HTMLElement>('[data-autofocus]');
    if (auto && !ref.current?.contains(document.activeElement)) auto.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && cancel.current()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      title={title}
      onCancel={onCancel}
      actions={
        <>
          <button className="btn ghost" onClick={onCancel} data-autofocus>
            Abbrechen
          </button>
          <button className={danger ? 'btn solid-danger' : 'btn primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {body}
    </Dialog>
  );
}
