import { describe, expect, it } from 'vitest';
import { addWakeEvent, setEpisodeDetails } from '../src/lib/episodes';
import type { Outcome, WakeData } from '../src/lib/model';
import {
  binLabel,
  binStart,
  dataQuality,
  exactTimes,
  firstWakeToGetUp,
  histogram,
  mean,
  median,
  outcomeCounts,
  perNightSeries,
  resolveRange,
  select,
  summarize,
  timeOfDayStats,
  topWindows,
  trimBins,
  weekdayStats,
  weeklySeries,
  windowSummary,
} from '../src/lib/stats';
import { addDays, formatMinutes, inTimeWindow } from '../src/lib/time';
import { apply, at, ctx, empty } from './helpers';

/** Baut Testdaten: nightDate → Liste [HH:MM, outcome] (Uhrzeiten < 18:00 liegen am Folgetag). */
function build(nights: Record<string, { events?: [string, Outcome?][]; up?: string }>): WakeData {
  const c = ctx();
  let d = empty();
  for (const [night, spec] of Object.entries(nights)) {
    for (const [time, outcome] of spec.events ?? []) {
      const date = +time.slice(0, 2) >= 18 ? night : addDays(night, 1);
      d = apply(d, addWakeEvent(d, { occurredAt: at(date, time), outcome: outcome ?? 'fell_asleep_again' }, c, night, { allowDuplicate: true }).changes);
      c.tick();
    }
    if (spec.up) d = apply(d, setEpisodeDetails(d, night, { gotUpAt: at(addDays(night, 1), spec.up) }, c).changes);
    if (!spec.events?.length && !spec.up) d = apply(d, setEpisodeDetails(d, night, { note: 'ruhig' }, c).changes);
  }
  return d;
}

const all = (d: WakeData) => select(d, resolveRange('all', d, '2026-10-20'));

describe('Mittelwert und Median', () => {
  it('berechnet korrekt bei gerader und ungerader Anzahl', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
  });
  it('mittelt Uhrzeiten über Mitternacht korrekt (23:50 und 00:10 → 00:00)', () => {
    const r = timeOfDayStats([23 * 60 + 50, 10]);
    expect(formatMinutes(r.mean!)).toBe('00:00');
    expect(formatMinutes(r.median!)).toBe('00:00');
  });
  it('Aufstehzeit: Durchschnitt und Median', () => {
    const d = build({ '2026-10-01': { up: '06:00' }, '2026-10-02': { up: '06:30' }, '2026-10-03': { up: '08:00' } });
    const s = summarize(all(d), 15);
    expect(s.getUp.n).toBe(3);
    expect(formatMinutes(s.getUp.mean!)).toBe('06:50');
    expect(formatMinutes(s.getUp.median!)).toBe('06:30');
  });
});

describe('Intervalle 5/15/30/60 Minuten', () => {
  const d = build({ '2026-10-01': { events: [['03:34'], ['03:37'], ['03:41'], ['03:44'], ['03:45']] } });
  it('Intervallgrenzen sind eindeutig definiert', () => {
    expect(binLabel(binStart(3 * 60 + 34, 15), 15)).toBe('03:30–03:44');
    expect(binLabel(binStart(3 * 60 + 45, 15), 15)).toBe('03:45–03:59');
    expect(binLabel(binStart(3 * 60 + 34, 5), 5)).toBe('03:30–03:34');
    expect(binLabel(binStart(3 * 60 + 34, 30), 30)).toBe('03:30–03:59');
    expect(binLabel(binStart(3 * 60 + 34, 60), 60)).toBe('03:00–03:59');
    expect(binLabel(binStart(23 * 60 + 59, 60), 60)).toBe('23:00–23:59');
  });
  it('03:34, 03:37, 03:41, 03:44 liegen im 15-min-Modus im selben Intervall', () => {
    const h = histogram(all(d).events, 15);
    expect(h.find((b) => b.label === '03:30–03:44')!.events).toBe(4);
    expect(h.find((b) => b.label === '03:45–03:59')!.events).toBe(1);
  });
  it('Intervallgröße verändert die Verteilung', () => {
    const ev = all(d).events;
    const counts = (size: 5 | 15 | 30 | 60) => histogram(ev, size).filter((b) => b.events).map((b) => [b.label, b.events]);
    expect(counts(5)).toEqual([['03:30–03:34', 1], ['03:35–03:39', 1], ['03:40–03:44', 2], ['03:45–03:49', 1]]);
    expect(counts(15)).toEqual([['03:30–03:44', 4], ['03:45–03:59', 1]]);
    expect(counts(30)).toEqual([['03:30–03:59', 5]]);
    expect(counts(60)).toEqual([['03:00–03:59', 5]]);
  });
  it('Verteilung deckt 24 h ab, beginnt um 18:00, Anteile summieren sich zu 1', () => {
    for (const size of [5, 15, 30, 60] as const) {
      const h = histogram(all(d).events, size);
      expect(h).toHaveLength(1440 / size);
      expect(h[0].label.startsWith('18:00')).toBe(true);
      expect(h.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1);
    }
  });
  it('trimBins lässt leere Zwischenintervalle stehen', () => {
    const d2 = build({ '2026-10-01': { events: [['02:05'], ['04:05']] } });
    const t = trimBins(histogram(all(d2).events, 60));
    expect(t.map((b) => b.label)).toEqual(['01:00–01:59', '02:00–02:59', '03:00–03:59', '04:00–04:59', '05:00–05:59']);
    expect(trimBins(histogram([], 60))).toEqual([]);
  });
});

