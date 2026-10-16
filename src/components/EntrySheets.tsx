import { useState } from 'react';
import {
  DuplicateEventError,
  ValidationError,
  addWakeEvent,
  defaultContext,
  deleteEpisode,
  deleteWakeEvent,
  eventsOfEpisode,
  findEpisodeByNight,
  setEpisodeDetails,
  updateWakeEvent,
} from '../lib/episodes';
import { type Changes, OUTCOMES, OUTCOME_LABELS, type Outcome, type WakeEvent } from '../lib/model';
import { StorageError } from '../lib/storage/types';
import { TimeInputError, addDays, combineLocal, formatNightLabel, formatTime, nightDateFor, toInputParts } from '../lib/time';
import { useApp } from '../state/AppContext';
import { DateTimeField, type DateTimeValue, NoteField, Notice, Switch } from './Controls';
import { Icon, OUTCOME_ICONS } from './Icons';
import { ConfirmDialog, Sheet } from './Sheet';

/** Führt eine Operation aus und übersetzt Fehler in Formularmeldungen. */
function useSubmit() {
  const { commit, getData, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateEventError | null>(null);

  async function submit(build: (data: ReturnType<typeof getData>) => Changes, success: string): Promise<boolean> {
    setError(null);
    setDuplicate(null);
    let changes: Changes;
    try {
      changes = build(getData());
    } catch (e) {
      if (e instanceof DuplicateEventError) setDuplicate(e);
      else if (e instanceof ValidationError || e instanceof TimeInputError) setError({ text: e.message, field: (e as ValidationError).field });
      else setError({ text: 'Unerwarteter Fehler. Bitte erneut versuchen.' });
      return false;
    }
    setBusy(true);
    try {
      await commit(changes);
      toast(success, 'success');
      return true;
    } catch (e) {
      setError({ text: e instanceof StorageError ? e.message : 'Speichern fehlgeschlagen. Bitte erneut versuchen.' });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy, error, setError, duplicate, setDuplicate };
}

const emptyDt = (date = ''): DateTimeValue => ({ date, time: '' });
const dtFromIso = (iso?: string): DateTimeValue => (iso ? toInputParts(new Date(iso)) : emptyDt());

/** Standardwert für neue Einträge: jetzt (aktuelle Nacht) bzw. Morgen nach der gewählten Nacht ohne Uhrzeit. */
function defaultDt(nightDate: string | undefined): DateTimeValue {
  const now = new Date();
  if (!nightDate || nightDate === nightDateFor(now)) return toInputParts(now);
  return emptyDt(addDays(nightDate, 1));
}

function parseDt(v: DateTimeValue, label: string): Date {
  if (!v.date || !v.time) throw new ValidationError(`${label}: Bitte Datum und Uhrzeit angeben.`, 'occurredAt');
  return combineLocal(v.date, v.time);
}

// =====================================================================
// Aufwachereignis anlegen/bearbeiten
// =====================================================================

export function EventSheet({
  open,
  onClose,
  nightDate,
  event,
}: {
  open: boolean;
  onClose: () => void;
  /** Feste Nacht (Kalender/Heute). Ohne Angabe wird die Nacht aus dem Zeitpunkt abgeleitet. */
  nightDate?: string;
  event?: WakeEvent;
}) {
  if (!open) return null;
  return <EventSheetInner onClose={onClose} nightDate={nightDate} event={event} />;
}

function EventSheetInner({ onClose, nightDate, event }: { onClose: () => void; nightDate?: string; event?: WakeEvent }) {
  const { data } = useApp();
  const editing = !!event;
  const episode = event ? data.episodes.find((e) => e.id === event.episodeId) : nightDate ? findEpisodeByNight(data, nightDate) : undefined;
  const fixedNight = episode?.nightDate ?? nightDate;

  const [dt, setDt] = useState<DateTimeValue>(() => (event ? dtFromIso(event.occurredAt) : defaultDt(nightDate)));
  const [outcome, setOutcome] = useState<Outcome | null>(event?.outcome ?? null);
  const [note, setNote] = useState(event?.note ?? '');
  const [final, setFinal] = useState<boolean>(() => {
    if (event) return episode?.gotUpEventId === event.id;
    if (episode?.gotUpAt) return false;
    const h = new Date().getHours();
    return h >= 4 && h < 12; // morgens ist „Aufgestanden“ meist das endgültige Aufstehen
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { submit, busy, error, setError, duplicate, setDuplicate } = useSubmit();

  // Live-Hinweis zur Nachtzuordnung
  let assignment: string | null = null;
  try {
    if (dt.date && dt.time) assignment = formatNightLabel(fixedNight ?? nightDateFor(combineLocal(dt.date, dt.time)));
  } catch {
    assignment = null;
  }

  const save = async (allowDuplicate = false) => {
    if (!outcome) {
      setError({ text: 'Bitte auswählen, was nach dem Aufwachen passiert ist.', field: 'outcome' });
      return;
    }
    const ok = await submit((d) => {
      const input = { occurredAt: parseDt(dt, 'Zeitpunkt'), outcome, note, markAsFinalGetUp: outcome === 'got_up' && final };
      const ctx = defaultContext();
      return event
        ? updateWakeEvent(d, event.id, input, ctx, { allowDuplicate }).changes
        : addWakeEvent(d, input, ctx, fixedNight, { allowDuplicate }).changes;
    }, editing ? 'Ereignis aktualisiert' : `Aufwachen um ${dt.time} gespeichert`);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!event) return;
    const ok = await submit((d) => deleteWakeEvent(d, event.id, defaultContext()).changes, 'Ereignis gelöscht');
    setConfirmDelete(false);
    if (ok) onClose();
  };

  const otherFinal = episode?.gotUpAt && episode.gotUpEventId !== event?.id;

  return (
    <>
      <Sheet
        open
        title={editing ? 'Aufwachen bearbeiten' : 'Aufwachen eintragen'}
        onClose={onClose}
        footer={
          <>
            {editing && (
              <button type="button" className="btn btn-ghost-danger" onClick={() => setConfirmDelete(true)} aria-label="Ereignis löschen">
                <Icon name="trash" size={18} /> Löschen
              </button>
            )}
            <button type="button" className="btn btn-primary btn-grow" disabled={busy} onClick={() => save(false)}>
              <Icon name="check" size={18} /> Speichern
            </button>
          </>
        }
      >
        <DateTimeField
          label="Zeitpunkt"
          value={dt}
          onChange={(v) => {
            setDt(v);
            setDuplicate(null);
          }}
          error={error && (error.field === 'occurredAt' || error.field === 'gotUpAt') ? error.text : undefined}
          hint={assignment ? <>Gehört zur Nacht {assignment}</> : undefined}
        />

        <fieldset className="field">
          <legend className="field-label">Was passierte danach?</legend>
          <div className="outcome-grid" role="radiogroup" aria-invalid={error?.field === 'outcome'}>
            {OUTCOMES.map((o) => (
              <label key={o} className={`outcome-option o-${o}${outcome === o ? ' selected' : ''}`}>
                <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} />
                <Icon name={OUTCOME_ICONS[o]} size={22} />
                <span>{OUTCOME_LABELS[o]}</span>
              </label>
            ))}
          </div>
          {error?.field === 'outcome' && (
            <p className="field-error" role="alert">
              <Icon name="alert" size={16} /> {error.text}
            </p>
          )}
        </fieldset>

        {outcome === 'got_up' && (
          <Switch
            label="Endgültiges Aufstehen dieser Nacht"
            checked={final}
            onChange={setFinal}
            hint={
              otherFinal
                ? `Ersetzt die bisherige Aufstehzeit ${formatTime(episode!.gotUpAt!)} Uhr.`
                : 'Übernimmt diesen Zeitpunkt als Aufstehzeit – ohne zusätzliches Ereignis.'
            }
          />
        )}

        <NoteField value={note} onChange={setNote} />

        {duplicate && (
          <Notice kind="warning">
            <p>{duplicate.message} Wirklich ein weiteres Ereignis speichern?</p>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => save(true)} disabled={busy}>
              Trotzdem speichern
            </button>
          </Notice>
        )}
        {error && !error.field && <Notice kind="error">{error.text}</Notice>}
        {error?.field && error.field !== 'occurredAt' && error.field !== 'outcome' && error.field !== 'gotUpAt' && <Notice kind="error">{error.text}</Notice>}
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        title="Ereignis löschen?"
        message={
          <p>
            Das Aufwachen um {event ? formatTime(event.occurredAt) : ''} Uhr wird gelöscht.
            {episode?.gotUpEventId === event?.id && ' Die daraus übernommene Aufstehzeit wird ebenfalls entfernt.'}
          </p>
        }
        confirmLabel="Löschen"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

// =====================================================================
// Aufstehen eintragen
// =====================================================================

export function GetUpSheet({ open, onClose, nightDate }: { open: boolean; onClose: () => void; nightDate: string }) {
  if (!open) return null;
  return <GetUpSheetInner onClose={onClose} nightDate={nightDate} />;
}

function GetUpSheetInner({ onClose, nightDate }: { onClose: () => void; nightDate: string }) {
  const { data } = useApp();
  const episode = findEpisodeByNight(data, nightDate);
  const [dt, setDt] = useState<DateTimeValue>(() => (episode?.gotUpAt ? dtFromIso(episode.gotUpAt) : defaultDt(nightDate)));
  const { submit, busy, error } = useSubmit();
  const linked = episode?.gotUpEventId ? data.events.find((e) => e.id === episode.gotUpEventId) : undefined;

  const save = async () => {
    const ok = await submit(
      (d) => setEpisodeDetails(d, nightDate, { gotUpAt: parseDt(dt, 'Aufstehzeit') }, defaultContext()).changes,
      `Aufstehen um ${dt.time} gespeichert`,
    );
    if (ok) onClose();
  };
  const clear = async () => {
    const ok = await submit((d) => setEpisodeDetails(d, nightDate, { gotUpAt: null }, defaultContext()).changes, 'Aufstehzeit entfernt');
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      title={episode?.gotUpAt ? 'Aufstehzeit ändern' : 'Aufstehen eintragen'}
      onClose={onClose}
      footer={
        <>
          {episode?.gotUpAt && (
            <button type="button" className="btn btn-ghost-danger" onClick={clear} disabled={busy}>
              <Icon name="trash" size={18} /> Entfernen
            </button>
          )}
          <button type="button" className="btn btn-primary btn-grow" onClick={save} disabled={busy}>
            <Icon name="check" size={18} /> Speichern
          </button>
        </>
      }
    >
      <p className="muted">Nacht {formatNightLabel(nightDate)}</p>
      <DateTimeField label="Tatsächlich aufgestanden um" value={dt} onChange={setDt} error={error?.text} />
      {linked && (
        <Notice>
          Die Aufstehzeit stammt aus dem Ereignis „Aufgestanden“ um {formatTime(linked.occurredAt)} Uhr. Eine geänderte Uhrzeit löst diese
          Verknüpfung; das Ereignis bleibt erhalten.
        </Notice>
      )}
    </Sheet>
  );
}

// =====================================================================
// Details der Nacht (Schlafenszeit, endgültiges Aufwachen, Notiz, Löschen)
// =====================================================================

export function EpisodeDetailsSheet({ open, onClose, nightDate }: { open: boolean; onClose: () => void; nightDate: string }) {
  if (!open) return null;
  return <EpisodeDetailsInner onClose={onClose} nightDate={nightDate} />;
}

function EpisodeDetailsInner({ onClose, nightDate }: { onClose: () => void; nightDate: string }) {
  const { data } = useApp();
  const episode = findEpisodeByNight(data, nightDate);
  const [bed, setBed] = useState<DateTimeValue>(() => (episode?.bedTime ? dtFromIso(episode.bedTime) : emptyDt(nightDate)));
  const [wake, setWake] = useState<DateTimeValue>(() => (episode?.finalWakeTime ? dtFromIso(episode.finalWakeTime) : emptyDt(addDays(nightDate, 1))));
  const [note, setNote] = useState(episode?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { submit, busy, error } = useSubmit();
  const eventCount = episode ? eventsOfEpisode(data, episode.id).length : 0;

  const optional = (v: DateTimeValue, label: string): Date | null => (v.time ? parseDt(v, label) : null);

  const save = async () => {
    const ok = await submit(
      (d) =>
        setEpisodeDetails(
          d,
          nightDate,
          { bedTime: optional(bed, 'Schlafenszeit'), finalWakeTime: optional(wake, 'Endgültig wach'), note },
          defaultContext(),
        ).changes,
      'Nacht gespeichert',
    );
    if (ok) onClose();
  };
  const remove = async () => {
    if (!episode) return;
    const ok = await submit((d) => deleteEpisode(d, episode.id), 'Nacht gelöscht');
    setConfirmDelete(false);
    if (ok) onClose();
  };

  return (
    <>
      <Sheet
        open
        title="Details zur Nacht"
        onClose={onClose}
        footer={
          <>
            {episode && (
              <button type="button" className="btn btn-ghost-danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={18} /> Nacht löschen
              </button>
            )}
            <button type="button" className="btn btn-primary btn-grow" onClick={save} disabled={busy}>
              <Icon name="check" size={18} /> Speichern
            </button>
          </>
        }
      >
        <p className="muted">Nacht {formatNightLabel(nightDate)}</p>
        <DateTimeField
          label="Schlafenszeit (geschätzt, optional)"
          value={bed}
          onChange={setBed}
          onClear={bed.time ? () => setBed(emptyDt(bed.date || nightDate)) : undefined}
          error={error?.field === 'bedTime' ? error.text : undefined}
        />
        <DateTimeField
          label="Endgültig wach (optional)"
          value={wake}
          onChange={setWake}
          onClear={wake.time ? () => setWake(emptyDt(wake.date || addDays(nightDate, 1))) : undefined}
          error={error?.field === 'finalWakeTime' ? error.text : undefined}
          hint="Letztes Aufwachen am Morgen – unabhängig vom Aufstehen."
        />
        <NoteField label="Notiz zur Nacht (optional)" value={note} onChange={setNote} />
        {error && error.field !== 'bedTime' && error.field !== 'finalWakeTime' && <Notice kind="error">{error.text}</Notice>}
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        title="Ganze Nacht löschen?"
        message={
          <p>
            Die Nacht {formatNightLabel(nightDate)} wird mit {eventCount === 1 ? '1 Aufwachereignis' : `${eventCount} Aufwachereignissen`} und allen
            Angaben gelöscht. Das kann nicht rückgängig gemacht werden.
          </p>
        }
        confirmLabel="Nacht löschen"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
