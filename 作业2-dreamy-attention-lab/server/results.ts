import type {
  ExperimentConfig,
  ExperimentId,
  SessionSummary,
  VisualSearchConfig,
} from '../shared/types.js';
import type { LabDb, TrialRow } from './db.js';
import {
  analyzeGroupVisualSearch,
  analyzePersonalVisualSearch,
} from './visual-search-results.js';
import {
  analyzeGroupMapAlignment,
  analyzePersonalMapAlignment,
} from './map-alignment-results.js';

export interface DescriptiveStats {
  n: number;
  mean: number | null;
  sd: number | null;
  se: number | null;
  ci_low: number | null;
  ci_high: number | null;
}

export interface BlockStats {
  block_id: string;
  block_type: string;
  label: string;
  n: number;
  accuracy: number | null;
  mean_response_time_ms: number | null;
  timeout_count: number;
}

export interface ConditionStats {
  condition_id: string;
  block_id: string;
  n: number;
  accuracy: number | null;
  mean_response_time_ms: number | null;
}

interface SessionMetric {
  participant_id: string;
  session_id: string;
  completed_at: string | null;
  formal_trials: number;
  valid_trials: number;
  accuracy: number | null;
  mean_rt: number | null;
  trials: TrialRow[];
  blocks: Map<string, { block_type: string; trials: TrialRow[] }>;
  eye_valid_trials: number;
  eye_ratio_sum: number;
  eye_ratio_n: number;
  mouse_usable_trials: number;
  mouse_path_sum: number;
  mouse_path_n: number;
  eye_direction_ratios: Record<string, number | null>;
  mouse_direction_ratios: Record<string, number | null>;
}

interface SessionRowMinimal {
  session_id: string;
  participant_id: string;
  completed_at: string | null;
  started_at: string;
  config_snapshot: string;
  summary_json: string | null;
}

