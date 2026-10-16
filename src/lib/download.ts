/**
 * Datei bereitstellen: Auf Touch-Geräten (iPhone) über das Teilen-Menü („In Dateien sichern“),
 * sonst als normaler Download. Muss direkt im Klick-Handler aufgerufen werden.
 */
export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareOrDownload(filename: string, content: string, mime: string): Promise<ShareResult> {
  const blob = new Blob([content], { type: mime });
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  if (touch && typeof File !== 'undefined' && navigator.canShare) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'cancelled';
        // z. B. NotAllowedError → auf Download ausweichen
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
