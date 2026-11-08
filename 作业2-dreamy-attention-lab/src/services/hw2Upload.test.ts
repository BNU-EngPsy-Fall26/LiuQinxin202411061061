import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrialSubmission } from '@shared/types';
import {
  HW2_EXPERIMENT_IDS,
  HW2_PROJECT_CODE,
  buildHw2Payload,
  bufferHw2Trial,
  compactHw2Trial,
  getOrCreateHw2ParticipantId,
  readHw2Status,
  readHw2TrialBuffer,
  resetHw2ParticipantId,
  submitHw2Session,
} from './hw2Upload';

class MemoryStorage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

function makeTrial(overrides: Partial<TrialSubmission> = {}): TrialSubmission {
  return {
    participant_id: 'P-TEST',
    experiment_id: 'visual-search',
    session_id: 'session-test',
    trial_id: 'trial-1',
    block_id: 'vs_feature',
    block_type: 'original_block',
    condition_id: 'feature_set4_present',
    trial_index: 1,
    phase: 'formal',
    stimulus_onset: 100,
    response_time: 612.4,
    response: 'f',
    correct: true,
    timestamp: '2026-11-09T00:00:00.000Z',
    timeout: false,
    invalid_response: false,
    eye_tracking_status: 'calibrated',
    calibration_status: 'passed',
    calibration_quality: 0.8,
    valid_gaze_ratio: 0.91,
    valid_mouse_ratio: 0.75,
    stimulus: {
      set_size: 4,
      target_present: true,
      target_region: 3,
      target_x: 100.24,
      target_y: 200.66,
      block_variant: 'feature',
    },
    response_data: {},
    tracking: {
      eye_tracking: { sample_count: 120, fixation_count: 8 },
      mouse_tracking: { sample_count: 42, path_length_px: 321.45 },
    },
    metadata: {},
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('hw2 compact trial mapping', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps visual-search condition, RT, correctness and stimulus summary', () => {
    const compact = compactHw2Trial(makeTrial());
    expect(compact.cond).toBe('feature_set4_present');
    expect(compact.rt).toBe(612);
    expect(compact.correct).toBe(1);
    expect(compact.phase).toBe('formal');
    expect(compact.setsize).toBe(4);
    expect(compact.t_present).toBe(1);
    expect(compact.t_region).toBe(3);
    expect(compact.gaze_n).toBe(120);
    expect(compact.gaze_fix).toBe(8);
    expect(compact.mouse_n).toBe(42);
    expect(compact.gaze_valid).toBe(0.91);
    expect(Object.keys(compact).length).toBeLessThanOrEqual(40);
    expect(compact).not.toHaveProperty('gaze_samples');
    expect(compact).not.toHaveProperty('mouse_samples');
  });

  it('keeps map-alignment heading, cue and target information', () => {
    const compact = compactHw2Trial(
      makeTrial({
        experiment_id: 'map-alignment',
        block_id: 'ma_person_cue',
        condition_id: 'person_cue_heading90',
        stimulus: {
          heading_deg: 90,
          alignment: 'misaligned',
          person_cue: 'person',
          target_building: 'teaching',
          target_direction: 'back',
          map_rotation_deg: 0,
        },
        tracking: { eye_tracking: {}, mouse_tracking: {} },
      }),
    );
    expect(compact.heading).toBe(90);
    expect(compact.align).toBe('misaligned');
    expect(compact.cue).toBe('person');
    expect(compact.target).toBe('teaching');
    expect(compact.t_dir).toBe('back');
    expect(compact.map_rot).toBe(0);
    expect(Object.keys(compact).length).toBeLessThanOrEqual(40);
  });

  it('keeps perceptual-ordering difficulty, error and order information', () => {
    const compact = compactHw2Trial(
      makeTrial({
        experiment_id: 'perceptual-ordering',
        stimulus: {
          difficulty: 'hard',
          rectangle_count: 6,
          correct_order: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
        },
        response_data: {
          position_error: 2,
          operation_count: 5,
          final_order: ['r2', 'r1', 'r3', 'r4', 'r5', 'r6'],
        },
        tracking: {},
      }),
    );
    expect(compact.diff).toBe('hard');
    expect(compact.n_rect).toBe(6);
    expect(compact.pos_err).toBe(2);
    expect(compact.ops).toBe(5);
    expect(compact.correct_order).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    expect(compact.final_order).toEqual(['r2', 'r1', 'r3', 'r4', 'r5', 'r6']);
    expect(Object.keys(compact).length).toBeLessThanOrEqual(40);
  });

  it('never includes raw gaze or mouse samples in the payload', () => {
    const trial = makeTrial({
      gaze_samples: [
        {
          t_ms: 10,
          timestamp_ms: 110,
          screen_x: 100,
          screen_y: 200,
          normalized_x: 0.5,
          normalized_y: 0.5,
          valid: true,
          face_lost: false,
        },
      ],
      mouse_samples: [
        {
          t_ms: 10,
          timestamp_ms: 110,
          x: 1,
          y: 2,
          normalized_x: 0.5,
          normalized_y: 0.5,
          movement_direction: 'right',
          movement_distance: 3,
          velocity: 10,
          valid: true,
          phase: 'stimulus',
        },
      ],
    });
    const payload = buildHw2Payload('visual-search', 'DCL-ABCDEFGH', 's-1', [
      compactHw2Trial(trial),
    ]);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('gaze_samples');
    expect(serialized).not.toContain('mouse_samples');
    expect(serialized).not.toContain('screen_x');
    expect(serialized).not.toContain('movement_direction');
  });

  it('uses the public project code and a distinct experiment identifier', () => {
    const payload = buildHw2Payload('map-alignment', 'DCL-ABCDEFGH', 's-2', []);
    expect(HW2_PROJECT_CODE).toBe('TYJKZF');
    expect(payload.project).toBe('TYJKZF');
    expect(payload.experiment).toBe(HW2_EXPERIMENT_IDS['map-alignment']);
    expect(payload.experiment).toBe('dreamy_map_alignment');
    expect(payload.meta.session).toBe('s-2');
    expect(new Set(Object.values(HW2_EXPERIMENT_IDS)).size).toBe(3);
    expect(
      Object.values(HW2_EXPERIMENT_IDS).every((id) => /^[a-z0-9_-]+$/.test(id)),
    ).toBe(true);
  });

  it('keeps a realistic 51-trial session under the 256 KB limit', () => {
    const trials = Array.from({ length: 51 }, (_, index) =>
      compactHw2Trial(
        makeTrial({
          trial_id: `trial-${index}`,
          trial_index: index + 1,
          condition_id: `feature_set${index}_present_with_a_long_condition_name`,
        }),
      ),
    );
    const payload = buildHw2Payload(
      'visual-search',
      'DCL-ABCDEFGH',
      'session-large',
      trials,
    );
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    expect(trials.length).toBeLessThanOrEqual(2000);
    expect(bytes).toBeLessThan(256 * 1024);
  });
});

