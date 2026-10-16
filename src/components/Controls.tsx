import { type ReactNode, useId } from 'react';
import { formatDate } from '../lib/time';
import { Icon, type IconName } from './Icons';

/**
 * Natives iOS-Datum/Uhrzeit-Auswahlrad, aber Anzeige immer im Format DD.MM.YYYY bzw. 24 h –
 * unabhängig von der Regionseinstellung des Browsers. Das native Feld liegt unsichtbar über der Anzeige.
 */
export function PickerInput({
  type,
  value,
  onChange,
  label,
  invalid,
  describedBy,
  min,
  max,
}: {
  type: 'date' | 'time';
  value: string;
  onChange: (v: string) => void;
  label: string;
  invalid?: boolean;
  describedBy?: string;
  min?: string;
  max?: string;
}) {
  const shown = value ? (type === 'date' ? formatDate(value) : value.slice(0, 5)) : type === 'date' ? 'TT.MM.JJJJ' : '--:--';
  return (
    <span className={`picker${invalid ? ' invalid' : ''}${value ? '' : ' empty'}`}>
      <span className="picker-display" aria-hidden="true">
        {shown}
        <Icon name={type === 'date' ? 'calendar' : 'clock'} size={18} />
      </span>
      <input
        type={type}
        className="picker-native"
        value={value}
        step={type === 'time' ? 60 : undefined}
        min={min}
        max={max}
        aria-label={`${label}${value ? `: ${shown}` : ''}`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(type === 'time' ? e.target.value.slice(0, 5) : e.target.value)}
        onClick={(e) => {
          try {
            (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
          } catch {
            /* nicht unterstützt → natives Verhalten */
          }
        }}
      />
    </span>
  );
}

/** Segmentierte Auswahl als Radiogruppe (Tastatur & Screenreader). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hideLabel,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  hideLabel?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="segmented-wrap">
      <legend className={hideLabel ? 'sr-only' : 'field-label'}>{label}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={String(o.value)} className={o.value === value ? 'seg active' : 'seg'}>
            <input type="radio" name={name} value={String(o.value)} checked={o.value === value} onChange={() => onChange(o.value)} />
            {o.icon && <Icon name={o.icon} size={16} />}
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="switch-row">
      <label htmlFor={id} className="switch-label">
        <span>{label}</span>
        {hint && <small className="muted">{hint}</small>}
      </label>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export interface DateTimeValue {
  date: string;
  time: string;
}

/** Datum + Uhrzeit mit nativen iOS-Pickern. */
export function DateTimeField({
  label,
  value,
  onChange,
  error,
  onClear,
  hint,
}: {
  label: string;
  value: DateTimeValue;
  onChange: (v: DateTimeValue) => void;
  error?: string;
  onClear?: () => void;
  hint?: ReactNode;
}) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      <div className="dt-row">
        <span className="dt-part">
          <PickerInput
            type="date"
            label={`${label} – Datum`}
            value={value.date}
            onChange={(date) => onChange({ ...value, date })}
            invalid={!!error}
            describedBy={error ? errId : undefined}
          />
        </span>
        <span className="dt-part dt-time">
          <PickerInput
            type="time"
            label={`${label} – Uhrzeit`}
            value={value.time}
            onChange={(time) => onChange({ ...value, time })}
            invalid={!!error}
            describedBy={error ? errId : undefined}
          />
        </span>
        {onClear && (
          <button type="button" className="icon-btn" onClick={onClear} aria-label={`${label} entfernen`}>
            <Icon name="x" />
          </button>
        )}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" id={errId} role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
    </fieldset>
  );
}

export function NoteField({ value, onChange, label = 'Notiz (optional)' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="input textarea"
        rows={2}
        maxLength={1000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // iOS: Feld oberhalb der Tastatur halten
        onFocus={(e) => {
          const el = e.currentTarget;
          setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
        }}
      />
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warning' | 'error'; children: ReactNode }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon name={kind === 'info' ? 'info' : 'alert'} size={18} />
      <div>{children}</div>
    </div>
  );
}
