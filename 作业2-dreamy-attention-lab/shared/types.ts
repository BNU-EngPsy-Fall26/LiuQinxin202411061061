/**
 * Shared contracts between the browser experiments and the API.
 * Every experiment writes into the same core trial shape, while keeping
 * experiment-specific parameters under stimulus / response_data / metadata.
 */

export type ExperimentId =
  | 'visual-search'
  | 'perceptual-ordering'
  | 'map-alignment';

export type ExperimentPhase = 'practice' | 'formal';

export type SessionStatus = 'in_progress' | 'completed';

export type BlockType = 'original_block' | 'extension_block';

export type VisualSearchVariant =
  | 'feature_search'
  | 'conjunction_search'
  | 'spatial_search';
export type OrderingVariant = 'uniform_aspect' | 'mixed_aspect';
export type MapVariant = 'no_cue' | 'person_cue';
export type BlockVariant =
  | VisualSearchVariant
  | OrderingVariant
  | MapVariant;

export interface ExperimentBlockConfig<
  Variant extends string = BlockVariant,
> {
  block_id: string;
  block_type: BlockType;
  label: string;
  variant: Variant;
  enabled: boolean;
  order: number;
  formalTrials: number;
}

export interface BaseExperimentConfig {
  version: number;
  practiceTrials: number;
  responseTimeoutMs: number;
  showResultsToParticipant: boolean;
  /**
   * Fixed order uses `block.order`; randomized order is deterministic for a
   * session seed and is recorded in trial/session metadata.
   */
  randomizeBlockOrder: boolean;
  blocks: ExperimentBlockConfig[];
}

