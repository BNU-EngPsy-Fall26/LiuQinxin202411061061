import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIGS,
  DEFAULT_PERCEPTUAL_ORDERING_CONFIG,
  DEFAULT_VISUAL_SEARCH_CONFIG,
  cloneDefaultConfig,
  enforceOriginalConditions,
} from './config.js';
import {
  allocateBalanced,
  buildBlockRuns,
  resolveBlockOrder,
  totalFormalTrials,
} from './blocks.js';
import type { ExperimentId, VisualSearchConfig } from './types.js';

describe('block model defaults', () => {
  it('ships the fixed three-block visual-search design and the other experiments', () => {
    expect(DEFAULT_VISUAL_SEARCH_CONFIG.blocks).toHaveLength(3);
    expect(
      DEFAULT_VISUAL_SEARCH_CONFIG.blocks.map((block) => block.formalTrials),
    ).toEqual([10, 10, 15]);
    expect(
      DEFAULT_VISUAL_SEARCH_CONFIG.blocks.reduce(
        (sum, block) => sum + block.formalTrials,
        0,
      ),
    ).toBe(35);
    expect(DEFAULT_VISUAL_SEARCH_CONFIG.practiceTrials).toBe(2);

    const ordering = DEFAULT_CONFIGS['perceptual-ordering' as ExperimentId];
    expect(ordering.blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of ordering.blocks) {
      expect(block.formalTrials).toBe(20);
      expect(block.enabled).toBe(true);
    }
    expect(totalFormalTrials(ordering)).toBe(ordering.blocks.length * 20);

    const map = DEFAULT_CONFIGS['map-alignment'];
    expect(map.blocks.map((block) => block.variant)).toEqual([
      'no_cue',
      'person_cue',
    ]);
    expect(map.blocks.map((block) => block.formalTrials)).toEqual([15, 15]);
    expect(map.blocks.every((block) => block.enabled)).toBe(true);
    expect(map.practiceTrials).toBe(4);
    expect(totalFormalTrials(map)).toBe(30);
    expect(totalFormalTrials(DEFAULT_VISUAL_SEARCH_CONFIG)).toBe(35);
  });

  it('keeps all three visual-search blocks independent and in the fixed order', () => {
    expect(DEFAULT_VISUAL_SEARCH_CONFIG.blocks.map((block) => block.block_id)).toEqual([
      'vs_feature',
      'vs_conjunction',
      'vs_spatial',
    ]);
    expect(
      DEFAULT_VISUAL_SEARCH_CONFIG.blocks.map((block) => block.block_type),
    ).toEqual(['original_block', 'original_block', 'extension_block']);
    expect(DEFAULT_VISUAL_SEARCH_CONFIG.blocks.map((block) => block.variant)).toEqual([
      'feature_search',
      'conjunction_search',
      'spatial_search',
    ]);
    expect(DEFAULT_VISUAL_SEARCH_CONFIG.blocks.every((block) => block.enabled)).toBe(
      true,
    );
    expect(DEFAULT_VISUAL_SEARCH_CONFIG.randomizeBlockOrder).toBe(false);
    expect(DEFAULT_PERCEPTUAL_ORDERING_CONFIG.blocks[0].variant).toBe(
      'uniform_aspect',
    );
    expect(DEFAULT_PERCEPTUAL_ORDERING_CONFIG.blocks[1].variant).toBe(
      'mixed_aspect',
    );
  });

  it('discloses remainder allocation instead of silently unbalancing trials', () => {
    expect(allocateBalanced(20, ['easy', 'medium', 'hard'])).toEqual({
      easy: 7,
      medium: 7,
      hard: 6,
    });
    expect(allocateBalanced(10, ['a', 'b', 'c', 'd', 'e'])).toEqual({
      a: 2,
      b: 2,
      c: 2,
      d: 2,
      e: 2,
    });
  });
});

