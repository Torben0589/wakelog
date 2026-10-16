import { useState } from 'react';
import { episodeIssues, eventsOfEpisode, findEpisodeByNight } from '../lib/episodes';
import { OUTCOME_LABELS, type WakeEvent } from '../lib/model';
import { addDays, formatDate, formatDateShort, formatTime, toDateKey, weekdayLong, weekdayShort } from '../lib/time';
import { useApp } from '../state/AppContext';
import { EpisodeDetailsSheet, EventSheet, GetUpSheet } from './EntrySheets';
import { Icon, OUTCOME_ICONS } from './Icons';

type TimelineItem =
  | { kind: 'bed'; at: string }
  | { kind: 'event'; at: string; event: WakeEvent; index: number; isFinal: boolean }
  | { kind: 'wake'; at: string }
  | { kind: 'up'; at: string };

/**
 * Darstellung und Bearbeitung einer Nacht – verwendet in „Heute“ und im Kalender.
 * autoNight: In „Heute“ wird die Nacht neuer Ereignisse aus dem Zeitpunkt abgeleitet.
 */
export function EpisodePanel({ nightDate, autoNight = false }: { nightDate: string; autoNight?: boolean }) {
  const { data, status } = useApp();
  const [sheet, setSheet] = useState<null | { type: 'event'; event?: WakeEvent } | { type: 'up' } | { type: 'details' }>(null);
  const episode = findEpisodeByNight(data, nightDate);
  const events = episode ? eventsOfEpisode(data, episode.id) : [];
  const issues = episode ? episodeIssues(data, episode) : [];
  const nextDay = addDays(nightDate, 1);

  const items: TimelineItem[] = [];
  if (episode?.bedTime) items.push({ kind: 'bed', at: episode.bedTime });
  events.forEach((e, i) => items.push({ kind: 'event', at: e.occurredAt, event: e, index: i + 1, isFinal: episode?.gotUpEventId === e.id }));
  if (episode?.finalWakeTime) items.push({ kind: 'wake', at: episode.finalWakeTime });
  if (episode?.gotUpAt && !episode.gotUpEventId) items.push({ kind: 'up', at: episode.gotUpAt });
  items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const disabled = status !== 'ready';
  const showDay = (iso: string) => toDateKey(new Date(iso)) !== nextDay; // Datum nur zeigen, wenn nicht „am Morgen danach“

  return (
    <section className="episode" aria-labelledby={`night-${nightDate}`}>
      <div className="card night-card">
        <p className="eyebrow">Nacht</p>
        <h2 id={`night-${nightDate}`} className="night-title">
          {weekdayLong(nightDate)} → {weekdayLong(nextDay)}
        </h2>
        <p className="muted night-dates">
          {formatDate(nightDate)} – {formatDate(nextDay)}
        </p>
        <dl className="night-stats">
          <div>
            <dt>Aufwachereignisse</dt>
            <dd>{episode ? events.length : '–'}</dd>
          </div>
          <div>
            <dt>Aufgestanden</dt>
            <dd>{episode?.gotUpAt ? formatTime(episode.gotUpAt) : '–'}</dd>
          </div>
        </dl>
        <div className="action-row">
          <button type="button" className="btn btn-primary btn-large" disabled={disabled} onClick={() => setSheet({ type: 'event' })}>
            <Icon name="plus" /> Aufwachen eintragen
          </button>
          <button type="button" className="btn btn-secondary btn-large" disabled={disabled} onClick={() => setSheet({ type: 'up' })}>
            <Icon name="gotUp" /> {episode?.gotUpAt ? 'Aufstehzeit ändern' : 'Aufstehen eintragen'}
          </button>
        </div>
      </div>

      {!episode ? (
        <div className="card soft">
          <p className="muted center">Für diese Nacht ist noch nichts erfasst.</p>
          <button type="button" className="btn btn-link" onClick={() => setSheet({ type: 'details' })} disabled={disabled}>
            Nacht ohne Aufwachen dokumentieren
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>Verlauf</h3>
            <button type="button" className="btn btn-link" onClick={() => setSheet({ type: 'details' })}>
              <Icon name="pencil" size={16} /> Details & Notiz
            </button>
          </div>
          {items.length === 0 ? (
            <p className="muted">Keine Aufwachereignisse – als ruhige Nacht dokumentiert.</p>
          ) : (
            <ol className="timeline">
              {items.map((it) => {
                const day = showDay(it.at) ? `${weekdayShort(it.at)} ${formatDateShort(it.at)}` : null;
                if (it.kind === 'event') {
                  const o = it.event.outcome;
                  return (
                    <li key={it.event.id} className={`tl-item tl-event o-${o}`}>
                      <button
                        type="button"
                        className="tl-btn"
                        onClick={() => setSheet({ type: 'event', event: it.event })}
                        aria-label={`${it.index}. Aufwachen um ${formatTime(it.at)} Uhr${day ? `, ${day}` : ''}: ${OUTCOME_LABELS[o]}${it.isFinal ? ', endgültiges Aufstehen' : ''}. Bearbeiten`}
                      >
                        <span className="tl-dot" aria-hidden="true">
                          <Icon name={OUTCOME_ICONS[o]} size={16} />
                        </span>
                        <span className="tl-time">
                          {formatTime(it.at)}
                          {day && <small>{day}</small>}
                        </span>
                        <span className="tl-text">
                          <span className="tl-title">
                            {OUTCOME_LABELS[o]}
                            {it.isFinal && <span className="badge">Aufstehen</span>}
                          </span>
                          {it.event.note && <span className="tl-note">{it.event.note}</span>}
                        </span>
                        <Icon name="chevronRight" size={18} className="tl-chevron" />
                      </button>
                    </li>
                  );
                }
                const meta = {
                  bed: { icon: 'bed', label: 'Schlafenszeit (geschätzt)', open: { type: 'details' } },
                  wake: { icon: 'sunrise', label: 'Endgültig wach', open: { type: 'details' } },
                  up: { icon: 'gotUp', label: 'Aufgestanden', open: { type: 'up' } },
                } as const;
                const m = meta[it.kind];
                return (
                  <li key={it.kind} className={`tl-item tl-${it.kind}`}>
                    <button type="button" className="tl-btn" onClick={() => setSheet(m.open)} aria-label={`${m.label} ${formatTime(it.at)} Uhr. Bearbeiten`}>
                      <span className="tl-dot" aria-hidden="true">
                        <Icon name={m.icon} size={16} />
                      </span>
                      <span className="tl-time">
                        {formatTime(it.at)}
                        {day && <small>{day}</small>}
                      </span>
                      <span className="tl-text">
                        <span className="tl-title">{m.label}</span>
                      </span>
                      <Icon name="chevronRight" size={18} className="tl-chevron" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {episode.note && (
            <p className="episode-note">
              <Icon name="note" size={16} /> {episode.note}
            </p>
          )}
          {issues.length > 0 && (
            <ul className="issues" aria-label="Hinweise zur Vollständigkeit">
              {issues.map((i) => (
                <li key={i}>
                  <Icon name="info" size={14} /> {i}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <EventSheet
        open={sheet?.type === 'event'}
        onClose={() => setSheet(null)}
        nightDate={autoNight && !(sheet?.type === 'event' && sheet.event) ? undefined : nightDate}
        event={sheet?.type === 'event' ? sheet.event : undefined}
      />
      <GetUpSheet open={sheet?.type === 'up'} onClose={() => setSheet(null)} nightDate={nightDate} />
      <EpisodeDetailsSheet open={sheet?.type === 'details'} onClose={() => setSheet(null)} nightDate={nightDate} />
    </section>
  );
}
