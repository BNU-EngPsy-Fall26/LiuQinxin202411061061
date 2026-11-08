/**
 * Deterministic seeded randomness.
 * A session seed is stored with every experiment so trial order can be
 * reproduced for auditing without relying on Math.random().
 */

export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    if (this.state === 0) this.state = 0x6d2b79f5;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    if (max <= min) return min;
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, Math.max(0, Math.min(count, items.length)));
  }
}

export function hashString(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `${values[0].toString(36)}${values[1].toString(36)}`;
}

/**
 * Shuffle and then reduce long runs of identical condition IDs.
 * This avoids obvious streak artefacts without breaking condition balance.
 */
export function balancedOrder<T>(
  items: readonly T[],
  conditionOf: (item: T) => string,
  seed: string,
  maxRun = 3,
): T[] {
  const rng = new Rng(seed);
  let best = rng.shuffle(items);
  let bestPenalty = runPenalty(best, conditionOf, maxRun);
  for (let attempt = 0; attempt < 120 && bestPenalty > 0; attempt += 1) {
    const candidate = rng.shuffle(items);
    const penalty = runPenalty(candidate, conditionOf, maxRun);
    if (penalty < bestPenalty) {
      best = candidate;
      bestPenalty = penalty;
    }
  }
  return best;
}

function runPenalty<T>(
  items: readonly T[],
  conditionOf: (item: T) => string,
  maxRun: number,
): number {
  let penalty = 0;
  let run = 1;
  for (let i = 1; i < items.length; i += 1) {
    if (conditionOf(items[i]) === conditionOf(items[i - 1])) {
      run += 1;
      if (run > maxRun) penalty += run - maxRun;
    } else {
      run = 1;
    }
  }
  return penalty;
}