describe('original-condition lock', () => {
  it('restores every locked visual-search parameter, not just trial count', () => {
    const defaults = cloneDefaultConfig(
      'visual-search',
    ) as VisualSearchConfig;
    const mutated = cloneDefaultConfig('visual-search') as VisualSearchConfig;
    mutated.targetColor = '#000000';
    mutated.letterSizePx = 99;
    mutated.stimulusFontWeight = 700 as unknown as typeof mutated.stimulusFontWeight;
    mutated.gridColumns = 2;
    mutated.blocks[0] = {
      ...mutated.blocks[0],
      label: 'Changed original',
      formalTrials: 4,
      enabled: false,
    };
    mutated.blocks[1] = {
      ...mutated.blocks[1],
      label: 'Changed conjunction',
      formalTrials: 6,
    };

    const locked = enforceOriginalConditions(
      'visual-search',
      mutated,
    ) as VisualSearchConfig;
    expect(locked.targetColor).toBe(defaults.targetColor);
    expect(locked.letterSizePx).toBe(defaults.letterSizePx);
    expect(locked.stimulusFontWeight).toBe(defaults.stimulusFontWeight);
    expect(locked.gridColumns).toBe(defaults.gridColumns);
    expect(locked.blocks[0].label).toBe(defaults.blocks[0].label);
    expect(locked.blocks[0].formalTrials).toBe(10);
    expect(locked.blocks[0].enabled).toBe(true);
    expect(locked.blocks[1].label).toBe(defaults.blocks[1].label);
    expect(locked.blocks[1].formalTrials).toBe(10);
    expect(locked.blocks[2].formalTrials).toBe(15);
  });

  it('leaves extension blocks adjustable and disableable', () => {
    const mutated = cloneDefaultConfig('visual-search');
    mutated.blocks[2] = {
      ...mutated.blocks[2],
      formalTrials: 12,
      enabled: false,
      label: 'Reduced spatial probe',
    };
    const locked = enforceOriginalConditions('visual-search', mutated);
    expect(locked.blocks[2]).toMatchObject({
      block_id: 'vs_spatial',
      block_type: 'extension_block',
      formalTrials: 12,
      enabled: false,
      label: 'Reduced spatial probe',
    });
  });
});

describe('block ordering', () => {
  const config = {
    randomizeBlockOrder: false,
    blocks: [
      {
        block_id: 'b_second',
        block_type: 'extension_block' as const,
        label: 'Second',
        variant: 'spatial_search' as const,
        enabled: true,
        order: 2,
        formalTrials: 20,
      },
      {
        block_id: 'b_first',
        block_type: 'original_block' as const,
        label: 'First',
        variant: 'feature_search' as const,
        enabled: true,
        order: 1,
        formalTrials: 20,
      },
      {
        block_id: 'b_disabled',
        block_type: 'extension_block' as const,
        label: 'Disabled',
        variant: 'spatial_search' as const,
        enabled: false,
        order: 0,
        formalTrials: 20,
      },
    ],
  };

  it('uses configured order and excludes disabled blocks', () => {
    expect(resolveBlockOrder(config, 'seed').map((block) => block.block_id)).toEqual([
      'b_first',
      'b_second',
    ]);
  });

  it('randomizes deterministically from the session seed', () => {
    const randomized = { ...config, randomizeBlockOrder: true };
    const first = resolveBlockOrder(randomized, 'same-seed').map(
      (block) => block.block_id,
    );
    const second = resolveBlockOrder(randomized, 'same-seed').map(
      (block) => block.block_id,
    );
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual(['b_first', 'b_second']);
  });

  it('generates each block independently with correct start indices', () => {
    const runs = buildBlockRuns(config, 'seed', (block, count) =>
      Array.from({ length: count }, (_, index) => `${block.block_id}:${index}`),
    );
    expect(runs.map((run) => run.block.block_id)).toEqual(['b_first', 'b_second']);
    expect(runs.map((run) => run.startIndex)).toEqual([0, 20]);
    expect(runs.every((run) => run.trials.length === run.block.formalTrials)).toBe(
      true,
    );
  });
});