export function getPersonalResults({
  db,
  experimentId,
  participantId,
  sessionId,
  config,
}: {
  db: LabDb;
  experimentId: ExperimentId;
  participantId: string;
  sessionId: string;
  config: ExperimentConfig;
}) {
  const session = db
    .prepare(
      `SELECT session_id, participant_id, experiment_id, started_at, completed_at,
              status, config_version, config_snapshot, summary_json
       FROM sessions
       WHERE session_id = ? AND participant_id = ? AND experiment_id = ?`,
    )
    .get(sessionId, participantId, experimentId) as
    | (SessionRowMinimal & {
        experiment_id: string;
        status: string;
        config_version: number;
      })
    | undefined;
  if (!session) return null;

  const trials = db
    .prepare(
      `SELECT * FROM trials
       WHERE session_id = ? AND experiment_id = ? AND phase = 'formal'
       ORDER BY trial_index ASC`,
    )
    .all(sessionId, experimentId) as unknown as TrialRow[];

  const blocks = blockStats(trials, config);
  const conditions = conditionStats(trials);
  const valid = trials.filter(isValidTrial);
  const correct = trials.filter((trial) => trial.correct === 1);
  const meanRt = mean(correct.filter(hasRt).map((trial) => trial.response_time as number));
  const eye = personalEye(trials, config);
  const mouse = personalMouse(trials);
  const visualSearch =
    experimentId === 'visual-search'
      ? analyzePersonalVisualSearch(
          db,
          sessionId,
          trials,
          config as VisualSearchConfig,
        )
      : null;
  const mapAlignment =
    experimentId === 'map-alignment'
      ? analyzePersonalMapAlignment(trials)
      : null;

  return {
    experiment_id: experimentId,
    session: {
      session_id: session.session_id,
      status: session.status,
      started_at: session.started_at,
      completed_at: session.completed_at,
      config_version: session.config_version,
      summary: session.summary_json ? safeParse(session.summary_json) : null,
    },
    personal: {
      formal_trials: trials.length,
      valid_trials: valid.length,
      correct_trials: correct.length,
      accuracy: trials.length > 0 ? round4(correct.length / trials.length) : null,
      mean_response_time_ms: meanRt === null ? null : round1(meanRt),
      median_response_time_ms: median(
        correct.filter(hasRt).map((trial) => trial.response_time as number),
      ),
      timeout_count: trials.filter((trial) => trial.timeout === 1).length,
      blocks,
      conditions,
      eye,
      mouse,
      visual_search: visualSearch,
      map_alignment: mapAlignment,
      trials: trials.map((trial) => {
        const tracking = safeParse(trial.tracking_json) as Record<string, unknown>;
        const eyeTracking = (tracking?.eye_tracking ?? {}) as Record<string, unknown>;
        const mouseTracking = (tracking?.mouse_tracking ?? {}) as Record<string, unknown>;
        return {
          trial_id: trial.trial_id,
          trial_index: trial.trial_index,
          block_id: trial.block_id,
          block_name: trial.block_name,
          block_type: trial.block_type,
          condition_id: trial.condition_id,
          phase: trial.phase,
          correct: trial.correct === null ? null : trial.correct === 1,
          response_time: trial.response_time,
          timeout: trial.timeout === 1,
          invalid_response: trial.invalid_response === 1,
          response: trial.response,
          target_present:
            trial.target_present === null ? null : trial.target_present === 1,
          target_region: trial.target_region,
          target_x: trial.target_x,
          target_y: trial.target_y,
          set_size: trial.set_size,
          stimulus_type: trial.stimulus_type,
          window_blur: trial.window_blur === 1,
          gaze_available: trial.gaze_available === 1,
          gaze_quality: trial.gaze_quality,
          timestamp: trial.timestamp,
          eye_tracking_status: trial.eye_tracking_status,
          calibration_status: trial.calibration_status,
          calibration_quality: trial.calibration_quality,
          valid_gaze_ratio: trial.valid_gaze_ratio,
          valid_mouse_ratio: trial.valid_mouse_ratio,
          first_fixation_quadrant: eyeTracking.first_fixation_region ?? null,
          first_fixation_region: eyeTracking.first_fixation_region ?? null,
          target_distance_normalized:
            eyeTracking.target_distance_normalized ?? null,
          target_region_visit_order:
            eyeTracking.target_region_visit_order ?? null,
          target_first_fixation_ms: eyeTracking.target_first_fixation_ms ?? null,
          mouse_first_movement_direction:
            mouseTracking.first_movement_direction ?? null,
          mouse_first_movement_region:
            mouseTracking.first_movement_region ?? null,
          mouse_path_length_px: mouseTracking.path_length_px ?? null,
          stimulus: safeParse(trial.stimulus_json),
        };
      }),
    },
  };
}

