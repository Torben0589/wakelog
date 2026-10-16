import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Icon } from './Icons';

let openCount = 0;

/**
 * Modales Bottom-Sheet auf Basis von <dialog> (Fokusfalle, Escape, Screenreader-Semantik).
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  role = 'dialog',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Hintergrund-Scrollen sperren (Zähler, da Dialoge verschachtelt sein können)
    openCount++;
    document.documentElement.classList.add('modal-open');
    return () => {
      openCount = Math.max(0, openCount - 1);
      if (!openCount) document.documentElement.classList.remove('modal-open');
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      role={role}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // Klick auf Hintergrund
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            <Icon name="x" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}

/** Sicherheitsabfrage. Mit requireText muss der Nutzer ein Wort eintippen (z. B. „LÖSCHEN“). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  requireText,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  requireText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const typedId = useId();
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onCancel}
      role="alertdialog"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Abbrechen
          </button>
          <button
            type="button"
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={busy}
            onClick={() => {
              if (requireText && inputRef.current?.value.trim().toUpperCase() !== requireText) {
                inputRef.current?.focus();
                inputRef.current?.setAttribute('aria-invalid', 'true');
                return;
              }
              onConfirm();
            }}
          >
            {busy ? 'Bitte warten …' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
      {requireText && (
        <div className="field">
          <label htmlFor={typedId}>
            Zur Bestätigung <strong>{requireText}</strong> eingeben
          </label>
          <input ref={inputRef} id={typedId} className="input" autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        </div>
      )}
    </Sheet>
  );
}
