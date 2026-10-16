import type { Changes, WakeData } from '../model';

/** Abstraktion des lokalen Speichers. Alle Operationen sind atomar. */
export interface DataStore {
  readonly kind: 'indexeddb' | 'memory';
  loadAll(): Promise<WakeData>;
  apply(changes: Changes): Promise<void>;
  replaceAll(data: WakeData): Promise<void>;
  clear(): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Übersetzt technische Fehler in verständliche Meldungen. */
export function describeStorageError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'QuotaExceededError') return 'Der Gerätespeicher ist voll. Bitte Speicherplatz freigeben und erneut versuchen.';
  if (name === 'InvalidStateError') return 'Der lokale Speicher ist gerade nicht verfügbar. Bitte die App neu öffnen.';
  if (name === 'VersionError') return 'Die gespeicherten Daten stammen aus einer neueren App-Version. Bitte die App aktualisieren.';
  if (name === 'SecurityError') return 'Der Browser erlaubt keinen lokalen Speicher (z. B. im privaten Modus).';
  return 'Die Daten konnten nicht gespeichert werden. Bitte erneut versuchen.';
}
