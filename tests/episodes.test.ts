import { describe, expect, it } from 'vitest';
import {
  DuplicateEventError,
  ValidationError,
  addWakeEvent,
  deleteEpisode,
  deleteWakeEvent,
  episodeIssues,
  eventsOfEpisode,
  findEpisodeByNight,
  setEpisodeDetails,
  updateWakeEvent,
} from '../src/lib/episodes';
import type { WakeData } from '../src/lib/model';
import { nightDateFor, combineLocal, formatTime } from '../src/lib/time';
import { apply, at, ctx, empty } from './helpers';

describe('Schlafepisode anlegen und ändern', () => {
  it('legt beim ersten Ereignis automatisch die Nacht an', () => {
    const c = ctx();
    const r = addWakeEvent(empty(), { occurredAt: at('2026-10-14', '03:37'), outcome: 'fell_asleep_again' }, c);
    expect(r.episode.nightDate).toBe('2026-10-13');
    expect(r.changes.putEpisodes).toHaveLength(1);
    expect(r.changes.putEvents).toHaveLength(1);
    expect(r.event!.episodeId).toBe(r.episode.id);
  });

  it('ändert Schlafenszeit, Aufstehzeit und Notiz einer Nacht', () => {
    const c = ctx();
    let d = empty();
    d = apply(d, setEpisodeDetails(d, '2026-10-13', { bedTime: at('2026-10-13', '22:45') }, c).changes);
    c.tick();
    const r = setEpisodeDetails(d, '2026-10-13', { gotUpAt: at('2026-10-14', '06:15'), note: '  Kaffee spät  ' }, c);
    d = apply(d, r.changes);
    expect(d.episodes).toHaveLength(1);
    const ep = d.episodes[0];
    expect(formatTime(ep.bedTime!)).toBe('22:45');
    expect(formatTime(ep.gotUpAt!)).toBe('06:15');
    expect(ep.note).toBe('Kaffee spät');
    expect(ep.updatedAt > ep.createdAt).toBe(true);
    // entfernen mit null
    d = apply(d, setEpisodeDetails(d, '2026-10-13', { bedTime: null, note: '' }, c).changes);
    expect(d.episodes[0].bedTime).toBeUndefined();
    expect(d.episodes[0].note).toBeUndefined();
  });

  it('weist unlogische Reihenfolgen und Zeiten außerhalb der Nacht ab', () => {
    const c = ctx();
    const d = apply(empty(), setEpisodeDetails(empty(), '2026-10-13', { bedTime: at('2026-10-13', '23:00') }, c).changes);
    expect(() => setEpisodeDetails(d, '2026-10-13', { gotUpAt: at('2026-10-13', '22:00') }, c)).toThrow(ValidationError);
    expect(() => setEpisodeDetails(d, '2026-10-13', { gotUpAt: at('2026-10-15', '06:00') }, c)).toThrow(/passt nicht zur Nacht/);
    expect(() => setEpisodeDetails(d, 'kein-datum', {}, c)).toThrow(ValidationError);
    expect(() => setEpisodeDetails(d, '2026-10-13', { bedTime: new Date('x') }, c)).toThrow(/Ungültiger Zeitwert/);
  });

  it('löscht eine Nacht samt Ereignissen', () => {
    const c = ctx();
    let d = empty();
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '02:00'), outcome: 'unknown' }, c).changes);
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '04:00'), outcome: 'unknown' }, c).changes);
    d = apply(d, deleteEpisode(d, d.episodes[0].id));
    expect(d).toEqual({ episodes: [], events: [] });
  });
});

