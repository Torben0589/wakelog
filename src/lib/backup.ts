/**
 * JSON-Sicherung: Export, Validierung beim Import, Zusammenführen und Ersetzen.
 */
import { type SleepEpisode, type WakeData, type WakeEvent, NOTE_MAX_LENGTH, isOutcome } from './model';
import { type Settings, sanitizeSettings } from './settings';
import { formatDate, isValidDateKey, isValidIso } from './time';

export const BACKUP_FORMAT = 'wakelog-backup';
export const BACKUP_SCHEMA_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  app: string;
  appVersion: string;
  exportedAt: string;
  settings: Settings;
  episodes: SleepEpisode[];
  events: WakeEvent[];
}

export function createBackup(data: WakeData, settings: Settings, appVersion: string, now = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: 'WakeLog',
    appVersion,
    exportedAt: now.toISOString(),
    settings,
    episodes: [...data.episodes].sort((a, b) => a.nightDate.localeCompare(b.nightDate)),
    events: [...data.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
  };
}

export function serializeBackup(b: Backup): string {
  return JSON.stringify(b, null, 2);
}

export interface ParsedBackup {
  ok: boolean;
  /** Abbruchgrund, wenn die Datei insgesamt unbrauchbar ist */
  fatal?: string;
  data: WakeData;
  settings?: Settings;
  /** Verständliche Meldungen zu einzelnen verworfenen Datensätzen */
  errors: string[];
  totalEpisodes: number;
  totalEvents: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const optString = (v: unknown) => v === undefined || v === null || typeof v === 'string';
const optIso = (v: unknown) => v === undefined || v === null || isValidIso(v);

function validateEpisode(raw: unknown): { value?: SleepEpisode; error?: string } {
  if (!isObj(raw)) return { error: 'kein Objekt' };
  if (typeof raw.id !== 'string' || !raw.id) return { error: 'id fehlt' };
  if (!isValidDateKey(raw.nightDate)) return { error: 'nightDate ungültig (erwartet JJJJ-MM-TT)' };
  if (!isValidIso(raw.createdAt)) return { error: 'createdAt ungültig' };
  if (!isValidIso(raw.updatedAt)) return { error: 'updatedAt ungültig' };
  for (const k of ['bedTime', 'finalWakeTime', 'gotUpAt'] as const) if (!optIso(raw[k])) return { error: `${k} ungültig` };
  if (!optString(raw.gotUpEventId)) return { error: 'gotUpEventId ungültig' };
  if (!optString(raw.note) || (typeof raw.note === 'string' && raw.note.length > NOTE_MAX_LENGTH)) return { error: 'note ungültig oder zu lang' };
  const ep: SleepEpisode = { id: raw.id, nightDate: raw.nightDate as string, createdAt: raw.createdAt as string, updatedAt: raw.updatedAt as string };
  if (typeof raw.bedTime === 'string') ep.bedTime = raw.bedTime;
  if (typeof raw.finalWakeTime === 'string') ep.finalWakeTime = raw.finalWakeTime;
  if (typeof raw.gotUpAt === 'string') ep.gotUpAt = raw.gotUpAt;
  if (typeof raw.gotUpEventId === 'string' && raw.gotUpEventId) ep.gotUpEventId = raw.gotUpEventId;
  if (typeof raw.note === 'string' && raw.note.trim()) ep.note = raw.note;
  return { value: ep };
}

function validateEvent(raw: unknown): { value?: WakeEvent; error?: string } {
  if (!isObj(raw)) return { error: 'kein Objekt' };
  if (typeof raw.id !== 'string' || !raw.id) return { error: 'id fehlt' };
  if (typeof raw.episodeId !== 'string' || !raw.episodeId) return { error: 'episodeId fehlt' };
  if (!isValidIso(raw.occurredAt)) return { error: 'occurredAt ungültig' };
  if (!isOutcome(raw.outcome)) return { error: `outcome „${String(raw.outcome)}“ unbekannt` };
  if (!isValidIso(raw.createdAt)) return { error: 'createdAt ungültig' };
  if (!isValidIso(raw.updatedAt)) return { error: 'updatedAt ungültig' };
  if (!optString(raw.note) || (typeof raw.note === 'string' && raw.note.length > NOTE_MAX_LENGTH)) return { error: 'note ungültig oder zu lang' };
  const ev: WakeEvent = {
    id: raw.id,
    episodeId: raw.episodeId,
    occurredAt: raw.occurredAt as string,
    outcome: raw.outcome,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
  };
  if (typeof raw.note === 'string' && raw.note.trim()) ev.note = raw.note;
  return { value: ev };
}

/** Prüft eine Sicherungsdatei vollständig. Gültige Datensätze werden übernommen, ungültige gemeldet. */
export function parseBackup(text: string): ParsedBackup {
  const empty: ParsedBackup = { ok: false, data: { episodes: [], events: [] }, errors: [], totalEpisodes: 0, totalEvents: 0 };
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { ...empty, fatal: 'Die Datei ist keine gültige JSON-Datei.' };
  }
  if (!isObj(json) || json.format !== BACKUP_FORMAT) return { ...empty, fatal: 'Die Datei ist keine WakeLog-Sicherung.' };
  if (typeof json.schemaVersion !== 'number' || json.schemaVersion < 1)
    return { ...empty, fatal: 'Die Sicherung enthält keine gültige Schema-Version.' };
  if (json.schemaVersion > BACKUP_SCHEMA_VERSION)
    return { ...empty, fatal: `Die Sicherung stammt aus einer neueren WakeLog-Version (Schema ${json.schemaVersion}). Bitte die App aktualisieren.` };
  if (!Array.isArray(json.episodes) || !Array.isArray(json.events))
    return { ...empty, fatal: 'Die Sicherung enthält keine Listen „episodes“ und „events“.' };

