import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_ALIGNMENT_CONFIG } from '@shared/config';
import type {
  ExperimentBlockConfig,
  MapAlignmentConfig,
  MapVariant,
} from '@shared/types';
import {
  CAMPUS_BUILDINGS,
  generateMapTrials,
  normalizeDegrees,
  relativeDirectionForBearing,
  summarizeMapAlignment,
  type MapScore,
  type MapTrialSpec,
} from './generator';

function config(overrides: Partial<MapAlignmentConfig> = {}): MapAlignmentConfig {
  return { ...structuredClone(DEFAULT_MAP_ALIGNMENT_CONFIG), ...overrides };
}

const building = (id: string) =>
  CAMPUS_BUILDINGS.find((item) => item.id === id)!;

function formalSpecs(seed: string, block?: ExperimentBlockConfig<MapVariant>) {
  const cfg = config();
  return generateMapTrials({
    config: cfg,
    phase: 'formal',
    count: 15,
    seed,
    block,
  });
}

function answerFor(facingDeg: number, target: MapTrialSpec['targetBuilding']) {
  return relativeDirectionForBearing(
    normalizeDegrees(building(target).bearingDeg - facingDeg),
  ).key;
}

describe('map alignment trial generation', () => {
  it('creates two counterbalanced cue blocks with 15 formal trials each', () => {
    const cfg = config();
    const blocks = cfg.blocks as ExperimentBlockConfig<MapVariant>[];
    expect(blocks.map((block) => block.variant)).toEqual([
      'no_cue',
      'person_cue',
    ]);
    expect(blocks.map((block) => block.formalTrials)).toEqual([15, 15]);
    expect(cfg.practiceTrials).toBe(4);
    expect(cfg.rotations).toEqual([0, 90, 180, 270]);

    for (const [index, block] of blocks.entries()) {
      const specs = generateMapTrials({
        config: cfg,
        phase: 'formal',
        count: block.formalTrials,
        seed: `balance-${block.block_id}`,
        block,
        blockPresentationOrder: index + 1,
      });
      expect(specs).toHaveLength(15);
      expect(new Set(specs.map((spec) => spec.cue)).size).toBe(1);
      expect(specs.every((spec) => spec.blockId === block.block_id)).toBe(true);
      expect(
        specs.every((spec) => spec.blockPresentationOrder === index + 1),
      ).toBe(true);

      // Every block must contain all four real headings: 3 / 4 / 4 / 4.
      expect(specs.filter((spec) => spec.headingDeg === 0)).toHaveLength(3);
      for (const heading of [90, 180, 270]) {
        expect(
          specs.filter((spec) => spec.headingDeg === heading),
        ).toHaveLength(4);
      }
      expect(new Set(specs.map((spec) => spec.headingDeg)).size).toBe(4);
      expect(specs.filter((spec) => spec.alignment === 'aligned')).toHaveLength(3);
      expect(
        specs.filter((spec) => spec.alignment === 'misaligned'),
      ).toHaveLength(12);

      // The target is never the facing building, so "front" never occurs and
      // right / back / left each occur five times across 15 trials.
      expect(
        specs.filter((spec) => spec.targetDirection === 'front'),
      ).toHaveLength(0);
      for (const direction of ['right', 'back', 'left']) {
        expect(
          specs.filter((spec) => spec.targetDirection === direction),
        ).toHaveLength(5);
      }
      for (const spec of specs) {
        expect(spec.targetBuilding).not.toBe(spec.facingBuilding);
      }

      const targetCounts = CAMPUS_BUILDINGS.map(
        (item) =>
          specs.filter((spec) => spec.targetBuilding === item.id).length,
      ).sort();
      expect(targetCounts).toEqual([3, 4, 4, 4]);
    }
  });

  it('uses a fixed map and computes the answer from the heading angle', () => {
    const specs = formalSpecs('geometry-test');

    for (const spec of specs) {
      const target = building(spec.targetBuilding);
      const facing = building(spec.facingBuilding);
      expect(spec.mapRotationDeg).toBe(0);
      expect(spec.rotationDeg).toBe(0);
      expect(spec.compassNorthScreenDeg).toBe(0);
      expect(spec.personScreenHeadingDeg).toBe(spec.headingDeg);
      expect(spec.heading).toBe('building');
      expect(spec.facingBuildingWorldBearingDeg).toBe(facing.bearingDeg);
      expect(spec.facingBuildingScreenBearingDeg).toBe(spec.headingDeg);
      expect(spec.headingZh).toBe(`面朝${facing.zh}`);
      expect(spec.facingBuildingZh).toBe(facing.zh);
      expect(facing.bearingDeg).toBe(spec.headingDeg);

      expect(spec.targetLocalX).toBeCloseTo(target.x, 1);
      expect(spec.targetLocalY).toBeCloseTo(target.y, 1);
      expect(spec.targetScreenX).toBeCloseTo(target.x, 1);
      expect(spec.targetScreenY).toBeCloseTo(target.y, 1);
      expect(spec.targetScreenBearingDeg).toBe(target.bearingDeg);
      expect(spec.targetDirection).toBe(answerFor(spec.headingDeg, target.id));
      expect(spec.alignment).toBe(
        spec.headingDeg === 0 ? 'aligned' : 'misaligned',
      );
    }
  });

  it('places the four buildings at fixed top/right/bottom/left positions', () => {
    expect(building('experiment').bearingDeg).toBe(0);
    expect(building('cafeteria').bearingDeg).toBe(90);
    expect(building('library').bearingDeg).toBe(180);
    expect(building('teaching').bearingDeg).toBe(270);

    expect(building('experiment').y).toBeLessThan(280);
    expect(building('cafeteria').x).toBeGreaterThan(280);
    expect(building('library').y).toBeGreaterThan(280);
    expect(building('teaching').x).toBeLessThan(280);
  });

  it('matches the four documented heading examples', () => {
    // Facing cafeteria (right), teaching is behind.
    expect(answerFor(90, 'teaching')).toBe('back');
    // Facing library (down), teaching is on the right.
    expect(answerFor(180, 'teaching')).toBe('right');
    // Facing teaching (left), experiment is on the right.
    expect(answerFor(270, 'experiment')).toBe('right');
    // Facing experiment (up), cafeteria is on the right.
    expect(answerFor(0, 'cafeteria')).toBe('right');
  });

  it('rotates the person cue with the trial heading', () => {
    const cfg = config();
    const personBlock = (
      cfg.blocks as ExperimentBlockConfig<MapVariant>[]
    ).find((block) => block.variant === 'person_cue')!;
    const specs = generateMapTrials({
      config: cfg,
      phase: 'formal',
      count: 15,
      seed: 'person-heading',
      block: personBlock,
    });
    expect(specs.every((spec) => spec.cue === 'person')).toBe(true);
    expect(
      specs.every((spec) => spec.personScreenHeadingDeg === spec.headingDeg),
    ).toBe(true);
    expect(new Set(specs.map((spec) => spec.headingDeg))).toEqual(
      new Set([0, 90, 180, 270]),
    );
  });

  it('never mixes cue conditions in a block and keeps practice reproducible', () => {
    const cfg = config();
    const blocks = cfg.blocks as ExperimentBlockConfig<MapVariant>[];
    for (const block of blocks) {
      const practice = generateMapTrials({
        config: cfg,
        phase: 'practice',
        count: 2,
        seed: 'practice-seed',
        block,
      });
      expect(practice).toHaveLength(2);
      expect(new Set(practice.map((spec) => spec.cue)).size).toBe(1);
      for (const spec of practice) {
        expect(spec.targetBuilding).not.toBe(spec.facingBuilding);
        expect(spec.targetDirection).toBe(
          answerFor(spec.headingDeg, spec.targetBuilding),
        );
        expect(spec.mapRotationDeg).toBe(0);
      }
    }
    const first = formalSpecs('reproducible-seed');
    const second = formalSpecs('reproducible-seed');
    expect(first.map((spec) => spec.id)).toEqual(second.map((spec) => spec.id));
    expect(first.map((spec) => spec.targetDirection)).toEqual(
      second.map((spec) => spec.targetDirection),
    );
  });

  it('summarizes cue, heading, target and misalignment cost', () => {
    const scores: MapScore[] = [
      {
        trialIndex: 1,
        blockId: 'ma_no_cue',
        blockType: 'original_block',
        blockPresentationOrder: 1,
        variant: 'no_cue',
        alignment: 'aligned',
        cue: 'none',
        rotationDeg: 0,
        targetBuilding: 'cafeteria',
        targetBuildingZh: '食堂',
        targetDirection: 'right',
        response: 'right',
        correct: true,
        responseTime: 800,
        timeout: false,
      },
      {
        trialIndex: 2,
        blockId: 'ma_no_cue',
        blockType: 'original_block',
        blockPresentationOrder: 1,
        variant: 'no_cue',
        alignment: 'misaligned',
        cue: 'none',
        rotationDeg: 90,
        targetBuilding: 'teaching',
        targetBuildingZh: '教学楼',
        targetDirection: 'back',
        response: 'right',
        correct: false,
        responseTime: 1300,
        timeout: false,
      },
      {
        trialIndex: 3,
        blockId: 'ma_person_cue',
        blockType: 'extension_block',
        blockPresentationOrder: 2,
        variant: 'person_cue',
        alignment: 'misaligned',
        cue: 'person',
        rotationDeg: 180,
        targetBuilding: 'teaching',
        targetBuildingZh: '教学楼',
        targetDirection: 'right',
        response: 'right',
        correct: true,
        responseTime: 900,
        timeout: false,
      },
    ];
    const summary = summarizeMapAlignment(scores, 30, true);
    expect(summary.completed_trials).toBe(3);
    expect(summary.total_trials).toBe(30);
    expect(summary.accuracy).toBeCloseTo(2 / 3, 4);
    const details = summary.details as Record<string, unknown>;
    expect(details.by_cue).toHaveProperty('none');
    expect(details.by_cue).toHaveProperty('person');
    expect(details.by_alignment).toHaveProperty('aligned');
    expect(details.by_alignment).toHaveProperty('misaligned');
    expect(details.by_rotation).toHaveProperty('0');
    expect(details.by_rotation).toHaveProperty('90');
    expect(details.by_cue_rotation).toHaveProperty('person_rot180');
    expect(details.by_cue_alignment).toHaveProperty('none_misaligned');
    expect(details.by_cue_alignment).toHaveProperty('person_misaligned');
    expect(details.by_block_position).toHaveProperty('1');
    expect(details.by_block_position).toHaveProperty('2');
    expect(details.by_target_building).toHaveProperty('teaching');
    const cost = details.misalignment_cost as Record<string, unknown>;
    expect(cost).toHaveProperty('no_cue');
    expect(cost).toHaveProperty('person');
  });
});
