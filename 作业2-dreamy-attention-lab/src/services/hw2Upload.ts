import type { ExperimentId, TrialSubmission } from '@shared/types';

/**
 * Course-platform (homework 2) submission.
 *
 * The six-character project code is public and is the one supplied by the
 * course instructor. The download key is intentionally absent: it is only used
 * by the researcher to download data from the teacher's platform and must
 * never appear in frontend code or the repository.
 */
export const HW2_TEACHER_BASE = 'https://attention-lab-production.up.railway.app';
export const HW2_PROJECT_CODE = 'TYJKZF';

/** Each experiment is a separate `experiment` series on the teacher's side. */
export const HW2_EXPERIMENT_IDS: Record<ExperimentId, string> = {
  'visual-search': 'dreamy_visual_search',
  'map-alignment': 'dreamy_map_alignment',
  'perceptual-ordering': 'dreamy_perceptual_ordering',
};

const TRIAL_BUFFER_PREFIX = 'dcl.hw2.trials.';
const STATUS_PREFIX = 'dcl.hw2.status.';
const PARTICIPANT_KEY = 'dcl.hw2_participant_id';

const MAX_TRIAL_FIELDS = 40;
const MAX_TRIALS = 2000;
const MAX_PAYLOAD_BYTES = 256 * 1024;

export type Hw2TrialValue = string | number | boolean | number[] | string[];
export type Hw2CompactTrial = Record<string, Hw2TrialValue>;

export interface Hw2TrialBufferEntry {
  trial_id: string;
  trial: Hw2CompactTrial;
}

export interface Hw2TrialBuffer {
  experiment_id: ExperimentId;
  session_id: string;
  participant: string;
  trials: Hw2TrialBufferEntry[];
  updated_at: string;
}

export type Hw2StatusValue = 'pending' | 'success' | 'failed';

export interface Hw2SubmissionStatus {
  experiment_id: ExperimentId;
  session_id: string;
  participant: string;
  status: Hw2StatusValue;
  trials: number;
  attempts: number;
  updated_at: string;
  record_id?: string;
  warnings?: string;
  error?: string;
}

export interface Hw2SubmitOptions {
  /** A manual retry is allowed after a failed automatic attempt. */
  manual?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface Hw2SubmitOutcome {
  status: 'success' | 'failed' | 'skipped' | 'empty';
  record_id?: string;
  warnings?: string;
  error?: string;
}

export interface Hw2Payload {
  project: string;
  experiment: string;
  participant: string;
  condition: string;
  trials: Hw2CompactTrial[];
  meta: {
    ua: string;
    w: number;
    h: number;
    app: string;
    session: string;
  };
}

const inFlight = new Set<string>();
const listeners = new Set<() => void>();

function emitStatus(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A broken subscriber must not block the upload.
    }
  }
}

export function subscribeHw2Upload(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asText(value: unknown, max = 120): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function asFlag(value: unknown): 0 | 1 {
  return value ? 1 : 0;
}

function round1(value: number | null, fallback = -1): number {
  return value === null ? fallback : Math.round(value * 10) / 10;
}

function ratio(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return -1;
  return Math.round(value * 10000) / 10000;
}

function orderArray(value: unknown): number[] | string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    return null;
  }
  if (value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    return value as number[];
  }
  if (value.every((item) => typeof item === 'string')) {
    return value as string[];
  }
  return null;
}

/**
 * Flat, compact per-trial record for the teacher's endpoint.
 *
 * Raw gaze/mouse samples stay in the project's own outbox and database; only
 * counts and derived quality ratios are sent here. This keeps every trial well
 * below the 40-field limit and the whole submission far below 256 KB.
 */
