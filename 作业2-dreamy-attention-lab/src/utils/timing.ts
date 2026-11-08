/**
 * All experiment timing uses the monotonic performance timeline.
 * Date.now() is only used for wall-clock provenance, never to calculate RT.
 */

export function monotonicNow(): number {
  return performance.now();
}

export function mean(values: readonly number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function median(values: readonly number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 === 0
    ? (valid[middle - 1] + valid[middle]) / 2
    : valid[middle];
}

export function round(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} ms`;
}

/**
 * Records the timestamp as close as possible to the browser paint after a
 * state update. It is not a laboratory-grade photodiode timestamp; this
 * limitation is documented in the participant instructions and README.
 */
export function afterPaint(callback: (onset: number) => void): () => void {
  let cancelled = false;
  const first = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!cancelled) callback(monotonicNow());
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(first);
  };
}

export function normalizeKey(event: KeyboardEvent): string {
  if (event.key.startsWith('Arrow')) return event.key;
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}
