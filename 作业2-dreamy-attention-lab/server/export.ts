import type { LabDb } from './db.js';

export interface ExportFilters {
  experimentId?: string;
  participantId?: string;
  sessionId?: string;
  phase?: string;
  status?: string;
  blockId?: string;
  eyeTrackingStatus?: string;
  minValidGazeRatio?: number;
}

interface ExportSessionRow {
  session_id: string;
  participant_id: string;
  experiment_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  config_version: number;
  config_snapshot: string;
  environment_json: string | null;
  summary_json: string | null;
}

interface ExportTrialRow {
  trial_id: string;
  session_id: string;
  participant_id: string;
  experiment_id: string;
  block_id: string;
  block_type: string;
  condition_id: string;
  trial_index: number;
  phase: string;
  stimulus_onset: number;
  response_time: number | null;
  response: string | null;
  correct: number | null;
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
  session_started_at: string;
  session_completed_at: string | null;
  session_status: string;
  config_version: number;
}

function whereClause(filters: ExportFilters): {
  sql: string;
  params: Array<string | number>;
} {
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters.experimentId) {
    conditions.push('t.experiment_id = ?');
    params.push(filters.experimentId);
  }
  if (filters.participantId) {
    conditions.push('t.participant_id = ?');
    params.push(filters.participantId);
  }
  if (filters.sessionId) {
    conditions.push('t.session_id = ?');
    params.push(filters.sessionId);
  }
  if (filters.phase) {
    conditions.push('t.phase = ?');
    params.push(filters.phase);
  }
  if (filters.status) {
    conditions.push('s.status = ?');
    params.push(filters.status);
  }
  if (filters.blockId) {
    conditions.push('t.block_id = ?');
    params.push(filters.blockId);
  }
  if (filters.eyeTrackingStatus) {
    conditions.push('t.eye_tracking_status = ?');
    params.push(filters.eyeTrackingStatus);
  }
  if (filters.minValidGazeRatio !== undefined) {
    conditions.push('t.valid_gaze_ratio >= ?');
    params.push(filters.minValidGazeRatio);
  }
  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export function getExportTrials(db: LabDb, filters: ExportFilters): ExportTrialRow[] {
  const where = whereClause(filters);
  return db
    .prepare(
      `SELECT
         t.*,
         s.started_at AS session_started_at,
         s.completed_at AS session_completed_at,
         s.status AS session_status,
         s.config_version AS config_version
       FROM trials t
       JOIN sessions s ON s.session_id = t.session_id
       ${where.sql}
       ORDER BY s.started_at, t.session_id, t.phase, t.trial_index`,
    )
    .all(...where.params) as unknown as ExportTrialRow[];
}

export type ExportedSession = Omit<
  ExportSessionRow,
  'config_snapshot' | 'environment_json' | 'summary_json'
> & {
  config_snapshot: unknown;
  environment_json: unknown;
  summary_json: unknown;
  trials: Array<Record<string, unknown>>;
};

export function getExportSessions(
  db: LabDb,
  filters: ExportFilters,
): ExportedSession[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters.experimentId) {
    conditions.push('experiment_id = ?');
    params.push(filters.experimentId);
  }
  if (filters.participantId) {
    conditions.push('participant_id = ?');
    params.push(filters.participantId);
  }
  if (filters.sessionId) {
    conditions.push('session_id = ?');
    params.push(filters.sessionId);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  const sessions = db
    .prepare(
      `SELECT session_id, participant_id, experiment_id, started_at, completed_at,
              status, config_version, config_snapshot, environment_json, summary_json
       FROM sessions
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY started_at DESC`,
    )
    .all(...params) as unknown as ExportSessionRow[];

  const trialWhere = whereClause(filters);
  const trials = db
    .prepare(
      `SELECT t.*, s.started_at AS session_started_at, s.completed_at AS session_completed_at,
              s.status AS session_status, s.config_version AS config_version
       FROM trials t
       JOIN sessions s ON s.session_id = t.session_id
       ${trialWhere.sql}
       ORDER BY s.started_at, t.session_id, t.phase, t.trial_index`,
    )
    .all(...trialWhere.params) as unknown as ExportTrialRow[];

  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const trial of trials) {
    const normalized = normalizeTrial(trial);
    const list = grouped.get(trial.session_id) ?? [];
    list.push(normalized);
    grouped.set(trial.session_id, list);
  }

  return sessions.map((session) => ({
    ...session,
    config_snapshot: safeJson(session.config_snapshot, {}),
    environment_json: safeJson(session.environment_json, {}),
    summary_json: safeJson(session.summary_json, null),
    trials: grouped.get(session.session_id) ?? [],
  }));
}

