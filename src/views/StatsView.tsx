import { type ReactNode, useMemo, useState } from 'react';
import { BarList, ColumnChart } from '../components/charts/ColumnChart';
import { EmptyState, Notice, PickerInput, Segmented, Switch } from '../components/Controls';
import { Icon, OUTCOME_ICONS } from '../components/Icons';
import { OUTCOME_LABELS_SHORT } from '../lib/model';
import {
  BIN_SIZES,
  type BinSize,
  type PeriodKey,
  dataQuality,
  exactTimes,
  firstWakeToGetUp,
  formatNumber,
  formatPercent,
  histogram,
  outcomeCounts,
  perNightSeries,
  rangeLength,
  resolveRange,
  select,
  summarize,
  topWindows,
  trimBins,
  weekdayStats,
  weeklySeries,
  windowSummary,
} from '../lib/stats';
import { addDays, formatDate, formatDateShort, formatDuration, formatMinutes, parseTime, weekdayShort } from '../lib/time';
import { useApp } from '../state/AppContext';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: '7', label: '7 T' },
  { value: '30', label: '30 T' },
  { value: '90', label: '90 T' },
  { value: 'all', label: 'Alle' },
  { value: 'custom', label: 'Frei' },
];
const PERIOD_TEXT: Record<PeriodKey, string> = { '7': 'Letzte 7 Tage', '30': 'Letzte 30 Tage', '90': 'Letzte 90 Tage', all: 'Gesamter Zeitraum', custom: 'Freier Zeitraum' };
const MAX_NIGHT_BARS = 120;

const nights = (n: number) => (n === 1 ? '1 Nacht' : `${n} Nächte`);
const events = (n: number) => (n === 1 ? '1 Ereignis' : `${n} Ereignisse`);

