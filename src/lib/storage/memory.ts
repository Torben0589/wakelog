import { type Changes, type WakeData, applyChanges } from '../model';
import type { DataStore } from './types';

/** Speicher im Arbeitsspeicher – für Tests und als Notlösung, falls IndexedDB fehlt (Daten gehen beim Schließen verloren). */
export class MemoryStore implements DataStore {
  readonly kind = 'memory' as const;
  private data: WakeData;
  constructor(initial: WakeData = { episodes: [], events: [] }) {
    this.data = structuredClone(initial);
  }
  async loadAll(): Promise<WakeData> {
    return structuredClone(this.data);
  }
  async apply(changes: Changes): Promise<void> {
    this.data = applyChanges(this.data, structuredClone(changes));
  }
  async replaceAll(data: WakeData): Promise<void> {
    this.data = structuredClone(data);
  }
  async clear(): Promise<void> {
    this.data = { episodes: [], events: [] };
  }
}
