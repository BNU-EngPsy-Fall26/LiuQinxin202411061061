import { z } from 'zod';
import { CONFIG_SCHEMAS } from '../shared/config.js';
import { EXPERIMENT_IDS } from '../shared/types.js';

const experimentId = z.enum(['visual-search', 'perceptual-ordering', 'map-alignment']);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
const isoDate = z.string().datetime({ offset: true });

export const participantIdSchema = z
  .string()
  .trim()
  .min(3, '被试编号至少 3 个字符')
  .max(32, '被试编号最多 32 个字符')
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    '被试编号只能包含英文字母、数字、连字符和下划线',
  );

export const sessionSchema = z.object({
  session_id: z.string().regex(idPattern),
  participant_id: participantIdSchema,
  experiment_id: experimentId,
  started_at: isoDate,
  completed_at: isoDate.nullable(),
  status: z.enum(['in_progress', 'completed']),
  config_version: z.number().int().positive(),
  config_snapshot: z.record(z.string(), z.unknown()),
  environment: z.record(z.string(), z.unknown()).default({}),
});

const jsonObject = z.record(z.string(), z.unknown());

const eyeTrackingStatus = z.enum([
  'not_requested',
  'declined',
  'unavailable',
  'calibrated',
  'poor_quality',
  'calibration_failed',
]);
const calibrationStatus = z.enum([
  'not_applicable',
  'not_started',
  'passed',
  'failed',
  'declined',
]);

export const gazeSampleSchema = z.object({
  sample_index: z.number().int().min(0).max(10000).optional(),
  t_ms: z.number().finite().nonnegative().max(600000),
  timestamp_ms: z.number().finite().nonnegative(),
  screen_x: z.number().finite().nullable(),
  screen_y: z.number().finite().nullable(),
  normalized_x: z.number().finite().nullable(),
  normalized_y: z.number().finite().nullable(),
  valid: z.boolean(),
  face_lost: z.boolean(),
});

export const mouseSampleSchema = z.object({
  sample_index: z.number().int().min(0).max(10000).optional(),
  t_ms: z.number().finite().nonnegative().max(600000),
  timestamp_ms: z.number().finite().nonnegative(),
  x: z.number().finite(),
  y: z.number().finite(),
  normalized_x: z.number().finite(),
  normalized_y: z.number().finite(),
  movement_direction: z.string().max(30).nullable(),
  movement_distance: z.number().finite().nonnegative(),
  velocity: z.number().finite().nullable(),
  valid: z.boolean(),
  phase: z.enum(['stimulus', 'post_response']),
});

export const trialSchema = z.object({
  participant_id: participantIdSchema,
  experiment_id: experimentId,
  session_id: z.string().regex(idPattern),
  trial_id: z.string().regex(idPattern),
  block_id: z.string().min(1).max(80),
  block_name: z.string().max(120).nullable().optional(),
  block_type: z.enum(['original_block', 'extension_block']),
  condition_id: z.string().min(1).max(120),
  trial_index: z.number().int().min(1).max(5000),
  phase: z.enum(['practice', 'formal']),
  stimulus_onset: z.number().finite().nonnegative(),
  response_time: z.number().finite().nonnegative().max(300000).nullable(),
  response: z.string().max(120).nullable(),
  correct: z.boolean().nullable(),
  target_present: z.boolean().nullable().optional(),
  target_region: z.number().int().min(1).max(9).nullable().optional(),
  target_x: z.number().finite().nullable().optional(),
  target_y: z.number().finite().nullable().optional(),
  set_size: z.number().int().min(1).max(200).nullable().optional(),
  stimulus_type: z.string().max(80).nullable().optional(),
  planned_formal_trials: z.number().int().min(1).max(500).nullable().optional(),
  completed_formal_trials: z.number().int().min(0).max(1000).nullable().optional(),
  window_blur: z.boolean().optional(),
  gaze_available: z.boolean().optional(),
  gaze_quality: z.string().max(80).nullable().optional(),
  timestamp: isoDate,
  timeout: z.boolean(),
  invalid_response: z.boolean(),
  eye_tracking_status: eyeTrackingStatus.default('not_requested'),
  calibration_status: calibrationStatus.default('not_applicable'),
  calibration_quality: z.number().finite().nonnegative().nullable().default(null),
  valid_gaze_ratio: z.number().min(0).max(1).nullable().default(null),
  valid_mouse_ratio: z.number().min(0).max(1).nullable().default(null),
  stimulus: jsonObject,
  response_data: jsonObject,
  tracking: jsonObject,
  metadata: jsonObject,
  gaze_samples: z.array(gazeSampleSchema).max(3000).optional(),
  mouse_samples: z.array(mouseSampleSchema).max(3000).optional(),
});

export const completionSchema = z.object({
  session_id: z.string().regex(idPattern),
  completed_at: isoDate,
  summary: z.object({
    completed_trials: z.number().int().min(0).max(1000),
    total_trials: z.number().int().min(0).max(1000),
    accuracy: z.number().min(0).max(1).nullable(),
    mean_response_time_ms: z.number().finite().nonnegative().nullable(),
    median_response_time_ms: z.number().finite().nonnegative().nullable(),
    practice_completed: z.boolean(),
    details: jsonObject.optional(),
    generated_at: isoDate,
  }),
});

export const configUpdateSchema = z.object({
  experiment_id: experimentId,
  config: z.record(z.string(), z.unknown()),
});

export const literatureInputSchema = z.object({
  experiment_id: experimentId,
  block_variant: z.string().max(80).nullable().optional(),
  title: z.string().trim().min(1).max(400),
  authors: z.string().trim().min(1).max(400),
  year: z.number().int().min(1800).max(new Date().getFullYear() + 1),
  journal: z.string().trim().max(300).nullable().optional(),
  doi: z.string().trim().max(200).nullable().optional(),
  url: z.string().trim().url().max(500).nullable().optional(),
  sample_size: z.number().int().positive().max(10_000_000).nullable().optional(),
  task: z.string().trim().min(1).max(400),
  condition: z.string().trim().min(1).max(400),
  dependent_variable: z.string().trim().min(1).max(300),
  mean_value: z.number().finite().nullable().optional(),
  sd_value: z.number().finite().nonnegative().nullable().optional(),
  se_value: z.number().finite().nonnegative().nullable().optional(),
  unit: z.string().trim().max(80).nullable().optional(),
  source_page: z.string().trim().min(1).max(500),
  extraction_method: z.string().trim().min(1).max(500),
  comparability_note: z.string().trim().min(1).max(1000),
  approximate: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10_000).default(0),
});

export function validateExperimentConfig(experimentIdValue: string, config: unknown) {
  if (!(EXPERIMENT_IDS as string[]).includes(experimentIdValue)) {
    return { success: false as const, issues: ['未知实验编号'] };
  }
  const id = experimentIdValue as (typeof EXPERIMENT_IDS)[number];
  const result = CONFIG_SCHEMAS[id].safeParse(config);
  if (!result.success) {
    return {
      success: false as const,
      issues: result.error.issues.map(
        (issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`,
      ),
    };
  }
  return { success: true as const, data: result.data };
}
