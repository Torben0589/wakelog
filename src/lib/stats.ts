/**
 * Statistik – rein beschreibend, unabhängig von der Darstellung testbar.
 *
 * Grundsätze
 * - Nenner sind immer DOKUMENTIERTE Nächte (vorhandene Episoden). Fehlende Nächte sind keine Nullwerte.
 * - Uhrzeit-Intervalle: Start = floor(Minute des Tages / Größe) × Größe, Ende inklusive Start + Größe − 1.
 *   15 min: 03:30–03:44 enthält 03:30:00 bis 03:44:59.
 * - Durchschnitt/Median von Uhrzeiten werden auf einer „Nachtachse“ ab 18:00 berechnet,
 *   damit 23:50 und 00:10 korrekt beieinander liegen.
 * - Zeitfenster [von, bis): Beginn inklusive, Ende exklusive; über Mitternacht möglich.
 */
import { type Outcome, type SleepEpisode, type WakeData, type WakeEvent, OUTCOMES } from './model';
import {
  MINUTES_PER_DAY,
  NIGHT_AXIS_START,
  addDays,
  daysBetween,
  formatMinutes,
  fromNightMinutes,
  inTimeWindow,
  isoWeek,
  minutesOfDay,
  mondayOf,
  parseDateKey,
  toNightMinutes,
} from './time';

export const BIN_SIZES = [5, 15, 30, 60] as const;
export type BinSize = (typeof BIN_SIZES)[number];

export type PeriodKey = '7' | '30' | '90' | 'all' | 'custom';

/** Mindestanzahl Ereignisse, ab der ein „häufigstes Zeitfenster“ ausgewiesen wird. */
export const MIN_EVENTS_FOR_PATTERN = 3;

export interface DateRange {
  from: string; // inkl. (nightDate)
  to: string; // inkl. (nightDate)
}

export interface TimeWindow {
  from: number; // Minute des Tages
  to: number;
}

export interface Selection {
  range: DateRange | null;
  episodes: SleepEpisode[];
  events: WakeEvent[];
  episodeById: Map<string, SleepEpisode>;
}

// ---------- Zeitraum ----------

export function resolveRange(period: PeriodKey, data: WakeData, currentNight: string, custom?: DateRange): DateRange | null {
  if (period === 'custom') {
    if (!custom) return null;
    return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
  }
  if (period === 'all') {
    if (!data.episodes.length) return null;
    const dates = data.episodes.map((e) => e.nightDate).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }
  const n = Number(period);
  return { from: addDays(currentNight, -(n - 1)), to: currentNight };
}

export function select(data: WakeData, range: DateRange | null): Selection {
  const episodes = range ? data.episodes.filter((e) => e.nightDate >= range.from && e.nightDate <= range.to) : [];
  const episodeById = new Map(episodes.map((e) => [e.id, e]));
  const events = data.events.filter((e) => episodeById.has(e.episodeId));
  return { range, episodes, events, episodeById };
}

export function rangeLength(range: DateRange): number {
  return daysBetween(range.from, range.to) + 1;
}

// ---------- Hilfsfunktionen ----------

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Durchschnitt/Median von Uhrzeiten (Minute des Tages) über die Nachtachse ab 18:00. */
export function timeOfDayStats(mins: number[]): { n: number; mean: number | null; median: number | null } {
  const night = mins.map(toNightMinutes);
  const m = mean(night);
  const md = median(night);
  return {
    n: mins.length,
    mean: m === null ? null : fromNightMinutes(Math.round(m)),
    median: md === null ? null : fromNightMinutes(Math.round(md)),
  };
}

const eventMinute = (e: WakeEvent) => minutesOfDay(new Date(e.occurredAt));

// ---------- Intervalle ----------

export function binStart(minOfDay: number, size: BinSize): number {
  return Math.floor(minOfDay / size) * size;
}

export function binLabel(start: number, size: BinSize): string {
  return `${formatMinutes(start)}–${formatMinutes(start + size - 1)}`;
}

