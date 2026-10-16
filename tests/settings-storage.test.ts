import { describe, expect, it } from 'vitest';
import { addWakeEvent, deleteEpisode } from '../src/lib/episodes';
import { applyChanges } from '../src/lib/model';
import {
  DEFAULT_SETTINGS,
  type KeyValueStorage,
  SETTINGS_KEY,
  applyTheme,
  loadSettings,
  resolveTheme,
  sanitizeSettings,
  saveSettings,
} from '../src/lib/settings';
import { MemoryStore } from '../src/lib/storage/memory';
import { at, ctx } from './helpers';

class MapStorage implements KeyValueStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('Theme speichern und wiederherstellen', () => {
  it('speichert die Auswahl und stellt sie nach „Neustart“ wieder her', () => {
    const storage = new MapStorage();
    expect(loadSettings(storage).theme).toBe('system');
    saveSettings(storage, { ...loadSettings(storage), theme: 'dark' });
    expect(loadSettings(storage).theme).toBe('dark'); // neuer Ladevorgang = Neustart
    saveSettings(storage, { ...loadSettings(storage), theme: 'light' });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).theme).toBe('light');
  });

  it('Systemstandard folgt der Systemeinstellung', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('ungültige oder beschädigte Werte fallen auf Standard zurück', () => {
    const storage = new MapStorage();
    storage.setItem(SETTINGS_KEY, '{kaputt');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ theme: 'lila', binSize: 7, earlyWindowFrom: '25:00' })).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings({ getItem: () => null, setItem: () => { throw new Error('voll'); }, removeItem: () => {} }, DEFAULT_SETTINGS)).toBe(false);
  });

  it('applyTheme setzt data-theme und theme-color', () => {
    const attrs: Record<string, string> = {};
    const meta = { setAttribute: (k: string, v: string) => (attrs[k] = v) };
    const doc = { documentElement: { dataset: {} as Record<string, string>, style: {} as Record<string, string> }, querySelector: () => meta } as unknown as Document;
    applyTheme(doc, 'dark');
    expect(doc.documentElement.dataset.theme).toBe('dark');
    expect(attrs.content).toBe('#0A1220');
  });
});

describe('Speicher (MemoryStore als Referenz der DataStore-Schnittstelle)', () => {
  it('liest, schreibt, ändert und löscht atomar', async () => {
    const store = new MemoryStore();
    const c = ctx();
    let data = await store.loadAll();
    const r = addWakeEvent(data, { occurredAt: at('2026-10-14', '03:37'), outcome: 'unknown' }, c);
    await store.apply(r.changes);
    data = applyChanges(data, r.changes);
    expect(await store.loadAll()).toEqual(data);
    await store.apply(deleteEpisode(data, r.episode.id));
    expect(await store.loadAll()).toEqual({ episodes: [], events: [] });
  });
  it('replaceAll und clear', async () => {
    const store = new MemoryStore();
    await store.replaceAll({ episodes: [{ id: 'a', nightDate: '2026-10-01', createdAt: 'x', updatedAt: 'x' }], events: [] });
    expect((await store.loadAll()).episodes).toHaveLength(1);
    await store.clear();
    expect((await store.loadAll()).episodes).toHaveLength(0);
  });
});