export function getGroupResults({
  db,
  experimentId,
  config,
  viewerParticipantId,
  viewerSessionId,
}: {
  db: LabDb;
  experimentId: ExperimentId;
  config: ExperimentConfig;
  viewerParticipantId?: string | null;
  viewerSessionId?: string | null;
}) {
  const sessions = db
    .prepare(
      `SELECT session_id, participant_id, completed_at, started_at,
              config_snapshot, summary_json
       FROM sessions
       WHERE experiment_id = ? AND status = 'completed'
       ORDER BY COALESCE(completed_at, started_at) DESC, started_at DESC`,
    )
    .all(experimentId) as unknown as SessionRowMinimal[];

  const latest = new Map<string, SessionRowMinimal>();
  for (const session of sessions) {
    if (!latest.has(session.participant_id)) {
      latest.set(session.participant_id, session);
    }
  }

  const getTrials = db.prepare(
    `SELECT * FROM trials
     WHERE session_id = ? AND experiment_id = ? AND phase = 'formal'
     ORDER BY trial_index ASC`,
  );
  const metrics: SessionMetric[] = [];
  for (const session of latest.values()) {
    const trials = getTrials.all(
      session.session_id,
      experimentId,
    ) as unknown as TrialRow[];
    metrics.push(buildSessionMetric(session, trials, config));
  }

  const accuracyValues = metrics
    .map((metric) => metric.accuracy)
    .filter((value): value is number => value !== null);
  const rtValues = metrics
    .map((metric) => metric.mean_rt)
    .filter((value): value is number => value !== null);

  const blockIds = new Set<string>();
  for (const metric of metrics) {
    for (const blockId of metric.blocks.keys()) blockIds.add(blockId);
  }
  const blockAggregates = [...blockIds].map((blockId) => {
    const participants = metrics.filter((metric) => metric.blocks.has(blockId));
    const acc = participants
      .map((metric) => {
        const block = metric.blocks.get(blockId)!;
        return accuracyOf(block.trials);
      })
      .filter((value): value is number => value !== null);
    const rt = participants
      .map((metric) => {
        const block = metric.blocks.get(blockId)!;
        return meanOfCorrectRt(block.trials);
      })
      .filter((value): value is number => value !== null);
    const first = participants[0]?.blocks.get(blockId);
    return {
      block_id: blockId,
      block_type: first?.block_type ?? 'original_block',
      label: blockLabel(config, blockId),
      n: participants.length,
      accuracy: describe(acc),
      mean_response_time_ms: describe(rt),
    };
  });

  const eyeParticipants = metrics.filter((metric) => metric.eye_ratio_n > 0);
  const eyeRatios = eyeParticipants
    .map((metric) => metric.eye_ratio_sum / metric.eye_ratio_n)
    .filter((value) => Number.isFinite(value));
  const mouseParticipants = metrics.filter(
    (metric) => metric.mouse_usable_trials > 0,
  );
  const mousePaths = mouseParticipants
    .map((metric) => metric.mouse_path_sum / metric.mouse_path_n)
    .filter((value) => Number.isFinite(value));

  const viewerMetric =
    viewerParticipantId && viewerSessionId
      ? metrics.find(
          (metric) =>
            metric.participant_id === viewerParticipantId &&
            metric.session_id === viewerSessionId,
        ) ?? null
      : null;

  const participantTrials = metrics.map((metric) => ({
    participant_id: metric.participant_id,
    session_id: metric.session_id,
    trials: metric.trials,
  }));
  const visualSearch =
    experimentId === 'visual-search'
      ? analyzeGroupVisualSearch(
          db,
          participantTrials,
          config as VisualSearchConfig,
        )
      : null;
  const mapAlignment =
    experimentId === 'map-alignment'
      ? analyzeGroupMapAlignment(participantTrials)
      : null;

  return {
    experiment_id: experimentId,
    n_participants: metrics.length,
    n_sessions: latest.size,
    sample_warning:
      metrics.length < 10
        ? '当前完成人数较少（N < 10）。均值与区间仅作描述，不稳定，不能据此推断总体。'
        : null,
    group: {
      accuracy: describe(accuracyValues),
      mean_response_time_ms: describe(rtValues),
    },
    blocks: blockAggregates,
    visual_search: visualSearch,
    map_alignment: mapAlignment,
    eye: {
      participants_with_usable_gaze: eyeParticipants.length,
      mean_valid_gaze_ratio: describe(eyeRatios),
      direction_ratios: Object.fromEntries(
        EYE_DIRECTION_KEYS.map((key) => [
          key,
          describe(
            eyeParticipants
              .map((metric) => metric.eye_direction_ratios[key])
              .filter((value): value is number => value !== null),
          ),
        ]),
      ),
      usable: eyeParticipants.length >= 3,
      note:
        eyeParticipants.length < 3
          ? '有效眼动数据的参与者不足 3 人，暂不展示群体眼动统计。'
          : '仅汇总通过校准且有效注视比例达到阈值的试次；WebGazer 为探索性测量。方向比例由相邻注视点位移派生，不是真实扫描路径。',
    },
    mouse: {
      participants_with_mouse: mouseParticipants.length,
      mean_path_length_px: describe(mousePaths),
      direction_ratios: Object.fromEntries(
        MOUSE_DIRECTION_KEYS.map((key) => [
          key,
          describe(
            mouseParticipants
              .map((metric) => metric.mouse_direction_ratios[key])
              .filter((value): value is number => value !== null),
          ),
        ]),
      ),
      note:
        '鼠标轨迹是行为代理指标，与眼动分开统计，不合并为扫描轨迹。方向比例由样本位移派生，不代表注视方向。',
    },
    viewer_position:
      viewerMetric && viewerMetric.accuracy !== null
        ? {
            accuracy_percentile: percentileRank(
              accuracyValues,
              viewerMetric.accuracy,
            ),
            mean_rt_percentile:
              viewerMetric.mean_rt === null
                ? null
                : percentileRank(rtValues, viewerMetric.mean_rt, true),
            in_group: true,
          }
        : null,
    generated_at: new Date().toISOString(),
    limitation:
      '群体统计使用每名参与者最近一次已完成会话的正式试次，按参与者先汇总再计算；未对个人与文献均值做显著性检验。',
  };
}