describe('Mehrere Ereignisse, Mitternacht und Sortierung', () => {
  function night(): WakeData {
    const c = ctx();
    let d = empty();
    // absichtlich unsortiert erfasst, über Mitternacht
    for (const [date, time] of [['2026-10-14', '03:37'], ['2026-10-13', '23:50'], ['2026-10-14', '00:10'], ['2026-10-14', '05:05']] as const) {
      d = apply(d, addWakeEvent(d, { occurredAt: at(date, time), outcome: 'fell_asleep_again' }, c).changes);
      c.tick();
    }
    return d;
  }

  it('ordnet Ereignisse vor und nach Mitternacht derselben Nacht zu', () => {
    const d = night();
    expect(d.episodes).toHaveLength(1);
    expect(d.episodes[0].nightDate).toBe('2026-10-13');
    expect(d.events).toHaveLength(4);
  });

  it('sortiert chronologisch nach vollständigem Zeitpunkt (nicht nach Uhrzeit allein)', () => {
    const d = night();
    expect(eventsOfEpisode(d, d.episodes[0].id).map((e) => formatTime(e.occurredAt))).toEqual(['23:50', '00:10', '03:37', '05:05']);
  });

  it('sortiert gleiche Minute stabil nach Erstellungszeit', () => {
    const c = ctx();
    let d = empty();
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '03:00'), outcome: 'stayed_awake', note: 'A' }, c).changes);
    c.tick();
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '03:00'), outcome: 'fell_asleep_again', note: 'B' }, c).changes);
    expect(eventsOfEpisode(d, d.episodes[0].id).map((e) => e.note)).toEqual(['A', 'B']);
  });

  it('Nachtzuordnung: vor 18:00 → Vortag, ab 18:00 → gleicher Tag', () => {
    expect(nightDateFor(at('2026-10-14', '17:59'))).toBe('2026-10-13');
    expect(nightDateFor(at('2026-10-14', '18:00'))).toBe('2026-10-14');
    expect(nightDateFor(at('2026-10-14', '00:00'))).toBe('2026-10-13');
    expect(nightDateFor(at('2026-01-01', '03:00'))).toBe('2025-12-31');
  });

  it('weist Zeitpunkte zurück, die nicht zur gewählten Nacht passen', () => {
    const c = ctx();
    expect(() => addWakeEvent(empty(), { occurredAt: at('2026-10-15', '03:00'), outcome: 'unknown' }, c, '2026-10-13')).toThrow(/passt nicht zur Nacht/);
  });

  it('erkennt fehlende Uhrzeiten bei der Zeitumstellung (Europe/Berlin)', () => {
    expect(() => combineLocal('2026-03-29', '02:30')).toThrow(/Zeitumstellung/);
    expect(formatTime(combineLocal('2026-03-29', '03:30'))).toBe('03:30');
  });
});

