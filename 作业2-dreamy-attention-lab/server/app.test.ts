import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { DEFAULT_CONFIGS } from '../shared/config.js';
import { totalFormalTrials } from '../shared/blocks.js';
import type { SessionSummary, VisualSearchConfig } from '../shared/types.js';
import { createApp } from './app.js';
import { createDatabase, type LabDb } from './db.js';

const AUTH = {
  username: 'researcher',
  password: 'dreamlab-test',
  secret: 'test-secret-that-is-longer-than-24-chars',
  secureCookie: false,
};

const PARTICIPANT = 'P-TEST-001';
const SESSION = 'sess-test-001';
const STARTED = new Date('2026-11-08T10:00:00.000Z').toISOString();

let db: LabDb;
let app: Express;
let researcher: ReturnType<typeof request.agent>;

function searchConfig(overrides: Partial<VisualSearchConfig> = {}): VisualSearchConfig {
  return {
    ...structuredClone(DEFAULT_CONFIGS['visual-search'] as VisualSearchConfig),
    ...overrides,
  };
}

function sessionPayload(config = searchConfig()) {
  return {
    session_id: SESSION,
    participant_id: PARTICIPANT,
    experiment_id: 'visual-search',
    started_at: STARTED,
    completed_at: null,
    status: 'in_progress',
    config_version: config.version,
    config_snapshot: config,
    environment: { viewport: { width: 1440, height: 960 } },
  };
}

function trialPayload(overrides: Record<string, unknown> = {}) {
  return {
    participant_id: PARTICIPANT,
    experiment_id: 'visual-search',
    session_id: SESSION,
    trial_id: 'vs-test-001',
    block_id: 'vs_feature',
    block_type: 'original_block',
    condition_id: '12_present',
    trial_index: 1,
    phase: 'formal',
    stimulus_onset: 100.25,
    response_time: 456.75,
    response: 'f',
    correct: true,
    timestamp: new Date('2026-11-08T10:00:05.000Z').toISOString(),
    timeout: false,
    invalid_response: false,
    eye_tracking_status: 'calibrated',
    calibration_status: 'passed',
    calibration_quality: 132.4,
    valid_gaze_ratio: 0.82,
    valid_mouse_ratio: 1,
    stimulus: { set_size: 12, target_present: true },
    response_data: { key: 'f' },
    tracking: {
      mouse_used_for_response: false,
      mouse_tracking: {
        path_length_px: 120.5,
        first_movement_direction: 'right',
        left_to_right_transition_ratio: 0.75,
        right_to_left_transition_ratio: 0.25,
        top_to_bottom_transition_ratio: 0.5,
        bottom_to_top_transition_ratio: 0.5,
        center_to_periphery_transition_ratio: 0.6,
        periphery_to_center_transition_ratio: 0.4,
      },
      eye_tracking: {
        first_fixation_region: 'upper_left',
        direction_ratios: {
          left_to_right: 0.7,
          right_to_left: 0.3,
          top_to_bottom: 0.55,
          bottom_to_top: 0.45,
          center_to_periphery: 0.65,
          periphery_to_center: 0.35,
        },
      },
    },
    metadata: { phase: 'formal', timing_clock: 'performance.now()' },
    gaze_samples: [
      {
        sample_index: 0,
        t_ms: 10,
        timestamp_ms: 1000.5,
        screen_x: 500,
        screen_y: 400,
        normalized_x: 0.42,
        normalized_y: 0.48,
        valid: true,
        face_lost: false,
      },
    ],
    mouse_samples: [
      {
        sample_index: 0,
        t_ms: 20,
        timestamp_ms: 1010.5,
        x: 300,
        y: 220,
        normalized_x: 0.35,
        normalized_y: 0.41,
        movement_direction: 'right',
        movement_distance: 12.5,
        velocity: 310.2,
        valid: true,
        phase: 'stimulus',
      },
    ],
    ...overrides,
  };
}

