import { describe, expect, it } from 'vitest';
import { DEFAULT_PERCEPTUAL_ORDERING_CONFIG } from '@shared/config';
import type {
  ExperimentBlockConfig,
  OrderingVariant,
  PerceptualOrderingConfig,
} from '@shared/types';
import {
  ORDERING_DIFFICULTIES,
  generateOrderingTrials,
  summarizeOrdering,
} from './generator';

function config(
  overrides: Partial<PerceptualOrderingConfig> = {},
): PerceptualOrderingConfig {
  return {
    ...structuredClone(DEFAULT_PERCEPTUAL_ORDERING_CONFIG),
    ...overrides,
  };
}

describe('perceptual ordering trial generation', () => {
  it('generates the requested formal count and balances difficulty', () => {
    const specs = generateOrderingTrials({
      config: config(),
      phase: 'formal',
      count: 24,
      seed: 'ordering-balance',
    });

    expect(specs).toHaveLength(24);
    for (const difficulty of ORDERING_DIFFICULTIES) {
      expect(specs.filter((spec) => spec.difficulty === difficulty)).toHaveLength(8);
    }
    expect(new Set(specs.map((spec) => spec.id)).size).toBe(24);
  });

  it('splits each default 20-trial block as 7/7/6 and keeps extension aspects mixed', () => {
    const cfg = config();
    const blocks = cfg.blocks as ExperimentBlockConfig<OrderingVariant>[];
    const original = blocks.find(
      (block) => block.block_type === 'original_block',
    )!;
    const extension = blocks.find(
      (block) => block.block_type === 'extension_block',
    )!;
    const originalSpecs = generateOrderingTrials({
      config: cfg,
      phase: 'formal',
      count: original.formalTrials,
      seed: 'ordering-default-original',
      block: original,
    });
    const extensionSpecs = generateOrderingTrials({
      config: cfg,
      phase: 'formal',
      count: extension.formalTrials,
      seed: 'ordering-default-mixed',
      block: extension,
    });

    expect(originalSpecs).toHaveLength(20);
    expect(extensionSpecs).toHaveLength(20);
    for (const specs of [originalSpecs, extensionSpecs]) {
      expect(specs.filter((spec) => spec.difficulty === 'easy')).toHaveLength(7);
      expect(specs.filter((spec) => spec.difficulty === 'medium')).toHaveLength(7);
      expect(specs.filter((spec) => spec.difficulty === 'hard')).toHaveLength(6);
    }
    for (const spec of originalSpecs) {
      for (const rectangle of spec.rectangles) {
        expect(rectangle.aspectRatio).toBe(cfg.aspectRatio);
      }
    }
    expect(
      new Set(
        extensionSpecs.flatMap((spec) =>
          spec.rectangles.map((rectangle) => rectangle.aspectRatio),
        ),
      ).size,
    ).toBeGreaterThan(1);
  });

  it('preserves the configured area ratios and derives ranks from area', () => {
    const cfg = config();
    const specs = generateOrderingTrials({
      config: cfg,
      phase: 'formal',
      count: 24,
      seed: 'ordering-ratios',
    });

    for (const spec of specs) {
      const ratios = cfg.difficulties[spec.difficulty];
      expect(spec.rectangles).toHaveLength(cfg.rectanglesPerTrial);
      expect(spec.rectangles.map((rect) => rect.areaRatio).sort((a, b) => a - b)).toEqual(
        [...ratios].sort((a, b) => a - b),
      );
      expect(spec.rectangles.map((rect) => rect.area).sort((a, b) => a - b)).toEqual(
        ratios
          .map((ratio) => cfg.baseArea * ratio)
          .sort((a, b) => a - b),
      );
      const ranks = spec.rectangles
        .slice()
        .sort((a, b) => a.area - b.area)
        .map((rect) => rect.trueRank);
      expect(ranks).toEqual(
        Array.from({ length: cfg.rectanglesPerTrial }, (_, index) => index),
      );
    }
  });

  it('starts in an order that is neither already correct nor exactly reversed', () => {
    const specs = generateOrderingTrials({
      config: config(),
      phase: 'formal',
      count: 24,
      seed: 'ordering-initial',
    });

    for (const spec of specs) {
      expect(spec.initialOrder).toHaveLength(spec.rectangles.length);
      expect(new Set(spec.initialOrder).size).toBe(spec.rectangles.length);
      const correct = spec.rectangles
        .slice()
        .sort((a, b) => a.trueRank - b.trueRank)
        .map((rect) => rect.id);
      const reversed = [...correct].reverse();
      expect(spec.initialOrder).not.toEqual(correct);
      expect(spec.initialOrder).not.toEqual(reversed);
      for (const rect of spec.rectangles) {
        expect(rect.initialPosition).toBe(spec.initialOrder.indexOf(rect.id));
      }
    }
  });

  it('is reproducible for a given session seed', () => {
    const first = generateOrderingTrials({
      config: config(),
      phase: 'formal',
      count: 24,
      seed: 'ordering-repro',
    });
    const second = generateOrderingTrials({
      config: config(),
      phase: 'formal',
      count: 24,
      seed: 'ordering-repro',
    });
    expect(first.map((spec) => spec.id)).toEqual(second.map((spec) => spec.id));
    expect(first.map((spec) => spec.initialOrder)).toEqual(
      second.map((spec) => spec.initialOrder),
    );
  });

  it('summarizes exact accuracy and position error by difficulty', () => {
    const summary = summarizeOrdering(
      [
        {
          trialIndex: 1,
          blockId: 'po_original',
          blockType: 'original_block',
          variant: 'uniform_aspect',
          conditionId: 'ordering_easy',
          difficulty: 'easy',
          correct: true,
          positionError: 0,
          completedCount: 5,
          responseTime: 5000,
          timeout: false,
          operations: 2,
        },
        {
          trialIndex: 2,
          blockId: 'po_original',
          blockType: 'original_block',
          variant: 'uniform_aspect',
          conditionId: 'ordering_hard',
          difficulty: 'hard',
          correct: false,
          positionError: 2,
          completedCount: 5,
          responseTime: 9000,
          timeout: false,
          operations: 5,
        },
      ],
      24,
      true,
    );
    expect(summary.completed_trials).toBe(2);
    expect(summary.total_trials).toBe(24);
    expect(summary.accuracy).toBe(0.5);
    expect(summary.mean_response_time_ms).toBe(5000);
    const details = summary.details as Record<string, unknown>;
    expect(details.by_difficulty).toHaveProperty('easy');
    expect(details.mean_position_error).toBe(1);
    expect(details.mean_operations).toBe(3.5);
  });
});
