/**
 * Fachlogik für Schlafepisoden und Aufwachereignisse.
 * Alle Funktionen sind rein: Sie erhalten den aktuellen Datenstand und liefern Changes zurück,
 * die anschließend atomar gespeichert werden. Dadurch sind sie unabhängig von IndexedDB testbar.
 */
import {
  type Changes,
  type Outcome,
  type SleepEpisode,
  type WakeData,
  type WakeEvent,
  NOTE_MAX_LENGTH,
  OUTCOME_LABELS,
  compareEvents,
  isOutcome,
} from './model';
import { formatDate, formatTime, isValidDateKey, isWithinNight, nightDateFor, nightWindow } from './time';

export interface OpContext {
  now: Date;
  newId: () => string;
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Mögliches Duplikat: gleiche Nacht, gleiche Minute, gleicher Ausgang. Kann bewusst bestätigt werden. */
export class DuplicateEventError extends ValidationError {
  constructor(public existing: WakeEvent) {
    super(
      `In dieser Nacht gibt es bereits ein Ereignis um ${formatTime(existing.occurredAt)} Uhr („${OUTCOME_LABELS[existing.outcome]}“).`,
      'occurredAt',
    );
    this.name = 'DuplicateEventError';
  }
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback (z. B. unsichere Kontexte ohne HTTPS)
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const defaultContext = (): OpContext => ({ now: new Date(), newId });

// ---------- Abfragen ----------

export function findEpisodeByNight(data: WakeData, nightDate: string): SleepEpisode | undefined {
  return data.episodes.find((e) => e.nightDate === nightDate);
}

export function eventsOfEpisode(data: WakeData, episodeId: string): WakeEvent[] {
  return data.events.filter((e) => e.episodeId === episodeId).sort(compareEvents);
}

/** Das Ereignis, das als endgültiges Aufstehen verknüpft ist (falls vorhanden). */
export function linkedGetUpEvent(data: WakeData, ep: SleepEpisode): WakeEvent | undefined {
  return ep.gotUpEventId ? data.events.find((e) => e.id === ep.gotUpEventId && e.episodeId === ep.id) : undefined;
}

// ---------- Validierung ----------

function cleanNote(note: string | undefined): string | undefined {
  const t = (note ?? '').trim();
  if (t.length > NOTE_MAX_LENGTH) throw new ValidationError(`Die Notiz darf höchstens ${NOTE_MAX_LENGTH} Zeichen lang sein.`, 'note');
  return t.length ? t : undefined;
}

function assertValidDate(d: Date, field: string) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) throw new ValidationError('Ungültiger Zeitwert.', field);
}

function assertInNight(nightDate: string, d: Date, field: string, label: string) {
  if (!isWithinNight(nightDate, d)) {
    const { start, end } = nightWindow(nightDate);
    throw new ValidationError(
      `${label} passt nicht zur Nacht vom ${formatDate(nightDate)}. Erlaubt: ${formatDate(start)} ${formatTime(start)} bis ${formatDate(end)} ${formatTime(end)} Uhr.`,
      field,
    );
  }
}

const sameMinute = (a: string, b: string) => Math.floor(Date.parse(a) / 60000) === Math.floor(Date.parse(b) / 60000);

function findDuplicate(data: WakeData, episodeId: string, occurredAt: string, outcome: Outcome, ignoreId?: string) {
  return data.events.find(
    (e) => e.episodeId === episodeId && e.id !== ignoreId && e.outcome === outcome && sameMinute(e.occurredAt, occurredAt),
  );
}

function checkEpisodeOrder(ep: SleepEpisode) {
  const t = (v?: string) => (v ? Date.parse(v) : undefined);
  const bed = t(ep.bedTime);
  const wake = t(ep.finalWakeTime);
  const up = t(ep.gotUpAt);
  if (bed !== undefined && wake !== undefined && wake <= bed)
    throw new ValidationError('Das endgültige Aufwachen muss nach der Schlafenszeit liegen.', 'finalWakeTime');
  if (bed !== undefined && up !== undefined && up <= bed)
    throw new ValidationError('Die Aufstehzeit muss nach der Schlafenszeit liegen.', 'gotUpAt');
  if (wake !== undefined && up !== undefined && up < wake)
    throw new ValidationError('Die Aufstehzeit darf nicht vor dem endgültigen Aufwachen liegen.', 'gotUpAt');
}