  const errors: string[] = [];
  const episodes: SleepEpisode[] = [];
  const ids = new Set<string>();
  const nights = new Set<string>();
  json.episodes.forEach((raw, i) => {
    const r = validateEpisode(raw);
    if (!r.value) return errors.push(`Nacht ${i + 1}: ${r.error}`);
    if (ids.has(r.value.id)) return errors.push(`Nacht ${i + 1}: doppelte ID`);
    if (nights.has(r.value.nightDate)) return errors.push(`Nacht ${i + 1}: Datum ${formatDate(r.value.nightDate)} kommt doppelt vor`);
    ids.add(r.value.id);
    nights.add(r.value.nightDate);
    episodes.push(r.value);
  });
  const events: WakeEvent[] = [];
  const evIds = new Set<string>();
  json.events.forEach((raw, i) => {
    const r = validateEvent(raw);
    if (!r.value) return errors.push(`Ereignis ${i + 1}: ${r.error}`);
    if (!ids.has(r.value.episodeId)) return errors.push(`Ereignis ${i + 1}: gehört zu keiner gültigen Nacht`);
    if (evIds.has(r.value.id)) return errors.push(`Ereignis ${i + 1}: doppelte ID`);
    evIds.add(r.value.id);
    events.push(r.value);
  });
  const data = normalizeLinks({ episodes, events });
  return {
    ok: true,
    data,
    settings: isObj(json.settings) ? sanitizeSettings(json.settings) : undefined,
    errors,
    totalEpisodes: json.episodes.length,
    totalEvents: json.events.length,
  };
}

/** Entfernt Verknüpfungen auf nicht (mehr) vorhandene Aufsteh-Ereignisse. */
export function normalizeLinks(data: WakeData): WakeData {
  const evById = new Map(data.events.map((e) => [e.id, e]));
  return {
    episodes: data.episodes.map((ep) => {
      if (!ep.gotUpEventId) return ep;
      const ev = evById.get(ep.gotUpEventId);
      if (ev && ev.episodeId === ep.id && ev.outcome === 'got_up') return ep;
      const { gotUpEventId: _unused, ...rest } = ep;
      void _unused;
      return rest;
    }),
    events: data.events,
  };
}

export interface MergeReport {
  episodesAdded: number;
  episodesUpdated: number;
  episodesUnchanged: number;
  eventsAdded: number;
  eventsUpdated: number;
  eventsSkipped: number;
}

/**
 * Zusammenführen: Nächte werden über ID bzw. Datum zugeordnet, Ereignisse über ID.
 * Bei Konflikten gewinnt der jüngere updatedAt-Stand. Inhaltlich identische Ereignisse werden übersprungen.
 */
export function mergeData(existing: WakeData, incoming: WakeData): { data: WakeData; report: MergeReport } {
  const report: MergeReport = { episodesAdded: 0, episodesUpdated: 0, episodesUnchanged: 0, eventsAdded: 0, eventsUpdated: 0, eventsSkipped: 0 };
  const episodes = new Map(existing.episodes.map((e) => [e.id, e]));
  const byNight = new Map(existing.episodes.map((e) => [e.nightDate, e]));
  const idMap = new Map<string, string>(); // importierte Episoden-ID → Ziel-ID

  for (const inc of incoming.episodes) {
    const target = episodes.get(inc.id) ?? byNight.get(inc.nightDate);
    if (!target) {
      episodes.set(inc.id, inc);
      byNight.set(inc.nightDate, inc);
      idMap.set(inc.id, inc.id);
      report.episodesAdded++;
      continue;
    }
    idMap.set(inc.id, target.id);
    if (target.nightDate !== inc.nightDate) {
      // gleiche ID, anderes Datum: als eigene Nacht übernehmen, falls Datum frei ist
      if (!byNight.has(inc.nightDate)) {
        const copy = { ...inc, id: `${inc.id}-import` };
        episodes.set(copy.id, copy);
        byNight.set(copy.nightDate, copy);
        idMap.set(inc.id, copy.id);
        report.episodesAdded++;
      } else report.episodesUnchanged++;
      continue;
    }
    if (inc.updatedAt > target.updatedAt) {
      const merged: SleepEpisode = { ...inc, id: target.id, createdAt: target.createdAt < inc.createdAt ? target.createdAt : inc.createdAt };
      episodes.set(target.id, merged);
      byNight.set(merged.nightDate, merged);
      report.episodesUpdated++;
    } else report.episodesUnchanged++;
  }

  const events = new Map(existing.events.map((e) => [e.id, e]));
  const sig = (e: WakeEvent) => `${e.episodeId}|${Math.floor(Date.parse(e.occurredAt) / 60000)}|${e.outcome}|${e.note ?? ''}`;
  const signatures = new Set(existing.events.map(sig));
  for (const raw of incoming.events) {
    const episodeId = idMap.get(raw.episodeId);
    if (!episodeId) {
      report.eventsSkipped++;
      continue;
    }
    const inc = { ...raw, episodeId };
    const same = events.get(inc.id);
    if (same) {
      if (inc.updatedAt > same.updatedAt && same.episodeId === inc.episodeId) {
        events.set(inc.id, inc);
        report.eventsUpdated++;
      } else report.eventsSkipped++;
      continue;
    }
    if (signatures.has(sig(inc))) {
      report.eventsSkipped++;
      continue;
    }
    events.set(inc.id, inc);
    signatures.add(sig(inc));
    report.eventsAdded++;
  }
  return { data: normalizeLinks({ episodes: [...episodes.values()], events: [...events.values()] }), report };
}