export interface Bin {
  start: number;
  label: string;
  events: number;
  nights: number;
  /** Anteil an allen berücksichtigten Ereignissen (0…1) */
  share: number;
}

/** Vollständige Verteilung über 24 h, sortiert entlang der Nachtachse (Start 18:00). */
export function histogram(events: WakeEvent[], size: BinSize): Bin[] {
  const counts = new Map<number, { events: number; nights: Set<string> }>();
  for (const e of events) {
    const s = binStart(eventMinute(e), size);
    const c = counts.get(s) ?? { events: 0, nights: new Set<string>() };
    c.events++;
    c.nights.add(e.episodeId);
    counts.set(s, c);
  }
  const total = events.length;
  const bins: Bin[] = [];
  for (let i = 0; i < MINUTES_PER_DAY / size; i++) {
    const start = (NIGHT_AXIS_START + i * size) % MINUTES_PER_DAY;
    const c = counts.get(start);
    bins.push({ start, label: binLabel(start, size), events: c?.events ?? 0, nights: c?.nights.size ?? 0, share: total && c ? c.events / total : 0 });
  }
  return bins;
}

/** Schneidet leere Ränder ab (je ein leeres Intervall bleibt als Rand stehen). Leere Intervalle dazwischen bleiben sichtbar. */
export function trimBins(bins: Bin[]): Bin[] {
  const first = bins.findIndex((b) => b.events > 0);
  if (first < 0) return [];
  let last = bins.length - 1;
  while (bins[last].events === 0) last--;
  return bins.slice(Math.max(0, first - 1), Math.min(bins.length, last + 2));
}

/** Häufigste Zeitfenster: sortiert nach betroffenen Nächten, dann Ereignissen, dann Uhrzeit (Nachtachse). */
export function topWindows(events: WakeEvent[], size: BinSize, limit = 5): Bin[] {
  return histogram(events, size)
    .map((b, order) => ({ b, order }))
    .filter(({ b }) => b.events > 0)
    .sort((x, y) => y.b.nights - x.b.nights || y.b.events - x.b.events || x.order - y.order)
    .slice(0, limit)
    .map(({ b }) => b);
}

export interface ExactTime {
  minute: number;
  label: string;
  events: number;
  nights: number;
}

/** Exakt identische Uhrzeiten (HH:MM), die mindestens minCount-mal vorkommen. */
export function exactTimes(events: WakeEvent[], minCount = 2, limit = 5): ExactTime[] {
  const map = new Map<number, { events: number; nights: Set<string> }>();
  for (const e of events) {
    const m = eventMinute(e);
    const c = map.get(m) ?? { events: 0, nights: new Set<string>() };
    c.events++;
    c.nights.add(e.episodeId);
    map.set(m, c);
  }
  return [...map.entries()]
    .filter(([, c]) => c.events >= minCount)
    .map(([minute, c]) => ({ minute, label: formatMinutes(minute), events: c.events, nights: c.nights.size }))
    .sort((a, b) => b.nights - a.nights || b.events - a.events || toNightMinutes(a.minute) - toNightMinutes(b.minute))
    .slice(0, limit);
}

// ---------- Zusammenfassung ----------

export interface Summary {
  nights: number;
  events: number;
  avgEventsPerNight: number | null;
  nightsWithAtLeastTwo: number;
  nightsWithoutEvents: number;
  mostCommonWindow: Bin | null;
  mostCommonWindowReason?: string;
  getUp: { n: number; mean: number | null; median: number | null };
  outcomeKnown: { known: number; total: number };
}

