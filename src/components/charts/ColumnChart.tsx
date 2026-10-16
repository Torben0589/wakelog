import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

export interface Column {
  key: string;
  /** Achsenbeschriftung (kurz) */
  label: string;
  /** null = keine Daten (wird als Lücke mit Markierung gezeigt, nicht als 0) */
  value: number | null;
  /** Ausführliche Beschreibung für Auswahl, Screenreader und Tabelle */
  detail: string;
}

/**
 * Säulendiagramm in reinem SVG. Farben kommen aus CSS-Variablen (Hell/Dunkel).
 * Antippen einer Säule zeigt den Wert. Leere Säulen (null) werden als offener Kreis markiert.
 */
export function ColumnChart({
  title,
  columns,
  height = 180,
  tickEvery,
  formatValue = (v) => String(v),
  showValueLabels = false,
  valueLabel,
  unit = '',
  emptyText = 'Keine Daten',
  tableHeaders = ['Bereich', 'Wert'],
}: {
  title: string;
  columns: Column[];
  height?: number;
  /** Jede n-te Achsenbeschriftung zeigen (Standard: automatisch) */
  tickEvery?: number;
  formatValue?: (v: number) => string;
  showValueLabels?: boolean;
  valueLabel?: (c: Column) => string;
  unit?: string;
  emptyText?: string;
  tableHeaders?: [string, string];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [selected, setSelected] = useState<number | null>(null);
  const descId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setSelected(null), [columns]);

  const values = columns.map((c) => c.value ?? 0);
  const rawMax = Math.max(0, ...values);
  const max = niceMax(rawMax);
  const padL = 30;
  const padR = 6;
  const padT = showValueLabels ? 18 : 8;
  const padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = Math.max(1, columns.length);
  const slot = plotW / n;
  const barW = Math.max(2, Math.min(28, slot * 0.72));
  const autoTick = Math.max(1, Math.ceil((n * 34) / plotW));
  const every = tickEvery ? Math.max(tickEvery, autoTick) : autoTick;
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];
  const y = (v: number) => padT + plotH - (max ? (v / max) * plotH : 0);
  const sel = selected !== null ? columns[selected] : null;
  const hasAny = columns.some((c) => c.value !== null && c.value > 0);

  return (
    <figure className="chart">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="chart-readout" aria-live="polite">
        {sel ? sel.detail : hasAny ? 'Säule antippen für Details' : emptyText}
      </div>
      <div ref={wrapRef} className="chart-wrap">
        <svg width={width} height={height} role="img" aria-labelledby={descId} className="chart-svg">
          <title id={descId}>{`${title}: ${columns.filter((c) => c.value).map((c) => c.detail).slice(0, 12).join('; ') || emptyText}`}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="chart-axis">
                {Number.isInteger(t) ? t : formatValue(t)}
                {unit}
              </text>
            </g>
          ))}
          {columns.map((c, i) => {
            const cx = padL + slot * i + slot / 2;
            const isSel = selected === i;
            return (
              <g key={c.key} onClick={() => setSelected(isSel ? null : i)} className="chart-col">
                {/* große, unsichtbare Trefferfläche für Touch */}
                <rect x={padL + slot * i} y={padT} width={slot} height={plotH + padB} fill="transparent" />
                {c.value === null ? (
                  <circle cx={cx} cy={padT + plotH - 4} r={Math.min(3, barW / 2)} className="chart-missing" />
                ) : c.value > 0 ? (
                  <rect
                    x={cx - barW / 2}
                    y={y(c.value)}
                    width={barW}
                    height={Math.max(1, padT + plotH - y(c.value))}
                    rx={Math.min(4, barW / 3)}
                    className={isSel ? 'chart-bar selected' : 'chart-bar'}
                  />
                ) : null}
                {showValueLabels && c.value !== null && c.value > 0 && barW >= 10 && (
                  <text x={cx} y={y(c.value) - 4} textAnchor="middle" className="chart-value">
                    {valueLabel ? valueLabel(c) : formatValue(c.value)}
                  </text>
                )}
                {i % every === 0 && (
                  <text x={cx} y={height - 6} textAnchor="middle" className={isSel ? 'chart-axis strong' : 'chart-axis'}>
                    {c.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={padL} x2={width - padR} y1={padT + plotH} y2={padT + plotH} className="chart-baseline" />
        </svg>
      </div>
      <details className="chart-table">
        <summary>Werte als Tabelle</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{tableHeaders[0]}</th>
              <th scope="col">{tableHeaders[1]}</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td>{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Obergrenze der Y-Achse: ganzzahlig, bei > 4 gerade (damit die Mittellinie ganzzahlig ist). */
function niceMax(v: number): number {
  if (v <= 4) return Math.max(1, Math.ceil(v));
  const m = Math.ceil(v);
  return m % 2 ? m + 1 : m;
}

/** Horizontale Balkenliste (z. B. Wochentage, Verhalten) – gut lesbar auf schmalen Displays. */
export function BarList({
  rows,
  max,
  label,
}: {
  label: string;
  max?: number;
  rows: { key: string; label: string; value: number | null; text: string; sub?: string; className?: string; icon?: ReactNode }[];
}) {
  const m = max ?? Math.max(0, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="barlist" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className={r.className}>
          <span className="barlist-label">
            {r.icon}
            {r.label}
          </span>
          <span className="barlist-track" aria-hidden="true">
            {r.value !== null && <span className="barlist-fill" style={{ width: `${m ? Math.max(r.value > 0 ? 2 : 0, (r.value / m) * 100) : 0}%` }} />}
          </span>
          <span className="barlist-value">
            {r.text}
            {r.sub && <small>{r.sub}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
