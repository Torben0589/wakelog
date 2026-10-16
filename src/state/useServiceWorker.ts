import { useCallback, useEffect, useRef, useState } from 'react';

export interface SwState {
  supported: boolean;
  /** Service Worker steuert die Seite → App-Dateien liegen offline vor */
  offlineReady: boolean;
  updateAvailable: boolean;
  applyUpdate: () => void;
}

/** Registriert den Service Worker (nur im Produktions-Build) und meldet verfügbare Updates. */
export function useServiceWorker(): SwState {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD;
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offlineReady, setOfflineReady] = useState(() => supported && !!navigator.serviceWorker.controller);
  /** Nur nach bewusstem Klick auf „Aktualisieren“ neu laden – nie unerwartet während der Eingabe. */
  const updateRequested = useRef(false);

  useEffect(() => {
    if (!supported) return;
    let reg: ServiceWorkerRegistration | undefined;
    let reloading = false;
    const onController = () => {
      if (reloading || !updateRequested.current) return;
      reloading = true;
      window.location.reload();
    };
    const track = (r: ServiceWorkerRegistration) => {
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
      r.addEventListener('updatefound', () => {
        const sw = r.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed') {
            if (navigator.serviceWorker.controller) setWaiting(sw); // Update für bestehende Installation
            else setOfflineReady(true); // Erstinstallation
          }
        });
      });
    };
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((r) => {
        reg = r;
        track(r);
      })
      .catch(() => {
        /* z. B. kein HTTPS → App funktioniert, aber nicht offline */
      });
    navigator.serviceWorker.ready.then(() => setOfflineReady(true)).catch(() => {});
    const listener = () => onController();
    navigator.serviceWorker.addEventListener('controllerchange', listener);
    const onVisible = () => document.visibilityState === 'visible' && navigator.onLine && reg?.update().catch(() => {});
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', listener);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [supported]);

  const applyUpdate = useCallback(() => {
    updateRequested.current = true;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      // Fallback, falls controllerchange ausbleibt
      setTimeout(() => window.location.reload(), 3000);
    } else window.location.reload();
  }, [waiting]);

  return { supported, offlineReady, updateAvailable: !!waiting, applyUpdate };
}