function summary(): SessionSummary {
  return {
    completed_trials: 1,
    total_trials: 96,
    accuracy: 1,
    mean_response_time_ms: 456.8,
    median_response_time_ms: 456.8,
    practice_completed: true,
    details: { test: true },
    generated_at: new Date('2026-11-08T10:01:00.000Z').toISOString(),
  };
}

async function login(): Promise<void> {
  await researcher
    .post('/api/researcher/login')
    .send({ username: AUTH.username, password: AUTH.password })
    .expect(200);
}

async function createSession(config = searchConfig()): Promise<void> {
  await request(app).post('/api/sessions').send(sessionPayload(config)).expect(201);
}

beforeEach(() => {
  db = createDatabase(':memory:');
  app = createApp({ db, auth: AUTH });
  researcher = request.agent(app);
});

describe('public experiment and session API', () => {
  it('serves the experiment catalogue and current config', async () => {
    const catalogue = await request(app).get('/api/experiments').expect(200);
    // MediaPipe's generated loader needs string evaluation before WebGazer can
    // begin camera calibration; the CSP must continue to permit it.
    expect(catalogue.headers['content-security-policy']).toContain("'unsafe-eval'");
    expect(catalogue.body.experiments).toHaveLength(2);
    expect(catalogue.body.experiments.map((item: { id: string }) => item.id)).toEqual([
      'visual-search',
      'map-alignment',
    ]);
    expect(catalogue.body.experiments[0].config_version).toBe(3);

    // Archived experiments stay readable for historical sessions even though
    // they are no longer advertised in the participant-facing catalogue.
    await request(app).get('/api/experiments/perceptual-ordering/config').expect(200);

    const config = await request(app)
      .get('/api/experiments/map-alignment/config')
      .expect(200);
    expect(totalFormalTrials(config.body.config)).toBe(30);
    expect(config.body.config.version).toBe(4);
    expect(config.body.config.blocks).toHaveLength(2);
    expect(
      config.body.config.blocks.map((block: { variant: string }) => block.variant),
    ).toEqual(['no_cue', 'person_cue']);
    expect(
      config.body.config.blocks.map(
        (block: { formalTrials: number }) => block.formalTrials,
      ),
    ).toEqual([15, 15]);
    expect(config.body.config.practiceTrials).toBe(4);
    expect(config.body.config.responseTimeoutMs).toBe(0);
    expect(config.body.meta.id).toBe('map-alignment');

    await request(app).get('/api/experiments/not-an-experiment/config').expect(404);
  });

  it('rejects invalid config snapshots and invalid participant IDs', async () => {
    await request(app)
      .post('/api/sessions')
      .send({ ...sessionPayload(), config_snapshot: { formalTrials: 3 } })
      .expect(400);

    await request(app)
      .post('/api/sessions')
      .send({ ...sessionPayload(), participant_id: 'x' })
      .expect(400);
  });

  it('creates a session idempotently', async () => {
    await createSession();
    await request(app).post('/api/sessions').send(sessionPayload()).expect(201);
    const count = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });

  it('rejects a trial before its session exists', async () => {
    const response = await request(app).post('/api/trials').send(trialPayload()).expect(409);
    expect(response.body.code).toBe('SESSION_NOT_READY');
  });

  it('stores a trial and ignores an exact duplicate upload', async () => {
    await createSession();
    await request(app).post('/api/trials').send(trialPayload()).expect(201);
    await request(app).post('/api/trials').send(trialPayload()).expect(201);
    const count = db.prepare('SELECT COUNT(*) AS n FROM trials').get() as {
      n: number;
    };
    expect(count.n).toBe(1);
    const gaze = db.prepare('SELECT COUNT(*) AS n FROM gaze_samples').get() as {
      n: number;
    };
    const mouse = db.prepare('SELECT COUNT(*) AS n FROM mouse_samples').get() as {
      n: number;
    };
    expect(gaze.n).toBe(1);
    expect(mouse.n).toBe(1);
    const stored = db
      .prepare(
        'SELECT block_id, block_type, eye_tracking_status, valid_mouse_ratio FROM trials WHERE trial_id = ?',
      )
      .get('vs-test-001') as Record<string, unknown>;
    expect(stored.block_id).toBe('vs_feature');
    expect(stored.block_type).toBe('original_block');
    expect(stored.eye_tracking_status).toBe('calibrated');
  });

  it('rejects trials whose participant or experiment does not match the session', async () => {
    await createSession();
    await request(app)
      .post('/api/trials')
      .send(trialPayload({ participant_id: 'OTHER-PARTICIPANT' }))
      .expect(409);
    await request(app)
      .post('/api/trials')
      .send(trialPayload({ experiment_id: 'map-alignment' }))
      .expect(409);
  });

  it('completes a session and returns the summary only when configured to show it', async () => {
    await createSession();
    await request(app).post('/api/trials').send(trialPayload()).expect(201);
    await request(app)
      .post(`/api/sessions/${SESSION}/complete`)
      .send({ completed_at: summary().generated_at, summary: summary() })
      .expect(200);

    const result = await request(app).get(`/api/sessions/${SESSION}/result`).expect(200);
    expect(result.body.status).toBe('completed');
    expect(result.body.show_results).toBe(true);
    expect(result.body.summary.accuracy).toBe(1);

    const hiddenSession = 'sess-hidden-001';
    const hiddenConfig = searchConfig({ showResultsToParticipant: false });
    await request(app)
      .post('/api/sessions')
      .send({
        ...sessionPayload(hiddenConfig),
        session_id: hiddenSession,
      })
      .expect(201);
    await request(app)
      .post(`/api/sessions/${hiddenSession}/complete`)
      .send({ completed_at: summary().generated_at, summary: summary() })
      .expect(200);
    const hidden = await request(app)
      .get(`/api/sessions/${hiddenSession}/result`)
      .expect(200);
    expect(hidden.body.show_results).toBe(false);
    expect(hidden.body.summary).toBeNull();
  });
});

