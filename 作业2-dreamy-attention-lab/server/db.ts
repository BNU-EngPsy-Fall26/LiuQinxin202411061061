import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIGS, validateConfig } from '../shared/config.js';
import { seedLiterature } from './literature.js';
import type {
  ExperimentConfig,
  ExperimentId,
  GazeSampleInput,
  MapAlignmentConfig,
  MouseSampleInput,
} from '../shared/types.js';

export interface ConfigRow {
  experiment_id: ExperimentId;
  config_json: string;
  version: number;
  updated_at: string;
}

export interface SessionRow {
  session_id: string;
  participant_id: string;
  experiment_id: ExperimentId;
  started_at: string;
  completed_at: string | null;
  status: 'in_progress' | 'completed';
  config_version: number;
  config_snapshot: string;
  environment_json: string | null;
  summary_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrialRow {
  trial_id: string;
  session_id: string;
  participant_id: string;
  experiment_id: ExperimentId;
  block_id: string;
  block_name: string | null;
  block_type: string;
  condition_id: string;
  trial_index: number;
  phase: string;
  stimulus_onset: number;
  response_time: number | null;
  response: string | null;
  correct: number | null;
  target_present: number | null;
  target_region: number | null;
  target_x: number | null;
  target_y: number | null;
  set_size: number | null;
  stimulus_type: string | null;
  planned_formal_trials: number | null;
  completed_formal_trials: number | null;
  window_blur: number;
  gaze_available: number;
  gaze_quality: string | null;
  timestamp: string;
  timeout: number;
  invalid_response: number;
  eye_tracking_status: string;
  calibration_status: string;
  calibration_quality: number | null;
  valid_gaze_ratio: number | null;
  valid_mouse_ratio: number | null;
  stimulus_json: string;
  response_json: string;
  tracking_json: string;
  metadata_json: string;
  created_at: string;
}

export interface LiteratureRow {
  literature_id: string;
  experiment_id: ExperimentId;
  block_variant: string | null;
  title: string;
  authors: string;
  year: number;
  journal: string | null;
  doi: string | null;
  url: string | null;
  sample_size: number | null;
  task: string;
  condition: string;
  dependent_variable: string;
  mean_value: number | null;
  sd_value: number | null;
  se_value: number | null;
  unit: string | null;
  source_page: string;
  extraction_method: string;
  comparability_note: string;
  approximate: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type LabDb = DatabaseSync;

export function createDatabase(dbPath: string): LabDb {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS experiment_configs (
      experiment_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      participant_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      experiment_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress',
      config_version INTEGER NOT NULL,
      config_snapshot TEXT NOT NULL,
      environment_json TEXT,
      summary_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(participant_id) REFERENCES participants(participant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_participant
      ON sessions(participant_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_experiment
      ON sessions(experiment_id, started_at);

    CREATE TABLE IF NOT EXISTS trials (
      trial_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      experiment_id TEXT NOT NULL,
      block_id TEXT NOT NULL DEFAULT 'legacy_block',
      block_name TEXT,
      block_type TEXT NOT NULL DEFAULT 'original_block',
      condition_id TEXT NOT NULL,
      trial_index INTEGER NOT NULL,
      phase TEXT NOT NULL,
      stimulus_onset REAL NOT NULL,
      response_time REAL,
      response TEXT,
      correct INTEGER,
      target_present INTEGER,
      target_region INTEGER,
      target_x REAL,
      target_y REAL,
      set_size INTEGER,
      stimulus_type TEXT,
      planned_formal_trials INTEGER,
      completed_formal_trials INTEGER,
      window_blur INTEGER NOT NULL DEFAULT 0,
      gaze_available INTEGER NOT NULL DEFAULT 0,
      gaze_quality TEXT,
      timestamp TEXT NOT NULL,
      timeout INTEGER NOT NULL DEFAULT 0,
      invalid_response INTEGER NOT NULL DEFAULT 0,
      eye_tracking_status TEXT NOT NULL DEFAULT 'not_requested',
      calibration_status TEXT NOT NULL DEFAULT 'not_applicable',
      calibration_quality REAL,
      valid_gaze_ratio REAL,
      valid_mouse_ratio REAL,
      stimulus_json TEXT NOT NULL,
      response_json TEXT NOT NULL,
      tracking_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_trials_session
      ON trials(session_id, phase, trial_index);
    CREATE INDEX IF NOT EXISTS idx_trials_experiment
      ON trials(experiment_id, participant_id);

    CREATE TABLE IF NOT EXISTS gaze_samples (
      sample_id TEXT PRIMARY KEY,
      trial_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      experiment_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      sample_index INTEGER NOT NULL,
      t_ms REAL NOT NULL,
      timestamp_ms REAL NOT NULL,
      screen_x REAL,
      screen_y REAL,
      normalized_x REAL,
      normalized_y REAL,
      valid INTEGER NOT NULL,
      face_lost INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(trial_id) REFERENCES trials(trial_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_gaze_trial ON gaze_samples(trial_id, sample_index);
    CREATE INDEX IF NOT EXISTS idx_gaze_experiment ON gaze_samples(experiment_id, participant_id);

    CREATE TABLE IF NOT EXISTS mouse_samples (
      sample_id TEXT PRIMARY KEY,
      trial_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      experiment_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      sample_index INTEGER NOT NULL,
      t_ms REAL NOT NULL,
      timestamp_ms REAL NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      normalized_x REAL NOT NULL,
      normalized_y REAL NOT NULL,
      movement_direction TEXT,
      movement_distance REAL NOT NULL,
      velocity REAL,
      valid INTEGER NOT NULL,
      phase TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(trial_id) REFERENCES trials(trial_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mouse_trial ON mouse_samples(trial_id, sample_index);
    CREATE INDEX IF NOT EXISTS idx_mouse_experiment ON mouse_samples(experiment_id, participant_id);

    CREATE TABLE IF NOT EXISTS literature (
      literature_id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      block_variant TEXT,
      title TEXT NOT NULL,
      authors TEXT NOT NULL,
      year INTEGER NOT NULL,
      journal TEXT,
      doi TEXT,
      url TEXT,
      sample_size INTEGER,
      task TEXT NOT NULL,
      condition TEXT NOT NULL,
      dependent_variable TEXT NOT NULL,
      mean_value REAL,
      sd_value REAL,
      se_value REAL,
      unit TEXT,
      source_page TEXT NOT NULL,
      extraction_method TEXT NOT NULL,
      comparability_note TEXT NOT NULL,
      approximate INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_literature_experiment
      ON literature(experiment_id, sort_order);
  `);

  // Legacy databases: add Phase-2 columns without dropping raw trials.
  ensureColumn(db, 'trials', 'block_id', "TEXT NOT NULL DEFAULT 'legacy_block'");
  ensureColumn(db, 'trials', 'block_type', "TEXT NOT NULL DEFAULT 'original_block'");
  ensureColumn(db, 'trials', 'eye_tracking_status', "TEXT NOT NULL DEFAULT 'not_requested'");
  ensureColumn(db, 'trials', 'calibration_status', "TEXT NOT NULL DEFAULT 'not_applicable'");
  ensureColumn(db, 'trials', 'calibration_quality', 'REAL');
  ensureColumn(db, 'trials', 'valid_gaze_ratio', 'REAL');
  ensureColumn(db, 'trials', 'valid_mouse_ratio', 'REAL');
  ensureColumn(db, 'trials', 'block_name', 'TEXT');
  ensureColumn(db, 'trials', 'target_present', 'INTEGER');
  ensureColumn(db, 'trials', 'target_region', 'INTEGER');
  ensureColumn(db, 'trials', 'target_x', 'REAL');
  ensureColumn(db, 'trials', 'target_y', 'REAL');
  ensureColumn(db, 'trials', 'set_size', 'INTEGER');
  ensureColumn(db, 'trials', 'stimulus_type', 'TEXT');
  ensureColumn(db, 'trials', 'planned_formal_trials', 'INTEGER');
  ensureColumn(db, 'trials', 'completed_formal_trials', 'INTEGER');
  ensureColumn(db, 'trials', 'window_blur', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'trials', 'gaze_available', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'trials', 'gaze_quality', 'TEXT');

  const now = new Date().toISOString();
  const insertConfig = db.prepare(
    `INSERT OR IGNORE INTO experiment_configs
       (experiment_id, config_json, version, updated_at)
     VALUES (?, ?, ?, ?)`,
  );
  for (const [id, config] of Object.entries(DEFAULT_CONFIGS)) {
    insertConfig.run(id, JSON.stringify(config), config.version, now);
  }
  migrateStoredVisualSearchConfig(db, now);
  migrateStoredMapAlignmentConfig(db, now);
  migrateLiteratureComparability(db, now);
  seedLiterature(db);

  return db;
}

export function getConfig(db: LabDb, id: ExperimentId): ExperimentConfig {
  const row = db
    .prepare('SELECT config_json FROM experiment_configs WHERE experiment_id = ?')
    .get(id) as { config_json: string } | undefined;
  if (!row) {
    const fallback = DEFAULT_CONFIGS[id];
    saveConfig(db, id, fallback);
    return fallback;
  }
  const stored = JSON.parse(row.config_json) as Record<string, unknown>;
  const checked = validateConfig(id, stored);
  if (checked.success) {
    return {
      ...checked.data,
      version: Number(stored.version) || 1,
    } as ExperimentConfig;
  }
  const fallback = { ...DEFAULT_CONFIGS[id] } as ExperimentConfig;
  return fallback;
}

export function getConfigRow(db: LabDb, id: ExperimentId): ConfigRow {
  const row = db
    .prepare(
      `SELECT experiment_id, config_json, version, updated_at
       FROM experiment_configs WHERE experiment_id = ?`,
    )
    .get(id) as ConfigRow | undefined;
  if (!row) throw new Error(`Unknown experiment: ${id}`);
  return row;
}

export function saveConfig(
  db: LabDb,
  id: ExperimentId,
  config: ExperimentConfig,
): ExperimentConfig {
  const row = db
    .prepare('SELECT version FROM experiment_configs WHERE experiment_id = ?')
    .get(id) as { version: number } | undefined;
  const nextVersion = row ? row.version + 1 : 1;
  const saved = { ...config, version: nextVersion } as ExperimentConfig;
  db.prepare(
    `INSERT INTO experiment_configs (experiment_id, config_json, version, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(experiment_id) DO UPDATE SET
       config_json = excluded.config_json,
       version = excluded.version,
       updated_at = excluded.updated_at`,
  ).run(id, JSON.stringify(saved), nextVersion, new Date().toISOString());
  return saved;
}

export function upsertParticipant(
  db: LabDb,
  participantId: string,
  now = new Date().toISOString(),
): void {
  db.prepare(
    `INSERT INTO participants (participant_id, created_at, last_seen_at)
     VALUES (?, ?, ?)
     ON CONFLICT(participant_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
  ).run(participantId, now, now);
}

export interface TrialInsertInput {
  trial_id: string;
  session_id: string;
  participant_id: string;
  experiment_id: ExperimentId;
  block_id: string;
  block_name?: string | null;
  block_type: string;
  condition_id: string;
  trial_index: number;
  phase: string;
  stimulus_onset: number;
  response_time: number | null;
  response: string | null;
  correct: boolean | null;
  target_present?: boolean | null;
  target_region?: number | null;
  target_x?: number | null;
  target_y?: number | null;
  set_size?: number | null;
  stimulus_type?: string | null;
  planned_formal_trials?: number | null;
  completed_formal_trials?: number | null;
  window_blur?: boolean;
  gaze_available?: boolean;
  gaze_quality?: string | null;
  timestamp: string;
  timeout: boolean;
  invalid_response: boolean;
  eye_tracking_status: string;
  calibration_status: string;
  calibration_quality: number | null;
  valid_gaze_ratio: number | null;
  valid_mouse_ratio: number | null;
  stimulus: Record<string, unknown>;
  response_data: Record<string, unknown>;
  tracking: Record<string, unknown>;
  metadata: Record<string, unknown>;
  gaze_samples?: GazeSampleInput[];
  mouse_samples?: MouseSampleInput[];
}

/**
 * Writes a trial and its raw samples in one transaction. Sample IDs are
 * deterministic, so an offline retry can never duplicate rows.
 */
export function insertTrialWithSamples(db: LabDb, input: TrialInsertInput): void {
  const now = new Date().toISOString();
  const insertTrial = db.prepare(
    `INSERT OR IGNORE INTO trials (
      trial_id, session_id, participant_id, experiment_id, block_id, block_name,
      block_type, condition_id, trial_index, phase, stimulus_onset, response_time,
      response, correct, target_present, target_region, target_x, target_y,
      set_size, stimulus_type, planned_formal_trials, completed_formal_trials,
      window_blur, gaze_available, gaze_quality, timestamp, timeout,
      invalid_response, eye_tracking_status, calibration_status,
      calibration_quality, valid_gaze_ratio, valid_mouse_ratio, stimulus_json,
      response_json, tracking_json, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertGaze = db.prepare(
    `INSERT OR IGNORE INTO gaze_samples (
      sample_id, trial_id, session_id, participant_id, experiment_id, block_id,
      sample_index, t_ms, timestamp_ms, screen_x, screen_y, normalized_x,
      normalized_y, valid, face_lost, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMouse = db.prepare(
    `INSERT OR IGNORE INTO mouse_samples (
      sample_id, trial_id, session_id, participant_id, experiment_id, block_id,
      sample_index, t_ms, timestamp_ms, x, y, normalized_x, normalized_y,
      movement_direction, movement_distance, velocity, valid, phase, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    insertTrial.run(
      input.trial_id,
      input.session_id,
      input.participant_id,
      input.experiment_id,
      input.block_id,
      input.block_name ?? null,
      input.block_type,
      input.condition_id,
      input.trial_index,
      input.phase,
      input.stimulus_onset,
      input.response_time,
      input.response,
      input.correct === null ? null : input.correct ? 1 : 0,
      input.target_present === null || input.target_present === undefined
        ? null
        : input.target_present
          ? 1
          : 0,
      input.target_region ?? null,
      input.target_x ?? null,
      input.target_y ?? null,
      input.set_size ?? null,
      input.stimulus_type ?? null,
      input.planned_formal_trials ?? null,
      input.completed_formal_trials ?? null,
      input.window_blur ? 1 : 0,
      input.gaze_available ? 1 : 0,
      input.gaze_quality ?? null,
      input.timestamp,
      input.timeout ? 1 : 0,
      input.invalid_response ? 1 : 0,
      input.eye_tracking_status,
      input.calibration_status,
      input.calibration_quality,
      input.valid_gaze_ratio,
      input.valid_mouse_ratio,
      JSON.stringify(input.stimulus),
      JSON.stringify(input.response_data),
      JSON.stringify(input.tracking),
      JSON.stringify(input.metadata),
      now,
    );
    (input.gaze_samples ?? []).forEach((sample, index) => {
      insertGaze.run(
        `${input.trial_id}:g:${sample.sample_index ?? index}`,
        input.trial_id,
        input.session_id,
        input.participant_id,
        input.experiment_id,
        input.block_id,
        sample.sample_index ?? index,
        sample.t_ms,
        sample.timestamp_ms,
        sample.screen_x,
        sample.screen_y,
        sample.normalized_x,
        sample.normalized_y,
        sample.valid ? 1 : 0,
        sample.face_lost ? 1 : 0,
        now,
      );
    });
    (input.mouse_samples ?? []).forEach((sample, index) => {
      insertMouse.run(
        `${input.trial_id}:m:${sample.sample_index ?? index}`,
        input.trial_id,
        input.session_id,
        input.participant_id,
        input.experiment_id,
        input.block_id,
        sample.sample_index ?? index,
        sample.t_ms,
        sample.timestamp_ms,
        sample.x,
        sample.y,
        sample.normalized_x,
        sample.normalized_y,
        sample.movement_direction,
        sample.movement_distance,
        sample.velocity,
        sample.valid ? 1 : 0,
        sample.phase,
        now,
      );
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * The previous deployment stored a two-block red-T visual-search config.
 * Replace only that obsolete shape; measurement preferences are preserved and
 * all existing sessions/trials remain untouched.
 */
function migrateStoredVisualSearchConfig(db: LabDb, now: string): void {
  const row = db
    .prepare(
      "SELECT config_json, version FROM experiment_configs WHERE experiment_id = 'visual-search'",
    )
    .get() as { config_json: string; version: number } | undefined;
  if (!row) return;
  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(row.config_json) as Record<string, unknown>;
  } catch {
    return;
  }
  const blocks = Array.isArray(stored.blocks)
    ? (stored.blocks as Array<Record<string, unknown>>)
    : [];
  const variants = new Set(blocks.map((block) => block.variant));
  const current =
    variants.size === 3 &&
    variants.has('feature_search') &&
    variants.has('conjunction_search') &&
    variants.has('spatial_search');
  if (current) return;
  const checked = validateConfig('visual-search', {
    ...stored,
    version: Math.max(3, Number(stored.version) || 0),
  });
  if (!checked.success) return;
  db.prepare(
    `UPDATE experiment_configs
     SET config_json = ?, version = ?, updated_at = ?
     WHERE experiment_id = 'visual-search'`,
  ).run(JSON.stringify(checked.data), checked.data.version, now);
}

/**
 * Replace the obsolete aligned/misaligned × three-cue map config with the
 * current two-condition rotation design. Existing sessions and trials remain
 * available in the database; only the served config row is upgraded.
 */
function migrateStoredMapAlignmentConfig(db: LabDb, now: string): void {
  const row = db
    .prepare(
      "SELECT config_json FROM experiment_configs WHERE experiment_id = 'map-alignment'",
    )
    .get() as { config_json: string } | undefined;
  if (!row) return;
  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(row.config_json) as Record<string, unknown>;
  } catch {
    return;
  }
  const blocks = Array.isArray(stored.blocks)
    ? (stored.blocks as Array<Record<string, unknown>>)
    : [];
  const variants = new Set(blocks.map((block) => block.variant));
  const mapDefaults = DEFAULT_CONFIGS[
    'map-alignment'
  ] as MapAlignmentConfig;
  const current =
    Number(stored.version) >= 4 &&
    variants.size === 2 &&
    variants.has('no_cue') &&
    variants.has('person_cue') &&
    Array.isArray(stored.rotations) &&
    blocks.every((block) => block.formalTrials === 15) &&
    stored.practiceTrials === mapDefaults.practiceTrials &&
    stored.responseTimeoutMs === 0 &&
    !('mapPreviewDurationMs' in stored);
  if (current) return;
  const checked = validateConfig('map-alignment', {
    ...stored,
    version: Math.max(4, Number(stored.version) || 0),
    practiceTrials: mapDefaults.practiceTrials,
    randomizeBlockOrder: false,
    blocks: structuredClone(mapDefaults.blocks),
    responseTimeoutMs: 0,
    fixationDurationMs: mapDefaults.fixationDurationMs,
    postTrialDelayMs: mapDefaults.postTrialDelayMs,
  });
  if (!checked.success) return;
  db.prepare(
    `UPDATE experiment_configs
     SET config_json = ?, version = ?, updated_at = ?
     WHERE experiment_id = 'map-alignment'`,
  ).run(JSON.stringify(checked.data), checked.data.version, now);
}

/** Update only the seeded Treisman rows whose comparability text referenced
 * the old red-T / set-size-12/24 protocol. Researcher-authored rows are left
 * untouched. */
function migrateLiteratureComparability(db: LabDb, now: string): void {
  const note =
    '参考站点使用红色 O 目标、set size 4/8/16/24。本平台现采用相同的红色 O 与 4/8/16/24，但试次数、呈现设备和程序仍不同；该斜率仅作近似背景，不与个人数据做显著性检验。';
  const rows = db
    .prepare(
      `SELECT literature_id, block_variant, comparability_note
       FROM literature
       WHERE experiment_id = 'visual-search'
         AND literature_id LIKE 'lit-vs-treisman-%'`,
    )
    .all() as Array<{
    literature_id: string;
    block_variant: string | null;
    comparability_note: string;
  }>;
  const update = db.prepare(
    `UPDATE literature
     SET block_variant = ?, comparability_note = ?, updated_at = ?
     WHERE literature_id = ?`,
  );
  for (const row of rows) {
    const variant = row.literature_id.includes('feature')
      ? 'feature_search'
      : 'conjunction_search';
    update.run(variant, note, now, row.literature_id);
  }
}

function ensureColumn(
  db: LabDb,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