// ---------- Operationen ----------

export interface WakeEventInput {
  occurredAt: Date;
  outcome: Outcome;
  note?: string;
  /** Nur bei outcome = got_up: Zeitpunkt zugleich als endgültiges Aufstehen der Nacht übernehmen. */
  markAsFinalGetUp?: boolean;
}

export interface OpOptions {
  allowDuplicate?: boolean;
}

export interface OpResult {
  changes: Changes;
  episode: SleepEpisode;
  event?: WakeEvent;
}

function ensureEpisode(data: WakeData, nightDate: string, ctx: OpContext): { episode: SleepEpisode; created: boolean } {
  if (!isValidDateKey(nightDate)) throw new ValidationError('Ungültiges Datum der Nacht.', 'nightDate');
  const existing = findEpisodeByNight(data, nightDate);
  if (existing) return { episode: existing, created: false };
  const ts = ctx.now.toISOString();
  return { episode: { id: ctx.newId(), nightDate, createdAt: ts, updatedAt: ts }, created: true };
}

/**
 * Neues Aufwachereignis. Ohne nightDate wird die Nacht aus dem Zeitpunkt abgeleitet (vor 18:00 → Vortag).
 */
export function addWakeEvent(
  data: WakeData,
  input: WakeEventInput,
  ctx: OpContext,
  nightDate?: string,
  opts: OpOptions = {},
): OpResult {
  assertValidDate(input.occurredAt, 'occurredAt');
  if (!isOutcome(input.outcome)) throw new ValidationError('Bitte das Verhalten nach dem Aufwachen auswählen.', 'outcome');
  const night = nightDate ?? nightDateFor(input.occurredAt);
  assertInNight(night, input.occurredAt, 'occurredAt', 'Der Zeitpunkt');
  const note = cleanNote(input.note);
  const { episode } = ensureEpisode(data, night, ctx);
  const occurredAt = input.occurredAt.toISOString();

  if (!opts.allowDuplicate) {
    const dup = findDuplicate(data, episode.id, occurredAt, input.outcome);
    if (dup) throw new DuplicateEventError(dup);
  }

  const ts = ctx.now.toISOString();
  const event: WakeEvent = { id: ctx.newId(), episodeId: episode.id, occurredAt, outcome: input.outcome, note, createdAt: ts, updatedAt: ts };
  let ep: SleepEpisode = { ...episode, updatedAt: ts };
  if (input.outcome === 'got_up' && input.markAsFinalGetUp) {
    ep = { ...ep, gotUpAt: occurredAt, gotUpEventId: event.id };
    checkEpisodeOrder(ep);
  }
  return { changes: { putEpisodes: [ep], putEvents: [event] }, episode: ep, event };
}

export function updateWakeEvent(data: WakeData, eventId: string, input: WakeEventInput, ctx: OpContext, opts: OpOptions = {}): OpResult {
  const current = data.events.find((e) => e.id === eventId);
  if (!current) throw new ValidationError('Das Ereignis existiert nicht mehr.');
  const episode = data.episodes.find((e) => e.id === current.episodeId);
  if (!episode) throw new ValidationError('Die zugehörige Nacht existiert nicht mehr.');
  assertValidDate(input.occurredAt, 'occurredAt');
  if (!isOutcome(input.outcome)) throw new ValidationError('Bitte das Verhalten nach dem Aufwachen auswählen.', 'outcome');
  assertInNight(episode.nightDate, input.occurredAt, 'occurredAt', 'Der Zeitpunkt');
  const note = cleanNote(input.note);
  const occurredAt = input.occurredAt.toISOString();
  if (!opts.allowDuplicate) {
    const dup = findDuplicate(data, episode.id, occurredAt, input.outcome, eventId);
    if (dup) throw new DuplicateEventError(dup);
  }
  const ts = ctx.now.toISOString();
  const event: WakeEvent = { ...current, occurredAt, outcome: input.outcome, note, updatedAt: ts };
  let ep: SleepEpisode = { ...episode, updatedAt: ts };
  const wasLinked = episode.gotUpEventId === eventId;
  if (input.outcome === 'got_up' && input.markAsFinalGetUp) {
    ep = { ...ep, gotUpAt: occurredAt, gotUpEventId: eventId };
  } else if (wasLinked) {
    // Verknüpfung aufgehoben → abgeleitete Aufstehzeit entfernen
    ep = { ...ep, gotUpAt: undefined, gotUpEventId: undefined };
  }
  checkEpisodeOrder(ep);
  return { changes: { putEpisodes: [ep], putEvents: [event] }, episode: ep, event };
}