export function compactHw2Trial(
  trial: TrialSubmission,
  anonymousId?: string,
): Hw2CompactTrial {
  const stimulus = asRecord(trial.stimulus);
  const responseData = asRecord(trial.response_data);
  const tracking = asRecord(trial.tracking);
  const eye = asRecord(tracking.eye_tracking);
  const mouse = asRecord(tracking.mouse_tracking);

  const compact: Hw2CompactTrial = {
    // The teacher's data view replaces the top-level `participant` with its
    // own per-experiment P01/P02 codes. This stable random code stays in the
    // downloaded trial data so the same person can still be linked across
    // experiments; it contains no name, student number or contact details.
    ...(anonymousId ? { anon: asText(anonymousId, 40) } : {}),
    tid: asText(trial.trial_id, 60),
    trial: Math.round(trial.trial_index),
    block: asText(trial.block_id, 60),
    btype: asText(trial.block_type, 40),
    phase: trial.phase,
    cond: asText(trial.condition_id, 120),
    rt:
      trial.response_time === null
        ? -1
        : Math.round(trial.response_time),
    correct: asFlag(trial.correct),
    resp: asText(trial.response, 120),
    timeout: asFlag(trial.timeout),
    invalid: asFlag(trial.invalid_response),
    blur: asFlag(trial.window_blur),
    eye: asText(trial.eye_tracking_status, 40),
    calib: asText(trial.calibration_status, 40),
    calib_q: round1(trial.calibration_quality),
    gaze_valid: ratio(trial.valid_gaze_ratio),
    mouse_valid: ratio(trial.valid_mouse_ratio),
    gaze_n: Math.round(asNumber(eye.sample_count) ?? 0),
    gaze_fix: Math.round(asNumber(eye.fixation_count) ?? 0),
    mouse_n: Math.round(asNumber(mouse.sample_count) ?? 0),
    mouse_path: round1(asNumber(mouse.path_length_px), 0),
  };

  if (trial.experiment_id === 'visual-search') {
    compact.setsize = Math.round(
      asNumber(stimulus.set_size) ?? trial.set_size ?? -1,
    );
    compact.t_present = asFlag(
      stimulus.target_present ?? trial.target_present,
    );
    compact.t_region = Math.round(
      asNumber(stimulus.target_region) ?? trial.target_region ?? -1,
    );
    compact.t_x = round1(
      asNumber(stimulus.target_x) ?? trial.target_x ?? -1,
    );
    compact.t_y = round1(
      asNumber(stimulus.target_y) ?? trial.target_y ?? -1,
    );
    compact.variant = asText(
      stimulus.block_variant ?? stimulus.stimulus_type ?? trial.stimulus_type,
      40,
    );
  } else if (trial.experiment_id === 'map-alignment') {
    compact.heading = round1(asNumber(stimulus.heading_deg));
    compact.align = asText(stimulus.alignment, 20);
    compact.cue = asText(stimulus.person_cue, 20);
    compact.target = asText(stimulus.target_building, 40);
    compact.t_dir = asText(stimulus.target_direction, 20);
    compact.map_rot = round1(asNumber(stimulus.map_rotation_deg));
  } else if (trial.experiment_id === 'perceptual-ordering') {
    compact.diff = asText(stimulus.difficulty, 30);
    compact.n_rect = Math.round(asNumber(stimulus.rectangle_count) ?? -1);
    compact.pos_err = round1(asNumber(responseData.position_error));
    compact.ops = Math.round(
      asNumber(responseData.operation_count) ??
        asNumber(responseData.operations) ??
        -1,
    );
    const correctOrder = orderArray(stimulus.correct_order);
    if (correctOrder) compact.correct_order = correctOrder;
    const finalOrder = orderArray(responseData.final_order);
    if (finalOrder) compact.final_order = finalOrder;
  }

  if (Object.keys(compact).length > MAX_TRIAL_FIELDS) {
    // Never expected: the mapping above is fixed. Truncating here would hide
    // a programming error from the researcher.
    throw new Error(
      `HW2 trial mapping produced ${Object.keys(compact).length} fields (max ${MAX_TRIAL_FIELDS}).`,
    );
  }

  return compact;
}

export function buildHw2Payload(
  experimentId: ExperimentId,
  participant: string,
  sessionId: string,
  trials: Hw2CompactTrial[],
): Hw2Payload {
  return {
    project: HW2_PROJECT_CODE,
    experiment: HW2_EXPERIMENT_IDS[experimentId],
    participant,
    condition: '',
    trials,
    meta: {
      ua:
        typeof navigator !== 'undefined'
          ? navigator.userAgent.slice(0, 80)
          : '',
      w: typeof window !== 'undefined' ? window.innerWidth : 0,
      h: typeof window !== 'undefined' ? window.innerHeight : 0,
      app: 'dreamy-attention-lab',
      session: sessionId,
    },
  };
}