export function StatsView() {
  const { data, settings, currentNight, navigate } = useApp();
  const [period, setPeriod] = useState<PeriodKey>(settings.defaultPeriod);
  const [custom, setCustom] = useState({ from: addDays(currentNight, -29), to: currentNight });
  const [binSize, setBinSize] = useState<BinSize>(settings.binSize);
  const [showShare, setShowShare] = useState(false);
  const [winFrom, setWinFrom] = useState(settings.earlyWindowEnabled ? settings.earlyWindowFrom : '');
  const [winTo, setWinTo] = useState(settings.earlyWindowEnabled ? settings.earlyWindowTo : '');

  const range = useMemo(() => resolveRange(period, data, currentNight, custom), [period, data, currentNight, custom]);
  const sel = useMemo(() => select(data, range), [data, range]);
  const timeWindow = useMemo(() => {
    const f = parseTime(winFrom);
    const t = parseTime(winTo);
    return f !== null && t !== null && f !== t ? { from: f, to: t } : null;
  }, [winFrom, winTo]);

  const summary = useMemo(() => summarize(sel, binSize), [sel, binSize]);
  const bins = useMemo(() => trimBins(histogram(sel.events, binSize)), [sel, binSize]);
  const top = useMemo(() => topWindows(sel.events, binSize, 5), [sel, binSize]);
  const exact = useMemo(() => exactTimes(sel.events, 2, 5), [sel]);
  const perNight = useMemo(() => perNightSeries(sel, timeWindow), [sel, timeWindow]);
  const weekly = useMemo(() => weeklySeries(sel, timeWindow), [sel, timeWindow]);
  const weekdays = useMemo(() => weekdayStats(sel), [sel]);
  const outcomes = useMemo(() => outcomeCounts(sel.events), [sel]);
  const spans = useMemo(() => firstWakeToGetUp(sel), [sel]);
  const quality = useMemo(() => dataQuality(sel), [sel]);
  const winSum = useMemo(() => (timeWindow ? windowSummary(sel, timeWindow) : null), [sel, timeWindow]);

  if (!data.episodes.length) {
    return (
      <div className="view">
        <EmptyState icon="chart" title="Noch keine Schlafdaten">
          <p className="muted">Sobald du Nächte erfasst hast, erscheinen hier Auswertungen zu Aufwachzeiten, Häufigkeiten und Mustern.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('heute')}>
            Erste Nacht erfassen
          </button>
        </EmptyState>
      </div>
    );
  }

  const winLabel = timeWindow ? `${formatMinutes(timeWindow.from)}–${formatMinutes(timeWindow.to)}` : '';
  const rangeText = range ? `${formatDate(range.from)} – ${formatDate(range.to)}` : '';

  return (
    <div className="view stats">
      {/* ---------- Zeitraum ---------- */}
      <div className="card">
        <Segmented label="Zeitraum" value={period} options={PERIODS} onChange={setPeriod} hideLabel />
        {period === 'custom' && (
          <div className="range-row">
            <div>
              <span className="field-label" aria-hidden="true">Von (Nacht)</span>
              <PickerInput type="date" label="Zeitraum von (Nacht)" value={custom.from} max={currentNight} onChange={(v) => v && setCustom((c) => ({ ...c, from: v }))} />
            </div>
            <div>
              <span className="field-label" aria-hidden="true">Bis (Nacht)</span>
              <PickerInput type="date" label="Zeitraum bis (Nacht)" value={custom.to} max={currentNight} onChange={(v) => v && setCustom((c) => ({ ...c, to: v }))} />
            </div>
          </div>
        )}
        <p className="muted small range-text">
          {PERIOD_TEXT[period]} · {rangeText} · {nights(sel.episodes.length)} dokumentiert
        </p>
      </div>

      {sel.episodes.length === 0 ? (
        <EmptyState icon="calendar" title="Keine Daten im gewählten Zeitraum">
          <p className="muted">Wähle einen anderen Zeitraum oder erfasse Nächte im Kalender.</p>
        </EmptyState>
      ) : (
        <>
          {/* ---------- A. Zusammenfassung ---------- */}
          <Section title="Zusammenfassung">
            <div className="tiles">
              <Tile label="Dokumentierte Nächte" value={String(summary.nights)} />
              <Tile label="Aufwachereignisse" value={String(summary.events)} />
              <Tile label="Ø pro dokumentierter Nacht" value={summary.avgEventsPerNight === null ? '–' : formatNumber(summary.avgEventsPerNight)} sub={`${summary.events} ÷ ${summary.nights}`} />
              <Tile label="Nächte mit ≥ 2 Ereignissen" value={String(summary.nightsWithAtLeastTwo)} sub={`von ${summary.nights} · ${formatPercent(summary.nightsWithAtLeastTwo, summary.nights)}`} />
              <Tile
                wide
                label={`Häufigstes Zeitfenster (${binSize} min)`}
                value={summary.mostCommonWindow ? summary.mostCommonWindow.label : '–'}
                sub={
                  summary.mostCommonWindow
                    ? `in ${nights(summary.mostCommonWindow.nights)} von ${summary.nights} · ${events(summary.mostCommonWindow.events)}`
                    : summary.mostCommonWindowReason
                }
              />
              <Tile
                label="Aufstehzeit Ø / Median"
                value={summary.getUp.n ? `${formatMinutes(summary.getUp.mean!)} / ${formatMinutes(summary.getUp.median!)}` : '–'}
                sub={summary.getUp.n ? `aus ${nights(summary.getUp.n)}` : 'Noch keine Aufstehzeit erfasst'}
              />
              <Tile label="Nächte mit Aufstehzeit" value={`${summary.getUp.n} von ${summary.nights}`} sub={formatPercent(summary.getUp.n, summary.nights)} />
              <Tile
                wide
                label="Ereignisse mit bekanntem Ausgang"
                value={summary.outcomeKnown.total ? formatPercent(summary.outcomeKnown.known, summary.outcomeKnown.total) : '–'}
                sub={summary.outcomeKnown.total ? `${summary.outcomeKnown.known} von ${events(summary.outcomeKnown.total)}` : 'Keine Ereignisse im Zeitraum'}
              />
            </div>
          </Section>

          {/* ---------- B. Verteilung ---------- */}
          <Section title="Verteilung der Aufwachzeiten">
            <Segmented
              label="Intervall"
              value={binSize}
              options={BIN_SIZES.map((b) => ({ value: b, label: `${b} min` }))}
              onChange={setBinSize}
              hideLabel
            />
            {sel.events.length === 0 ? (
              <p className="muted">Im Zeitraum wurden keine Aufwachereignisse erfasst.</p>
            ) : (
              <>
                <Switch label="Anteile anzeigen" checked={showShare} onChange={setShowShare} />
                <ColumnChart
                  title={`Aufwachereignisse je ${binSize}-Minuten-Intervall`}
                  columns={bins.map((b) => ({
                    key: String(b.start),
                    label: formatMinutes(b.start),
                    value: b.events,
                    detail: `${b.label}: ${events(b.events)} (${formatPercent(b.events, sel.events.length)}) in ${nights(b.nights)}`,
                  }))}
                  tickEvery={Math.max(1, 60 / binSize)}
                  showValueLabels
                  valueLabel={(c) => (showShare ? `${Math.round(((c.value ?? 0) / sel.events.length) * 100)}%` : String(c.value))}
                  tableHeaders={['Intervall ab', 'Ereignisse']}
                />
                {showShare && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Intervall</th>
                        <th scope="col" className="num">Ereignisse</th>
                        <th scope="col" className="num">Anteil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bins.filter((b) => b.events).map((b) => (
                        <tr key={b.start}>
                          <td>{b.label}</td>
                          <td className="num">{b.events}</td>
                          <td className="num">{formatPercent(b.events, sel.events.length)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="muted small">Anteil an allen {events(sel.events.length)} im Zeitraum</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
                <p className="footnote">Intervallgrenzen: Beginn inklusive, z. B. 03:30–03:44 umfasst 03:30:00 bis 03:44:59. Achse beginnt am Abend.</p>
              </>
            )}
          </Section>

          {/* ---------- C. Häufigste Uhrzeiten ---------- */}
          <Section title="Häufigste Zeitfenster">
            {top.length === 0 ? (
              <p className="muted">Keine Aufwachereignisse im Zeitraum.</p>
            ) : (
              <>
                <table className="data-table">
                  <caption className="sr-only">Häufigste Zeitfenster, sortiert nach betroffenen Nächten</caption>
                  <thead>
                    <tr>
                      <th scope="col">Zeitfenster</th>
                      <th scope="col" className="num">Nächte</th>
                      <th scope="col" className="num">Ereignisse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((b) => (
                      <tr key={b.start}>
                        <td>{b.label}</td>
                        <td className="num">
                          {b.nights} <small className="muted">/ {summary.nights}</small>
                        </td>
                        <td className="num">{b.events}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="footnote">
                  Sortiert nach Anzahl der Nächte, in denen das Zeitfenster mindestens einmal vorkam. Mehrfaches Aufwachen im selben Fenster
                  derselben Nacht zählt als mehrere Ereignisse, aber nur als eine Nacht.
                </p>
                <h4 className="subhead">Exakt gleiche Uhrzeiten</h4>
                {exact.length === 0 ? (
                  <p className="muted small">Keine Uhrzeit (HH:MM) kam mehr als einmal vor.</p>
                ) : (
                  <ul className="chips">
                    {exact.map((x) => (
                      <li key={x.minute} className="chip">
                        <strong>{x.label}</strong> {x.events}× in {nights(x.nights)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Section>

          {/* ---------- D. Verlauf ---------- */}
          <Section title="Verlauf">
            <div className="window-row">
              <span className="field-label">Zeitfenster</span>
              <div>
                <PickerInput type="time" label="Zeitfenster von" value={winFrom} onChange={setWinFrom} />
              </div>
              <span aria-hidden="true">–</span>
              <div>
                <PickerInput type="time" label="Zeitfenster bis" value={winTo} onChange={setWinTo} />
              </div>
            </div>
            {!timeWindow ? (
              <Notice>Gib ein Zeitfenster mit zwei unterschiedlichen Uhrzeiten ein (z. B. 03:00–04:00), um diese Uhrzeit über mehrere Wochen zu verfolgen.</Notice>
            ) : (
              winSum && (
                <p className="window-summary">
                  <strong>{winLabel} Uhr:</strong> {events(winSum.events)} in {nights(winSum.nights)} von {summary.nights} dokumentierten (
                  {formatPercent(winSum.nights, summary.nights)} der Nächte)
                </p>
              )
            )}

            <h4 className="subhead">Aufwachereignisse pro Nacht</h4>
            {range && rangeLength(range) <= MAX_NIGHT_BARS ? (
              <ColumnChart
                title="Aufwachereignisse pro Nacht"
                columns={perNight.map((p) => ({
                  key: p.nightDate,
                  label: formatDateShort(p.nightDate).slice(0, 5).replace(/\.$/, ''),
                  value: p.events,
                  detail:
                    p.events === null
                      ? `${weekdayShort(p.nightDate)} ${formatDate(p.nightDate)}: nicht dokumentiert`
                      : `${weekdayShort(p.nightDate)} ${formatDate(p.nightDate)}: ${events(p.events)}${timeWindow ? `, davon ${p.windowEvents} im Zeitfenster` : ''}`,
                }))}
                tableHeaders={['Nacht', 'Ereignisse']}
              />
            ) : (
              <p className="muted small">Bei mehr als {MAX_NIGHT_BARS} Nächten wird der Verlauf nur wochenweise dargestellt.</p>
            )}
            <p className="legend-inline">
              <span className="missing-dot" aria-hidden="true" /> = Nacht nicht dokumentiert (kein Nullwert)
            </p>

            {timeWindow && (
              <>
                <h4 className="subhead">Nächte mit Aufwachen {winLabel} je Kalenderwoche</h4>
                <ColumnChart
                  title={`Nächte mit Aufwachen zwischen ${winLabel} je Kalenderwoche`}
                  columns={weekly.map((w) => ({
                    key: w.key,
                    label: String(w.label.replace('KW ', '')),
                    value: w.documentedNights ? w.nightsWithWindowEvent : null,
                    detail: w.documentedNights
                      ? `${w.label}: ${w.nightsWithWindowEvent} von ${nights(w.documentedNights)} (${events(w.windowEvents)} im Fenster)`
                      : `${w.label}: keine Nacht dokumentiert`,
                  }))}
                  tableHeaders={['KW', 'Nächte im Zeitfenster']}
                />
              </>
            )}

            <h4 className="subhead">Aufwachereignisse je Kalenderwoche</h4>
            <ColumnChart
              title="Aufwachereignisse je Kalenderwoche"
              columns={weekly.map((w) => ({
                key: w.key,
                label: w.label.replace('KW ', ''),
                value: w.documentedNights ? w.events : null,
                detail: w.documentedNights ? `${w.label}: ${events(w.events)} in ${nights(w.documentedNights)}` : `${w.label}: keine Nacht dokumentiert`,
              }))}
              tableHeaders={['KW', 'Ereignisse']}
            />

            <h4 className="subhead">Ø Ereignisse pro dokumentierter Nacht je Woche</h4>
            <ColumnChart
              title="Durchschnittliche Aufwachereignisse pro dokumentierter Nacht je Kalenderwoche"
              columns={weekly.map((w) => ({
                key: w.key,
                label: w.label.replace('KW ', ''),
                value: w.avgPerNight,
                detail:
                  w.avgPerNight === null
                    ? `${w.label}: keine Nacht dokumentiert`
                    : `${w.label}: Ø ${formatNumber(w.avgPerNight)} (${w.events} ÷ ${w.documentedNights})`,
              }))}
              formatValue={(v) => formatNumber(v)}
              tableHeaders={['KW', 'Ø pro Nacht']}
            />
            <p className="footnote">Achse = Kalenderwoche (ISO). Wochen ohne dokumentierte Nacht bleiben leer.</p>
          </Section>

          {/* ---------- E. Wochentage ---------- */}
          <Section title="Wochentage">
            <BarList
              label="Durchschnittliche Aufwachereignisse je Wochentag"
              rows={weekdays.map((w) => ({
                key: String(w.weekday),
                label: w.label,
                value: w.avgPerNight,
                text: w.avgPerNight === null ? 'keine Daten' : `Ø ${formatNumber(w.avgPerNight)}`,
                sub: w.nights ? `${events(w.events)} · ${nights(w.nights)}${w.nights < 2 ? ' · wenig Daten' : ''}` : undefined,
              }))}
            />
            <p className="footnote">
              Wochentag = Abend des Nachtbeginns. Der Durchschnitt bezieht sich auf die je Wochentag dokumentierten Nächte, damit unterschiedlich viele
              Aufzeichnungen nicht verzerren.
            </p>
          </Section>

          {/* ---------- F. Verhalten ---------- */}
          <Section title="Verhalten nach dem Aufwachen">
            {sel.events.length === 0 ? (
              <p className="muted">Keine Aufwachereignisse im Zeitraum.</p>
            ) : (
              <BarList
                label="Verhalten nach dem Aufwachen"
                max={sel.events.length}
                rows={outcomes.map((o) => ({
                  key: o.outcome,
                  label: OUTCOME_LABELS_SHORT[o.outcome],
                  className: `o-${o.outcome}`,
                  icon: <Icon name={OUTCOME_ICONS[o.outcome]} size={16} />,
                  value: o.count,
                  text: `${o.count}`,
                  sub: formatPercent(o.count, sel.events.length),
                }))}
              />
            )}
            <p className="muted small">Basis: {events(sel.events.length)} im Zeitraum.</p>

            <h4 className="subhead">Zeitspanne zwischen erstem dokumentierten Aufwachen und Aufstehen</h4>
            {spans.n === 0 ? (
              <p className="muted small">Benötigt Nächte mit mindestens einem Aufwachereignis vor der erfassten Aufstehzeit.</p>
            ) : (
              <div className="tiles">
                <Tile label="Durchschnitt" value={formatDuration(spans.mean!)} />
                <Tile label="Median" value={formatDuration(spans.median!)} />
                <Tile wide label="Spannweite" value={`${formatDuration(spans.min!)} – ${formatDuration(spans.max!)}`} sub={`aus ${nights(spans.n)}`} />
              </div>
            )}
            <p className="footnote">
              Dies ist die Zeitspanne zwischen zwei Ereignissen – keine tatsächliche Wachzeit. Dazwischen kann wieder geschlafen worden sein.
            </p>
          </Section>

          {/* ---------- G. Datenqualität ---------- */}
          <Section title="Datenqualität">
            <ul className="quality">
              <li>
                <span>Dokumentierte Nächte im Zeitraum</span>
                <strong>
                  {quality.documentedNights} von {quality.daysInRange}
                </strong>
              </li>
              <li>
                <span>Nicht dokumentierte Nächte</span>
                <strong>{quality.undocumentedNights}</strong>
              </li>
              <li>
                <span>Nächte ohne Aufstehzeit</span>
                <strong>{quality.nightsWithoutGetUp}</strong>
              </li>
              <li>
                <span>Ereignisse mit unbekanntem Ausgang</span>
                <strong>{quality.unknownOutcomes}</strong>
              </li>
              {quality.nightsWithEventsAfterGetUp > 0 && (
                <li>
                  <span>Nächte mit Ereignis nach der Aufstehzeit</span>
                  <strong>{quality.nightsWithEventsAfterGetUp}</strong>
                </li>
              )}
            </ul>
            <p className="footnote">
              Nicht dokumentierte Nächte fließen in keine Berechnung ein – sie werden weder als „kein Aufwachen“ noch als Nullwert gezählt.
              Durchschnitte beruhen nur auf vorhandenen Werten.
            </p>
          </Section>

          <p className="disclaimer">
            <Icon name="info" size={16} /> Die Auswertung beschreibt nur deine eigenen Aufzeichnungen. Sie ist keine medizinische Diagnose.
          </p>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card section" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Tile({ label, value, sub, wide }: { label: string; value: string; sub?: string; wide?: boolean }) {
  return (
    <div className={wide ? 'tile wide' : 'tile'}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}