export function deleteWakeEvent(data: WakeData, eventId: string, ctx: OpContext): OpResult {
  const current = data.events.find((e) => e.id === eventId);
  if (!current) throw new ValidationError('Das Ereignis existiert nicht mehr.');
  const episode = data.episodes.find((e) => e.id === current.episodeId);
  if (!episode) throw new ValidationError('Die zugehörige Nacht existiert nicht mehr.');
  let ep: SleepEpisode = { ...episode, updatedAt: ctx.now.toISOString() };
  if (episode.gotUpEventId === eventId) ep = { ...ep, gotUpAt: undefined, gotUpEventId: undefined };
  return { changes: { putEpisodes: [ep], deleteEventIds: [eventId] }, episode: ep };
}

export interface EpisodeDetailsInput {
  bedTime?: Date | null;
  finalWakeTime?: Date | null;
  gotUpAt?: Date | null;
  note?: string;
}

/**
 * Setzt Episodenfelder. undefined = unverändert, null = entfernen.
 * Wird die Aufstehzeit direkt gesetzt, wird eine Verknüpfung zu einem Ereignis aufgehoben,
 * sofern dessen Zeitpunkt nicht mehr übereinstimmt.
 */
export function setEpisodeDetails(data: WakeData, nightDate: string, input: EpisodeDetailsInput, ctx: OpContext): OpResult {
  const { episode } = ensureEpisode(data, nightDate, ctx);
  const ep: SleepEpisode = { ...episode, updatedAt: ctx.now.toISOString() };
  const fields: [keyof EpisodeDetailsInput & ('bedTime' | 'finalWakeTime' | 'gotUpAt'), string][] = [
    ['bedTime', 'Die Schlafenszeit'],
    ['finalWakeTime', 'Das endgültige Aufwachen'],
    ['gotUpAt', 'Die Aufstehzeit'],
  ];
  for (const [key, label] of fields) {
    const v = input[key];
    if (v === undefined) continue;
    if (v === null) {
      delete ep[key];
      if (key === 'gotUpAt') delete ep.gotUpEventId;
      continue;
    }
    assertValidDate(v, key);
    assertInNight(nightDate, v, key, label);
    ep[key] = v.toISOString();
  }
  if (input.note !== undefined) {
    const n = cleanNote(input.note);
    if (n) ep.note = n;
    else delete ep.note;
  }
  if (ep.gotUpEventId) {
    const linked = data.events.find((e) => e.id === ep.gotUpEventId);
    if (!linked || !ep.gotUpAt || linked.occurredAt !== ep.gotUpAt) delete ep.gotUpEventId;
  }
  checkEpisodeOrder(ep);
  return { changes: { putEpisodes: [ep] }, episode: ep };
}

export function deleteEpisode(data: WakeData, episodeId: string): Changes {
  if (!data.episodes.some((e) => e.id === episodeId)) throw new ValidationError('Die Nacht existiert nicht mehr.');
  return {
    deleteEpisodeIds: [episodeId],
    deleteEventIds: data.events.filter((e) => e.episodeId === episodeId).map((e) => e.id),
  };
}

/** Hinweise zur Vollständigkeit einer Nacht (für Anzeige & Statistik). */
export function episodeIssues(data: WakeData, ep: SleepEpisode): string[] {
  const issues: string[] = [];
  const evs = eventsOfEpisode(data, ep.id);
  if (!ep.gotUpAt) issues.push('Aufstehzeit fehlt');
  const unknown = evs.filter((e) => e.outcome === 'unknown').length;
  if (unknown) issues.push(unknown === 1 ? '1 Ereignis mit unbekanntem Ausgang' : `${unknown} Ereignisse mit unbekanntem Ausgang`);
  if (ep.gotUpAt) {
    const up = Date.parse(ep.gotUpAt);
    if (evs.some((e) => Date.parse(e.occurredAt) > up)) issues.push('Ereignis nach der Aufstehzeit');
  }
  if (ep.bedTime) {
    const bed = Date.parse(ep.bedTime);
    if (evs.some((e) => Date.parse(e.occurredAt) < bed)) issues.push('Ereignis vor der Schlafenszeit');
  }
  return issues;
}
