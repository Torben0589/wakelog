/**
 * CSV-Export für Tabellenkalkulationen (Excel, Numbers, LibreOffice).
 * - Eine Zeile pro Aufwachereignis, Nächte ohne Ereignis erscheinen mit einer Zeile ohne Ereignisdaten.
 * - Trennzeichen „;“ (deutsches Excel), UTF-8 mit BOM (Umlaute), Zeilenende CRLF.
 * - Felder mit ; " Zeilenumbruch werden in Anführungszeichen gesetzt, " wird verdoppelt.
 * - Schutz vor Formel-Injektion: Texte, die mit = + - @ beginnen, erhalten ein vorangestelltes '.
 */
import { OUTCOME_LABELS_SHORT, type WakeData, compareEvents } from './model';
import { formatDate, formatTime, weekdayLong } from './time';

export const CSV_SEPARATOR = ';';
export const CSV_BOM = '\uFEFF';

export const CSV_HEADER = [
  'Nacht (Beginn)',
  'Wochentag',
  'Schlafenszeit',
  'Endgültig wach',
  'Aufgestanden um',
  'Aufstehdatum',
  'Notiz zur Nacht',
  'Ereignis Nr.',
  'Ereignis Datum',
  'Ereignis Uhrzeit',
  'Verhalten',
  'Endgültiges Aufstehen',
  'Notiz zum Ereignis',
  'Ereignis Zeitstempel (ISO, UTC)',
  'Nacht-ID',
  'Ereignis-ID',
];

export function escapeCsv(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;"\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(data: WakeData): string {
  const rows: string[][] = [CSV_HEADER];
  const episodes = [...data.episodes].sort((a, b) => a.nightDate.localeCompare(b.nightDate));
  for (const ep of episodes) {
    const base = [
      formatDate(ep.nightDate),
      weekdayLong(ep.nightDate),
      ep.bedTime ? formatTime(ep.bedTime) : '',
      ep.finalWakeTime ? formatTime(ep.finalWakeTime) : '',
      ep.gotUpAt ? formatTime(ep.gotUpAt) : '',
      ep.gotUpAt ? formatDate(ep.gotUpAt) : '',
      ep.note ?? '',
    ];
    const evs = data.events.filter((e) => e.episodeId === ep.id).sort(compareEvents);
    if (!evs.length) {
      rows.push([...base, '', '', '', '', '', '', '', ep.id, '']);
      continue;
    }
    evs.forEach((ev, i) => {
      rows.push([
        ...base,
        String(i + 1),
        formatDate(ev.occurredAt),
        formatTime(ev.occurredAt),
        OUTCOME_LABELS_SHORT[ev.outcome],
        ep.gotUpEventId === ev.id ? 'ja' : 'nein',
        ev.note ?? '',
        ev.occurredAt,
        ep.id,
        ev.id,
      ]);
    });
  }
  return CSV_BOM + rows.map((r) => r.map(escapeCsv).join(CSV_SEPARATOR)).join('\r\n') + '\r\n';
}