describe('Bearbeiten, Löschen, Duplikate, Aufstehen', () => {
  it('bearbeitet ein Ereignis und behält die Nacht', () => {
    const c = ctx();
    let d = empty();
    const r = addWakeEvent(d, { occurredAt: at('2026-10-14', '03:37'), outcome: 'unknown' }, c);
    d = apply(d, r.changes);
    c.tick();
    const u = updateWakeEvent(d, r.event!.id, { occurredAt: at('2026-10-14', '03:41'), outcome: 'stayed_awake', note: 'Durst' }, c);
    d = apply(d, u.changes);
    expect(d.events).toHaveLength(1);
    expect(formatTime(d.events[0].occurredAt)).toBe('03:41');
    expect(d.events[0].outcome).toBe('stayed_awake');
    expect(d.events[0].note).toBe('Durst');
    expect(d.events[0].createdAt).toBe(r.event!.createdAt);
  });

  it('löscht ein einzelnes Ereignis', () => {
    const c = ctx();
    let d = empty();
    const a = addWakeEvent(d, { occurredAt: at('2026-10-14', '02:00'), outcome: 'unknown' }, c);
    d = apply(d, a.changes);
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '04:00'), outcome: 'unknown' }, c).changes);
    d = apply(d, deleteWakeEvent(d, a.event!.id, c).changes);
    expect(d.events.map((e) => formatTime(e.occurredAt))).toEqual(['04:00']);
    expect(d.episodes).toHaveLength(1);
  });

  it('meldet mögliche Duplikate und erlaubt sie nach Bestätigung', () => {
    const c = ctx();
    let d = empty();
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '03:37'), outcome: 'fell_asleep_again' }, c).changes);
    expect(() => addWakeEvent(d, { occurredAt: at('2026-10-14', '03:37'), outcome: 'fell_asleep_again' }, c)).toThrow(DuplicateEventError);
    // gleiche Minute, anderer Ausgang → kein Duplikat
    expect(() => addWakeEvent(d, { occurredAt: at('2026-10-14', '03:37'), outcome: 'stayed_awake' }, c)).not.toThrow();
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '03:37'), outcome: 'fell_asleep_again' }, c, undefined, { allowDuplicate: true }).changes);
    expect(d.events).toHaveLength(2);
  });

  it('„Aufgestanden“ als endgültiges Aufstehen erzeugt kein zweites Ereignis', () => {
    const c = ctx();
    let d = empty();
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '03:37'), outcome: 'fell_asleep_again' }, c).changes);
    const r = addWakeEvent(d, { occurredAt: at('2026-10-14', '06:15'), outcome: 'got_up', markAsFinalGetUp: true }, c);
    d = apply(d, r.changes);
    expect(d.events).toHaveLength(2);
    const ep = findEpisodeByNight(d, '2026-10-13')!;
    expect(formatTime(ep.gotUpAt!)).toBe('06:15');
    expect(ep.gotUpEventId).toBe(r.event!.id);
    // Uhrzeit des verknüpften Ereignisses korrigieren → Aufstehzeit folgt
    d = apply(d, updateWakeEvent(d, r.event!.id, { occurredAt: at('2026-10-14', '06:20'), outcome: 'got_up', markAsFinalGetUp: true }, c).changes);
    expect(formatTime(findEpisodeByNight(d, '2026-10-13')!.gotUpAt!)).toBe('06:20');
    // Ereignis löschen → abgeleitete Aufstehzeit wird entfernt
    d = apply(d, deleteWakeEvent(d, r.event!.id, c).changes);
    expect(findEpisodeByNight(d, '2026-10-13')!.gotUpAt).toBeUndefined();
    expect(findEpisodeByNight(d, '2026-10-13')!.gotUpEventId).toBeUndefined();
  });

  it('Aufwachen 03:37 + Aufstehen 06:15 werden getrennt gespeichert', () => {
    const c = ctx();
    let d = empty();
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '03:37'), outcome: 'fell_asleep_again' }, c).changes);
    d = apply(d, setEpisodeDetails(d, '2026-10-13', { gotUpAt: at('2026-10-14', '06:15') }, c).changes);
    expect(d.events).toHaveLength(1);
    expect(formatTime(d.events[0].occurredAt)).toBe('03:37');
    expect(formatTime(d.episodes[0].gotUpAt!)).toBe('06:15');
  });

  it('meldet Vollständigkeitsprobleme einer Nacht', () => {
    const c = ctx();
    let d = empty();
    d = apply(d, addWakeEvent(d, { occurredAt: at('2026-10-14', '03:37'), outcome: 'unknown' }, c).changes);
    expect(episodeIssues(d, d.episodes[0])).toEqual(['Aufstehzeit fehlt', '1 Ereignis mit unbekanntem Ausgang']);
  });

  it('lehnt unbekannte Ausgänge und zu lange Notizen ab', () => {
    const c = ctx();
    expect(() => addWakeEvent(empty(), { occurredAt: at('2026-10-14', '03:00'), outcome: 'x' as never }, c)).toThrow(ValidationError);
    expect(() => addWakeEvent(empty(), { occurredAt: at('2026-10-14', '03:00'), outcome: 'unknown', note: 'a'.repeat(1001) }, c)).toThrow(/Notiz/);
  });
});