function normalizeTrial(row: ExportTrialRow): Record<string, unknown> {
  return {
    participant_id: row.participant_id,
    experiment_id: row.experiment_id,
    session_id: row.session_id,
    trial_id: row.trial_id,
    block_id: row.block_id,
    block_type: row.block_type,
    condition_id: row.condition_id,
    trial_index: row.trial_index,
    phase: row.phase,
    stimulus_onset: row.stimulus_onset,
    response_time: row.response_time,
    response: row.response,
    correct: row.correct === null ? null : Boolean(row.correct),
    timestamp: row.timestamp,
    timeout: Boolean(row.timeout),
    invalid_response: Boolean(row.invalid_response),
    eye_tracking_status: row.eye_tracking_status,
    calibration_status: row.calibration_status,
    calibration_quality: row.calibration_quality,
    valid_gaze_ratio: row.valid_gaze_ratio,
    valid_mouse_ratio: row.valid_mouse_ratio,
    stimulus: safeJson(row.stimulus_json, {}),
    response_data: safeJson(row.response_json, {}),
    tracking: safeJson(row.tracking_json, {}),
    metadata: safeJson(row.metadata_json, {}),
    session_started_at: row.session_started_at,
    session_completed_at: row.session_completed_at,
    session_status: row.session_status,
    config_version: row.config_version,
    created_at: row.created_at,
  };
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function flatten(
  value: unknown,
  prefix: string,
  target: Record<string, string | number | boolean | null>,
  depth = 0,
): void {
  if (value === null || value === undefined) {
    target[prefix] = '';
    return;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    target[prefix] = value;
    return;
  }
  if (depth >= 4) {
    target[prefix] = JSON.stringify(value);
    return;
  }
  if (Array.isArray(value)) {
    target[prefix] = JSON.stringify(value);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      flatten(nested, `${prefix}.${key}`, target, depth + 1);
    }
  }
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  // Mitigate spreadsheet formula injection when a researcher opens the CSV.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function trialsToCsv(rows: ExportTrialRow[]): string {
  if (rows.length === 0) {
    return '﻿' + 'participant_id,experiment_id,session_id,trial_id\n';
  }
  const records = rows.map((row) => {
    const base: Record<string, string | number | boolean | null> = {
      participant_id: row.participant_id,
      experiment_id: row.experiment_id,
      session_id: row.session_id,
      trial_id: row.trial_id,
      block_id: row.block_id,
      block_type: row.block_type,
      condition_id: row.condition_id,
      trial_index: row.trial_index,
      phase: row.phase,
      stimulus_onset: row.stimulus_onset,
      response_time: row.response_time,
      response: row.response,
      correct: row.correct === null ? '' : row.correct ? 1 : 0,
      timestamp: row.timestamp,
      timeout: row.timeout ? 1 : 0,
      invalid_response: row.invalid_response ? 1 : 0,
      eye_tracking_status: row.eye_tracking_status,
      calibration_status: row.calibration_status,
      calibration_quality: row.calibration_quality,
      valid_gaze_ratio: row.valid_gaze_ratio,
      valid_mouse_ratio: row.valid_mouse_ratio,
      session_started_at: row.session_started_at,
      session_completed_at: row.session_completed_at ?? '',
      session_status: row.session_status,
      config_version: row.config_version,
    };
    flatten(safeJson(row.stimulus_json, {}), 'stimulus', base);
    flatten(safeJson(row.response_json, {}), 'response_data', base);
    flatten(safeJson(row.tracking_json, {}), 'tracking', base);
    flatten(safeJson(row.metadata_json, {}), 'metadata', base);
    return base;
  });

  const keySet = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) keySet.add(key);
  }
  const coreOrder = [
    'participant_id',
    'experiment_id',
    'session_id',
    'trial_id',
    'block_id',
    'block_type',
    'condition_id',
    'trial_index',
    'phase',
    'stimulus_onset',
    'response_time',
    'response',
    'correct',
    'timestamp',
    'timeout',
    'invalid_response',
    'eye_tracking_status',
    'calibration_status',
    'calibration_quality',
    'valid_gaze_ratio',
    'valid_mouse_ratio',
    'session_started_at',
    'session_completed_at',
    'session_status',
    'config_version',
  ];
  const headers = [
    ...coreOrder,
    ...[...keySet].filter((key) => !coreOrder.includes(key)).sort(),
  ];
  const lines = [headers.map(csvCell).join(',')];
  for (const record of records) {
    lines.push(headers.map((header) => csvCell(record[header])).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

export function parseFilters(query: Record<string, unknown>): ExportFilters {
  const pick = (key: string) =>
    typeof query[key] === 'string' && query[key] ? (query[key] as string) : undefined;
  const ratioRaw = pick('min_valid_gaze_ratio');
  const ratio = ratioRaw === undefined ? undefined : Number.parseFloat(ratioRaw);
  return {
    experimentId: pick('experiment_id'),
    participantId: pick('participant_id'),
    sessionId: pick('session_id'),
    phase: pick('phase'),
    status: pick('status'),
    blockId: pick('block_id'),
    eyeTrackingStatus: pick('eye_tracking_status'),
    minValidGazeRatio:
      ratio !== undefined && Number.isFinite(ratio)
        ? Math.max(0, Math.min(1, ratio))
        : undefined,
  };
}