export function getTrialSamples({
  db,
  experimentId,
  participantId,
  sessionId,
  trialId,
}: {
  db: LabDb;
  experimentId: ExperimentId;
  participantId: string;
  sessionId: string;
  trialId: string;
}) {
  const trial = db
    .prepare(
      `SELECT trial_id FROM trials
       WHERE trial_id = ? AND session_id = ? AND participant_id = ?
         AND experiment_id = ?`,
    )
    .get(trialId, sessionId, participantId, experimentId);
  if (!trial) return null;
  const gaze = db
    .prepare(
      `SELECT sample_index, t_ms, timestamp_ms, screen_x, screen_y,
              normalized_x, normalized_y, valid, face_lost
       FROM gaze_samples WHERE trial_id = ? ORDER BY sample_index ASC`,
    )
    .all(trialId) as unknown as Array<Record<string, unknown>>;
  const mouse = db
    .prepare(
      `SELECT sample_index, t_ms, timestamp_ms, x, y, normalized_x, normalized_y,
              movement_direction, movement_distance, velocity, valid, phase
       FROM mouse_samples WHERE trial_id = ? ORDER BY sample_index ASC`,
    )
    .all(trialId) as unknown as Array<Record<string, unknown>>;
  return {
    trial_id: trialId,
    gaze_samples: gaze.map((sample) => ({
      ...sample,
      valid: sample.valid === 1,
      face_lost: sample.face_lost === 1,
    })),
    mouse_samples: mouse.map((sample) => ({
      ...sample,
      valid: sample.valid === 1,
    })),
    note:
      'Gaze and mouse samples are separate measurement tracks. They are not merged into one scanpath.',
  };
}

export function getSessionListForExportLookup(
  db: LabDb,
  sessionId: string,
): { session_id: string; participant_id: string; experiment_id: string } | null {
  const row = db
    .prepare(
      'SELECT session_id, participant_id, experiment_id FROM sessions WHERE session_id = ?',
    )
    .get(sessionId) as
    | { session_id: string; participant_id: string; experiment_id: string }
    | undefined;
  return row ?? null;
}

const EYE_DIRECTION_KEYS = [
  'left_to_right',
  'right_to_left',
  'top_to_bottom',
  'bottom_to_top',
  'center_to_periphery',
  'periphery_to_center',
] as const;

const MOUSE_DIRECTION_KEYS = [
  'left_to_right_transition_ratio',
  'right_to_left_transition_ratio',
  'top_to_bottom_transition_ratio',
  'bottom_to_top_transition_ratio',
  'center_to_periphery_transition_ratio',
  'periphery_to_center_transition_ratio',
] as const;

