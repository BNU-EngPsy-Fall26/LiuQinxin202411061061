import { describe, expect, it } from 'vitest';
import type { TrialRow } from './db.js';
import {
  analyzeGroupMapAlignment,
  analyzePersonalMapAlignment,
} from './map-alignment-results.js';

function trial(
  overrides: {
    cue?: string;
    rotation?: number;
    building?: string;
    correct?: boolean;
    rt?: number | null;
    timeout?: boolean;
    invalid?: boolean;
    response?: string;
    blockPosition?: number;
  } = {},
): TrialRow {
  const {
    cue = 'none',
    rotation = 0,
    building = 'library',
    correct = true,
    rt = 800,
    timeout = false,
    invalid = false,
    response = 'front',
    blockPosition = cue === 'person' ? 2 : 1,
  } = overrides;
  const stimulus: Record<string, unknown> = {
    map_protocol_version: 4,
    person_cue: cue,
    cue_condition: cue === 'person' ? 'person_cue' : 'no_cue',
    rotation_deg: rotation,
    map_rotation_deg: rotation,
    alignment: rotation === 0 ? 'aligned' : 'misaligned',
    facing_building: 'experiment',
    facing_building_zh: '实验楼',
    target_building: building,
    target_building_zh: building === 'library' ? '图书馆' : '实验楼',
    target_direction: 'front',
    correct_answer: 'front',
    block_presentation_order: blockPosition,
    block_order: ['no_cue', 'person_cue'],
  };
  return {
    stimulus_json: JSON.stringify(stimulus),
    response,
    correct: correct ? 1 : 0,
    response_time: rt,
    timeout: timeout ? 1 : 0,
    invalid_response: invalid ? 1 : 0,
  } as TrialRow;
}

describe('map alignment result analysis', () => {
  it('computes cue and rotation statistics from new-format trials only', () => {
    const analysis = analyzePersonalMapAlignment([
      trial({ cue: 'none', rotation: 0, rt: 800 }),
      trial({ cue: 'none', rotation: 90, rt: 1000 }),
      trial({ cue: 'none', rotation: 180, correct: false, rt: 500 }),
      trial({ cue: 'person', rotation: 0, rt: 850 }),
      trial({ cue: 'person', rotation: 270, rt: 950 }),
      { ...trial(), stimulus_json: JSON.stringify({ scene: 'old' }) } as TrialRow,
    ]);

    expect(analysis.included_trials).toBe(5);
    expect(analysis.excluded_trials).toBe(1);
    expect(analysis.conditions.find((cell) => cell.cue === 'none')).toMatchObject({
      n_trials: 3,
      n_valid: 3,
      n_observations: 2,
      accuracy: 0.6667,
      error_rate: 0.3333,
      mean_rt_ms: 900,
    });
    expect(analysis.alignment.find((cell) => cell.alignment === 'aligned')).toMatchObject({
      n_trials: 2,
      mean_rt_ms: 825,
    });
    expect(
      analysis.alignment.find((cell) => cell.alignment === 'misaligned'),
    ).toMatchObject({
      n_trials: 3,
      mean_rt_ms: 975,
    });
    expect(analysis.cost.no_cue).toMatchObject({
      aligned_mean_rt_ms: 800,
      misaligned_mean_rt_ms: 1000,
      misalignment_cost_ms: 200,
      accuracy_cost: 0.5,
    });
    expect(analysis.cost.person).toMatchObject({
      aligned_mean_rt_ms: 850,
      misaligned_mean_rt_ms: 950,
      misalignment_cost_ms: 100,
      accuracy_cost: 0,
    });
    expect(analysis.cost.cue_reduction_ms).toBe(100);
    expect(analysis.cost.available).toBe(true);
    expect(analysis.cost.conclusion).toContain('少 100 ms');
  });

  it('averages group cost at participant level instead of pooling trials', () => {
    const participantA = [
      trial({ cue: 'none', rotation: 0, rt: 800 }),
      trial({ cue: 'none', rotation: 90, rt: 1000 }),
      trial({ cue: 'person', rotation: 0, rt: 850 }),
      trial({ cue: 'person', rotation: 90, rt: 950 }),
    ];
    const participantB = [
      trial({ cue: 'none', rotation: 0, rt: 600 }),
      trial({ cue: 'none', rotation: 90, rt: 1000 }),
      trial({ cue: 'person', rotation: 0, rt: 700 }),
      trial({ cue: 'person', rotation: 90, rt: 900 }),
    ];
    const group = analyzeGroupMapAlignment([
      { participant_id: 'P-A', trials: participantA },
      { participant_id: 'P-B', trials: participantB },
    ]);

    expect(group.conditions.find((cell) => cell.cue === 'none')).toMatchObject({
      n_participants: 2,
      n_trials: 4,
    });
    expect(group.cost.no_cue.misalignment_cost_ms).toBe(300);
    expect(group.cost.person.misalignment_cost_ms).toBe(150);
    expect(group.cost.cue_reduction_ms).toBe(150);
    expect(
      group.cue_rotations.find(
        (cell) => cell.cue === 'person' && cell.rotation_deg === 90,
      )?.mean_rt_ms,
    ).toBe(925);
    expect(group.block_positions.map((entry) => entry.position)).toEqual([1, 2]);
  });
});
