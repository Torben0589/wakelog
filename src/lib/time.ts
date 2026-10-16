/**
 * Zeit- und Datumslogik. Alle Berechnungen nutzen die lokale Zeitzone des Geräts.
 * Datumsschlüssel: "YYYY-MM-DD" (lokal). Kalender-Arithmetik über Date(y, m, d) ist sommerzeitsicher.
 */

/** Ereignisse ab dieser Stunde gehören zur Nacht desselben Datums, davor zur Nacht des Vortags. */
export const NIGHT_BOUNDARY_HOUR = 18;
/** Ein Ereignis der Nacht N darf zwischen N 12:00 und N+1 18:00 liegen (Validierung). */
export const NIGHT_WINDOW_START_HOUR = 12;
export const NIGHT_WINDOW_END_HOUR = 18;

export const MINUTES_PER_DAY = 1440;
/** Ursprung der „Nachtachse“ (Diagramme beginnen um 18:00 statt um 00:00). */
export const NIGHT_AXIS_START = NIGHT_BOUNDARY_HOUR * 60;

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const pad2 = (n: number) => String(n).padStart(2, '0');

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isValidDateKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  const m = DATE_KEY_RE.exec(key);
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}

export function parseDateKey(key: string): Date {
  const m = DATE_KEY_RE.exec(key);
  if (!m) throw new Error(`Ungültiges Datum: ${key}`);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Anzahl Kalendertage von a nach b (b - a), sommerzeitsicher. */
export function daysBetween(a: string, b: string): number {
  const da = parseDateKey(a);
  const db = parseDateKey(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
}

export function isValidIso(v: unknown): v is string {
  return typeof v === 'string' && ISO_RE.test(v) && Number.isFinite(Date.parse(v));
}

export function parseTime(v: string): number | null {
  const m = TIME_RE.exec(v);
  return m ? +m[1] * 60 + +m[2] : null;
}

export function formatMinutes(min: number): string {
  const m = ((Math.round(min) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export class TimeInputError extends Error {}

/**
 * Lokales Datum + Uhrzeit → Date.
 * Wirft bei ungültigen Werten und bei Uhrzeiten, die wegen der Sommerzeitumstellung nicht existieren.
 */
export function combineLocal(dateKey: string, time: string): Date {
  if (!isValidDateKey(dateKey)) throw new TimeInputError('Bitte ein gültiges Datum angeben.');
  const mins = parseTime(time);
  if (mins === null) throw new TimeInputError('Bitte eine gültige Uhrzeit (HH:MM) angeben.');
  const d = parseDateKey(dateKey);
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(mins / 60), mins % 60);
  if (result.getHours() * 60 + result.getMinutes() !== mins || toDateKey(result) !== dateKey) {
    throw new TimeInputError('Diese Uhrzeit existiert wegen der Zeitumstellung nicht. Bitte eine andere Uhrzeit wählen.');
  }
  return result;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Minuten seit 18:00 (0 … 1439) – für Durchschnitt/Median von Uhrzeiten rund um Mitternacht. */
export function toNightMinutes(minOfDay: number): number {
  return (minOfDay - NIGHT_AXIS_START + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}
export function fromNightMinutes(nightMin: number): number {
  return (nightMin + NIGHT_AXIS_START) % MINUTES_PER_DAY;
}

/** Zu welcher Nacht gehört ein Zeitpunkt? Vor 18:00 → Nacht des Vortags. */
export function nightDateFor(d: Date): string {
  if (d.getHours() >= NIGHT_BOUNDARY_HOUR) return toDateKey(d);
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

export function nightWindow(nightDate: string): { start: Date; end: Date } {
  const d = parseDateKey(nightDate);
  return {
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), NIGHT_WINDOW_START_HOUR, 0),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, NIGHT_WINDOW_END_HOUR, 0),
  };
}

export function isWithinNight(nightDate: string, d: Date): boolean {
  const { start, end } = nightWindow(nightDate);
  return d.getTime() >= start.getTime() && d.getTime() < end.getTime();
}

/** Liegt eine Minute im Zeitfenster [from, to)? Fenster über Mitternacht (z. B. 23:30–01:00) werden unterstützt. */
export function inTimeWindow(min: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? min >= from && min < to : min >= from || min < to;
}

// ---------- Formatierung (DD.MM.YYYY, 24 h) ----------

export function formatDate(v: string | Date): string {
  const d = typeof v === 'string' ? (DATE_KEY_RE.test(v) ? parseDateKey(v) : new Date(v)) : v;
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
export function formatDateShort(v: string | Date): string {
  const d = typeof v === 'string' ? (DATE_KEY_RE.test(v) ? parseDateKey(v) : new Date(v)) : v;
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`;
}
export function formatTime(v: string | Date): string {
  const d = typeof v === 'string' ? new Date(v) : v;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function weekdayShort(v: string | Date): string {
  const d = typeof v === 'string' ? (DATE_KEY_RE.test(v) ? parseDateKey(v) : new Date(v)) : v;
  return WEEKDAYS_SHORT[d.getDay()];
}
export function weekdayLong(v: string | Date): string {
  const d = typeof v === 'string' ? (DATE_KEY_RE.test(v) ? parseDateKey(v) : new Date(v)) : v;
  return WEEKDAYS_LONG[d.getDay()];
}
/** „Nacht Di 13.10. → Mi 14.10.2026“ */
export function formatNightLabel(nightDate: string): string {
  const next = addDays(nightDate, 1);
  return `${weekdayShort(nightDate)} ${formatDateShort(nightDate)} → ${weekdayShort(next)} ${formatDate(next)}`;
}
export function formatDuration(totalMinutes: number): string {
  const m = Math.round(totalMinutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** ISO-8601-Kalenderwoche eines Datumsschlüssels. */
export function isoWeek(key: string): { year: number; week: number } {
  const d = parseDateKey(key);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

/** Montag (Datumsschlüssel) der Woche, in der key liegt. */
export function mondayOf(key: string): string {
  const d = parseDateKey(key);
  const offset = (d.getDay() + 6) % 7;
  return addDays(key, -offset);
}

/** Werte für <input type="date"> und <input type="time"> */
export function toInputParts(d: Date): { date: string; time: string } {
  return { date: toDateKey(d), time: formatTime(d) };
}