describe('hw2 local buffer and submission guards', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deduplicates trial buffering by trial_id', () => {
    bufferHw2Trial('visual-search', 'session-1', makeTrial({ trial_id: 'same' }));
    bufferHw2Trial(
      'visual-search',
      'session-1',
      makeTrial({ trial_id: 'same', response_time: 999 }),
    );
    const buffer = readHw2TrialBuffer('session-1');
    expect(buffer?.trials).toHaveLength(1);
    expect(buffer?.trials[0].trial.rt).toBe(999);
    expect(String(buffer?.trials[0].trial.anon)).toMatch(/^DCL-[A-Z0-9]{8}$/);
  });

  it('does not upload a typed participant identifier', async () => {
    localStorage.setItem('dcl.participant_id', '202411061061');
    bufferHw2Trial('visual-search', 'session-2', makeTrial());
    let sent: Record<string, unknown> | null = null;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ ok: true, record_id: 'rec-1' });
    });
    const outcome = await submitHw2Session('visual-search', 'session-2', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(outcome.status).toBe('success');
    expect(String(sent && (sent as { participant?: string }).participant)).toMatch(
      /^DCL-[A-Z0-9]{8}$/,
    );
  });

  it('auto-submits once and never repeats a successful session', async () => {
    bufferHw2Trial('visual-search', 'session-3', makeTrial());
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, record_id: 'rec-3' }),
    );
    const first = await submitHw2Session('visual-search', 'session-3', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(first.status).toBe('success');
    const second = await submitHw2Session('visual-search', 'session-3', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(second.status).toBe('success');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readHw2Status('session-3')?.status).toBe('success');
    // The compact copy is cleared after acceptance; the project's own outbox
    // still holds the full raw trial.
    expect(readHw2TrialBuffer('session-3')).toBeNull();
  });

  it('keeps local data after a failure and only retries manually', async () => {
    bufferHw2Trial('visual-search', 'session-4', makeTrial());
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, msg: 'boom' }, 400))
      .mockResolvedValueOnce(jsonResponse({ ok: true, record_id: 'rec-4' }));

    const first = await submitHw2Session('visual-search', 'session-4', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(first.status).toBe('failed');
    expect(readHw2Status('session-4')?.error).toBe('boom');
    expect(readHw2TrialBuffer('session-4')?.trials).toHaveLength(1);

    // A second automatic attempt is refused.
    const second = await submitHw2Session('visual-search', 'session-4', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(second.status).toBe('skipped');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // The explicit retry button is allowed.
    const retry = await submitHw2Session('visual-search', 'session-4', {
      manual: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(retry.status).toBe('success');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(readHw2Status('session-4')?.status).toBe('success');
  });

  it('generates a stable anonymous upload code', () => {
    const first = getOrCreateHw2ParticipantId();
    const second = getOrCreateHw2ParticipantId();
    expect(first).toBe(second);
    expect(first).toMatch(/^DCL-[A-Z0-9]{8}$/);
  });

  it('starts a new anonymous code after a participant change', () => {
    const first = getOrCreateHw2ParticipantId();
    resetHw2ParticipantId();
    const second = getOrCreateHw2ParticipantId();
    expect(second).toMatch(/^DCL-[A-Z0-9]{8}$/);
    expect(second).not.toBe(first);
  });
});
