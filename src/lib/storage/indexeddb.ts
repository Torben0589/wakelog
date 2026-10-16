/**
 * IndexedDB-Speicher.
 *
 * Schema (DB "wakelog", Version 1)
 *   episodes  keyPath "id"   Indizes: nightDate (unique)
 *   events    keyPath "id"   Indizes: episodeId, occurredAt
 *
 * Schema-Änderungen: DB_VERSION erhöhen und in MIGRATIONS eine Funktion für die neue Version ergänzen.
 * Beim Öffnen werden alle Migrationen von (alteVersion + 1) bis DB_VERSION nacheinander ausgeführt,
 * innerhalb der Upgrade-Transaktion – schlägt eine fehl, bleibt die alte Datenbank unverändert.
 */
import type { Changes, SleepEpisode, WakeData, WakeEvent } from '../model';
import { type DataStore, StorageError, describeStorageError } from './types';

export const DB_NAME = 'wakelog';
export const DB_VERSION = 1;

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

const MIGRATIONS: Record<number, Migration> = {
  1: (db) => {
    const episodes = db.createObjectStore('episodes', { keyPath: 'id' });
    episodes.createIndex('nightDate', 'nightDate', { unique: true });
    const events = db.createObjectStore('events', { keyPath: 'id' });
    events.createIndex('episodeId', 'episodeId', { unique: false });
    events.createIndex('occurredAt', 'occurredAt', { unique: false });
  },
  // 2: (db, tx) => { … z. B. tx.objectStore('events').createIndex(…) … },
};

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaktion abgebrochen', 'AbortError'));
  });
}

/** JSON-Kopie ohne undefined-Felder (IndexedDB speichert sonst explizite undefined-Werte). */
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class IndexedDbStore implements DataStore {
  readonly kind = 'indexeddb' as const;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private factory: IDBFactory = indexedDB) {}

  static isAvailable(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = this.factory.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(new StorageError(describeStorageError(e), e));
        return;
      }
      request.onupgradeneeded = (ev) => {
        const db = request.result;
        const tx = request.transaction!;
        for (let v = ev.oldVersion + 1; v <= DB_VERSION; v++) MIGRATIONS[v]?.(db, tx);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Eine neuere App-Version in einem anderen Tab möchte upgraden → Verbindung freigeben.
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(new StorageError(describeStorageError(request.error), request.error));
      request.onblocked = () => reject(new StorageError('Die Datenbank wird von einem anderen Fenster blockiert. Bitte andere WakeLog-Fenster schließen.'));
    }).catch((e) => {
      this.dbPromise = null;
      throw e;
    });
    return this.dbPromise;
  }

  private async run(mode: IDBTransactionMode, fn: (tx: IDBTransaction) => void): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction(['episodes', 'events'], mode);
      fn(tx);
      await done(tx);
    } catch (e) {
      throw e instanceof StorageError ? e : new StorageError(describeStorageError(e), e);
    }
  }

  async loadAll(): Promise<WakeData> {
    const db = await this.open();
    try {
      const tx = db.transaction(['episodes', 'events'], 'readonly');
      const [episodes, events] = await Promise.all([
        req(tx.objectStore('episodes').getAll() as IDBRequest<SleepEpisode[]>),
        req(tx.objectStore('events').getAll() as IDBRequest<WakeEvent[]>),
      ]);
      return { episodes, events };
    } catch (e) {
      throw new StorageError('Die gespeicherten Daten konnten nicht gelesen werden.', e);
    }
  }

  apply(ch: Changes): Promise<void> {
    return this.run('readwrite', (tx) => {
      const eps = tx.objectStore('episodes');
      const evs = tx.objectStore('events');
      for (const id of ch.deleteEventIds ?? []) evs.delete(id);
      for (const id of ch.deleteEpisodeIds ?? []) {
        eps.delete(id);
        // Kaskade: zugehörige Ereignisse löschen
        const r = evs.index('episodeId').openKeyCursor(IDBKeyRange.only(id));
        r.onsuccess = () => {
          const c = r.result;
          if (c) {
            evs.delete(c.primaryKey);
            c.continue();
          }
        };
      }
      for (const ep of ch.putEpisodes ?? []) eps.put(clean(ep));
      for (const ev of ch.putEvents ?? []) evs.put(clean(ev));
    });
  }

  replaceAll(data: WakeData): Promise<void> {
    return this.run('readwrite', (tx) => {
      const eps = tx.objectStore('episodes');
      const evs = tx.objectStore('events');
      eps.clear();
      evs.clear();
      for (const ep of data.episodes) eps.put(clean(ep));
      for (const ev of data.events) evs.put(clean(ev));
    });
  }

  clear(): Promise<void> {
    return this.run('readwrite', (tx) => {
      tx.objectStore('episodes').clear();
      tx.objectStore('events').clear();
    });
  }
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (Ergebnis: true/false/null = nicht unterstützt). */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