function randomAnonymousSuffix(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let result = '';
  for (const value of bytes) result += alphabet[value % alphabet.length];
  return result;
}

let memoryParticipantId: string | null = null;

/**
 * Starts a fresh anonymous upload code. Called when the participant identity
 * changes on this device, so two different participants sharing a browser are
 * not merged into one `participant` on the course platform.
 */
export function resetHw2ParticipantId(): void {
  memoryParticipantId = null;
  try {
    localStorage.removeItem(PARTICIPANT_KEY);
  } catch {
    // The in-memory fallback was already cleared.
  }
}

/**
 * Stable anonymous code used only for course-platform uploads. It is generated
 * independently of the participant's typed ID, so a student number typed into
 * the login field is never sent to the teacher's server.
 */
export function getOrCreateHw2ParticipantId(): string {
  try {
    const existing = localStorage.getItem(PARTICIPANT_KEY);
    if (existing && /^DCL-[A-Z0-9]{8}$/.test(existing)) return existing;
    const created = `DCL-${randomAnonymousSuffix()}`;
    localStorage.setItem(PARTICIPANT_KEY, created);
    return created;
  } catch {
    if (!memoryParticipantId) {
      memoryParticipantId = `DCL-${randomAnonymousSuffix()}`;
    }
    return memoryParticipantId;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Appends a compact trial to the durable per-session buffer. The raw
 * `TrialSubmission` (including gaze/mouse samples) continues to go to the
 * project's own offline queue; it is never part of this buffer.
 */
export function bufferHw2Trial(
  experimentId: ExperimentId,
  sessionId: string,
  trial: TrialSubmission,
  participant = getOrCreateHw2ParticipantId(),
): void {
  if (!sessionId) return;
  try {
    const compact = compactHw2Trial(trial, participant);
    const key = `${TRIAL_BUFFER_PREFIX}${sessionId}`;
    const stored = readJson<Hw2TrialBuffer>(key);
    const buffer: Hw2TrialBuffer =
      stored && stored.session_id === sessionId
        ? stored
        : {
            experiment_id: experimentId,
            session_id: sessionId,
            participant,
            trials: [],
            updated_at: '',
          };
    const entry: Hw2TrialBufferEntry = {
      trial_id: trial.trial_id,
      trial: compact,
    };
    const existingIndex = buffer.trials.findIndex(
      (candidate) => candidate.trial_id === trial.trial_id,
    );
    if (existingIndex >= 0) {
      buffer.trials[existingIndex] = entry;
    } else {
      buffer.trials.push(entry);
    }
    buffer.participant = participant;
    buffer.updated_at = new Date().toISOString();
    writeJson(key, buffer);
  } catch {
    // The project's own outbox still holds the raw trial. A later upload
    // attempt can only use whatever compact trials were buffered.
  }
}

export function readHw2TrialBuffer(sessionId: string): Hw2TrialBuffer | null {
  if (!sessionId) return null;
  return readJson<Hw2TrialBuffer>(`${TRIAL_BUFFER_PREFIX}${sessionId}`);
}

function clearHw2TrialBuffer(sessionId: string): void {
  try {
    localStorage.removeItem(`${TRIAL_BUFFER_PREFIX}${sessionId}`);
  } catch {
    // The upload already succeeded; the raw trial record remains in the
    // project's own outbox/database.
  }
}

export function readHw2Status(sessionId: string): Hw2SubmissionStatus | null {
  if (!sessionId) return null;
  return readJson<Hw2SubmissionStatus>(`${STATUS_PREFIX}${sessionId}`);
}

function writeStatus(status: Hw2SubmissionStatus): void {
  writeJson(`${STATUS_PREFIX}${status.session_id}`, status);
  emitStatus();
}

/**
 * Submits a completed session once. The automatic call refuses to repeat a
 * previously attempted session; the retry button passes `manual: true`.
 * The teacher's endpoint has no documented idempotency key, so this guard is
 * deliberately conservative: never auto-submit the same session twice.
 */
export async function submitHw2Session(
  experimentId: ExperimentId,
  sessionId: string,
  options: Hw2SubmitOptions = {},
): Promise<Hw2SubmitOutcome> {
  const manual = options.manual === true;
  if (!sessionId) return { status: 'skipped', error: '缺少会话编号。' };
  if (inFlight.has(sessionId)) return { status: 'skipped' };

  const previous = readHw2Status(sessionId);
  if (previous?.status === 'success') {
    return {
      status: 'success',
      record_id: previous.record_id,
      warnings: previous.warnings,
    };
  }
  if (!manual && previous) {
    // Automatic upload happens at most once per completed session.
    return { status: 'skipped', error: previous.error };
  }

  const buffer = readHw2TrialBuffer(sessionId);
  if (!buffer || buffer.trials.length === 0) {
    return { status: 'empty', error: '没有找到本会话的待上传数据。' };
  }
  if (buffer.trials.length > MAX_TRIALS) {
    return {
      status: 'failed',
      error: `试次数 ${buffer.trials.length} 超过接口上限 ${MAX_TRIALS}。`,
    };
  }

  const participant = buffer.participant || getOrCreateHw2ParticipantId();
  const payload = buildHw2Payload(
    experimentId,
    participant,
    sessionId,
    buffer.trials.map((entry) => entry.trial),
  );
  const body = JSON.stringify(payload);
  const bytes =
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(body).byteLength
      : body.length;
  if (bytes > MAX_PAYLOAD_BYTES) {
    const error = `提交体积 ${Math.round(bytes / 1024)} KB 超过接口上限 256 KB。`;
    writeStatus({
      experiment_id: experimentId,
      session_id: sessionId,
      participant,
      status: 'failed',
      trials: buffer.trials.length,
      attempts: (previous?.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
      error,
    });
    return { status: 'failed', error };
  }

  inFlight.add(sessionId);
  const attempts = (previous?.attempts ?? 0) + 1;
  writeStatus({
    experiment_id: experimentId,
    session_id: sessionId,
    participant,
    status: 'pending',
    trials: buffer.trials.length,
    attempts,
    updated_at: new Date().toISOString(),
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) {
      timer = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 20000,
      );
    }
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${HW2_TEACHER_BASE}/api/hw2/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      ...(controller ? { signal: controller.signal } : {}),
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = asRecord(JSON.parse(text));
    } catch {
      parsed = {};
    }

    if (!response.ok || parsed.ok !== true) {
      const error =
        asText(parsed.msg, 300) ||
        `课程平台返回 HTTP ${response.status}。`;
      writeStatus({
        experiment_id: experimentId,
        session_id: sessionId,
        participant,
        status: 'failed',
        trials: buffer.trials.length,
        attempts,
        updated_at: new Date().toISOString(),
        error,
      });
      return { status: 'failed', error };
    }

    const recordId = asText(parsed.record_id, 120);
    const warnings = asText(parsed.warnings, 300);
    writeStatus({
      experiment_id: experimentId,
      session_id: sessionId,
      participant,
      status: 'success',
      trials: buffer.trials.length,
      attempts,
      updated_at: new Date().toISOString(),
      ...(recordId ? { record_id: recordId } : {}),
      ...(warnings ? { warnings } : {}),
    });
    // The compact copy is no longer needed once the platform accepted it;
    // the project's own outbox still holds the full trial record.
    clearHw2TrialBuffer(sessionId);
    return {
      status: 'success',
      ...(recordId ? { record_id: recordId } : {}),
      ...(warnings ? { warnings } : {}),
    };
  } catch (caught) {
    const error =
      caught instanceof Error && caught.name === 'AbortError'
        ? '提交超时，本地数据已保留。'
        : caught instanceof Error
          ? caught.message
          : '网络错误，本地数据已保留。';
    writeStatus({
      experiment_id: experimentId,
      session_id: sessionId,
      participant,
      status: 'failed',
      trials: buffer.trials.length,
      attempts,
      updated_at: new Date().toISOString(),
      error,
    });
    return { status: 'failed', error };
  } finally {
    if (timer !== null) clearTimeout(timer);
    inFlight.delete(sessionId);
  }
}