describe('researcher authentication and data API', () => {
  it('protects researcher routes and rejects bad credentials', async () => {
    await request(app).get('/api/researcher/overview').expect(401);
    await request(app)
      .post('/api/researcher/login')
      .send({ username: AUTH.username, password: 'wrong-password' })
      .expect(401);
    await request(app).get('/api/researcher/me').expect(200).expect({ authenticated: false, username: null });
    await login();
    await researcher.get('/api/researcher/me').expect(200).expect({
      authenticated: true,
      username: AUTH.username,
    });
    await researcher.get('/api/researcher/overview').expect(200);
  });

  it('lists sessions, participants, trial detail and exports', async () => {
    await createSession();
    await request(app).post('/api/trials').send(trialPayload()).expect(201);
    await request(app)
      .post('/api/trials')
      .send(
        trialPayload({
          trial_id: 'vs-test-002',
          trial_index: 2,
          response: '=1+1',
          response_data: { key: 'j', note: 'formula-like participant response' },
        }),
      )
      .expect(201);
    await request(app)
      .post(`/api/sessions/${SESSION}/complete`)
      .send({ completed_at: summary().generated_at, summary: summary() })
      .expect(200);

    await login();

    const overview = await researcher.get('/api/researcher/overview').expect(200);
    expect(overview.body.totals.participants).toBe(1);
    expect(overview.body.totals.completed_sessions).toBe(1);
    expect(overview.body.totals.trials).toBe(2);
    expect(overview.body.per_experiment[0].formal_trials).toBe(2);

    const participants = await researcher
      .get('/api/researcher/participants')
      .expect(200);
    expect(participants.body.participants[0].participant_id).toBe(PARTICIPANT);
    expect(participants.body.participants[0].experiments).toEqual(['visual-search']);

    const sessions = await researcher
      .get('/api/researcher/sessions?experiment_id=visual-search&status=completed')
      .expect(200);
    expect(sessions.body.total).toBe(1);
    expect(sessions.body.sessions[0].trial_count).toBe(2);

    const detail = await researcher
      .get(`/api/researcher/sessions/${SESSION}`)
      .expect(200);
    expect(detail.body.trials).toHaveLength(2);
    expect(detail.body.trials[0].stimulus_json).toEqual({
      set_size: 12,
      target_present: true,
    });
    expect(detail.body.session.config_snapshot.blocks).toHaveLength(3);
    expect(detail.body.trials[0].block_id).toBe('vs_feature');
    expect(detail.body.trials[0].block_type).toBe('original_block');

    const csv = await researcher
      .get('/api/researcher/export.csv?experiment_id=visual-search')
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    expect(csv.text).toContain('participant_id');
    expect(csv.text).toContain("'=1+1");
    expect(csv.text).toContain('session_started_at');

    const json = await researcher
      .get('/api/researcher/export.json?experiment_id=visual-search')
      .expect(200);
    expect(json.body.session_count).toBe(1);
    expect(json.body.sessions[0].trials).toHaveLength(2);
    expect(json.body.sessions[0].trials[1].response).toBe('=1+1');
    expect(json.body.sessions[0].summary_json.accuracy).toBe(1);
  });

  it('requires authentication for exports and config changes', async () => {
    await request(app).get('/api/researcher/export.csv').expect(401);
    await request(app).get('/api/researcher/export.json').expect(401);
    await request(app)
      .put('/api/researcher/configs/visual-search')
      .send({ config: searchConfig() })
      .expect(401);
  });

  it('returns personal results, group aggregates, samples and literature provenance', async () => {
    await createSession();
    await request(app).post('/api/trials').send(trialPayload()).expect(201);
    await request(app)
      .post('/api/trials')
      .send(
        trialPayload({
          trial_id: 'vs-practice-001',
          trial_index: 2,
          phase: 'practice',
          correct: false,
          response_time: 9999,
        }),
      )
      .expect(201);
    await request(app)
      .post(`/api/sessions/${SESSION}/complete`)
      .send({ completed_at: summary().generated_at, summary: summary() })
      .expect(200);

    const personal = await request(app)
      .get(`/api/results/visual-search?participant_id=${PARTICIPANT}&session_id=${SESSION}`)
      .expect(200);
    expect(personal.body.personal.formal_trials).toBe(1);
    expect(personal.body.personal.accuracy).toBe(1);
    expect(personal.body.personal.eye.usable_trials).toBe(1);
    expect(personal.body.personal.mouse.usable_trials).toBe(1);
    expect(personal.body.personal.eye.direction_ratios.left_to_right).toBe(0.7);
    expect(
      personal.body.personal.mouse.direction_ratios
        .left_to_right_transition_ratio,
    ).toBe(0.75);
    expect(personal.body.personal.mouse.mean_path_length_px).toBe(120.5);
    expect(personal.body.personal.trials[0].block_id).toBe('vs_feature');
    expect(personal.body.personal.trials[0].stimulus.set_size).toBe(12);
    expect(personal.body.session.summary.accuracy).toBe(1);

    await request(app)
      .get(`/api/results/visual-search?participant_id=OTHER&session_id=${SESSION}`)
      .expect(404);

    const group = await request(app)
      .get(
        `/api/results/visual-search/group?participant_id=${PARTICIPANT}&session_id=${SESSION}`,
      )
      .expect(200);
    expect(group.body.n_participants).toBe(1);
    expect(group.body.group.accuracy.mean).toBe(1);
    expect(group.body.group.mean_response_time_ms.mean).toBe(456.8);
    expect(group.body.blocks[0].n).toBe(1);
    expect(
      group.body.eye.direction_ratios.left_to_right.mean,
    ).toBeCloseTo(0.7, 4);
    expect(
      group.body.mouse.direction_ratios.left_to_right_transition_ratio.mean,
    ).toBeCloseTo(0.75, 4);
    expect(group.body.sample_warning).toContain('N < 10');
    expect(group.body.viewer_position.in_group).toBe(true);
    expect(JSON.stringify(group.body)).not.toContain(PARTICIPANT);

    const samples = await request(app)
      .get(
        `/api/results/visual-search/trials/vs-test-001/samples?participant_id=${PARTICIPANT}&session_id=${SESSION}`,
      )
      .expect(200);
    expect(samples.body.gaze_samples).toHaveLength(1);
    expect(samples.body.mouse_samples).toHaveLength(1);
    expect(samples.body.note).toContain('not merged');

    const literature = await request(app)
      .get('/api/literature/visual-search')
      .expect(200);
    expect(literature.body.records.length).toBeGreaterThanOrEqual(7);
    expect(literature.body.comparison.directly_comparable_rows).toBe(0);
    expect(literature.body.comparison.message).toContain('暂无可比较');
    expect(
      literature.body.records.every(
        (record: { source_page: string; extraction_method: string }) =>
          record.source_page && record.extraction_method,
      ),
    ).toBe(true);

    await login();
    await researcher
      .get(`/api/researcher/sessions/${SESSION}/trials/vs-test-001/samples`)
      .expect(200);
    await researcher.get('/api/researcher/literature').expect(200);
  });

  it('manages literature records behind authentication', async () => {
    const record = {
      experiment_id: 'visual-search',
      block_variant: 'feature_search',
      title: 'Test citation',
      authors: 'Test Author',
      year: 2020,
      journal: 'Test Journal',
      doi: null,
      url: 'https://example.org/paper',
      sample_size: 30,
      task: 'Visual search',
      condition: 'Target present',
      dependent_variable: 'RT',
      mean_value: 500,
      sd_value: 80,
      se_value: null,
      unit: 'ms',
      source_page: 'Table 1',
      extraction_method: 'Read from table',
      comparability_note: 'Different stimuli; background only.',
      approximate: false,
      sort_order: 90,
    };
    await request(app).post('/api/researcher/literature').send(record).expect(401);
    await login();
    const created = await researcher
      .post('/api/researcher/literature')
      .send(record)
      .expect(201);
    expect(created.body.record.mean_value).toBe(500);
    const id = created.body.record.literature_id as string;

    const updated = await researcher
      .put(`/api/researcher/literature/${id}`)
      .send({ ...record, mean_value: 510 })
      .expect(200);
    expect(updated.body.record.mean_value).toBe(510);

    await researcher.delete(`/api/researcher/literature/${id}`).expect(200);
    await researcher.delete(`/api/researcher/literature/${id}`).expect(404);
  });

  it('validates config edits, increments versions and can reset defaults', async () => {
    await login();
    const current = await researcher
      .get('/api/experiments/visual-search/config')
      .expect(200);
    expect(current.body.version).toBe(3);

    await researcher
      .put('/api/researcher/configs/visual-search')
      .send({ config: searchConfig({ blocks: [] }) })
      .expect(400);

    // Extensions are adjustable, but the original block and core original
    // stimulus parameters are restored to the shipped defaults.
    const updatedConfig = searchConfig({ letterSizePx: 40 });
    updatedConfig.blocks = updatedConfig.blocks.map((block) =>
      block.block_id === 'vs_spatial'
        ? { ...block, formalTrials: 22 }
        : { ...block, formalTrials: 22 },
    );
    const updated = await researcher
      .put('/api/researcher/configs/visual-search')
      .send({ config: updatedConfig })
      .expect(200);
    expect(updated.body.saved).toBe(true);
    expect(updated.body.config.version).toBe(4);
    expect(totalFormalTrials(updated.body.config)).toBe(42);
    expect(
      updated.body.config.blocks.find(
        (block: { block_type: string }) => block.block_type === 'original_block',
      ).formalTrials,
    ).toBe(10);

    const publicConfig = await researcher
      .get('/api/experiments/visual-search/config')
      .expect(200);
    expect(publicConfig.body.version).toBe(4);
    expect(publicConfig.body.config.letterSizePx).toBe(34);

    const reset = await researcher
      .post('/api/researcher/configs/visual-search/reset')
      .expect(200);
    expect(reset.body.config.version).toBe(5);
    expect(totalFormalTrials(reset.body.config)).toBe(35);
    expect(reset.body.config.letterSizePx).toBe(34);

    await researcher.put('/api/researcher/configs/unknown').send({}).expect(404);
  });
});