export function summarize(sel: Selection, size: BinSize): Summary {
  const perEp = countByEpisode(sel.events);
  const nights = sel.episodes.length;
  const top = topWindows(sel.events, size, 1)[0] ?? null;
  let mostCommonWindow: Bin | null = null;
  let reason: string | undefined;
  if (sel.events.length < MIN_EVENTS_FOR_PATTERN) {
    reason = `Ab ${MIN_EVENTS_FOR_PATTERN} Aufwachereignissen wird ein häufigstes Zeitfenster ermittelt.`;
  } else if (!top || top.events < 2) {
    reason = 'Bisher kein Zeitfenster mit mehr als einem Ereignis.';
  } else {
    mostCommonWindow = top;
  }
  const getUps = sel.episodes.filter((e) => e.gotUpAt).map((e) => minutesOfDay(new Date(e.gotUpAt!)));
  return {
    nights,
    events: sel.events.length,
    avgEventsPerNight: nights ? sel.events.length / nights : null,
    nightsWithAtLeastTwo: sel.episodes.filter((e) => (perEp.get(e.id) ?? 0) >= 2).length,
    nightsWithoutEvents: sel.episodes.filter((e) => !perEp.get(e.id)).length,
    mostCommonWindow,
    mostCommonWindowReason: reason,
    getUp: timeOfDayStats(getUps),
    outcomeKnown: { known: sel.events.filter((e) => e.outcome !== 'unknown').length, total: sel.events.length },
  };
}

function countByEpisode(events: WakeEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) m.set(e.episodeId, (m.get(e.episodeId) ?? 0) + 1);
  return m;
}

// ---------- Verhalten ----------

export function outcomeCounts(events: WakeEvent[]): { outcome: Outcome; count: number; share: number }[] {
  return OUTCOMES.map((o) => {
    const count = events.filter((e) => e.outcome === o).length;
    return { outcome: o, count, share: events.length ? count / events.length : 0 };
  });
}