export interface VisualSearchConfig extends BaseExperimentConfig {
  fixationDurationMs: number;
  postTrialDelayMs: number;
  setSizes: number[];
  gridColumns: number;
  gridRows: number;
  targetKey: string;
  absentKey: string;
  targetColor: string;
  distractorRedColor: string;
  distractorBlueColor: string;
  stimulusBackground: string;
  letterSizePx: number;
  jitterPx: number;
  stimulusFontFamily: string;
  stimulusFontWeight: 400;
  fixationCrossSizePx: number;
  fixationCrossStrokePx: number;
  fixationCrossColor: string;
  targetAoiRadiusPx: number;
  mouseTracking: boolean;
  eyeTrackingEnabled: boolean;
  gazeSampleIntervalMs: number;
  calibrationPointCount: number;
  calibrationClicksPerPoint: number;
  gazeValidationMaxErrorPx: number;
  gazeMinValidRatio: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PerceptualOrderingConfig extends BaseExperimentConfig {
  rectanglesPerTrial: number;
  aspectRatio: number;
  mixedAspectRatios: number[];
  baseArea: number;
  difficulties: Record<Difficulty, number[]>;
  rectangleFill: string;
  rectangleStroke: string;
  stimulusBackground: string;
  postTrialDelayMs: number;
}

export type PersonCue = 'none' | 'person';
export type MapAlignment = 'aligned' | 'misaligned';
export type RelativeDirection = 'front' | 'back' | 'left' | 'right';
export type CardinalDirection = 'north' | 'east' | 'south' | 'west';

export interface MapAlignmentConfig extends BaseExperimentConfig {
  fixationDurationMs: number;
  postTrialDelayMs: number;
  rotations: number[];
  keys: Record<RelativeDirection, string>;
  mapSizePx: number;
  cueSizePx: number;
}

export type ExperimentConfig =
  | VisualSearchConfig
  | PerceptualOrderingConfig
  | MapAlignmentConfig;

export interface ExperimentMeta {
  id: ExperimentId;
  index: string;
  zhName: string;
  enName: string;
  tagline: string;
  description: string;
  durationLabel: string;
  accent: 'mist' | 'lilac' | 'mint';
  outcome: string;
}

export type EyeTrackingStatus =
  | 'not_requested'
  | 'declined'
  | 'unavailable'
  | 'calibration_failed'
  | 'poor_quality'
  | 'calibrated';

export type CalibrationStatus =
  | 'not_applicable'
  | 'not_started'
  | 'passed'
  | 'failed'
  | 'declined';

/** A raw gaze sample. Coordinates are screen pixels and stage-normalised [0,1]. */
export interface GazeSampleInput {
  sample_index?: number;
  /** Milliseconds since the trial's recorded stimulus onset. */
  t_ms: number;
  /** Monotonic browser clock (`performance.now()`). */
  timestamp_ms: number;
  screen_x: number | null;
  screen_y: number | null;
  normalized_x: number | null;
  normalized_y: number | null;
  valid: boolean;
  face_lost: boolean;
}

/** A raw pointer sample. Never interpreted or labelled as gaze. */
export interface MouseSampleInput {
  sample_index?: number;
  t_ms: number;
  timestamp_ms: number;
  /** Coordinates in CSS pixels relative to the stimulus stage. */
  x: number;
  y: number;
  normalized_x: number;
  normalized_y: number;
  movement_direction: string | null;
  movement_distance: number;
  /** CSS px per second when calculable. */
  velocity: number | null;
  valid: boolean;
  phase: 'stimulus' | 'post_response';
}

export type RegionNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface TrialSubmission {
  participant_id: string;
  experiment_id: ExperimentId;
  session_id: string;
  trial_id: string;
  block_id: string;
  block_type: BlockType;
  /** Optional explicit fields used by the visual-search blocks. They are
   * duplicated into stimulus/metadata so older rows remain readable. */
  block_name?: string | null;
  trial_type?: ExperimentPhase;
  condition_id: string;
  trial_index: number;
  phase: ExperimentPhase;
  stimulus_onset: number;
  response_time: number | null;
  response: string | null;
  correct: boolean | null;
  target_present?: boolean | null;
  target_region?: RegionNumber | null;
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
  eye_tracking_status: EyeTrackingStatus;
  calibration_status: CalibrationStatus;
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

export interface SessionSubmission {
  session_id: string;
  participant_id: string;
  experiment_id: ExperimentId;
  started_at: string;
  completed_at: string | null;
  status: SessionStatus;
  config_version: number;
  config_snapshot: ExperimentConfig;
  environment: Record<string, unknown>;
}

export interface SessionSummary {
  completed_trials: number;
  total_trials: number;
  accuracy: number | null;
  mean_response_time_ms: number | null;
  median_response_time_ms: number | null;
  practice_completed: boolean;
  details?: Record<string, unknown>;
  generated_at: string;
}

export interface CompletionSubmission {
  session_id: string;
  completed_at: string;
  summary: SessionSummary;
}

export interface ExperimentResult {
  session_id: string;
  experiment_id: ExperimentId;
  status: SessionStatus;
  summary: SessionSummary | null;
  config?: Pick<ExperimentConfig, 'showResultsToParticipant'>;
}

export interface ParticipantInfo {
  participant_id: string;
  session_count: number;
  experiments: string[];
  first_seen_at: string;
  last_seen_at: string;
}

export interface ResearcherSessionRow {
  session_id: string;
  participant_id: string;
  experiment_id: ExperimentId;
  started_at: string;
  completed_at: string | null;
  status: SessionStatus;
  trial_count: number;
  formal_trial_count: number;
  summary_json: string | null;
}

export interface BlockRuntimeState {
  block_id: string;
  block_type: BlockType;
  label: string;
  variant: string;
  order: number;
  formal_trials: number;
}

/**
 * Full experiment id list, including archived experiments whose historical
 * sessions must remain readable. New participant-facing catalogs should use
 * ACTIVE_EXPERIMENT_IDS instead.
 */
export const EXPERIMENT_IDS: ExperimentId[] = [
  'visual-search',
  'perceptual-ordering',
  'map-alignment',
];

/**
 * Experiments currently open to new participants. Perceptual ordering is kept
 * in the type system and database for historical data compatibility, but is no
 * longer offered on the participant-facing platform.
 */
export const ACTIVE_EXPERIMENT_IDS: ExperimentId[] = [
  'visual-search',
  'map-alignment',
];

export function isExperimentId(value: string): value is ExperimentId {
  return (EXPERIMENT_IDS as string[]).includes(value);
}

export function isActiveExperimentId(value: string): value is ExperimentId {
  return (ACTIVE_EXPERIMENT_IDS as string[]).includes(value);
}