/**
 * Average already-derived direction ratios across usable trials. A missing
 * ratio (for example, no horizontal movement in a trial) is skipped, not
 * treated as zero. These are descriptive summaries, not scanpath evidence.
 */
function summarizeDirectionRatios(
  trials: TrialRow[],
  pick: (tracking: Record<string, unknown>) => Record<string, unknown> | null,
  keys: readonly string[],
): Record<string, number | null> {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const trial of trials) {
    const tracking = safeParse(trial.tracking_json) as Record<string, unknown>;
    const ratios = pick(tracking);
    if (!ratios) continue;
    for (const key of keys) {
      const value = ratios[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        sums.set(key, (sums.get(key) ?? 0) + value);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return Object.fromEntries(
    keys.map((key) => {
      const count = counts.get(key) ?? 0;
      return [key, count > 0 ? round4((sums.get(key) ?? 0) / count) : null];
    }),
  );
}

function buildSessionMetric(
  session: SessionRowMinimal,
  trials: TrialRow[],
  config: ExperimentConfig,
): SessionMetric {
  const blocks = new Map<string, { block_type: string; trials: TrialRow[] }>();
  for (const trial of trials) {
    const existing = blocks.get(trial.block_id);
    if (existing) existing.trials.push(trial);
    else blocks.set(trial.block_id, { block_type: trial.block_type, trials: [trial] });
  }
  const eyeUsable = trials.filter(
    (trial) =>
      trial.eye_tracking_status === 'calibrated' &&
      trial.valid_gaze_ratio !== null &&
      trial.valid_gaze_ratio >= minValidGazeRatio(config),
  );
  const mouseUsable = trials.filter(
    (trial) =>
      trial.valid_mouse_ratio !== null && trial.valid_mouse_ratio >= 0.8,
  );
  const mousePaths = mouseUsable
    .map((trial) => {
      const tracking = safeParse(trial.tracking_json) as Record<string, unknown>;
      const mouse = (tracking?.mouse_tracking ?? {}) as Record<string, unknown>;
      return typeof mouse.path_length_px === 'number' ? mouse.path_length_px : null;
    })
    .filter((value): value is number => value !== null);
  return {
    participant_id: session.participant_id,
    session_id: session.session_id,
    completed_at: session.completed_at,
    formal_trials: trials.length,
    valid_trials: trials.filter(isValidTrial).length,
    accuracy: accuracyOf(trials),
    mean_rt: meanOfCorrectRt(trials),
    trials,
    blocks,
    eye_valid_trials: eyeUsable.length,
    eye_ratio_sum: eyeUsable.reduce(
      (sum, trial) => sum + (trial.valid_gaze_ratio ?? 0),
      0,
    ),
    eye_ratio_n: eyeUsable.length,
    mouse_usable_trials: mouseUsable.length,
    mouse_path_sum: mousePaths.reduce((sum, value) => sum + value, 0),
    mouse_path_n: mousePaths.length,
    eye_direction_ratios: summarizeDirectionRatios(
      eyeUsable,
      (tracking) => {
        const eye = (tracking.eye_tracking ?? {}) as Record<string, unknown>;
        return (eye.direction_ratios ?? null) as Record<string, unknown> | null;
      },
      EYE_DIRECTION_KEYS,
    ),
    mouse_direction_ratios: summarizeDirectionRatios(
      mouseUsable,
      (tracking) =>
        (tracking.mouse_tracking ?? null) as Record<string, unknown> | null,
      MOUSE_DIRECTION_KEYS,
    ),
  };
}

function personalEye(trials: TrialRow[], config: ExperimentConfig) {
  const calibrated = trials.filter(
    (trial) => trial.calibration_status === 'passed',
  );
  const usable = trials.filter(
    (trial) =>
      trial.eye_tracking_status === 'calibrated' &&
      trial.valid_gaze_ratio !== null &&
      trial.valid_gaze_ratio >= minValidGazeRatio(config),
  );
  const ratios = usable
    .map((trial) => trial.valid_gaze_ratio)
    .filter((value): value is number => value !== null);
  const calibrationQuality = calibrated
    .map((trial) => trial.calibration_quality)
    .filter((value): value is number => value !== null);
  const quadrants: Record<string, number> = {};
  let targetFixationTrials = 0;
  const targetFixationTimes: number[] = [];
  const quadrantTransitions: number[] = [];
  for (const trial of usable) {
    const tracking = safeParse(trial.tracking_json) as Record<string, unknown>;
    const eye = (tracking?.eye_tracking ?? {}) as Record<string, unknown>;
    const quadrant = eye.first_fixation_region;
    if (typeof quadrant === 'string') {
      quadrants[quadrant] = (quadrants[quadrant] ?? 0) + 1;
    }
    if (typeof eye.target_first_fixation_ms === 'number') {
      targetFixationTrials += 1;
      targetFixationTimes.push(eye.target_first_fixation_ms);
    }
    if (typeof eye.quadrant_transitions === 'number') {
      quadrantTransitions.push(eye.quadrant_transitions);
    }
  }
  const statuses = new Set(trials.map((trial) => trial.eye_tracking_status));
  const usableEnough =
    usable.length >= 5 && ratios.length > 0 && mean(ratios) !== null;
  return {
    requested: statuses.has('calibrated') || statuses.has('poor_quality'),
    declined: statuses.has('declined'),
    unavailable: statuses.has('unavailable'),
    usable_trials: usable.length,
    formal_trials: trials.length,
    mean_valid_gaze_ratio: ratios.length > 0 ? round4(mean(ratios) as number) : null,
    median_calibration_error_px:
      calibrationQuality.length > 0
        ? median(calibrationQuality)
        : null,
    first_fixation_quadrants: quadrants,
    trials_with_target_fixation: targetFixationTrials,
    mean_target_first_fixation_ms:
      targetFixationTimes.length > 0
        ? round1(mean(targetFixationTimes) as number)
        : null,
    mean_quadrant_transitions:
      quadrantTransitions.length > 0
        ? round1(mean(quadrantTransitions) as number)
        : null,
    direction_ratios: summarizeDirectionRatios(
      usable,
      (tracking) => {
        const eye = (tracking.eye_tracking ?? {}) as Record<string, unknown>;
        return (eye.direction_ratios ?? null) as Record<string, unknown> | null;
      },
      EYE_DIRECTION_KEYS,
    ),
    sufficient: usableEnough,
    note: usableEnough
      ? 'WebGazer 估计为探索性指标，使用大范围区域 AOI（象限/中央），不能识别单个字母。方向比例由相邻注视点位移派生，不是真实扫描路径。'
      : '有效注视试次不足，不展示注视热图或方向性结论。鼠标数据仍单独分析。',
  };
}

function personalMouse(trials: TrialRow[]) {
  const usable = trials.filter(
    (trial) => trial.valid_mouse_ratio !== null && trial.valid_mouse_ratio >= 0.8,
  );
  const paths: number[] = [];
  const directions: Record<string, number> = {};
  for (const trial of usable) {
    const tracking = safeParse(trial.tracking_json) as Record<string, unknown>;
    const mouse = (tracking?.mouse_tracking ?? {}) as Record<string, unknown>;
    if (typeof mouse.path_length_px === 'number') paths.push(mouse.path_length_px);
    const direction = mouse.first_movement_direction;
    if (typeof direction === 'string') {
      directions[direction] = (directions[direction] ?? 0) + 1;
    }
  }
  return {
    usable_trials: usable.length,
    mean_path_length_px: paths.length > 0 ? round1(mean(paths) as number) : null,
    first_movement_directions: directions,
    direction_ratios: summarizeDirectionRatios(
      usable,
      (tracking) =>
        (tracking.mouse_tracking ?? null) as Record<string, unknown> | null,
      MOUSE_DIRECTION_KEYS,
    ),
    note:
      '鼠标轨迹仅在刺激区域内记录，是搜索行为代理指标，不等同于注视，也不与眼动坐标合并。方向比例由样本位移派生，不反映注意或注视。',
  };
}

function blockStats(trials: TrialRow[], config: ExperimentConfig): BlockStats[] {
  const groups = new Map<string, TrialRow[]>();
  for (const trial of trials) {
    const list = groups.get(trial.block_id) ?? [];
    list.push(trial);
    groups.set(trial.block_id, list);
  }
  const order = new Map(
    config.blocks.map((block, index) => [block.block_id, index] as const),
  );
  return [...groups.entries()]
    .sort(
      ([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999),
    )
    .map(([blockId, group]) => ({
      block_id: blockId,
      block_type: group[0]?.block_type ?? 'original_block',
      label: blockLabel(config, blockId),
      n: group.length,
      accuracy: accuracyOf(group),
      mean_response_time_ms: meanOfCorrectRt(group),
      timeout_count: group.filter((trial) => trial.timeout === 1).length,
    }));
}

function conditionStats(trials: TrialRow[]): ConditionStats[] {
  const groups = new Map<string, TrialRow[]>();
  for (const trial of trials) {
    const key = `${trial.block_id}::${trial.condition_id}`;
    const list = groups.get(key) ?? [];
    list.push(trial);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([, group]) => ({
    condition_id: group[0]?.condition_id ?? '',
    block_id: group[0]?.block_id ?? '',
    n: group.length,
    accuracy: accuracyOf(group),
    mean_response_time_ms: meanOfCorrectRt(group),
  }));
}

function blockLabel(config: ExperimentConfig, blockId: string): string {
  return (
    config.blocks.find((block) => block.block_id === blockId)?.label ??
    blockId
  );
}

function minValidGazeRatio(config: ExperimentConfig): number {
  const value = (config as unknown as { gazeMinValidRatio?: unknown })
    .gazeMinValidRatio;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0.55;
}

function isValidTrial(trial: TrialRow): boolean {
  return (
    trial.timeout === 0 &&
    trial.invalid_response === 0 &&
    trial.response_time !== null
  );
}

function hasRt(trial: TrialRow): boolean {
  return (
    trial.timeout === 0 &&
    trial.response_time !== null &&
    trial.correct === 1
  );
}

function accuracyOf(trials: TrialRow[]): number | null {
  if (trials.length === 0) return null;
  return round4(trials.filter((trial) => trial.correct === 1).length / trials.length);
}

function meanOfCorrectRt(trials: TrialRow[]): number | null {
  const values = trials
    .filter(hasRt)
    .map((trial) => trial.response_time as number);
  return values.length > 0 ? round1(mean(values) as number) : null;
}

export function describe(values: number[]): DescriptiveStats {
  const clean = values.filter((value) => Number.isFinite(value));
  const n = clean.length;
  if (n === 0) {
    return { n: 0, mean: null, sd: null, se: null, ci_low: null, ci_high: null };
  }
  const avg = mean(clean) as number;
  if (n === 1) {
    return {
      n,
      mean: round2(avg),
      sd: null,
      se: null,
      ci_low: null,
      ci_high: null,
    };
  }
  const variance =
    clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const se = sd / Math.sqrt(n);
  return {
    n,
    mean: round2(avg),
    sd: round2(sd),
    se: round2(se),
    ci_low: round2(avg - 1.96 * se),
    ci_high: round2(avg + 1.96 * se),
  };
}

function percentileRank(
  values: number[],
  target: number,
  lowerIsBetter = false,
): number | null {
  if (values.length === 0) return null;
  const better = lowerIsBetter
    ? values.filter((value) => value >= target).length
    : values.filter((value) => value <= target).length;
  return round1((better / values.length) * 100);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export type { SessionSummary };
