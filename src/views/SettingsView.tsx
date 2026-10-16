import { useRef, useState } from 'react';
import { Notice, PickerInput, Segmented, Switch } from '../components/Controls';
import { Icon } from '../components/Icons';
import { ConfirmDialog, Sheet } from '../components/Sheet';
import { type ParsedBackup, createBackup, mergeData, parseBackup, serializeBackup } from '../lib/backup';
import { buildCsv } from '../lib/csv';
import { fileStamp, shareOrDownload } from '../lib/download';
import { BIN_SIZES } from '../lib/stats';
import { StorageError } from '../lib/storage/types';
import { THEME_LABELS, type ThemePreference, sanitizeSettings } from '../lib/settings';
import { parseTime } from '../lib/time';
import { useApp } from '../state/AppContext';
import type { SwState } from '../state/useServiceWorker';

export function SettingsView({ sw }: { sw: SwState }) {
  const app = useApp();
  const { settings, updateSettings, data, toast } = app;
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ file: string; result: ParsedBackup } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [busy, setBusy] = useState(false);

  const exportJson = async () => {
    try {
      const text = serializeBackup(createBackup(app.getData(), settings, __APP_VERSION__));
      const r = await shareOrDownload(`wakelog-sicherung_${fileStamp()}.json`, text, 'application/json');
      if (r !== 'cancelled') toast('JSON-Sicherung erstellt', 'success');
    } catch {
      toast('Export fehlgeschlagen. Bitte erneut versuchen.', 'error');
    }
  };
  const exportCsv = async () => {
    try {
      const r = await shareOrDownload(`wakelog-export_${fileStamp()}.csv`, buildCsv(app.getData()), 'text/csv;charset=utf-8');
      if (r !== 'cancelled') toast('CSV-Export erstellt', 'success');
    } catch {
      toast('Export fehlgeschlagen. Bitte erneut versuchen.', 'error');
    }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      toast('Die Datei ist zu groß (max. 20 MB).', 'error');
      return;
    }
    try {
      const text = await f.text();
      setParsed({ file: f.name, result: parseBackup(text) });
    } catch {
      toast('Die Datei konnte nicht gelesen werden.', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const wipe = async () => {
    setBusy(true);
    try {
      await app.clearAll();
      app.resetSettings();
      toast('Alle lokalen Daten wurden gelöscht', 'success');
      setConfirmWipe(false);
    } catch (e) {
      toast(e instanceof StorageError ? e.message : 'Löschen fehlgeschlagen.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const windowValid = (() => {
    const f = parseTime(settings.earlyWindowFrom);
    const t = parseTime(settings.earlyWindowTo);
    return f !== null && t !== null && f !== t;
  })();

  return (
    <div className="view settings">
      <section className="card section">
        <h3>Darstellung</h3>
        <Segmented<ThemePreference>
          label="Erscheinungsbild"
          value={settings.theme}
          options={[
            { value: 'light', label: THEME_LABELS.light, icon: 'sun' },
            { value: 'dark', label: THEME_LABELS.dark, icon: 'moon' },
            { value: 'system', label: THEME_LABELS.system, icon: 'monitor' },
          ]}
          onChange={(theme) => updateSettings({ theme })}
        />
        <p className="footnote">„System“ folgt automatisch der Hell-/Dunkel-Einstellung von iOS.</p>
      </section>

      <section className="card section">
        <h3>Statistik</h3>
        <Segmented
          label="Standardintervall für Uhrzeitverteilungen"
          value={settings.binSize}
          options={BIN_SIZES.map((b) => ({ value: b, label: `${b} min` }))}
          onChange={(binSize) => updateSettings({ binSize })}
        />
        <Segmented
          label="Standardzeitraum"
          value={settings.defaultPeriod}
          options={[
            { value: '7', label: '7 T' },
            { value: '30', label: '30 T' },
            { value: '90', label: '90 T' },
            { value: 'all', label: 'Alle' },
          ]}
          onChange={(defaultPeriod) => updateSettings({ defaultPeriod })}
        />
        <Switch
          label="Standard-Zeitfenster für frühes Aufwachen"
          checked={settings.earlyWindowEnabled}
          onChange={(earlyWindowEnabled) => updateSettings({ earlyWindowEnabled })}
          hint="Wird in der Statistik unter „Verlauf“ vorausgewählt."
        />
        {settings.earlyWindowEnabled && (
          <div className="window-row">
            <div>
              <span className="field-label" aria-hidden="true">Von</span>
              <PickerInput
                type="time"
                label="Frühes Aufwachen von"
                value={settings.earlyWindowFrom}
                onChange={(v) => parseTime(v) !== null && updateSettings({ earlyWindowFrom: v })}
              />
            </div>
            <span aria-hidden="true">–</span>
            <div>
              <span className="field-label" aria-hidden="true">Bis</span>
              <PickerInput
                type="time"
                label="Frühes Aufwachen bis"
                value={settings.earlyWindowTo}
                onChange={(v) => parseTime(v) !== null && updateSettings({ earlyWindowTo: v })}
              />
            </div>
          </div>
        )}
        {settings.earlyWindowEnabled && !windowValid && <Notice kind="warning">Beginn und Ende des Zeitfensters müssen sich unterscheiden.</Notice>}
      </section>

      <section className="card section">
        <h3>Datenverwaltung</h3>
        <p className="muted small">
          {data.episodes.length} Nächte · {data.events.length} Aufwachereignisse gespeichert
        </p>
        <div className="button-list">
          <button type="button" className="list-btn" onClick={exportJson}>
            <Icon name="download" /> <span>JSON exportieren</span>
            <small>Vollständige Sicherung inkl. Einstellungen</small>
          </button>
          <button type="button" className="list-btn" onClick={exportCsv}>
            <Icon name="download" /> <span>CSV exportieren</span>
            <small>Tabelle für Excel/Numbers (eine Zeile pro Ereignis)</small>
          </button>
          <button type="button" className="list-btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> <span>JSON importieren</span>
            <small>Sicherung prüfen, dann zusammenführen oder ersetzen</small>
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" className="list-btn danger" onClick={() => setConfirmWipe(true)}>
            <Icon name="trash" /> <span>Alle lokalen Daten löschen</span>
            <small>Nächte, Ereignisse und Einstellungen</small>
          </button>
        </div>
      </section>

      <section className="card section info">
        <h3>Informationen</h3>
        <div className="about">
          <img src="./icons/icon-192.png" alt="" width={56} height={56} />
          <div>
            <strong>WakeLog</strong>
            <span className="muted small">Version {__APP_VERSION__}</span>
          </div>
        </div>
        <ul className="status-list">
          <li>
            <span>Offline-Nutzung</span>
            <strong>{sw.offlineReady ? 'bereit' : sw.supported ? 'wird eingerichtet' : 'nicht aktiv'}</strong>
          </li>
          <li>
            <span>Speicher</span>
            <strong>{app.storeKind === 'indexeddb' ? 'IndexedDB (lokal)' : 'nur temporär!'}</strong>
          </li>
          <li>
            <span>Dauerhafter Speicher</span>
            <strong>{app.persistent === true ? 'gewährt' : app.persistent === false ? 'nicht gewährt' : 'unbekannt'}</strong>
          </li>
        </ul>
        <h4 className="subhead">
          <Icon name="shield" size={16} /> Datenschutz
        </h4>
        <p className="small">
          Alle Einträge werden ausschließlich auf diesem Gerät gespeichert. Es gibt kein Konto, keinen Server, keine Cloud-Synchronisierung und
          kein Tracking. Daten verlassen das Gerät nur, wenn du selbst eine Export-Datei teilst.
        </p>
        <h4 className="subhead">
          <Icon name="info" size={16} /> Keine Diagnose
        </h4>
        <p className="small">WakeLog ist ein persönliches Protokoll. Die Auswertungen sind rein beschreibend und ersetzen keine ärztliche Beratung.</p>
        <h4 className="subhead">
          <Icon name="download" size={16} /> Sicherung & Wiederherstellung
        </h4>
        <p className="small">
          Lokale Daten können verloren gehen, wenn Website-Daten in Safari gelöscht werden oder die Home-Bildschirm-App entfernt wird. Exportiere
          regelmäßig eine JSON-Sicherung (z. B. in die Dateien-App) und stelle sie über „JSON importieren“ wieder her. Hinweis: Safari-Tab und
          Home-Bildschirm-App haben auf dem iPhone getrennte Speicher.
        </p>
      </section>

      {parsed && (
        <ImportSheet
          file={parsed.file}
          result={parsed.result}
          onClose={() => setParsed(null)}
        />
      )}

      <ConfirmDialog
        open={confirmWipe}
        title="Alle lokalen Daten löschen?"
        message={
          <>
            <p>
              Es werden <strong>{data.episodes.length} Nächte</strong> und <strong>{data.events.length} Aufwachereignisse</strong> sowie alle
              Einstellungen dauerhaft von diesem Gerät gelöscht.
            </p>
            <p>Tipp: Vorher eine JSON-Sicherung exportieren.</p>
          </>
        }
        confirmLabel="Endgültig löschen"
        danger
        requireText="LÖSCHEN"
        busy={busy}
        onConfirm={wipe}
        onCancel={() => setConfirmWipe(false)}
      />
    </div>
  );
}

function ImportSheet({ file, result, onClose }: { file: string; result: ParsedBackup; onClose: () => void }) {
  const app = useApp();
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [confirmed, setConfirmed] = useState(false);
  const [takeSettings, setTakeSettings] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = app.data;
  const valid = result.data;

  const run = async () => {
    setError(null);
    if (mode === 'replace' && !confirmed) {
      setError('Bitte bestätige, dass die vorhandenen Daten ersetzt werden sollen.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'merge') {
        const { data, report } = mergeData(app.getData(), valid);
        await app.replaceAll(data);
        app.toast(
          `Zusammengeführt: ${report.episodesAdded} Nächte neu, ${report.episodesUpdated} aktualisiert · ${report.eventsAdded} Ereignisse neu, ${report.eventsUpdated} aktualisiert, ${report.eventsSkipped} übersprungen`,
          'success',
        );
      } else {
        await app.replaceAll(valid);
        if (takeSettings && result.settings) app.updateSettings(sanitizeSettings(result.settings));
        app.toast(`Daten ersetzt: ${valid.episodes.length} Nächte, ${valid.events.length} Ereignisse`, 'success');
      }
      onClose();
    } catch (e) {
      setError(e instanceof StorageError ? e.message : 'Import fehlgeschlagen. Die bisherigen Daten sind unverändert.');
    } finally {
      setBusy(false);
    }
  };

  if (!result.ok) {
    return (
      <Sheet open title="Import nicht möglich" onClose={onClose} footer={<button className="btn btn-primary btn-grow" onClick={onClose}>OK</button>}>
        <Notice kind="error">
          <strong>{file}</strong>
          <p>{result.fatal}</p>
        </Notice>
      </Sheet>
    );
  }

  const nothing = valid.episodes.length === 0;
  return (
    <Sheet
      open
      title="Sicherung importieren"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className={mode === 'replace' ? 'btn btn-danger btn-grow' : 'btn btn-primary btn-grow'} disabled={busy || nothing} onClick={run}>
            {busy ? 'Bitte warten …' : mode === 'replace' ? 'Daten ersetzen' : 'Zusammenführen'}
          </button>
        </>
      }
    >
      <p className="small muted">{file}</p>
      <ul className="status-list">
        <li>
          <span>Gültige Nächte</span>
          <strong>
            {valid.episodes.length} von {result.totalEpisodes}
          </strong>
        </li>
        <li>
          <span>Gültige Ereignisse</span>
          <strong>
            {valid.events.length} von {result.totalEvents}
          </strong>
        </li>
        <li>
          <span>Aktuell gespeichert</span>
          <strong>
            {current.episodes.length} Nächte · {current.events.length} Ereignisse
          </strong>
        </li>
      </ul>
      {result.errors.length > 0 && (
        <Notice kind="warning">
          <p>
            {result.errors.length} {result.errors.length === 1 ? 'Datensatz ist ungültig' : 'Datensätze sind ungültig'} und{' '}
            {result.errors.length === 1 ? 'wird' : 'werden'} nicht übernommen:
          </p>
          <ul className="error-list">
            {result.errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {result.errors.length > 8 && <li>… und {result.errors.length - 8} weitere</li>}
          </ul>
        </Notice>
      )}
      {nothing ? (
        <Notice kind="error">Die Datei enthält keine gültigen Nächte.</Notice>
      ) : (
        <>
          <Segmented
            label="Wie sollen die Daten übernommen werden?"
            value={mode}
            options={[
              { value: 'merge', label: 'Zusammenführen' },
              { value: 'replace', label: 'Vollständig ersetzen' },
            ]}
            onChange={(m) => {
              setMode(m);
              setConfirmed(false);
            }}
          />
          {mode === 'merge' ? (
            <p className="small muted">
              Vorhandene Daten bleiben erhalten. Gleiche Nächte werden zusammengeführt, bei Konflikten gilt der neuere Stand. Bereits vorhandene
              Ereignisse werden übersprungen. Einstellungen bleiben unverändert.
            </p>
          ) : (
            <>
              <Notice kind="warning">
                Alle {current.episodes.length} Nächte und {current.events.length} Ereignisse auf diesem Gerät werden gelöscht und durch die Sicherung
                ersetzt.
              </Notice>
              <label className="check-row">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>Ich habe verstanden, dass die vorhandenen Daten ersetzt werden.</span>
              </label>
              {result.settings && <Switch label="Einstellungen aus der Sicherung übernehmen" checked={takeSettings} onChange={setTakeSettings} />}
            </>
          )}
        </>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Sheet>
  );
}
