import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type Changes, EMPTY_DATA, type WakeData, applyChanges } from '../lib/model';
import { DEFAULT_SETTINGS, type Settings, applyTheme, loadSettings, resolveTheme, saveSettings } from '../lib/settings';
import { IndexedDbStore, requestPersistentStorage } from '../lib/storage/indexeddb';
import { MemoryStore } from '../lib/storage/memory';
import { type DataStore, StorageError } from '../lib/storage/types';
import { nightDateFor } from '../lib/time';

export type Route = 'heute' | 'kalender' | 'statistik' | 'einstellungen';
const ROUTES: Route[] = ['heute', 'kalender', 'statistik', 'einstellungen'];

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

interface AppState {
  status: 'loading' | 'ready' | 'error';
  loadError?: string;
  data: WakeData;
  /** Aktueller Datenstand ohne Render-Verzögerung (für Operationen) */
  getData: () => WakeData;
  commit: (changes: Changes) => Promise<void>;
  replaceAll: (data: WakeData) => Promise<void>;
  clearAll: () => Promise<void>;
  retryLoad: () => void;
  storeKind: DataStore['kind'];
  persistent: boolean | null;

  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;

  currentNight: string;
  route: Route;
  navigate: (r: Route) => void;
  calendarNight: string | null;
  openNightInCalendar: (nightDate: string) => void;
  setCalendarNight: (nightDate: string | null) => void;

  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp außerhalb des AppProvider');
  return v;
}

function readRoute(): Route {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'heute';
}

function createStore(): DataStore {
  return IndexedDbStore.isAvailable() ? new IndexedDbStore() : new MemoryStore();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<DataStore>(null as unknown as DataStore);
  if (!storeRef.current) storeRef.current = createStore();
  const [status, setStatus] = useState<AppState['status']>('loading');
  const [loadError, setLoadError] = useState<string>();
  const [data, setData] = useState<WakeData>(EMPTY_DATA);
  const dataRef = useRef<WakeData>(EMPTY_DATA);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);

  // ---------- Daten laden ----------
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    storeRef.current
      .loadAll()
      .then((d) => {
        if (cancelled) return;
        dataRef.current = d;
        setData(d);
        setStatus('ready');
        if (d.episodes.length) requestPersistentStorage().then(setPersistent);
        else navigator.storage?.persisted?.().then(setPersistent).catch(() => setPersistent(null));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof StorageError ? e.message : 'Die gespeicherten Daten konnten nicht geladen werden.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [loadNonce]);

  const setBoth = (d: WakeData) => {
    dataRef.current = d;
    setData(d);
  };

  const commit = useCallback(async (changes: Changes) => {
    await storeRef.current.apply(changes); // wirft StorageError → Aufrufer zeigt Meldung, UI bleibt unverändert
    setBoth(applyChanges(dataRef.current, changes));
    if (persistent !== true) requestPersistentStorage().then(setPersistent);
  }, [persistent]);

  const replaceAll = useCallback(async (d: WakeData) => {
    await storeRef.current.replaceAll(d);
    setBoth(d);
  }, []);

  const clearAll = useCallback(async () => {
    await storeRef.current.clear();
    setBoth(EMPTY_DATA);
  }, []);

  // ---------- Einstellungen & Theme ----------
  const [settings, setSettings] = useState<Settings>(() => loadSettings(safeLocalStorage()));
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    applyTheme(document, resolveTheme(settings.theme, systemDark));
  }, [settings.theme, systemDark]);

  const toastFn = useToasts();

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (!saveSettings(safeLocalStorage(), next)) toastFn.toast('Einstellung konnte nicht dauerhaft gespeichert werden.', 'error');
        return next;
      });
    },
    [toastFn],
  );
  const resetSettings = useCallback(() => {
    saveSettings(safeLocalStorage(), DEFAULT_SETTINGS);
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  // ---------- Aktuelle Nacht (aktualisiert sich minütlich und beim Zurückkehren in die App) ----------
  const [currentNight, setCurrentNight] = useState(() => nightDateFor(new Date()));
  useEffect(() => {
    const update = () => setCurrentNight(nightDateFor(new Date()));
    const t = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  // ---------- Navigation (Hash, damit Zurück-Gesten funktionieren) ----------
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((r: Route) => {
    if (readRoute() !== r) location.hash = `/${r}`;
    window.scrollTo(0, 0);
  }, []);
  const [calendarNight, setCalendarNight] = useState<string | null>(null);
  const openNightInCalendar = useCallback(
    (n: string) => {
      setCalendarNight(n);
      navigate('kalender');
    },
    [navigate],
  );

  const value = useMemo<AppState>(
    () => ({
      status,
      loadError,
      data,
      getData: () => dataRef.current,
      commit,
      replaceAll,
      clearAll,
      retryLoad: () => setLoadNonce((n) => n + 1),
      storeKind: storeRef.current.kind,
      persistent,
      settings,
      updateSettings,
      resetSettings,
      currentNight,
      route,
      navigate,
      calendarNight,
      openNightInCalendar,
      setCalendarNight,
      ...toastFn,
    }),
    [status, loadError, data, commit, replaceAll, clearAll, persistent, settings, updateSettings, resetSettings, currentNight, route, navigate, calendarNight, openNightInCalendar, toastFn],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, kind: Toast['kind'] = 'info') => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-1), { id, text, kind }]);
      if (kind !== 'error') setTimeout(() => dismissToast(id), 3500);
    },
    [dismissToast],
  );
  return useMemo(() => ({ toasts, toast, dismissToast }), [toasts, toast, dismissToast]);
}
