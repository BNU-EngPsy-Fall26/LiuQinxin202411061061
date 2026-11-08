import { describe, expect, it } from 'vitest';
import { DEFAULT_VISUAL_SEARCH_CONFIG } from '@shared/config';
import type {
  ExperimentBlockConfig,
  VisualSearchConfig,
  VisualSearchVariant,
} from '@shared/types';
import type {
  GazeTrialMetrics,
  MouseTrialMetrics,
} from '@shared/search-metrics';
import {
  REGION_NUMBERS,
  block3PresentCount,
  plannedRegionCounts,
  regionAtNormalizedPoint,
} from '@shared/visual-search';
import {
  generateVisualSearchPractice,
  generateVisualSearchTrials,
  summarizeVisualSearch,
  type VisualSearchScore,
} from './generator';

function emptyGaze(): GazeTrialMetrics {
  return {
    sample_count: 0,
    valid_sample_count: 0,
    valid_gaze_ratio: null,
    fixation_count: 0,
    fixations: [],
    fixation_regions: [],
    first_fixation_position: null,
    first_fixation_region: null,
    first_fixation_quadrant: null,
    first_fixation_ms: null,
    target_first_fixation_ms: null,
    target_first_fixation_region: null,
    target_distance_normalized: null,
    target_distance_px: null,
    regions_visited_before_target: null,
    target_region_visit_order: null,
    quadrant_transitions: 0,
    quadrant_transition_ratio: null,
    left_to_right_transition_ratio: null,
    right_to_left_transition_ratio: null,
    top_to_bottom_transition_ratio: null,
    bottom_to_top_transition_ratio: null,
    center_to_periphery_transition_ratio: null,
    periphery_to_center_transition_ratio: null,
    quadrant_counts: {
      'top-left': 0,
      'top-right': 0,
      'bottom-left': 0,
      'bottom-right': 0,
      center: 0,
    },
    region_counts: Object.fromEntries(
      REGION_NUMBERS.map((region) => [region, 0]),
    ) as Record<(typeof REGION_NUMBERS)[number], number>,
    quality_sufficient: false,
  };
}

function emptyMouse(): MouseTrialMetrics {
  return {
    sample_count: 0,
    valid_sample_count: 0,
    valid_mouse_ratio: null,
    first_movement_direction: null,
    first_movement_quadrant: null,
    first_movement_position: null,
    first_movement_region: null,
    first_movement_latency_ms: null,
    path_length_px: 0,
    target_distance_normalized: null,
    target_region_relation: null,
    quadrant_transitions: 0,
    left_to_right_transition_ratio: null,
    right_to_left_transition_ratio: null,
    top_to_bottom_transition_ratio: null,
    bottom_to_top_transition_ratio: null,
    center_to_periphery_transition_ratio: null,
    periphery_to_center_transition_ratio: null,
    sufficient_for_metrics: false,
  };
}

function config(overrides: Partial<VisualSearchConfig> = {}): VisualSearchConfig {
  return { ...structuredClone(DEFAULT_VISUAL_SEARCH_CONFIG), ...overrides };
}

function visualBlocks(cfg: VisualSearchConfig): ExperimentBlockConfig<VisualSearchVariant>[] {
  return cfg.blocks as ExperimentBlockConfig<VisualSearchVariant>[];
}

function blockOf(
  cfg: VisualSearchConfig,
  variant: VisualSearchVariant,
): ExperimentBlockConfig<VisualSearchVariant> {
  return visualBlocks(cfg).find((block) => block.variant === variant)!;
}

function score(overrides: Partial<VisualSearchScore> = {}): VisualSearchScore {
  return {
    trialId: 'trial-1',
    trialIndex: 1,
    blockId: 'vs_feature',
    blockName: '特征搜索（颜色）',
    blockType: 'original_block',
    variant: 'feature_search',
    correct: true,
    responseTime: 720,
    timeout: false,
    targetPresent: true,
    targetRegion: 5,
    targetX: 430,
    targetY: 270,
    setSize: 12,
    conditionId: '12_present',
    mouseAvailable: true,
    gazeAvailable: false,
    gazeQuality: 'unavailable',
    gazeValidRatio: null,
    eyeTrackingStatus: 'declined',
    gazeMetrics: emptyGaze(),
    mouseMetrics: emptyMouse(),
    windowBlur: false,
    ...overrides,
  };
}

