import { describe, expect, it } from 'vitest';
import { createBackup, mergeData, parseBackup, serializeBackup } from '../src/lib/backup';
import { CSV_BOM, buildCsv, escapeCsv } from '../src/lib/csv';
import { addWakeEvent, setEpisodeDetails } from '../src/lib/episodes';
import type { WakeData } from '../src/lib/model';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import { apply, at, ctx, empty } from './helpers';

function sample(): WakeData {
  const c = ctx();
  let d = empty();
  d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '03:37'), outcome: 'fell_asleep_again', note: 'Straße laut; "Müllabfuhr"' }, c).changes);
  d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '06:15'), outcome: 'got_up', markAsFinalGetUp: true }, c).changes);
  d = apply(d, setEpisodeDetails(d, '2026-10-13', { bedTime: at('2026-10-13', '22:40'), note: 'Übermüdet\nzweite Zeile' }, c).changes);
  d = apply(d, setEpisodeDetails(d, '2026-10-15', { gotUpAt: at('2026-10-16', '07:00') }, c).changes);
  return d;
}

describe('JSON-Export und -Import', () => {
  it('Roundtrip erhält alle Nächte, Ereignisse und Einstellungen', () => {
    const d = sample();
    const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, binSize: 5 as const };
    const text = serializeBackup(createBackup(d, settings, '1.0.0', new Date('2026-10-16T08:00:00Z')));
    const p = parseBackup(text);
    expect(p.ok).toBe(true);
    expect(p.errors).toEqual([]);
    expect(p.settings).toEqual(settings);
    const byId = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(p.data.episodes)).toEqual(byId(d.episodes));
    expect(byId(p.data.events)).toEqual(byId(d.events));
  });

  it('weist kaputte oder fremde Dateien ab', () => {
    expect(parseBackup('{kein json').fatal).toMatch(/keine gültige JSON/);
    expect(parseBackup('{"hello":1}').fatal).toMatch(/keine WakeLog-Sicherung/);
    expect(parseBackup('{"format":"wakelog-backup","schemaVersion":99,"episodes":[],"events":[]}').fatal).toMatch(/neueren/);
    expect(parseBackup('{"format":"wakelog-backup","schemaVersion":1}').fatal).toMatch(/episodes/);
  });

  it('meldet ungültige Datensätze einzeln und übernimmt nur gültige', () => {
    const d = sample();
    const b = createBackup(d, DEFAULT_SETTINGS, '1.0.0') as unknown as { episodes: unknown[]; events: unknown[] };
    b.episodes.push({ id: 'x', nightDate: '2026-02-31', createdAt: 'gestern', updatedAt: 'heute' });
    b.episodes.push({ ...(b.episodes[0] as object), id: 'dup-night' });
    b.events.push({ id: 'e1', episodeId: 'gibts-nicht', occurredAt: '2026-10-14T01:00:00.000Z', outcome: 'unknown', createdAt: '2026-10-14T01:00:00.000Z', updatedAt: '2026-10-14T01:00:00.000Z' });
    b.events.push({ id: 'e2', episodeId: (d.episodes[0] as { id: string }).id, occurredAt: '03:37', outcome: 'schlecht' });
    const p = parseBackup(JSON.stringify(b));
    expect(p.ok).toBe(true);
    expect(p.data.episodes).toHaveLength(2);
    expect(p.data.events).toHaveLength(2);
    expect(p.errors).toHaveLength(4);
    expect(p.errors.join('\n')).toMatch(/nightDate ungültig/);
    expect(p.errors.join('\n')).toMatch(/kommt doppelt vor/);
    expect(p.errors.join('\n')).toMatch(/gehört zu keiner gültigen Nacht/);
    expect(p.errors.join('\n')).toMatch(/occurredAt ungültig/);
  });

  it('Zusammenführen: gleiche Sicherung zweimal importieren erzeugt keine Duplikate', () => {
    const d = sample();
    const { data, report } = mergeData(d, structuredClone(d));
    expect(data.events).toHaveLength(d.events.length);
    expect(data.episodes).toHaveLength(d.episodes.length);
    expect(report.eventsAdded).toBe(0);
    expect(report.eventsSkipped).toBe(d.events.length);
  });

  it('Zusammenführen ordnet Nächte über das Datum zu und ergänzt neue Ereignisse', () => {
    const c = ctx('2026-10-17T10:00:00.000Z');
    const local = sample();
    let other = empty();
    other = apply(other, addWakeEvent(other, { occurredAt: at('2026-10-14', '02:10'), outcome: 'stayed_awake' }, { ...c, newId: () => 'fremd-' + Math.random() }).changes);
    const { data, report } = mergeData(local, other);
    const ep = data.episodes.filter((e) => e.nightDate === '2026-10-13');
    expect(ep).toHaveLength(1);
    expect(data.events.filter((e) => e.episodeId === ep[0].id)).toHaveLength(3);
    expect(report.eventsAdded).toBe(1);
  });

  it('Zusammenführen: neuerer Stand gewinnt', () => {
    const d = sample();
    const newer = structuredClone(d);
    newer.events[0] = { ...newer.events[0], outcome: 'stayed_awake', updatedAt: '2030-01-01T00:00:00.000Z' };
    const { data, report } = mergeData(d, newer);
    expect(data.events.find((e) => e.id === newer.events[0].id)!.outcome).toBe('stayed_awake');
    expect(report.eventsUpdated).toBe(1);
  });
});

describe('CSV-Export', () => {
  it('maskiert Sonderzeichen korrekt', () => {
    expect(escapeCsv('a;b')).toBe('"a;b"');
    expect(escapeCsv('sagt "hallo"')).toBe('"sagt ""hallo"""');
    expect(escapeCsv('zwei\nZeilen')).toBe('"zwei\nZeilen"');
    expect(escapeCsv('=SUMME(A1)')).toBe("'=SUMME(A1)");
    expect(escapeCsv('Größe Übel')).toBe('Größe Übel');
    expect(escapeCsv(undefined)).toBe('');
  });

  it('eine Zeile pro Ereignis plus Nächte ohne Ereignis, mit BOM und Umlauten', () => {
    const csv = buildCsv(sample());
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    // Kopf + 2 Ereignisse (Nacht 13.10.) + 1 Nacht ohne Ereignis (15.10.); mehrzeilige Notiz steht in Anführungszeichen
    const header = lines[0].split(';');
    expect(header[0]).toBe('Nacht (Beginn)');
    expect(csv).toContain('13.10.2026;Dienstag;22:40;;06:15;14.10.2026;"Übermüdet\nzweite Zeile";1;14.10.2026;03:37;Wieder eingeschlafen;nein;"Straße laut; ""Müllabfuhr""";');
    expect(csv).toContain(';2;14.10.2026;06:15;Aufgestanden;ja;;');
    expect(csv).toContain('15.10.2026;Donnerstag;;;07:00;16.10.2026;;;;;;;;;');
    expect(csv.match(/\r\n/g)!.length).toBe(4);
  });

  it('leerer Datenbestand ergibt nur die Kopfzeile', () => {
    expect(buildCsv(empty()).split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});