describe('Ereignisse vs. betroffene Nächte', () => {
  // Nacht 1: dreimal im selben Intervall, Nacht 2: einmal; Nacht 3: anderes Intervall zweimal in zwei Nächten
  const d = build({
    '2026-10-01': { events: [['03:31'], ['03:35'], ['03:40']] },
    '2026-10-02': { events: [['03:33'], ['05:10']] },
    '2026-10-03': { events: [['05:12']] },
  });
  it('unterscheidet Ereignisanzahl und Nächte je Intervall', () => {
    const b = histogram(all(d).events, 15).find((x) => x.label === '03:30–03:44')!;
    expect(b.events).toBe(4);
    expect(b.nights).toBe(2);
  });
  it('Rangliste sortiert nach Nächten, nicht nach Ereignissen', () => {
    const top = topWindows(all(d).events, 15);
    expect(top.map((t) => [t.label, t.nights, t.events])).toEqual([
      ['03:30–03:44', 2, 4],
      ['05:00–05:14', 2, 2],
    ]);
  });
  it('exakt identische Uhrzeiten werden separat gezählt', () => {
    const d2 = build({ '2026-10-01': { events: [['03:37'], ['03:37']] }, '2026-10-02': { events: [['03:37'], ['04:00']] } });
    expect(exactTimes(all(d2).events)).toEqual([{ minute: 217, label: '03:37', events: 3, nights: 2 }]);
  });
  it('Zeitfenster zählt Ereignisse und Nächte getrennt', () => {
    expect(windowSummary(all(d), { from: 180, to: 240 })).toEqual({ events: 4, nights: 2, documentedNights: 3 });
  });
});

describe('Zusammenfassung, leere und unvollständige Daten', () => {
  it('liefert bei leeren Daten keine Pseudo-Kennzahlen', () => {
    const s = summarize(select(empty(), null), 15);
    expect(s.nights).toBe(0);
    expect(s.avgEventsPerNight).toBeNull();
    expect(s.getUp.mean).toBeNull();
    expect(s.mostCommonWindow).toBeNull();
    expect(s.mostCommonWindowReason).toMatch(/Ab 3/);
    expect(resolveRange('all', empty(), '2026-10-20')).toBeNull();
    expect(perNightSeries(select(empty(), null), null)).toEqual([]);
  });
  it('zählt dokumentierte Nächte ohne Ereignis mit 0, fehlende Nächte nicht', () => {
    const d = build({ '2026-10-01': { events: [['03:00'], ['04:00']] }, '2026-10-03': {} });
    const sel = select(d, { from: '2026-10-01', to: '2026-10-04' });
    const s = summarize(sel, 15);
    expect(s.nights).toBe(2);
    expect(s.avgEventsPerNight).toBe(1); // 2 Ereignisse / 2 dokumentierte Nächte, nicht / 4 Kalendertage
    expect(s.nightsWithAtLeastTwo).toBe(1);
    expect(s.nightsWithoutEvents).toBe(1);
    expect(perNightSeries(sel, null).map((p) => p.events)).toEqual([2, null, 0, null]);
    const q = dataQuality(sel);
    expect(q).toMatchObject({ daysInRange: 4, documentedNights: 2, undocumentedNights: 2, nightsWithoutGetUp: 2 });
  });
  it('fehlende Aufstehzeit wird nicht als 00:00 gewertet', () => {
    const d = build({ '2026-10-01': { up: '07:00' }, '2026-10-02': { events: [['03:00']] } });
    const s = summarize(all(d), 15);
    expect(s.getUp.n).toBe(1);
    expect(formatMinutes(s.getUp.mean!)).toBe('07:00');
  });
  it('Anteil bekannter Ausgänge mit Nenner', () => {
    const d = build({ '2026-10-01': { events: [['02:00', 'unknown'], ['03:00', 'stayed_awake'], ['04:00', 'got_up'], ['05:00']] } });
    expect(summarize(all(d), 15).outcomeKnown).toEqual({ known: 3, total: 4 });
    expect(outcomeCounts(all(d).events).map((o) => o.count)).toEqual([1, 1, 1, 1]);
  });
  it('häufigstes Zeitfenster erst bei ausreichender Datenbasis', () => {
    expect(summarize(all(build({ '2026-10-01': { events: [['03:00'], ['03:05']] } })), 15).mostCommonWindow).toBeNull();
    const s = summarize(all(build({ '2026-10-01': { events: [['03:00'], ['03:05'], ['05:00']] } })), 15);
    expect(s.mostCommonWindow!.label).toBe('03:00–03:14');
  });
});