describe('visual search trial generation', () => {
  it('balances set size × target presence for a search block', () => {
    const cfg = config();
    const specs = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: 96,
      seed: 'vs-balance',
      block: blockOf(cfg, 'feature_search'),
    });

    expect(specs).toHaveLength(96);
    for (const setSize of cfg.setSizes) {
      for (const present of [true, false]) {
        const condition = specs.filter(
          (spec) => spec.setSize === setSize && spec.targetPresent === present,
        );
        expect(condition).toHaveLength(12);
        for (const trial of condition) {
          expect(trial.items).toHaveLength(setSize);
          expect(trial.items.filter((item) => item.isTarget)).toHaveLength(
            present ? 1 : 0,
          );
        }
      }
    }
    expect(new Set(specs.map((spec) => spec.id)).size).toBe(96);
  });

  it('keeps the 10-trial search blocks at five present and five absent across all set sizes', () => {
    const cfg = config();
    for (const variant of ['feature_search', 'conjunction_search'] as const) {
      const block = blockOf(cfg, variant);
      expect(block.formalTrials).toBe(10);
      const specs = generateVisualSearchTrials({
        config: cfg,
        phase: 'formal',
        count: block.formalTrials,
        seed: `vs-ten-${variant}`,
        block,
      });

      expect(specs).toHaveLength(10);
      expect(specs.filter((spec) => spec.targetPresent)).toHaveLength(5);
      expect(specs.filter((spec) => !spec.targetPresent)).toHaveLength(5);
      for (const present of [true, false]) {
        for (const setSize of cfg.setSizes) {
          expect(
            specs.some(
              (spec) =>
                spec.setSize === setSize && spec.targetPresent === present,
            ),
          ).toBe(true);
        }
      }
    }
  });

  it('uses only the red O target and blue O / blue X distractors in Block 1', () => {
    const cfg = config();
    const specs = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: 48,
      seed: 'vs-feature-stimuli',
      block: blockOf(cfg, 'feature_search'),
    });

    for (const trial of specs) {
      const targets = trial.items.filter((item) => item.isTarget);
      expect(targets).toHaveLength(trial.targetPresent ? 1 : 0);
      for (const target of targets) {
        expect(target.letter).toBe('O');
        expect(target.color).toBe(cfg.targetColor);
        expect(target.color).not.toBe(cfg.distractorBlueColor);
        expect(trial.targetCell).toEqual(target.gridCell);
        expect(trial.targetPositionPct?.x).toBeCloseTo(target.xPct, 8);
        expect(trial.targetPositionPct?.y).toBeCloseTo(target.yPct, 8);
        expect(trial.targetPositionPx?.x).toBeCloseTo(target.xPx, 8);
        expect(trial.targetPositionPx?.y).toBeCloseTo(target.yPx, 8);
        expect(trial.targetRegion).toBe(target.region);
      }
      for (const item of trial.items.filter((entry) => !entry.isTarget)) {
        expect(item.color).toBe(cfg.distractorBlueColor);
        expect(['O', 'X']).toContain(item.letter);
      }
      // Block 1 never contains a red X or any other red letter.
      expect(
        trial.items.some(
          (item) =>
            item.color === cfg.distractorRedColor && item.letter !== 'O',
        ),
      ).toBe(false);
    }
  });

  it('keeps Block 1 distractor letters approximately balanced', () => {
    const cfg = config();
    const specs = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: 48,
      seed: 'vs-feature-distractors',
      block: blockOf(cfg, 'feature_search'),
    });

    for (const trial of specs) {
      const distractors = trial.items.filter((item) => !item.isTarget);
      const blueO = distractors.filter((item) => item.letter === 'O').length;
      const blueX = distractors.filter((item) => item.letter === 'X').length;
      expect(blueO + blueX).toBe(distractors.length);
      expect(Math.abs(blueO - blueX)).toBeLessThanOrEqual(1);
    }
  });

  it('uses red X and blue O distractors in Block 2, with the red O target', () => {
    const cfg = config();
    const specs = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: 48,
      seed: 'vs-conjunction-stimuli',
      block: blockOf(cfg, 'conjunction_search'),
    });

    for (const trial of specs) {
      const targets = trial.items.filter((item) => item.isTarget);
      expect(targets).toHaveLength(trial.targetPresent ? 1 : 0);
      for (const target of targets) {
        expect(target.letter).toBe('O');
        expect(target.color).toBe(cfg.targetColor);
      }
      for (const item of trial.items.filter((entry) => !entry.isTarget)) {
        expect(
          (item.letter === 'X' && item.color === cfg.distractorRedColor) ||
            (item.letter === 'O' && item.color === cfg.distractorBlueColor),
        ).toBe(true);
      }
      // A blue X would be a third distractor type and is forbidden.
      expect(
        trial.items.some(
          (item) => item.letter === 'X' && item.color === cfg.distractorBlueColor,
        ),
      ).toBe(false);
      // A non-target red O would make target detection ambiguous.
      expect(
        trial.items.some(
          (item) =>
            !item.isTarget &&
            item.letter === 'O' &&
            item.color === cfg.targetColor,
        ),
      ).toBe(false);
    }
  });

  it('saves actual coordinates and nine-region membership for every item', () => {
    const cfg = config();
    const specs = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: 48,
      seed: 'vs-item-coordinates',
      block: blockOf(cfg, 'conjunction_search'),
    });

    for (const trial of specs) {
      for (const item of trial.items) {
        expect(Number.isFinite(item.xPx)).toBe(true);
        expect(Number.isFinite(item.yPx)).toBe(true);
        expect(Number.isFinite(item.xPct)).toBe(true);
        expect(Number.isFinite(item.yPct)).toBe(true);
        expect(item.region).toBe(
          regionAtNormalizedPoint(item.xPct / 100, item.yPct / 100),
        );
      }
      if (trial.targetPresent) {
        expect(trial.targetPositionPx).not.toBeNull();
        expect(Number.isFinite(trial.targetPositionPx?.x)).toBe(true);
        expect(Number.isFinite(trial.targetPositionPx?.y)).toBe(true);
        expect(trial.targetPositionPct).not.toBeNull();
        expect(trial.targetRegion).not.toBeNull();
      } else {
        expect(trial.targetCell).toBeNull();
        expect(trial.targetRegion).toBeNull();
        expect(trial.targetPositionPct).toBeNull();
        expect(trial.targetPositionPx).toBeNull();
        expect(trial.items.some((item) => item.isTarget)).toBe(false);
      }
    }
  });

  it('avoids long runs of the same set-size condition without losing trials', () => {
    const cfg = config();
    const specs = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: 96,
      seed: 'vs-order',
      block: blockOf(cfg, 'feature_search'),
    });
    let run = 1;
    let maximumRun = 1;
    for (let index = 1; index < specs.length; index += 1) {
      run =
        specs[index].conditionId === specs[index - 1].conditionId ? run + 1 : 1;
      maximumRun = Math.max(maximumRun, run);
    }
    expect(maximumRun).toBeLessThanOrEqual(3);
  });

  it('is reproducible for a given session seed', () => {
    const cfg = config();
    const first = generateVisualSearchTrials({
      config: cfg,
      phase: 'practice',
      count: 8,
      seed: 'vs-repro',
      block: blockOf(cfg, 'feature_search'),
    });
    const second = generateVisualSearchTrials({
      config: cfg,
      phase: 'practice',
      count: 8,
      seed: 'vs-repro',
      block: blockOf(cfg, 'feature_search'),
    });
    expect(first.map((spec) => spec.id)).toEqual(second.map((spec) => spec.id));
    expect(first.map((spec) => spec.items.map((item) => item.gridCell))).toEqual(
      second.map((spec) => spec.items.map((item) => item.gridCell)),
    );
  });

  it('ships the fixed 10 / 10 / 15 formal design with two practice trials per block', () => {
    const cfg = config();
    expect(
      [...cfg.blocks]
        .sort((a, b) => a.order - b.order)
        .map((block) => block.variant),
    ).toEqual(['feature_search', 'conjunction_search', 'spatial_search']);
    expect(
      visualBlocks(cfg).map((block) => block.formalTrials),
    ).toEqual([10, 10, 15]);
    expect(visualBlocks(cfg).filter((block) => block.enabled)).toHaveLength(3);
    expect(visualBlocks(cfg).reduce((sum, block) => sum + block.formalTrials, 0)).toBe(
      35,
    );
    for (const block of visualBlocks(cfg)) {
      const practice = generateVisualSearchPractice({
        config: cfg,
        block,
        seed: `practice-${block.variant}`,
      });
      expect(practice).toHaveLength(2);
      expect(practice.map((trial) => trial.phase)).toEqual(['practice', 'practice']);
      expect(practice.map((trial) => trial.targetPresent)).toEqual([true, false]);
      expect(practice.every((trial) => trial.variant === block.variant)).toBe(true);
      expect(practice.map((trial) => trial.practiceIndex)).toEqual([0, 1]);
    }
  });

  it('gives Blocks 1 and 2 the configured formal counts without mixing variants', () => {
    const cfg = config();
    for (const variant of ['feature_search', 'conjunction_search'] as const) {
      const block = blockOf(cfg, variant);
      const specs = generateVisualSearchTrials({
        config: cfg,
        phase: 'formal',
        count: block.formalTrials,
        seed: `vs-${variant}`,
        block,
      });
      expect(specs).toHaveLength(10);
      expect(specs.every((trial) => trial.variant === variant)).toBe(true);
      expect(specs.every((trial) => trial.blockId === block.block_id)).toBe(true);
    }
  });

  it('gives Block 3 exactly nine present and six absent trials, one per region', () => {
    const cfg = config();
    const block = blockOf(cfg, 'spatial_search');
    expect(block.formalTrials).toBe(15);
    const specs = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: block.formalTrials,
      seed: 'vs-default-spatial',
      block,
    });
    expect(specs).toHaveLength(15);
    const present = specs.filter((spec) => spec.targetPresent);
    const absent = specs.filter((spec) => !spec.targetPresent);
    expect(present).toHaveLength(9);
    expect(absent).toHaveLength(6);
    expect(present.map((spec) => spec.targetRegion).sort()).toEqual(
      [...REGION_NUMBERS].sort(),
    );
    expect(new Set(present.map((spec) => spec.targetRegion)).size).toBe(9);
    for (const spec of present) {
      const target = spec.items.find((item) => item.isTarget);
      expect(target).toBeDefined();
      expect(target?.letter).toBe('O');
      expect(target?.color).toBe(cfg.targetColor);
      expect(spec.targetCell).toEqual(target?.gridCell);
      expect(spec.targetPositionPct?.x).toBeCloseTo(target?.xPct ?? 0, 8);
      expect(spec.targetPositionPct?.y).toBeCloseTo(target?.yPct ?? 0, 8);
      expect(spec.targetRegion).toBe(target?.region);
    }
    for (const spec of absent) {
      expect(spec.targetCell).toBeNull();
      expect(spec.targetRegion).toBeNull();
      expect(spec.targetPositionPct).toBeNull();
      expect(spec.targetPositionPx).toBeNull();
      expect(spec.items.some((item) => item.isTarget)).toBe(false);
      expect(spec.items).toHaveLength(spec.setSize);
    }
  });

  it('interleaves Block 3 presence without a fixed alternation or long runs', () => {
    const cfg = config();
    const block = blockOf(cfg, 'spatial_search');
    const specs = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: 15,
      seed: 'vs-spatial-order',
      block,
    });
    const presence = specs.map((spec) => spec.targetPresent);
    let run = 1;
    let maximumRun = 1;
    for (let index = 1; index < presence.length; index += 1) {
      run = presence[index] === presence[index - 1] ? run + 1 : 1;
      maximumRun = Math.max(maximumRun, run);
    }
    expect(maximumRun).toBeLessThanOrEqual(2);
    const fixedAlternation = presence.every(
      (value, index) => index < 2 || value === presence[index - 2],
    );
    expect(fixedAlternation).toBe(false);
    expect(presence.filter(Boolean)).toHaveLength(9);
  });

  it('rebalances researcher-adjusted Block 3 counts and reports uncovered regions', () => {
    const cfg = config();
    const block = blockOf(cfg, 'spatial_search');
    const reduced = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: 8,
      seed: 'vs-spatial-eight',
      block,
    });
    expect(reduced).toHaveLength(8);
    expect(reduced.filter((spec) => spec.targetPresent)).toHaveLength(
      block3PresentCount(8),
    );
    expect(reduced.filter((spec) => spec.targetPresent)).toHaveLength(8);
    expect(reduced.every((spec) => spec.targetPresent)).toBe(true);
    const counts = plannedRegionCounts(8);
    expect(counts[9]).toBe(0);
    expect(counts[1]).toBe(1);
    expect(uncoveredForTest(8)).toEqual([9]);

    const enlarged = generateVisualSearchTrials({
      config: cfg,
      phase: 'formal',
      count: 18,
      seed: 'vs-spatial-eighteen',
      block,
    });
    expect(enlarged).toHaveLength(18);
    expect(enlarged.filter((spec) => spec.targetPresent)).toHaveLength(
      block3PresentCount(18),
    );
    expect(enlarged.filter((spec) => !spec.targetPresent)).toHaveLength(
      18 - block3PresentCount(18),
    );
    const enlargedCounts = plannedRegionCounts(18);
    expect(REGION_NUMBERS.every((region) => enlargedCounts[region] >= 1)).toBe(true);
  });

  it('summarizes accuracy, correct-trial RT and Block 3 region validity', () => {
    const cfg = config();
    const summary = summarizeVisualSearch(
      [
        score({ trialId: 'correct-1', responseTime: 720 }),
        score({
          trialId: 'incorrect-1',
          correct: false,
          responseTime: 1400,
          targetPresent: false,
          targetRegion: null,
          targetX: null,
          targetY: null,
          setSize: 24,
          conditionId: '24_absent',
          blockId: 'vs_conjunction',
          blockName: '联合搜索（颜色 × 形状）',
          variant: 'conjunction_search',
        }),
        score({
          trialId: 'spatial-1',
          blockId: 'vs_spatial',
          blockName: '空间位置搜索',
          blockType: 'extension_block',
          variant: 'spatial_search',
          responseTime: 900,
          targetRegion: 5,
        }),
      ],
      35,
      true,
      visualBlocks(cfg),
    );
    expect(summary.completed_trials).toBe(3);
    expect(summary.total_trials).toBe(35);
    expect(summary.accuracy).toBeCloseTo(2 / 3, 4);
    expect(summary.mean_response_time_ms).toBe(810);
    const details = summary.details as Record<string, any>;
    expect(details.by_set_size).toHaveProperty('12');
    expect(details.by_target_presence).toHaveProperty('present');
    expect(details.by_target_region).toHaveProperty('5');
    expect(details.by_block).toHaveProperty('vs_feature');
    expect(details.by_block).toHaveProperty('vs_conjunction');
    expect(details.by_block).toHaveProperty('vs_spatial');
    expect(details.spatial).toMatchObject({
      block_id: 'vs_spatial',
      planned_formal_trials: 15,
      completed_formal_trials: 1,
      target_present_count: 1,
      target_absent_count: 0,
      exploratory: true,
    });
    expect(details.spatial.region_trial_counts['5']).toBe(1);
    expect(details.spatial.region_valid_counts['5']).toBe(1);
    expect(details.blocks.map((block: { variant: string }) => block.variant)).toEqual([
      'feature_search',
      'conjunction_search',
      'spatial_search',
    ]);
    expect(details.mouse_tracking.note).toContain('not eye-tracking');
  });

  it('aggregates gaze and mouse direction ratios separately', () => {
    const cfg = config();
    const gaze = emptyGaze();
    gaze.quality_sufficient = true;
    gaze.valid_gaze_ratio = 0.9;
    gaze.fixation_count = 4;
    gaze.left_to_right_transition_ratio = 0.8;
    gaze.right_to_left_transition_ratio = 0.2;
    gaze.center_to_periphery_transition_ratio = 0.6;
    gaze.periphery_to_center_transition_ratio = 0.4;
    const mouse = emptyMouse();
    mouse.sufficient_for_metrics = true;
    mouse.valid_mouse_ratio = 0.95;
    mouse.left_to_right_transition_ratio = 0.3;
    mouse.right_to_left_transition_ratio = 0.7;
    mouse.top_to_bottom_transition_ratio = 0.9;
    mouse.bottom_to_top_transition_ratio = 0.1;

    const summary = summarizeVisualSearch(
      [
        score({
          trialId: 'spatial-gaze',
          blockId: 'vs_spatial',
          blockName: '空间位置搜索',
          blockType: 'extension_block',
          variant: 'spatial_search',
          responseTime: 900,
          targetRegion: 5,
          gazeAvailable: true,
          gazeQuality: 'good',
          gazeValidRatio: 0.9,
          eyeTrackingStatus: 'calibrated',
          gazeMetrics: gaze,
          mouseMetrics: mouse,
        }),
      ],
      35,
      true,
      visualBlocks(cfg),
    );
    const details = summary.details as {
      eye_tracking: { mean_direction_ratios: Record<string, number | null> };
      mouse_tracking: { mean_direction_ratios: Record<string, number | null> };
    };
    expect(
      details.eye_tracking.mean_direction_ratios
        .left_to_right_transition_ratio,
    ).toBe(0.8);
    expect(
      details.eye_tracking.mean_direction_ratios
        .center_to_periphery_transition_ratio,
    ).toBe(0.6);
    expect(
      details.eye_tracking.mean_direction_ratios.top_to_bottom_transition_ratio,
    ).toBeNull();
    expect(
      details.mouse_tracking.mean_direction_ratios
        .right_to_left_transition_ratio,
    ).toBe(0.7);
    expect(
      details.mouse_tracking.mean_direction_ratios.top_to_bottom_transition_ratio,
    ).toBe(0.9);
  });
});

function uncoveredForTest(formalTrials: number): number[] {
  const counts = plannedRegionCounts(formalTrials);
  return REGION_NUMBERS.filter((region) => counts[region] === 0);
}
