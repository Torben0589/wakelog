/**
 * Benutzereinstellungen (lokal in localStorage – synchron verfügbar, damit das Theme
 * schon vor dem ersten Rendern feststeht). Schlafdaten liegen getrennt in IndexedDB.
 */
import { BIN_SIZES, type BinSize, type PeriodKey } from './stats';
import { parseTime } from './time';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface Settings {
  theme: ThemePreference;
  binSize: BinSize;
  defaultPeriod: Exclude<PeriodKey, 'custom'>;
  earlyWindowEnabled: boolean;
  earlyWindowFrom: string; // HH:MM
  earlyWindowTo: string; // HH:MM
}

export const SETTINGS_KEY = 'wakelog.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  binSize: 15,
  defaultPeriod: '30',
  earlyWindowEnabled: true,
  earlyWindowFrom: '03:00',
  earlyWindowTo: '04:00',
};

/** Übernimmt nur gültige Werte; alles andere fällt auf die Standardwerte zurück. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (r.theme === 'light' || r.theme === 'dark' || r.theme === 'system') s.theme = r.theme;
  if ((BIN_SIZES as readonly unknown[]).includes(r.binSize)) s.binSize = r.binSize as BinSize;
  if (r.defaultPeriod === '7' || r.defaultPeriod === '30' || r.defaultPeriod === '90' || r.defaultPeriod === 'all') s.defaultPeriod = r.defaultPeriod;
  if (typeof r.earlyWindowEnabled === 'boolean') s.earlyWindowEnabled = r.earlyWindowEnabled;
  if (typeof r.earlyWindowFrom === 'string' && parseTime(r.earlyWindowFrom) !== null) s.earlyWindowFrom = r.earlyWindowFrom;
  if (typeof r.earlyWindowTo === 'string' && parseTime(r.earlyWindowTo) !== null) s.earlyWindowTo = r.earlyWindowTo;
  return s;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadSettings(storage: KeyValueStorage | undefined): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Gibt false zurück, wenn nicht gespeichert werden konnte (z. B. gesperrter Speicher). */
export function saveSettings(storage: KeyValueStorage | undefined, s: Settings): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
    return !!storage;
  } catch {
    return false;
  }
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/** Farbe der Browser-/Statusleiste je Theme (entspricht --bg in theme.css). */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#F3F5F9', dark: '#0A1220' };

export function applyTheme(doc: Document, theme: ResolvedTheme): void {
  doc.documentElement.dataset.theme = theme;
  doc.documentElement.style.colorScheme = theme;
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

export const THEME_LABELS: Record<ThemePreference, string> = { light: 'Hell', dark: 'Dunkel', system: 'System' };
