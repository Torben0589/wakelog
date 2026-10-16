import { Icon, type IconName } from './components/Icons';
import { AppProvider, type Route, useApp } from './state/AppContext';
import { useServiceWorker } from './state/useServiceWorker';
import { CalendarView } from './views/CalendarView';
import { SettingsView } from './views/SettingsView';
import { StatsView } from './views/StatsView';
import { TodayView } from './views/TodayView';

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

const TABS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'heute', label: 'Heute', icon: 'moon' },
  { route: 'kalender', label: 'Kalender', icon: 'calendar' },
  { route: 'statistik', label: 'Statistik', icon: 'chart' },
];

const TITLES: Record<Route, string> = { heute: 'Heute', kalender: 'Kalender', statistik: 'Statistik', einstellungen: 'Einstellungen' };

function Shell() {
  const { route, navigate, status, loadError, retryLoad, storeKind, toasts, dismissToast } = useApp();
  const sw = useServiceWorker();
  const isSettings = route === 'einstellungen';

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Zum Inhalt springen
      </a>
      <header className="topbar">
        {isSettings ? (
          <button type="button" className="back-btn" onClick={() => history.length > 1 ? history.back() : navigate('heute')}>
            <Icon name="chevronLeft" /> Zurück
          </button>
        ) : (
          <span className="brand" aria-hidden="true">
            <img src="./icons/favicon.svg" alt="" width={28} height={28} />
          </span>
        )}
        <h1>{TITLES[route]}</h1>
        {!isSettings ? (
          <button type="button" className="icon-btn gear" onClick={() => navigate('einstellungen')} aria-label="Einstellungen">
            <Icon name="settings" size={24} />
          </button>
        ) : (
          <span className="topbar-spacer" />
        )}
      </header>

      {sw.updateAvailable && (
        <div className="update-banner" role="status">
          <Icon name="refresh" size={18} />
          <span>Eine neue Version von WakeLog ist verfügbar.</span>
          <button type="button" className="btn btn-small btn-primary" onClick={sw.applyUpdate}>
            Aktualisieren
          </button>
        </div>
      )}
      {storeKind === 'memory' && (
        <div className="update-banner warn" role="alert">
          <Icon name="alert" size={18} />
          <span>Lokaler Speicher nicht verfügbar – Einträge gehen beim Schließen verloren. Bitte privaten Modus beenden.</span>
        </div>
      )}

      <main id="main" className="main" tabIndex={-1}>
        {status === 'loading' && (
          <div className="loading" role="status">
            <span className="spinner" aria-hidden="true" /> Daten werden geladen …
          </div>
        )}
        {status === 'error' && (
          <div className="view">
            <div className="empty">
              <div className="empty-icon">
                <Icon name="alert" size={28} />
              </div>
              <h3>Daten konnten nicht geladen werden</h3>
              <p className="muted">{loadError}</p>
              <button type="button" className="btn btn-primary" onClick={retryLoad}>
                Erneut versuchen
              </button>
            </div>
          </div>
        )}
        {status === 'ready' && (
          <>
            {route === 'heute' && <TodayView />}
            {route === 'kalender' && <CalendarView />}
            {route === 'statistik' && <StatsView />}
            {route === 'einstellungen' && <SettingsView sw={sw} />}
          </>
        )}
      </main>

      <nav className="tabbar" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <button
            key={t.route}
            type="button"
            className={route === t.route ? 'tab active' : 'tab'}
            aria-current={route === t.route ? 'page' : undefined}
            onClick={() => navigate(t.route)}
          >
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon name={t.kind === 'error' ? 'alert' : 'check'} size={18} />
            <span>{t.text}</span>
            <button type="button" className="icon-btn small" onClick={() => dismissToast(t.id)} aria-label="Meldung schließen">
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
