import type { OpContext } from '../src/lib/episodes';
import { EMPTY_DATA, type WakeData, applyChanges, type Changes } from '../src/lib/model';
import { combineLocal } from '../src/lib/time';

/** Deterministischer Kontext: fortlaufende IDs, feste „Jetzt“-Zeit (Sekunde wird pro Aufruf erhöht). */
export function ctx(nowIso = '2026-10-14T10:00:00.000Z'): OpContext & { tick(): void } {
  let n = 0;
  let now = new Date(nowIso);
  return {
    get now() {
      return now;
    },
    newId: () => `id-${++n}`,
    tick() {
      now = new Date(now.getTime() + 1000);
    },
  };
}

export const at = (date: string, time: string) => combineLocal(date, time);

export function apply(data: WakeData, ch: Changes): WakeData {
  return applyChanges(data, ch);
}

export const empty = (): WakeData => structuredClone(EMPTY_DATA);
