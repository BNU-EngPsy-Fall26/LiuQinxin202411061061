import type {
  BaseExperimentConfig,
  BlockRuntimeState,
  ExperimentBlockConfig,
} from './types.js';

/**
 * Small deterministic PRNG used for block ordering. It is intentionally kept
 * in shared code so the browser and server can reproduce the same order.
 */
export function blockSeedHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const result = [...items];
  let state = blockSeedHash(seed) || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function enabledBlocks(
  config: Pick<BaseExperimentConfig, 'blocks'>,
): ExperimentBlockConfig[] {
  return config.blocks.filter((block) => block.enabled);
}

export function totalFormalTrials(
  config: Pick<BaseExperimentConfig, 'blocks'>,
): number {
  return enabledBlocks(config).reduce(
    (sum, block) => sum + block.formalTrials,
    0,
  );
}

/**
 * Fixed order follows `order` (then block id). Randomized order is shuffled
 * deterministically from the session seed; the resolved order is stored in
 * trial metadata so every observation remains traceable.
 */
export function resolveBlockOrder(
  config: Pick<BaseExperimentConfig, 'blocks' | 'randomizeBlockOrder'>,
  sessionSeed: string,
): BlockRuntimeState[] {
  const active = enabledBlocks(config);
  const fixed = [...active].sort(
    (a, b) => a.order - b.order || a.block_id.localeCompare(b.block_id),
  );
  const ordered = config.randomizeBlockOrder
    ? seededShuffle(fixed, `${sessionSeed}:block-order`)
    : fixed;
  return ordered.map((block, index) => ({
    block_id: block.block_id,
    block_type: block.block_type,
    label: block.label,
    variant: block.variant,
    order: index,
    formal_trials: block.formalTrials,
  }));
}

/** Split a trial count over conditions as evenly as possible. */
export function allocateBalanced(
  total: number,
  keys: string[],
): Record<string, number> {
  const allocation: Record<string, number> = {};
  for (const key of keys) allocation[key] = 0;
  if (keys.length === 0) return allocation;
  const base = Math.floor(total / keys.length);
  let remainder = total % keys.length;
  for (const key of keys) {
    allocation[key] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return allocation;
}

export function describeBlockAllocation(
  allocation: Record<string, number>,
  total: number,
): string {
  const entries = Object.entries(allocation);
  const counts = new Set(entries.map(([, count]) => count));
  if (counts.size <= 1) return `${total} trials evenly balanced across conditions.`;
  return `${total} trials; conditions are not exactly divisible, so the remainder is assigned deterministically: ${entries
    .map(([key, count]) => `${key}=${count}`)
    .join(', ')}.`;
}

export interface BlockRun<T> {
  block: ExperimentBlockConfig;
  trials: T[];
  startIndex: number;
}

/**
 * Resolve the formal block order once per session and generate each block's
 * trials independently. Practice is deliberately not part of these runs.
 */
export function buildBlockRuns<T>(
  config: Pick<BaseExperimentConfig, 'blocks' | 'randomizeBlockOrder'>,
  sessionSeed: string,
  generate: (block: ExperimentBlockConfig, trialCount: number) => T[],
): BlockRun<T>[] {
  const order = resolveBlockOrder(config, sessionSeed);
  const runs: BlockRun<T>[] = [];
  let startIndex = 0;
  for (const state of order) {
    const block = config.blocks.find(
      (candidate) => candidate.block_id === state.block_id,
    );
    if (!block) continue;
    const trials = generate(block, block.formalTrials);
    runs.push({ block, trials, startIndex });
    startIndex += trials.length;
  }
  return runs;
}
