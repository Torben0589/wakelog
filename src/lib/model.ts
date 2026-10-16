/**
 * WakeLog – Datenmodell
 *
 * Zeitpunkte werden als ISO-8601-Strings in UTC gespeichert (z. B. "2026-10-14T01:37:00.000Z").
 * Dargestellt und ausgewertet werden sie in der lokalen Zeitzone des Geräts.
 * nightDate ist ein lokales Kalenderdatum "YYYY-MM-DD" (Beginn der Schlafperiode).
 */

export const OUTCOMES = ['fell_asleep_again', 'stayed_awake', 'got_up', 'unknown'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  fell_asleep_again: 'Wieder eingeschlafen',
  stayed_awake: 'Wach geblieben',
  got_up: 'Aufgestanden',
  unknown: 'Noch unbekannt',
};

/** Kurzform für Statistiken (dort heißt "Noch unbekannt" schlicht "Unbekannt"). */
export const OUTCOME_LABELS_SHORT: Record<Outcome, string> = {
  fell_asleep_again: 'Wieder eingeschlafen',
  stayed_awake: 'Wach geblieben',
  got_up: 'Aufgestanden',
  unknown: 'Unbekannt',
};

export interface SleepEpisode {
  id: string;
  /** Lokales Datum (YYYY-MM-DD), an dem die Schlafperiode begonnen hat. Eindeutig je Episode. */
  nightDate: string;
  createdAt: string;
  updatedAt: string;
  /** Geschätzte Schlafenszeit */
  bedTime?: string;
  /** Endgültiges Aufwachen am Morgen (optional, getrennt vom Aufstehen) */
  finalWakeTime?: string;
  /** Tatsächliche Aufstehzeit */
  gotUpAt?: string;
  /** Falls die Aufstehzeit aus einem Ereignis „Aufgestanden“ übernommen wurde: dessen ID (verhindert Doppelerfassung). */
  gotUpEventId?: string;
  note?: string;
}

export interface WakeEvent {
  id: string;
  episodeId: string;
  occurredAt: string;
  outcome: Outcome;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WakeData {
  episodes: SleepEpisode[];
  events: WakeEvent[];
}

/** Atomare Änderung, die Speicher und UI-Zustand gleichermaßen anwenden. */
export interface Changes {
  putEpisodes?: SleepEpisode[];
  putEvents?: WakeEvent[];
  deleteEpisodeIds?: string[];
  deleteEventIds?: string[];
}

export const EMPTY_DATA: WakeData = { episodes: [], events: [] };

export const NOTE_MAX_LENGTH = 1000;

export function isOutcome(v: unknown): v is Outcome {
  return typeof v === 'string' && (OUTCOMES as readonly string[]).includes(v);
}

/** Wendet Changes rein funktional auf einen Datenstand an. */
export function applyChanges(data: WakeData, ch: Changes): WakeData {
  const episodes = new Map(data.episodes.map((e) => [e.id, e]));
  const events = new Map(data.events.map((e) => [e.id, e]));
  for (const id of ch.deleteEventIds ?? []) events.delete(id);
  for (const id of ch.deleteEpisodeIds ?? []) {
    episodes.delete(id);
    for (const [eid, ev] of events) if (ev.episodeId === id) events.delete(eid);
  }
  for (const ep of ch.putEpisodes ?? []) episodes.set(ep.id, ep);
  for (const ev of ch.putEvents ?? []) events.set(ev.id, ev);
  return { episodes: [...episodes.values()], events: [...events.values()] };
}

/** Sortierung: Zeitpunkt, dann Erstellungszeit, dann ID – deterministisch auch bei gleicher Minute. */
export function compareEvents(a: WakeEvent, b: WakeEvent): number {
  const ta = Date.parse(a.occurredAt);
  const tb = Date.parse(b.occurredAt);
  if (ta !== tb) return ta - tb;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortEvents(events: WakeEvent[]): WakeEvent[] {
  return [...events].sort(compareEvents);
}