describe('Zeitspanne erstes Aufwachen → Aufstehen', () => {
  it('nutzt nur Nächte mit beiden Zeitpunkten', () => {
    const d = build({
      '2026-10-01': { events: [['03:37'], ['05:00']], up: '06:15' }, // 158 min
      '2026-10-02': { events: [['04:00']] }, // keine Aufstehzeit → ausgeschlossen
      '2026-10-03': { up: '06:00' }, // kein Ereignis → ausgeschlossen
      '2026-10-04': { events: [['05:30']], up: '06:00' }, // 30 min
    });
    const r = firstWakeToGetUp(all(d));
    expect(r.values).toEqual([158, 30]);
    expect(r.mean).toBe(94);
    expect(r.median).toBe(94);
  });
  it('ist sommerzeitsicher (Nacht 24./25.10.2026, Uhr wird zurückgestellt)', () => {
    const d = build({ '2026-10-24': { events: [['01:00']], up: '06:00' } });
    expect(firstWakeToGetUp(all(d)).values).toEqual([6 * 60]); // 01:00 MESZ → 06:00 MEZ = 6 h
  });
});

describe('Wochentage mit fehlenden Daten', () => {
  it('bezieht Durchschnitt auf dokumentierte Nächte je Wochentag', () => {
    // 2026-10-05 ist ein Montag
    const d = build({
      '2026-10-05': { events: [['03:00'], ['04:00']] }, // Mo
      '2026-10-12': { events: [] }, // Mo, dokumentiert ohne Ereignis
      '2026-10-06': { events: [['03:00']] }, // Di
    });
    const rows = weekdayStats(all(d));
    expect(rows[0]).toMatchObject({ label: 'Mo', nights: 2, events: 2, avgPerNight: 1, nightsWithEvents: 1 });
    expect(rows[1]).toMatchObject({ label: 'Di', nights: 1, events: 1, avgPerNight: 1 });
    expect(rows[2]).toMatchObject({ label: 'Mi', nights: 0, events: 0, avgPerNight: null });
  });
});

describe('Verlauf nach Kalenderwochen und Zeitfenster', () => {
  it('wertet Wochen getrennt aus und kennzeichnet Wochen ohne Daten mit null', () => {
    const d = build({
      '2026-10-05': { events: [['03:10'], ['05:00']] },
      '2026-10-06': { events: [['03:50']] },
      '2026-10-19': { events: [['02:00']] },
    });
    const sel = select(d, { from: '2026-10-05', to: '2026-10-25' });
    const w = weeklySeries(sel, { from: 180, to: 240 });
    expect(w.map((r) => r.label)).toEqual(['KW 41', 'KW 42', 'KW 43']);
    expect(w[0]).toMatchObject({ documentedNights: 2, events: 3, nightsWithWindowEvent: 2, windowEvents: 2, avgPerNight: 1.5 });
    expect(w[1]).toMatchObject({ documentedNights: 0, events: 0, avgPerNight: null });
    expect(w[2]).toMatchObject({ documentedNights: 1, nightsWithWindowEvent: 0 });
  });
  it('Zeitfenster über Mitternacht', () => {
    expect(inTimeWindow(23 * 60 + 45, 23 * 60 + 30, 60)).toBe(true);
    expect(inTimeWindow(30, 23 * 60 + 30, 60)).toBe(true);
    expect(inTimeWindow(60, 23 * 60 + 30, 60)).toBe(false);
    expect(inTimeWindow(180, 180, 240)).toBe(true);
    expect(inTimeWindow(240, 180, 240)).toBe(false);
  });
  it('Zeitraum „letzte 7 Tage“ umfasst genau 7 Nächte', () => {
    expect(resolveRange('7', empty(), '2026-10-15')).toEqual({ from: '2026-10-09', to: '2026-10-15' });
    expect(resolveRange('custom', empty(), '2026-10-15', { from: '2026-10-10', to: '2026-10-01' })).toEqual({ from: '2026-10-01', to: '2026-10-10' });
  });
  it('Korrektur einer Uhrzeit ändert die Auswertung', async () => {
    const { updateWakeEvent } = await import('../src/lib/episodes');
    let d = build({ '2026-10-01': { events: [['03:37']] } });
    expect(histogram(all(d).events, 15).find((b) => b.events)!.label).toBe('03:30–03:44');
    d = apply(d, updateWakeEvent(d, d.events[0].id, { occurredAt: at('2026-10-02', '04:02'), outcome: 'unknown' }, ctx()).changes);
    expect(histogram(all(d).events, 15).find((b) => b.events)!.label).toBe('04:00–04:14');
  });
});