export interface SpanStats {
  n: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

/**
 * Zeitspanne zwischen dem ersten dokumentierten Aufwachereignis und dem Aufstehen (Minuten).
 * Ausdrücklich KEINE Wachzeit. Das als Aufstehen verknüpfte Ereignis selbst zählt nicht als „erstes Aufwachen“.
 */
export function firstWakeToGetUp(sel: Selection): SpanStats & { values: number[] } {
  const values: number[] = [];
  for (const ep of sel.episodes) {
    if (!ep.gotUpAt) continue;
    const up = Date.parse(ep.gotUpAt);
    const times = sel.events
      .filter((e) => e.episodeId === ep.id && e.id !== ep.gotUpEventId)
      .map((e) => Date.parse(e.occurredAt))
      .filter((t) => t < up);
    if (!times.length) continue;
    values.push(Math.round((up - Math.min(...times)) / 60000)); // absolute Differenz → sommerzeitsicher
  }
  return {
    values,
    n: values.length,
    mean: mean(values),
    median: median(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

// ---------- Wochentage ----------

export interface WeekdayRow {
  /** 0 = Montag … 6 = Sonntag (Wochentag des Nachtbeginns) */
  weekday: number;
  label: string;
  nights: number;
  events: number;
  avgPerNight: number | null;
  nightsWithEvents: number;
}

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function weekdayStats(sel: Selection): WeekdayRow[] {
  const perEp = countByEpisode(sel.events);
  const rows: WeekdayRow[] = WEEKDAY_LABELS.map((label, weekday) => ({ weekday, label, nights: 0, events: 0, avgPerNight: null, nightsWithEvents: 0 }));
  for (const ep of sel.episodes) {
    const wd = (parseDateKey(ep.nightDate).getDay() + 6) % 7;
    const n = perEp.get(ep.id) ?? 0;
    rows[wd].nights++;
    rows[wd].events += n;
    if (n > 0) rows[wd].nightsWithEvents++;
  }
  for (const r of rows) r.avgPerNight = r.nights ? r.events / r.nights : null;
  return rows;
}

// ---------- Verlauf ----------

export interface NightPoint {
  nightDate: string;
  /** null = Nacht nicht dokumentiert (kein Nullwert!) */
  events: number | null;
  windowEvents: number | null;
}

export function perNightSeries(sel: Selection, window: TimeWindow | null): NightPoint[] {
  if (!sel.range) return [];
  const byNight = new Map(sel.episodes.map((e) => [e.nightDate, e]));
  const perEp = countByEpisode(sel.events);
  const perEpWindow = window ? countByEpisode(sel.events.filter((e) => inTimeWindow(eventMinute(e), window.from, window.to))) : new Map();
  const out: NightPoint[] = [];
  const len = rangeLength(sel.range);
  for (let i = 0; i < len; i++) {
    const d = addDays(sel.range.from, i);
    const ep = byNight.get(d);
    out.push({ nightDate: d, events: ep ? perEp.get(ep.id) ?? 0 : null, windowEvents: ep && window ? perEpWindow.get(ep.id) ?? 0 : null });
  }
  return out;
}

export interface WeekRow {
  key: string; // "2026-W42"
  label: string; // "KW 42"
  monday: string;
  documentedNights: number;
  events: number;
  nightsWithWindowEvent: number;
  windowEvents: number;
  avgPerNight: number | null;
}

export function weeklySeries(sel: Selection, window: TimeWindow | null): WeekRow[] {
  if (!sel.range) return [];
  const rows: WeekRow[] = [];
  const index = new Map<string, WeekRow>();
  for (let m = mondayOf(sel.range.from); m <= sel.range.to; m = addDays(m, 7)) {
    const w = isoWeek(m);
    const key = `${w.year}-W${String(w.week).padStart(2, '0')}`;
    const row: WeekRow = { key, label: `KW ${w.week}`, monday: m, documentedNights: 0, events: 0, nightsWithWindowEvent: 0, windowEvents: 0, avgPerNight: null };
    rows.push(row);
    index.set(m, row);
  }
  const perEp = countByEpisode(sel.events);
  const winEvents = window ? sel.events.filter((e) => inTimeWindow(eventMinute(e), window.from, window.to)) : [];
  const perEpWin = countByEpisode(winEvents);
  for (const ep of sel.episodes) {
    const row = index.get(mondayOf(ep.nightDate));
    if (!row) continue;
    row.documentedNights++;
    row.events += perEp.get(ep.id) ?? 0;
    const w = perEpWin.get(ep.id) ?? 0;
    row.windowEvents += w;
    if (w > 0) row.nightsWithWindowEvent++;
  }
  for (const r of rows) r.avgPerNight = r.documentedNights ? r.events / r.documentedNights : null;
  return rows;
}

/** Ereignisse im Zeitfenster gesamt: Ereignisanzahl vs. betroffene Nächte. */
export function windowSummary(sel: Selection, window: TimeWindow) {
  const evs = sel.events.filter((e) => inTimeWindow(eventMinute(e), window.from, window.to));
  return { events: evs.length, nights: new Set(evs.map((e) => e.episodeId)).size, documentedNights: sel.episodes.length };
}

// ---------- Datenqualität ----------

export interface DataQuality {
  daysInRange: number;
  documentedNights: number;
  undocumentedNights: number;
  nightsWithoutGetUp: number;
  unknownOutcomes: number;
  nightsWithEventsAfterGetUp: number;
}

export function dataQuality(sel: Selection): DataQuality {
  const days = sel.range ? rangeLength(sel.range) : 0;
  let after = 0;
  for (const ep of sel.episodes) {
    if (!ep.gotUpAt) continue;
    const up = Date.parse(ep.gotUpAt);
    if (sel.events.some((e) => e.episodeId === ep.id && Date.parse(e.occurredAt) > up)) after++;
  }
  return {
    daysInRange: days,
    documentedNights: sel.episodes.length,
    undocumentedNights: Math.max(0, days - sel.episodes.length),
    nightsWithoutGetUp: sel.episodes.filter((e) => !e.gotUpAt).length,
    unknownOutcomes: sel.events.filter((e) => e.outcome === 'unknown').length,
    nightsWithEventsAfterGetUp: after,
  };
}

export function formatPercent(part: number, total: number): string {
  if (!total) return '–';
  return `${Math.round((part / total) * 100)} %`;
}

export function formatNumber(v: number, digits = 1): string {
  return v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
