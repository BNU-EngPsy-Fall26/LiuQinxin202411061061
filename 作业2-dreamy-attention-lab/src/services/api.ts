import type {
  CompletionSubmission,
  ExperimentConfig,
  ExperimentId,
  ExperimentMeta,
  ExperimentResult,
  SessionSubmission,
  TrialSubmission,
} from '@shared/types';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT = 8000;

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeout = DEFAULT_TIMEOUT,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      ...options,
      signal: controller.signal,
    });
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const body = isJson ? await response.json() : null;
    if (!response.ok) {
      throw new ApiError(
        body?.error ?? `请求失败 (${response.status})`,
        response.status,
        body?.code,
        body?.issues,
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('服务器响应超时。', 0, 'TIMEOUT');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface PublicExperiment extends ExperimentMeta {
  config_version: number;
  practice_trials: number;
  formal_trials: number;
  estimated_minutes: string;
}

export interface ConfigResponse {
  experiment_id: ExperimentId;
  version: number;
  updated_at: string;
  config: ExperimentConfig;
  meta: ExperimentMeta;
}

export interface ResearcherSession {
  session_id: string;
  participant_id: string;
  experiment_id: ExperimentId;
  started_at: string;
  completed_at: string | null;
  status: 'in_progress' | 'completed';
  trial_count?: number;
  formal_trial_count?: number;
  config_version: number;
  summary: Record<string, unknown> | null;
}

export interface ResearcherOverview {
  totals: {
    participants: number;
    sessions: number;
    completed_sessions: number;
    trials: number;
  };
  per_experiment: Array<
    ExperimentMeta & {
      experiment_id: ExperimentId;
      sessions: number;
      completed: number;
      participants: number;
      trials: number;
      formal_trials: number;
    }
  >;
  recent_sessions: ResearcherSession[];
}

export interface ResearcherParticipant {
  participant_id: string;
  session_count: number;
  experiments: string[];
  first_seen_at: string;
  last_seen_at: string;
}

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

export interface SearchCell {
  set_size: number;
  target_present: boolean;
  n_trials: number;
  n_observations: number;
  n_correct: number;
  accuracy: number | null;
  mean_rt_ms: number | null;
  sd_rt_ms: number | null;
  se_rt_ms: number | null;
  ci_low: number | null;
  ci_high: number | null;
  sufficient_for_fit: boolean;
}

export interface SlopeFit {
  available: boolean;
  slope_ms_per_item: number | null;
  intercept_ms: number | null;
  r_squared: number | null;
  n_points: number;
  n_observations: number;
  minimum_cell_n: number;
  reason: string | null;
}

export interface SearchSeries {
  target_present: boolean;
  cells: SearchCell[];
  fit: SlopeFit;
}

export interface SearchVariantAnalysis {
  variant: 'feature_search' | 'conjunction_search';
  block_id: string;
  block_name: string;
  planned_formal_trials: number;
  completed_formal_trials: number;
  correct_trials: number;
  accuracy: number | null;
  mean_correct_rt_ms: number | null;
  present: SearchSeries;
  absent: SearchSeries;
  ratio: number | null;
  ratio_status: 'available' | 'insufficient' | 'denominator_near_zero';
  ratio_note: string;
}

export interface SearchAnalysis {
  variants: SearchVariantAnalysis[];
  conclusion: {
    sentences: string[];
    basis: string;
    theory_test_available: boolean;
  };
  literature: {
    treisman: {
      citation: string;
      source: string;
      feature: { present: number; absent: number };
      conjunction: { present: number; absent: number };
      unit: string;
      approximate: boolean;
    };
    ssts: { value: number; label: string; note: string };
  };
  note: string;
}

export interface RegionStat {
  region: number;
  label: string;
  planned_target_count: number;
  completed_target_count: number;
  valid_response_count: number;
  correct_count: number;
  timeout_count: number;
  accuracy: number | null;
  mean_correct_rt_ms: number | null;
  sd_correct_rt_ms: number | null;
  n_participants: number;
  exploratory: boolean;
  insufficient_reason: string | null;
}

export interface SpatialGazeStats {
  available: boolean;
  usable_trials: number;
  target_present_trials: number;
  trials_with_first_fixation: number;
  first_fixation_region_counts: Array<{ region: number; count: number }>;
  first_fixation_matches_target_count: number;
  first_fixation_match_rate: number | null;
  mean_first_fixation_distance_normalized: number | null;
  mean_first_fixation_distance_px: number | null;
  mean_target_region_visit_order: number | null;
  target_region_visit_order_counts: Record<string, number>;
  regions_with_first_fixation: number;
  sufficient: boolean;
  n_participants: number;
  note: string;
}

export interface SpatialMouseStats {
  available: boolean;
  usable_trials: number;
  target_present_trials: number;
  first_movement_region_counts: Array<{ region: number; count: number }>;
  same_region_count: number;
  different_region_count: number;
  mean_first_movement_latency_ms: number | null;
  mean_path_length_px: number | null;
  mean_target_distance_normalized: number | null;
  sufficient: boolean;
  n_participants: number;
  note: string;
}

export interface SpatialDirectionStats {
  exploratory: boolean;
  usable_trials: number;
  n_participants: number;
  ratios: Record<string, DescriptiveStats>;
  sufficient: boolean;
  note: string;
}

export interface SpatialAnalysis {
  block_id: string;
  block_name: string;
  planned_formal_trials: number;
  completed_formal_trials: number;
  planned_present_count: number;
  planned_absent_count: number;
  completed_present_count: number;
  completed_absent_count: number;
  planned_region_counts: Record<string, number>;
  uncovered_regions: number[];
  regions: RegionStat[];
  absent: {
    planned: number;
    completed: number;
    correct: number;
    accuracy: number | null;
    mean_correct_rt_ms: number | null;
  };
  n_participants: number;
  coverage_warning: string | null;
  exploratory_note: string;
  gaze: SpatialGazeStats;
  mouse: SpatialMouseStats;
  direction: SpatialDirectionStats;
}

export interface HeatmapBin {
  x: number;
  y: number;
  weight: number;
}

export interface PathPoint {
  x: number;
  y: number;
  t_ms: number;
}

export interface GazePathTrial {
  trial_id: string;
  trial_index: number;
  block_id: string;
  target_present: boolean;
  target_region: number | null;
  target_stage_x: number | null;
  target_stage_y: number | null;
  points: PathPoint[];
  sample_count: number;
  valid_gaze_ratio: number | null;
  quality_sufficient: boolean;
}

export interface MousePathTrial {
  trial_id: string;
  trial_index: number;
  block_id: string;
  target_present: boolean;
  target_region: number | null;
  target_stage_x: number | null;
  target_stage_y: number | null;
  points: PathPoint[];
  sample_count: number;
  valid_mouse_ratio: number | null;
}

export interface GazeHeatmap {
  layout: 'normalized_stage';
  bins: HeatmapBin[];
  max_weight: number;
  sample_count: number;
  trial_count: number;
  participant_count: number;
  trials: GazePathTrial[];
  sufficient: boolean;
  note: string;
}

export interface MousePaths {
  layout: 'normalized_stage';
  trials: MousePathTrial[];
  trial_count: number;
  participant_count: number;
  note: string;
}

export interface VisualSearchAnalysis {
  search: SearchAnalysis;
  spatial: SpatialAnalysis | null;
  gaze_heatmap: GazeHeatmap;
  mouse_paths: MousePaths;
  participant_slopes: {
    points: Array<{ present_slope: number; absent_slope: number }>;
    excluded_participants: number;
    total_participants: number;
    note: string;
  };
}

export type MapCueCondition = 'none' | 'person';
export type MapAlignmentState = 'aligned' | 'misaligned';

export interface MapCellStats {
  cue: MapCueCondition | null;
  rotation_deg: number | null;
  alignment: MapAlignmentState | null;
  n_trials: number;
  n_valid: number;
  n_observations: number;
  n_correct: number;
  n_participants: number;
  accuracy: number | null;
  error_rate: number | null;
  mean_rt_ms: number | null;
}

export interface MapConditionCost {
  cue: MapCueCondition;
  aligned_mean_rt_ms: number | null;
  misaligned_mean_rt_ms: number | null;
  misalignment_cost_ms: number | null;
  aligned_error_rate: number | null;
  misaligned_error_rate: number | null;
  error_cost: number | null;
  aligned_accuracy: number | null;
  misaligned_accuracy: number | null;
  accuracy_cost: number | null;
}

export interface MapErrorPair {
  correct_answer: 'front' | 'back' | 'left' | 'right';
  response: 'front' | 'back' | 'left' | 'right';
  correct_label: string;
  response_label: string;
  count: number;
}

export interface MapBlockPositionStats {
  position: number;
  n_participants: number;
  n_trials: number;
  n_valid: number;
  n_observations: number;
  accuracy: number | null;
  error_rate: number | null;
  mean_rt_ms: number | null;
}

export interface MapAlignmentAnalysis {
  conditions: MapCellStats[];
  alignment: MapCellStats[];
  rotations: MapCellStats[];
  cue_rotations: MapCellStats[];
  interaction: MapCellStats[];
  block_positions: MapBlockPositionStats[];
  cost: {
    no_cue: MapConditionCost;
    person: MapConditionCost;
    cue_reduction_ms: number | null;
    cue_reduction_error: number | null;
    cue_reduction_accuracy: number | null;
    available: boolean;
    conclusion: string;
  };
  conclusions: {
    rt: string;
    errors: string;
    interpretation: string;
    cue: string;
  };
  error_pairs: MapErrorPair[];
  target_buildings: Array<{
    building: string;
    label: string;
    n_trials: number;
    n_valid: number;
    n_observations: number;
    n_participants: number;
    accuracy: number | null;
    error_rate: number | null;
    mean_rt_ms: number | null;
  }>;
  block_order: string[] | null;
  included_trials: number;
  excluded_trials: number;
  note: string;
}

export interface PersonalTrial {
  trial_id: string;
  trial_index: number;
  block_id: string;
  block_name: string | null;
  block_type: string;
  condition_id: string;
  phase: string;
  correct: boolean | null;
  response_time: number | null;
  timeout: boolean;
  invalid_response: boolean;
  response: string | null;
  target_present: boolean | null;
  target_region: number | null;
  target_x: number | null;
  target_y: number | null;
  set_size: number | null;
  stimulus_type: string | null;
  window_blur: boolean;
  gaze_available: boolean;
  gaze_quality: string | null;
  timestamp: string;
  eye_tracking_status: string;
  calibration_status: string;
  calibration_quality: number | null;
  valid_gaze_ratio: number | null;
  valid_mouse_ratio: number | null;
  first_fixation_quadrant: string | null;
  first_fixation_region: number | null;
  target_distance_normalized: number | null;
  target_region_visit_order: number | null;
  target_first_fixation_ms: number | null;
  mouse_first_movement_direction: string | null;
  mouse_first_movement_region: number | null;
  mouse_path_length_px: number | null;
  stimulus: Record<string, unknown> | null;
}

export interface PersonalResults {
  experiment_id: ExperimentId;
  session: {
    session_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    config_version: number;
    summary: Record<string, unknown> | null;
  };
  personal: {
    formal_trials: number;
    valid_trials: number;
    correct_trials: number;
    accuracy: number | null;
    mean_response_time_ms: number | null;
    median_response_time_ms: number | null;
    timeout_count: number;
    blocks: BlockStats[];
    conditions: ConditionStats[];
    visual_search: VisualSearchAnalysis | null;
    map_alignment: MapAlignmentAnalysis | null;
    eye: {
      requested: boolean;
      declined: boolean;
      unavailable: boolean;
      usable_trials: number;
      formal_trials: number;
      mean_valid_gaze_ratio: number | null;
      median_calibration_error_px: number | null;
      first_fixation_quadrants: Record<string, number>;
      trials_with_target_fixation: number;
      mean_target_first_fixation_ms: number | null;
      mean_quadrant_transitions: number | null;
      direction_ratios: Record<string, number | null>;
      sufficient: boolean;
      note: string;
    };
    mouse: {
      usable_trials: number;
      mean_path_length_px: number | null;
      first_movement_directions: Record<string, number>;
      direction_ratios: Record<string, number | null>;
      note: string;
    };
    trials: PersonalTrial[];
  };
}

export interface GroupResults {
  experiment_id: ExperimentId;
  n_participants: number;
  n_sessions: number;
  sample_warning: string | null;
  group: {
    accuracy: DescriptiveStats;
    mean_response_time_ms: DescriptiveStats;
  };
  blocks: Array<{
    block_id: string;
    block_type: string;
    label: string;
    n: number;
    accuracy: DescriptiveStats;
    mean_response_time_ms: DescriptiveStats;
  }>;
  visual_search: VisualSearchAnalysis | null;
  map_alignment: MapAlignmentAnalysis | null;
  eye: {
    participants_with_usable_gaze: number;
    mean_valid_gaze_ratio: DescriptiveStats;
    direction_ratios: Record<string, DescriptiveStats>;
    usable: boolean;
    note: string;
  };
  mouse: {
    participants_with_mouse: number;
    mean_path_length_px: DescriptiveStats;
    direction_ratios: Record<string, DescriptiveStats>;
    note: string;
  };
  viewer_position: {
    accuracy_percentile: number | null;
    mean_rt_percentile: number | null;
    in_group: boolean;
  } | null;
  generated_at: string;
  limitation: string;
}

export interface LiteratureRecord {
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
  approximate: boolean;
  numeric_value_available: boolean;
  sort_order: number;
}

export interface MeasurementSamples {
  trial_id: string;
  gaze_samples: Array<Record<string, unknown>>;
  mouse_samples: Array<Record<string, unknown>>;
  note: string;
  max_points?: number;
}

export const api = {
  health: () => request<{ ok: boolean; time: string }>('/api/health'),
  experiments: () => request<{ experiments: PublicExperiment[] }>('/api/experiments'),
  experimentConfig: (id: ExperimentId) =>
    request<ConfigResponse>(`/api/experiments/${id}/config`),
  result: (sessionId: string) =>
    request<ExperimentResult & { show_results: boolean }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/result`,
    ),
  personalResults: (
    experimentId: ExperimentId,
    participantId: string,
    sessionId: string,
  ) => {
    const query = new URLSearchParams({
      participant_id: participantId,
      session_id: sessionId,
    });
    return request<PersonalResults>(
      `/api/results/${experimentId}?${query.toString()}`,
      {},
      15000,
    );
  },
  groupResults: (
    experimentId: ExperimentId,
    participantId?: string,
    sessionId?: string,
  ) => {
    const query = new URLSearchParams();
    if (participantId) query.set('participant_id', participantId);
    if (sessionId) query.set('session_id', sessionId);
    return request<GroupResults>(
      `/api/results/${experimentId}/group?${query.toString()}`,
      {},
      20000,
    );
  },
  literature: (experimentId: ExperimentId) =>
    request<{
      experiment_id: ExperimentId;
      records: LiteratureRecord[];
      comparison: {
        directly_comparable_rows: number;
        message: string;
      };
    }>(`/api/literature/${experimentId}`, {}, 15000),
  trialSamples: (
    experimentId: ExperimentId,
    trialId: string,
    participantId: string,
    sessionId: string,
  ) => {
    const query = new URLSearchParams({
      participant_id: participantId,
      session_id: sessionId,
    });
    return request<MeasurementSamples>(
      `/api/results/${experimentId}/trials/${encodeURIComponent(trialId)}/samples?${query.toString()}`,
      {},
      15000,
    );
  },
  createSession: (payload: SessionSubmission) =>
    request<{ session_id: string; accepted: boolean }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  saveTrial: (payload: TrialSubmission) =>
    request<{ trial_id: string; accepted: boolean }>('/api/trials', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  completeSession: (sessionId: string, payload: CompletionSubmission) =>
    request<{ completed: boolean }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/complete`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  researcherMe: () =>
    request<{ authenticated: boolean; username: string | null }>(
      '/api/researcher/me',
    ),
  login: (username: string, password: string) =>
    request<{ authenticated: boolean; username: string }>('/api/researcher/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    request<{ authenticated: boolean }>('/api/researcher/logout', { method: 'POST' }),
  overview: () => request<ResearcherOverview>('/api/researcher/overview'),
  participants: (search = '') =>
    request<{ participants: ResearcherParticipant[] }>(
      `/api/researcher/participants?search=${encodeURIComponent(search)}`,
      {},
      10000,
    ),
  sessions: (params: {
    experiment_id?: string;
    participant_id?: string;
    status?: string;
    block_id?: string;
    eye_tracking_status?: string;
    min_valid_gaze_ratio?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    return request<{
      total: number;
      limit: number;
      offset: number;
      sessions: ResearcherSession[];
    }>(`/api/researcher/sessions?${query.toString()}`, {}, 15000);
  },
  sessionDetail: (sessionId: string) =>
    request<{
      session: Record<string, unknown>;
      trials: Array<Record<string, unknown>>;
    }>(`/api/researcher/sessions/${encodeURIComponent(sessionId)}`, {}, 20000),
  configs: () =>
    request<{
      configs: Array<{
        experiment_id: ExperimentId;
        meta: ExperimentMeta;
        config: ExperimentConfig;
        defaults: ExperimentConfig;
      }>;
    }>('/api/researcher/configs'),
  updateConfig: (id: ExperimentId, config: ExperimentConfig) =>
    request<{ saved: boolean; config: ExperimentConfig }>(
      `/api/researcher/configs/${id}`,
      { method: 'PUT', body: JSON.stringify({ config }) },
    ),
  resetConfig: (id: ExperimentId) =>
    request<{ reset: boolean; config: ExperimentConfig }>(
      `/api/researcher/configs/${id}/reset`,
      { method: 'POST' },
    ),
  trialSamplesResearcher: (sessionId: string, trialId: string) =>
    request<MeasurementSamples>(
      `/api/researcher/sessions/${encodeURIComponent(sessionId)}/trials/${encodeURIComponent(trialId)}/samples`,
      {},
      20000,
    ),
  researcherLiterature: (experimentId?: string) =>
    request<{ records: LiteratureRecord[]; total: number }>(
      `/api/researcher/literature${experimentId ? `?experiment_id=${encodeURIComponent(experimentId)}` : ''}`,
      {},
      15000,
    ),
  createLiterature: (record: Record<string, unknown>) =>
    request<{ saved: boolean; record: LiteratureRecord }>(
      '/api/researcher/literature',
      { method: 'POST', body: JSON.stringify(record) },
      15000,
    ),
  updateLiterature: (id: string, record: Record<string, unknown>) =>
    request<{ saved: boolean; record: LiteratureRecord }>(
      `/api/researcher/literature/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(record) },
      15000,
    ),
  deleteLiterature: (id: string) =>
    request<{ deleted: boolean }>(
      `/api/researcher/literature/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
};

export function exportUrl(
  format: 'csv' | 'json',
  filters: {
    experiment_id?: string;
    participant_id?: string;
    status?: string;
    phase?: string;
    block_id?: string;
    eye_tracking_status?: string;
    min_valid_gaze_ratio?: string;
  },
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  return `/api/researcher/export.${format}?${query.toString()}`;
}
