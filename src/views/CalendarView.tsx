import { useMemo, useState } from 'react';
import { EpisodePanel } from '../components/EpisodePanel';
import { Icon } from '../components/Icons';
import { MONTHS, formatDate, parseDateKey, toDateKey, weekdayLong } from '../lib/time';
import { useApp } from '../state/AppContext';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function CalendarView() {
  const { data, currentNight, calendarNight, setCalendarNight } = useApp();
  const selected = calendarNight ?? currentNight;
  const [month, setMonth] = useState(() => {
    const d = parseDateKey(selected);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // Ereignisanzahl je dokumentierter Nacht
  const counts = useMemo(() => {
    const perEp = new Map<string, number>();
    for (const e of data.events) perEp.set(e.episodeId, (perEp.get(e.episodeId) ?? 0) + 1);
    return new Map(data.episodes.map((ep) => [ep.nightDate, perEp.get(ep.id) ?? 0]));
  }, [data]);

  const cells = useMemo(() => {
    const first = new Date(month.y, month.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(month.y, month.m + 1, 0).getDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= days; d++) out.push(toDateKey(new Date(month.y, month.m, d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const shift = (delta: number) => setMonth((p) => {
    const d = new Date(p.y, p.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const goToCurrent = () => {
    const d = parseDateKey(currentNight);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    setCalendarNight(currentNight);
  };

  const monthDocumented = cells.filter((c) => c && counts.has(c)).length;

  return (
    <div className="view">
      <div className="card calendar">
        <div className="cal-head">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Vorheriger Monat">
            <Icon name="chevronLeft" />
          </button>
          <h2 aria-live="polite">
            {MONTHS[month.m]} {month.y}
          </h2>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Nächster Monat">
            <Icon name="chevronRight" />
          </button>
        </div>
        <div className="cal-grid" role="grid" aria-label={`Kalender ${MONTHS[month.m]} ${month.y}`}>
          <div role="row" className="cal-row">
            {WD.map((w) => (
              <span key={w} role="columnheader" className="cal-wd">
                {w}
              </span>
            ))}
          </div>
          {Array.from({ length: cells.length / 7 }, (_, r) => (
            <div role="row" className="cal-row" key={r}>
              {cells.slice(r * 7, r * 7 + 7).map((key, i) => {
                if (!key) return <span key={`e${i}`} role="gridcell" className="cal-cell empty" />;
                const count = counts.get(key);
                const documented = count !== undefined;
                const future = key > currentNight;
                const cls = [
                  'cal-cell',
                  documented ? (count === 0 ? 'doc-zero' : count === 1 ? 'doc-one' : 'doc-many') : 'nodata',
                  key === selected ? 'selected' : '',
                  key === currentNight ? 'current' : '',
                ].join(' ');
                const desc = !documented ? 'keine Daten' : count === 0 ? 'dokumentiert, kein Aufwachen' : count === 1 ? '1 Aufwachereignis' : `${count} Aufwachereignisse`;
                return (
                  <span role="gridcell" key={key}>
                    <button
                      type="button"
                      className={cls}
                      disabled={future}
                      aria-pressed={key === selected}
                      aria-label={`Nacht ab ${weekdayLong(key)}, ${formatDate(key)}: ${desc}${key === currentNight ? ', aktuelle Nacht' : ''}`}
                      onClick={() => setCalendarNight(key)}
                    >
                      <span className="cal-day">{parseDateKey(key).getDate()}</span>
                      <span className="cal-mark" aria-hidden="true">
                        {documented && count === 0 && <Icon name="check" size={12} />}
                        {documented && count === 1 && <span className="dot" />}
                        {documented && count! >= 2 && <span className="count">{count}</span>}
                      </span>
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cal-foot">
          <button type="button" className="btn btn-secondary btn-small" onClick={goToCurrent}>
            Zur aktuellen Nacht
          </button>
          <span className="muted small">{monthDocumented} {monthDocumented === 1 ? 'Nacht' : 'Nächte'} dokumentiert</span>
        </div>
        <ul className="legend" aria-label="Legende">
          <li>
            <span className="legend-swatch nodata">1</span> keine Daten
          </li>
          <li>
            <span className="legend-swatch doc-zero">
              <Icon name="check" size={12} />
            </span>{' '}
            ohne Aufwachen
          </li>
          <li>
            <span className="legend-swatch doc-one">
              <span className="dot" />
            </span>{' '}
            1 Ereignis
          </li>
          <li>
            <span className="legend-swatch doc-many">
              <span className="count">2</span>
            </span>{' '}
            mehrere (Anzahl)
          </li>
        </ul>
        <p className="footnote">Datum = Abend, an dem die Nacht begann.</p>
      </div>

      <EpisodePanel key={selected} nightDate={selected} />
    </div>
  );
}
