import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  ExperimentBlockConfig,
  ExperimentPhase,
  SessionSummary,
  VisualSearchConfig,
  VisualSearchVariant,
} from '@shared/types';
import { buildBlockRuns, type BlockRun } from '@shared/blocks';
import {
  BLOCK_BRIEFS,
  PRACTICE_TRIALS_PER_BLOCK,
  REGIONS,
} from '@shared/visual-search';
import { ExperimentTopBar } from '@/components/experiment/ExperimentTopBar';
import {
  afterPaint,
  formatMs,
  isEditableTarget,
  monotonicNow,
  normalizeKey,
} from '@/utils/timing';
import {
  generateVisualSearchPractice,
  generateVisualSearchTrials,
  summarizeVisualSearch,
  VIRTUAL_STAGE,
  type VisualSearchScore,
  type VisualSearchTrialSpec,
} from './generator';
import {
  MouseTrajectoryRecorder,
  type MouseTrackingResult,
} from './mouseTracking';
import {
  GazeTracker,
  type EyeCaptureResult,
  type EyeValidationPoint,
  type EyeValidationResult,
} from './eyeTracking';
import {
  computeGazeTrialMetrics,
  computeMouseTrialMetrics,
} from '@shared/search-metrics';
import { useAttentionMonitor } from '@/experiments/shared/useAttentionMonitor';
import type { ExperimentRuntime } from '@/experiments/shared/useExperimentRuntime';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import {
  getParticipantId,
  readActiveSessionProgress,
  saveActiveSessionProgress,
} from '@/services/localStore';

type Screen =
  | 'recovery'
  | 'block_intro'
  | 'fixation'
  | 'stimulus'
  | 'practice_feedback'
  | 'practice_complete'
  | 'eye_consent'
  | 'eye_setup'
  | 'eye_calibration'
  | 'eye_validation'
  | 'eye_validation_result'
  | 'formal_ready'
  | 'block_complete'
  | 'intertrial'
  | 'finishing';

interface PracticeFeedback {
  correct: boolean;
  timedOut: boolean;
  response: string | null;
  responseTime: number | null;
  targetPresent: boolean;
}

interface PracticeStats {
  correct: number;
  total: number;
  correctRt: number[];
}

interface StoredProgress {
  block_index: number;
  completed_in_block: number;
  block_complete: boolean;
  completed_blocks: number;
  scores: VisualSearchScore[];
}

const CALIBRATION_GRID = [
  { xPct: 14, yPct: 18 },
  { xPct: 50, yPct: 18 },
  { xPct: 86, yPct: 18 },
  { xPct: 14, yPct: 50 },
  { xPct: 50, yPct: 50 },
  { xPct: 86, yPct: 50 },
  { xPct: 14, yPct: 82 },
  { xPct: 50, yPct: 82 },
  { xPct: 86, yPct: 82 },
];

const VALIDATION_POINTS = [
  { xPct: 18, yPct: 25 },
  { xPct: 82, yPct: 25 },
  { xPct: 50, yPct: 50 },
  { xPct: 18, yPct: 75 },
  { xPct: 82, yPct: 75 },
];

export function VisualSearchTask({
  config,
  runtime,
  onComplete,
}: {
  config: VisualSearchConfig;
  runtime: ExperimentRuntime;
  onComplete: (summary: SessionSummary, sessionId: string) => void;
}) {
  const participantId = getParticipantId() ?? '';
  const seed = runtime.sessionSeed;

  const formalRuns = useMemo<BlockRun<VisualSearchTrialSpec>[]>(() => {
    const ordered = {
      ...config,
      // The task enforces the design order even if an obsolete value says
      // otherwise; validation also rejects a non-monotonic order.
      randomizeBlockOrder: false,
    };
    return buildBlockRuns(ordered, `${seed}:formal`, (block, count) =>
      generateVisualSearchTrials({
        config,
        phase: 'formal',
        count,
        seed: `${seed}:formal`,
        block: block as ExperimentBlockConfig<VisualSearchVariant>,
      }),
    );
  }, [config, seed]);

  const practiceByBlock = useMemo(
    () =>
      formalRuns.map((run) =>
        generateVisualSearchPractice({
          config,
          block: run.block as ExperimentBlockConfig<VisualSearchVariant>,
          seed: `${seed}:practice`,
        }),
      ),
    [config, formalRuns, seed],
  );

  const [blockIndex, setBlockIndex] = useState(0);
  const [phase, setPhase] = useState<ExperimentPhase>('practice');
  const [trialIndex, setTrialIndex] = useState(0);
  const [screen, setScreen] = useState<Screen>('block_intro');
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [finishError, setFinishError] = useState('');
  const [eyeSetupError, setEyeSetupError] = useState('');
  const [eyeNotice, setEyeNotice] = useState('');
  const [calibrationCounts, setCalibrationCounts] = useState<number[]>(() =>
    CALIBRATION_GRID.map(() => 0),
  );
  const [validationIndex, setValidationIndex] = useState(0);
  const [validationResults, setValidationResults] = useState<EyeValidationPoint[]>([]);
  const [validationSummary, setValidationSummary] = useState<EyeValidationResult | null>(null);
  const [recovery, setRecovery] = useState<StoredProgress | null>(null);
  const [eyeDecisionMade, setEyeDecisionMade] = useState(false);
  const sync = useSyncStatus();

  const stageRef = useRef<HTMLDivElement>(null);
  const onsetRef = useRef<number | null>(null);
  const stageRectRef = useRef<DOMRect | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const recorderRef = useRef<MouseTrajectoryRecorder | null>(null);
  const trackerRef = useRef<GazeTracker | null>(null);
  const lockedRef = useRef(false);
  const invalidKeysRef = useRef<string[]>([]);
  const blurCountRef = useRef(0);
  const formalScoresRef = useRef<VisualSearchScore[]>([]);
  const practiceScoresRef = useRef<Record<string, PracticeStats>>({});
  const lastSaveRef = useRef<Promise<void> | null>(null);
  const completedRef = useRef(false);
  const practiceCompletedRef = useRef(false);
  const validationStartedRef = useRef(false);
  const recoveryCheckedRef = useRef(false);
  const attentionMonitor = useAttentionMonitor();
  const attentionRef = useRef(attentionMonitor);
  attentionRef.current = attentionMonitor;

  const currentRun = formalRuns[blockIndex] ?? null;
  const block = currentRun?.block as
    | ExperimentBlockConfig<VisualSearchVariant>
    | undefined;
  const variant = block?.variant ?? 'feature_search';
  const brief = BLOCK_BRIEFS[variant];
  const practiceTrials = practiceByBlock[blockIndex] ?? [];
  const trials = phase === 'practice' ? practiceTrials : currentRun?.trials ?? [];
  const currentSpec = trials[trialIndex] ?? null;
  const targetKey = useMemo(() => normalizeConfiguredKey(config.targetKey), [config.targetKey]);
  const absentKey = useMemo(() => normalizeConfiguredKey(config.absentKey), [config.absentKey]);

  const stateRef = useRef({
    screen,
    phase,
    blockIndex,
    trialIndex,
    currentSpec,
    block,
    currentRun,
  });
  stateRef.current = {
    screen,
    phase,
    blockIndex,
    trialIndex,
    currentSpec,
    block,
    currentRun,
  };

  const getTracker = useCallback((): GazeTracker => {
    if (!trackerRef.current) {
      trackerRef.current = new GazeTracker(
        config.gazeSampleIntervalMs,
        config.gazeValidationMaxErrorPx,
        config.gazeMinValidRatio,
      );
    }
    return trackerRef.current;
  }, [
    config.gazeMinValidRatio,
    config.gazeSampleIntervalMs,
    config.gazeValidationMaxErrorPx,
  ]);

  useEffect(() => {
    return () => {
      trackerRef.current?.dispose();
      trackerRef.current = null;
    };
  }, []);

  const persistProgress = useCallback(
    (overrides?: Partial<StoredProgress>) => {
      if (!participantId) return;
      const completed = formalScoresRef.current.length;
      if (completed === 0 && !overrides && phase !== 'formal') return;
      const completedInBlock = formalScoresRef.current.filter(
        (score) => score.blockId === stateRef.current.block?.block_id,
      ).length;
      const progress: StoredProgress = {
        block_index: stateRef.current.blockIndex,
        completed_in_block: completedInBlock,
        block_complete: false,
        completed_blocks: stateRef.current.blockIndex,
        scores: formalScoresRef.current,
        ...overrides,
      };
      saveActiveSessionProgress(
        runtime.sessionId,
        participantId,
        'visual-search',
        progress as unknown as Record<string, unknown>,
      );
    },
    [participantId, phase, runtime.sessionId],
  );

  // Restore completed formal trials after an accidental refresh. Nothing is
  // auto-marked complete: the participant must confirm resumption.
  useEffect(() => {
    if (recoveryCheckedRef.current) return;
    recoveryCheckedRef.current = true;
    if (!participantId) return;
    const raw = readActiveSessionProgress(
      runtime.sessionId,
      participantId,
      'visual-search',
    );
    if (!raw) return;
    const scores = Array.isArray(raw.scores)
      ? (raw.scores as VisualSearchScore[])
      : [];
    if (scores.length === 0) return;
    const recovered: StoredProgress = {
      block_index: Number(raw.block_index) || 0,
      completed_in_block: Number(raw.completed_in_block) || 0,
      block_complete: Boolean(raw.block_complete),
      completed_blocks: Number(raw.completed_blocks) || 0,
      scores,
    };
    formalScoresRef.current = scores;
    practiceCompletedRef.current = true;
    setRecovery(recovered);
    setScreen('recovery');
  }, [participantId, runtime.sessionId]);

  const finishTrial = useCallback(
    (responseKey: string | null, timedOut: boolean) => {
      if (lockedRef.current) return;
      const state = stateRef.current;
      const spec = state.currentSpec;
      if (!spec || state.screen !== 'stimulus') return;
      const onset = onsetRef.current;
      if (onset === null) return;
      const activeBlock = state.block;
      const run = state.currentRun;
      if (!activeBlock || !run) return;
      lockedRef.current = true;
      if (deadlineRef.current !== null) {
        window.clearTimeout(deadlineRef.current);
        deadlineRef.current = null;
      }

      const responseAt = monotonicNow();
      const responseTime = timedOut ? null : Math.max(0, responseAt - onset);
      const mouse: MouseTrackingResult =
        recorderRef.current?.stop(timedOut ? null : responseAt) ??
        emptyMouseResult('Pointer trajectory recording was not active.');
      recorderRef.current = null;
      const eye: EyeCaptureResult =
        trackerRef.current?.stopTrial(timedOut ? null : responseAt) ??
        emptyEyeCapture();
      const monitor = attentionRef.current;
      const attentionSnapshot = monitor.snapshot();
      monitor.disarmTrial();
      const invalidKeys = [...invalidKeysRef.current];
      const responseIsPresent = responseKey !== null && responseKey === targetKey;
      const correct =
        responseKey === null ? false : spec.targetPresent === responseIsPresent;
      const stageRect = stageRectRef.current;
      const targetItem = spec.items.find((item) => item.isTarget) ?? null;
      const targetScreen = targetItem && stageRect ? toScreenPoint(targetItem, stageRect) : null;
      const currentPhase = state.phase;
      const currentTrialIndex = state.trialIndex;
      const globalFormalIndex =
        currentPhase === 'formal'
          ? run.startIndex + currentTrialIndex + 1
          : 1000 + state.blockIndex * 10 + currentTrialIndex + 1;
      const targetNormalized = spec.targetPositionPct
        ? { x: spec.targetPositionPct.x / 100, y: spec.targetPositionPct.y / 100 }
        : null;
      const gazeMetrics = computeGazeTrialMetrics({
        samples: eye.samples,
        targetAoi: spec.targetRegion,
        targetPresent: spec.targetPresent,
        targetNormalized,
        minValidRatio: config.gazeMinValidRatio,
      });
      const mouseMetrics = computeMouseTrialMetrics(mouse.samples, {
        region: spec.targetRegion,
        normalized: targetNormalized,
      });
      const eyeStatus = eye.eye_tracking_status;
      const windowBlur = blurCountRef.current > 0;
      const blockOrder = config.blocks.findIndex(
        (candidate) => candidate.block_id === activeBlock.block_id,
      );

      const draft = {
        trialId: spec.id,
        blockId: activeBlock.block_id,
        blockName: brief.blockName,
        blockType: activeBlock.block_type,
        conditionId: spec.conditionId,
        trialIndex: globalFormalIndex,
        phase: currentPhase,
        stimulusOnset: onset,
        responseTime,
        response: responseKey,
        correct,
        timeout: timedOut,
        targetPresent: spec.targetPresent,
        targetRegion: spec.targetRegion,
        targetX: targetScreen?.screenX ?? null,
        targetY: targetScreen?.screenY ?? null,
        setSize: spec.setSize,
        stimulusType: activeBlock.variant,
        plannedFormalTrials: activeBlock.formalTrials,
        completedFormalTrials:
          currentPhase === 'formal' ? currentTrialIndex + 1 : null,
        windowBlur,
        gazeAvailable: eye.samples.length > 0 && eyeStatus !== 'declined',
        gazeQuality: eyeStatus,
        invalidResponse: invalidKeys.length > 0,
        eyeTrackingStatus: eyeStatus,
        calibrationStatus: eye.calibration_status,
        calibrationQuality: eye.calibration_quality,
        validGazeRatio: eye.valid_gaze_ratio,
        validMouseRatio: mouse.valid_mouse_ratio,
        stimulus: {
          block_id: activeBlock.block_id,
          block_name: brief.blockName,
          block_variant: activeBlock.variant,
          stimulus_type: activeBlock.variant,
          set_size: spec.setSize,
          target_present: spec.targetPresent,
          target_region: spec.targetRegion,
          target_x: targetScreen?.screenX ?? null,
          target_y: targetScreen?.screenY ?? null,
          target_x_stage: targetScreen?.stageX ?? null,
          target_y_stage: targetScreen?.stageY ?? null,
          target_position_pct: spec.targetPositionPct,
          target_position_virtual_px: spec.targetPositionPx,
          planned_formal_trials: activeBlock.formalTrials,
          items: spec.items.map((item) => ({
            letter: item.letter,
            shape: item.letter,
            color: item.color,
            role: item.isTarget ? 'target' : 'distractor',
            region: item.region,
            x_pct: round(item.xPct),
            y_pct: round(item.yPct),
            x_stage_px: round(item.xPx),
            y_stage_px: round(item.yPx),
            ...(stageRect
              ? {
                  x_screen_px: round(stageRect.left + (item.xPct / 100) * stageRect.width),
                  y_screen_px: round(stageRect.top + (item.yPct / 100) * stageRect.height),
                }
              : {}),
            grid_col: item.gridCell.col,
            grid_row: item.gridCell.row,
            is_target: item.isTarget,
          })),
          nine_region: {
            definition: '搜索区域按实际边界等分为 3×3，编号 1–9',
            regions: REGIONS,
          },
          search_area: {
            normalized: { x: 72 / 860, y: 64 / 540, width: 716 / 860, height: 412 / 540 },
            virtual_px: { x: 72, y: 64, width: 716, height: 412 },
            screen_px: stageRect
              ? {
                  x: round(stageRect.left + (72 / 860) * stageRect.width),
                  y: round(stageRect.top + (64 / 540) * stageRect.height),
                  width: round((716 / 860) * stageRect.width),
                  height: round((412 / 540) * stageRect.height),
                }
              : null,
          },
          grid: {
            columns: config.gridColumns,
            rows: config.gridRows,
            arrangement: 'jittered_grid',
          },
          target_color: config.targetColor,
          distractor_colors:
            activeBlock.variant === 'feature_search'
              ? [config.distractorBlueColor]
              : [config.distractorRedColor, config.distractorBlueColor],
          letter_size_px: config.letterSizePx,
          font_family: config.stimulusFontFamily,
          font_weight: 400,
          fixation_cross: {
            size_px: config.fixationCrossSizePx,
            stroke_px: config.fixationCrossStrokePx,
            color: config.fixationCrossColor,
          },
          jitter_px: config.jitterPx,
          virtual_stage: VIRTUAL_STAGE,
          stage_rect: stageRect
            ? {
                width: round(stageRect.width),
                height: round(stageRect.height),
                top: round(stageRect.top),
                left: round(stageRect.left),
              }
            : null,
          device_pixel_ratio: window.devicePixelRatio,
        },
        responseData: {
          key: responseKey,
          target_key: config.targetKey,
          absent_key: config.absentKey,
          invalid_keys: invalidKeys,
          timed_out: timedOut,
        },
        tracking: {
          window_blur: {
            occurred: windowBlur,
            count: blurCountRef.current,
          },
          mouse_tracking: mouse,
          eye_tracking: {
            available: eye.samples.length > 0,
            status: eyeStatus,
            calibration_status: eye.calibration_status,
            calibration_quality: eye.calibration_quality,
            valid_gaze_ratio: eye.valid_gaze_ratio,
            sample_count: eye.samples.length,
            fixation_count: gazeMetrics.fixation_count,
            fixation_sequence: gazeMetrics.fixation_regions,
            first_fixation_position: gazeMetrics.first_fixation_position,
            first_fixation_region: gazeMetrics.first_fixation_region,
            first_fixation_ms: gazeMetrics.first_fixation_ms,
            target_first_fixation_ms: gazeMetrics.target_first_fixation_ms,
            target_first_fixation_region: gazeMetrics.target_first_fixation_region,
            target_distance_normalized: gazeMetrics.target_distance_normalized,
            target_distance_px: gazeMetrics.target_distance_px,
            regions_visited_before_target: gazeMetrics.regions_visited_before_target,
            target_region_visit_order: gazeMetrics.target_region_visit_order,
            region_transitions: gazeMetrics.quadrant_transitions,
            region_counts: gazeMetrics.region_counts,
            direction_ratios: {
              left_to_right: gazeMetrics.left_to_right_transition_ratio,
              right_to_left: gazeMetrics.right_to_left_transition_ratio,
              top_to_bottom: gazeMetrics.top_to_bottom_transition_ratio,
              bottom_to_top: gazeMetrics.bottom_to_top_transition_ratio,
              center_to_periphery: gazeMetrics.center_to_periphery_transition_ratio,
              periphery_to_center: gazeMetrics.periphery_to_center_transition_ratio,
            },
            aoi_note:
              'Gaze AOIs are the nine large search-area regions, not individual letters. WebGazer error is typically several degrees of visual angle.',
            note:
              eyeStatus === 'declined'
                ? 'The participant declined camera access. Mouse data are recorded separately and are not gaze.'
                : eyeStatus === 'unavailable' || eyeStatus === 'calibration_failed'
                  ? 'Camera eye tracking was unavailable or did not pass the quality check. Mouse data are not gaze.'
                  : 'Exploratory WebGazer estimate. Raw video is never uploaded. Eye and mouse tracks are stored separately.',
          },
          attention: attentionSnapshot,
        },
        metadata: {
          phase: currentPhase,
          trial_type: currentPhase,
          block_id: activeBlock.block_id,
          block_name: brief.blockName,
          block_type: activeBlock.block_type,
          block_label: activeBlock.label,
          block_variant: activeBlock.variant,
          block_order: blockOrder,
          block_trial_index: currentTrialIndex + 1,
          block_trial_count: activeBlock.formalTrials,
          planned_formal_trials: activeBlock.formalTrials,
          completed_formal_trials:
            currentPhase === 'formal' ? currentTrialIndex + 1 : null,
          practice_trials_per_block: PRACTICE_TRIALS_PER_BLOCK,
          trial_number_within_phase: currentTrialIndex + 1,
          resolved_block_order: formalRuns.map((item) => item.block.block_id),
          trial_seed: spec.rngSeed,
          session_seed: seed,
          session_id: runtime.sessionId,
          fixation_duration_ms: config.fixationDurationMs,
          response_deadline_ms: config.responseTimeoutMs,
          mouse_tracking_enabled: config.mouseTracking,
          eye_tracking_requested_by_config: config.eyeTrackingEnabled,
          eye_tracking_collected:
            eyeStatus === 'calibrated' || eyeStatus === 'poor_quality',
          window_blur: windowBlur,
          window_blur_count: blurCountRef.current,
          gaze_available: eye.samples.length > 0 && eyeStatus !== 'declined',
          gaze_quality: eyeStatus,
          search_area_definition:
            'The 3×3 regions divide the actual stimulus search area, not the browser window.',
          browser_timing_note:
            'Stimulus onset is captured after two animation frames with performance.now(); browser display latency is not photodiode-verified.',
        },
        gazeSamples: eye.samples,
        mouseSamples: mouse.samples,
      };

      const savePromise = runtime
        .recordTrial(draft)
        .then(() => undefined)
        .catch((error: unknown) => {
          console.error('visual search trial save failed', error);
        });
      lastSaveRef.current = savePromise;
      blurCountRef.current = 0;

      const score: VisualSearchScore = {
        trialId: spec.id,
        trialIndex: globalFormalIndex,
        blockId: activeBlock.block_id,
        blockName: brief.blockName,
        blockType: activeBlock.block_type,
        variant: activeBlock.variant,
        correct,
        responseTime,
        timeout: timedOut,
        targetPresent: spec.targetPresent,
        targetRegion: spec.targetRegion,
        targetX: targetScreen?.screenX ?? null,
        targetY: targetScreen?.screenY ?? null,
        setSize: spec.setSize,
        conditionId: spec.conditionId,
        mouseAvailable: mouse.sufficient_for_metrics,
        gazeAvailable: eye.samples.length > 0 && eyeStatus !== 'declined',
        gazeQuality: eyeStatus,
        gazeValidRatio: eye.valid_gaze_ratio,
        eyeTrackingStatus: eyeStatus,
        gazeMetrics,
        mouseMetrics,
        windowBlur,
      };

      if (currentPhase === 'formal') {
        formalScoresRef.current.push(score);
        const completedInBlock = currentTrialIndex + 1;
        const blockComplete = completedInBlock >= run.trials.length;
        persistProgress({
          block_index: state.blockIndex,
          completed_in_block: completedInBlock,
          block_complete: blockComplete,
          completed_blocks: blockComplete ? state.blockIndex + 1 : state.blockIndex,
          scores: formalScoresRef.current,
        });
        if (blockComplete) {
          setScreen('block_complete');
        } else {
          setScreen('intertrial');
        }
      } else {
        const existing = practiceScoresRef.current[activeBlock.block_id] ?? {
          correct: 0,
          total: 0,
          correctRt: [],
        };
        practiceScoresRef.current[activeBlock.block_id] = {
          correct: existing.correct + (correct ? 1 : 0),
          total: existing.total + 1,
          correctRt:
            correct && responseTime !== null
              ? [...existing.correctRt, responseTime]
              : existing.correctRt,
        };
        setFeedback({
          correct,
          timedOut,
          response: responseKey,
          responseTime,
          targetPresent: spec.targetPresent,
        });
        setScreen('practice_feedback');
      }
    },
    [
      brief.blockName,
      config,
      formalRuns,
      persistProgress,
      runtime,
      targetKey,
    ],
  );

  const finishRef = useRef(finishTrial);
  finishRef.current = finishTrial;

  useEffect(() => {
    if (screen !== 'fixation') return;
    lockedRef.current = false;
    onsetRef.current = null;
    invalidKeysRef.current = [];
    blurCountRef.current = 0;
    const timer = window.setTimeout(() => {
      setScreen('stimulus');
    }, config.fixationDurationMs);
    return () => window.clearTimeout(timer);
  }, [screen, trialIndex, blockIndex, phase, config.fixationDurationMs]);

  useEffect(() => {
    if (screen !== 'stimulus' || !currentSpec) return;
    let active = true;
    const cancelFrames = afterPaint((onset) => {
      if (!active) return;
      onsetRef.current = onset;
      stageRectRef.current = stageRef.current?.getBoundingClientRect() ?? null;
      if (config.mouseTracking && phase === 'formal' && stageRef.current) {
        recorderRef.current = new MouseTrajectoryRecorder(
          stageRef.current,
          onset,
          currentSpec.targetPositionPct,
        );
      }
      if (phase === 'formal' && trackerRef.current?.calibrationStatus === 'passed') {
        const rect = stageRef.current?.getBoundingClientRect();
        if (rect) trackerRef.current.startTrial(onset, rect);
      }
      attentionRef.current.armTrial();
      deadlineRef.current = window.setTimeout(() => {
        finishRef.current(null, true);
      }, config.responseTimeoutMs);
    });
    return () => {
      active = false;
      cancelFrames();
      if (deadlineRef.current !== null) {
        window.clearTimeout(deadlineRef.current);
        deadlineRef.current = null;
      }
      if (recorderRef.current) {
        recorderRef.current.stop();
        recorderRef.current = null;
      }
      trackerRef.current?.stopTrial(null);
    };
  }, [
    screen,
    currentSpec,
    config.mouseTracking,
    config.responseTimeoutMs,
    phase,
  ]);

  useEffect(() => {
    if (screen !== 'stimulus') return;
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (onsetRef.current === null) return;
      const key = normalizeKey(event);
      if (key === targetKey || key === absentKey) {
        event.preventDefault();
        finishRef.current(key, false);
        return;
      }
      if (
        ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(event.key) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key.length === 1 || event.key.startsWith('Arrow')) {
        invalidKeysRef.current.push(key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen, targetKey, absentKey]);

  useEffect(() => {
    if (screen !== 'stimulus') return;
    const markBlur = () => {
      blurCountRef.current += 1;
    };
    window.addEventListener('blur', markBlur);
    document.addEventListener('visibilitychange', markBlur);
    return () => {
      window.removeEventListener('blur', markBlur);
      document.removeEventListener('visibilitychange', markBlur);
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== 'practice_feedback') return;
    const timer = window.setTimeout(() => {
      if (trialIndex + 1 < practiceTrials.length) {
        setTrialIndex(trialIndex + 1);
        setScreen('fixation');
      } else {
        practiceCompletedRef.current = true;
        setScreen('practice_complete');
      }
    }, 1050);
    return () => window.clearTimeout(timer);
  }, [screen, trialIndex, practiceTrials.length]);

  useEffect(() => {
    if (screen !== 'intertrial') return;
    const delay = Math.max(120, config.postTrialDelayMs);
    const timer = window.setTimeout(() => {
      if (trialIndex + 1 < (currentRun?.trials.length ?? 0)) {
        setTrialIndex(trialIndex + 1);
        setScreen('fixation');
      } else {
        setScreen('block_complete');
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [screen, trialIndex, currentRun, config.postTrialDelayMs]);

  useEffect(() => {
    if (screen !== 'eye_validation') return;
    if (validationIndex >= VALIDATION_POINTS.length) return;
    let active = true;
    const point = VALIDATION_POINTS[validationIndex];
    const timer = window.setTimeout(() => {
      const x = (window.innerWidth * point.xPct) / 100;
      const y = (window.innerHeight * point.yPct) / 100;
      const tracker = trackerRef.current;
      if (!tracker) return;
      void tracker.validatePoint(x, y, 900).then((result) => {
        if (!active) return;
        setValidationResults((current) => [...current, result]);
        setValidationIndex((current) => current + 1);
      });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [screen, validationIndex]);

  useEffect(() => {
    if (screen !== 'eye_validation') return;
    if (
      validationIndex < VALIDATION_POINTS.length ||
      validationResults.length < VALIDATION_POINTS.length ||
      validationSummary
    ) {
      return;
    }
    const summary = trackerRef.current?.finalizeValidation(
      validationResults,
      VALIDATION_POINTS.length,
    );
    if (!summary) return;
    setValidationSummary(summary);
    setScreen('eye_validation_result');
  }, [screen, validationIndex, validationResults, validationSummary]);

  useEffect(() => {
    if (phase !== 'formal' || screen === 'finishing') return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase, screen]);

  const finalizeExperiment = useCallback(async () => {
    if (completedRef.current) return;
    setFinishError('');
    const expected = formalRuns.reduce((sum, run) => sum + run.trials.length, 0);
    if (formalScoresRef.current.length !== expected) {
      setFinishError(
        `正式试次未完成：已记录 ${formalScoresRef.current.length} / ${expected}。未完成的试次不会被标记为完成。`,
      );
      setScreen('finishing');
      return;
    }
    try {
      await lastSaveRef.current;
      await runtime.ensureSession();
      trackerRef.current?.dispose();
      trackerRef.current = null;
      const summary = summarizeVisualSearch(
        formalScoresRef.current,
        expected,
        practiceCompletedRef.current,
        formalRuns.map(
          (run) => run.block as ExperimentBlockConfig<VisualSearchVariant>,
        ),
      );
      const sessionId = await runtime.complete(summary);
      completedRef.current = true;
      onComplete(summary, sessionId);
    } catch (error) {
      console.error('visual search finalization failed', error);
      setFinishError(
        error instanceof Error ? error.message : '实验结束数据保存失败，请重试。',
      );
    }
  }, [formalRuns, onComplete, runtime]);

  const finalizeRef = useRef(finalizeExperiment);
  finalizeRef.current = finalizeExperiment;

  const beginPractice = () => {
    setPhase('practice');
    setTrialIndex(0);
    setFeedback(null);
    setScreen('fixation');
  };

  const continueToFormal = () => {
    if (blockIndex === 0 && config.eyeTrackingEnabled && !eyeDecisionMade) {
      setScreen('eye_consent');
      return;
    }
    setScreen('formal_ready');
  };

  const startFormal = () => {
    setPhase('formal');
    setTrialIndex(0);
    setScreen('fixation');
  };

  const enableEyeTracking = async () => {
    setEyeSetupError('');
    setScreen('eye_setup');
    const result = await getTracker().enable();
    if (!result.ok) {
      setEyeSetupError(result.reason);
      setEyeDecisionMade(true);
      setScreen('formal_ready');
      return;
    }
    getTracker().beginCalibration();
    setCalibrationCounts(CALIBRATION_GRID.map(() => 0));
    setValidationResults([]);
    setValidationSummary(null);
    setValidationIndex(0);
    setScreen('eye_calibration');
  };

  const declineEyeTracking = () => {
    getTracker().markDeclined();
    setEyeDecisionMade(true);
    setEyeNotice('你已选择不使用摄像头。鼠标轨迹仍会记录，但不会被解释为注视。');
    setScreen('formal_ready');
  };

  const recordCalibrationClick = (
    value: number,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const tracker = trackerRef.current;
    if (!tracker) return;
    if (calibrationCounts[value] >= config.calibrationClicksPerPoint) return;
    const rect = event.currentTarget.getBoundingClientRect();
    tracker.recordCalibrationPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setCalibrationCounts((current) =>
      current.map((count, itemIndex) => (itemIndex === value ? count + 1 : count)),
    );
  };

  const startValidation = () => {
    if (validationStartedRef.current) return;
    validationStartedRef.current = true;
    setValidationResults([]);
    setValidationIndex(0);
    setValidationSummary(null);
    setScreen('eye_validation');
    window.setTimeout(() => {
      validationStartedRef.current = false;
    }, 500);
  };

  const restartCalibration = () => {
    getTracker().beginCalibration();
    setCalibrationCounts(CALIBRATION_GRID.map(() => 0));
    setValidationResults([]);
    setValidationSummary(null);
    setValidationIndex(0);
    setScreen('eye_calibration');
  };

  const finishEyeSetup = () => {
    setEyeDecisionMade(true);
    setScreen('formal_ready');
  };

  const completeBlock = () => {
    if (blockIndex + 1 < formalRuns.length) {
      setBlockIndex(blockIndex + 1);
      setPhase('practice');
      setTrialIndex(0);
      setFeedback(null);
      setScreen('block_intro');
    } else {
      setScreen('finishing');
      void finalizeRef.current();
    }
  };

  const acceptRecovery = () => {
    if (!recovery) return;
    const targetBlock = Math.min(recovery.block_index, formalRuns.length - 1);
    setBlockIndex(targetBlock);
    setPhase('formal');
    setEyeDecisionMade(true);
    if (recovery.block_complete) {
      setTrialIndex(
        Math.min(
          recovery.completed_in_block - 1,
          (formalRuns[targetBlock]?.trials.length ?? 1) - 1,
        ),
      );
      setScreen('block_complete');
    } else {
      const nextIndex = Math.min(
        recovery.completed_in_block,
        (formalRuns[targetBlock]?.trials.length ?? 1) - 1,
      );
      setTrialIndex(nextIndex);
      setScreen('fixation');
    }
    setRecovery(null);
  };

  const blockScores = formalScoresRef.current.filter(
    (score) => score.blockId === block?.block_id,
  );
  const blockAccuracy =
    blockScores.length > 0
      ? blockScores.filter((score) => score.correct === true).length /
        blockScores.length
      : null;
  const totalPerBlock = phase === 'practice'
    ? practiceTrials.length
    : currentRun?.trials.length ?? 0;
  const blockCurrent = Math.min(trialIndex + 1, Math.max(totalPerBlock, 1));
  const allCalibrationDone = calibrationCounts.every(
    (count) => count >= config.calibrationClicksPerPoint,
  );
  const showStage =
    screen === 'fixation' ||
    screen === 'stimulus' ||
    screen === 'intertrial' ||
    screen === 'practice_feedback';
  const eyeStatusLabel = getTrackerStatusLabel(trackerRef.current);
  const isLastBlock = blockIndex + 1 >= formalRuns.length;

  return (
    <div className="experiment-page">
      <ExperimentTopBar
        title="视觉搜索"
        phase={phase}
        current={blockCurrent}
        total={totalPerBlock}
        blockLabel={block?.label}
        blockCurrent={blockCurrent}
        blockTotal={totalPerBlock}
        allowExit={screen !== 'stimulus' && screen !== 'fixation'}
      />
      <main className="experiment-main">
        {screen === 'recovery' && recovery && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">Session recovery</span>
            <h1 className="runtime-title">已找到未完成的正式进度</h1>
            <p className="runtime-lede">
              本机保存了 {recovery.scores.length} 个已完成的正式试次。
              中断前的数据已经逐试次提交；未完成的试次不会被自动标记为完成。
            </p>
            <p className="runtime-note">
              点击继续后将从下一个未完成试次开始。如果不想继续，可退出实验；
              已提交的数据仍保留在服务器。
            </p>
            <div className="runtime-actions">
              <button type="button" className="btn btn--primary btn--lg" onClick={acceptRecovery}>
                恢复并继续
                <ArrowRight size={16} strokeWidth={1.7} />
              </button>
            </div>
          </div>
        )}

        {screen === 'block_intro' && block && (
          <div className="block-intro">
            <div className="block-intro__copy">
              <span className="runtime-eyebrow">
                Block {blockIndex + 1} / {formalRuns.length} · {brief.english}
              </span>
              <h1 className="runtime-title">{brief.title}</h1>
              <p className="runtime-lede">{brief.rule}</p>
              <div className="block-demo-inline">
                <span className="block-demo-item" style={{ color: config.targetColor }}>O</span>
                <small>目标</small>
                {variant === 'feature_search' ? (
                  <>
                    <span className="block-demo-item" style={{ color: config.distractorBlueColor }}>O</span>
                    <span className="block-demo-item" style={{ color: config.distractorBlueColor }}>X</span>
                    <small>干扰项</small>
                  </>
                ) : (
                  <>
                    <span className="block-demo-item" style={{ color: config.distractorRedColor }}>X</span>
                    <span className="block-demo-item" style={{ color: config.distractorBlueColor }}>O</span>
                    <small>干扰项</small>
                  </>
                )}
              </div>
              <div className="runtime-keys">
                <span className="keycap">
                  <kbd>{config.targetKey.toUpperCase()}</kbd>存在红色 O
                </span>
                <span className="keycap">
                  <kbd>{config.absentKey.toUpperCase()}</kbd>不存在红色 O
                </span>
              </div>
              <p className="runtime-note">
                先练习 {PRACTICE_TRIALS_PER_BLOCK} 次（有反馈），再进入 {block.formalTrials} 个无反馈正式试次。
              </p>
              <div className="runtime-actions">
                <button type="button" className="btn btn--gold btn--lg" onClick={beginPractice}>
                  开始练习
                  <ArrowRight size={16} strokeWidth={1.7} />
                </button>
              </div>
            </div>
            <div className="block-intro__visual">
              <BlockStimulusDemo
                variant={variant}
                targetColor={config.targetColor}
                redColor={config.distractorRedColor}
                blueColor={config.distractorBlueColor}
              />
            </div>
          </div>
        )}

        {screen === 'practice_complete' && block && (
          <div className="runtime-panel">
            <span className="practice-badge">Practice complete</span>
            <h1 className="runtime-title">本 Block 练习完成</h1>
            <p className="runtime-lede">
              练习不计入正式统计。接下来有 {block.formalTrials} 个正式试次，没有逐题反馈。
            </p>
            <div className="runtime-actions">
              <button type="button" className="btn btn--gold btn--lg" onClick={continueToFormal}>
                开始正式试次
                <ArrowRight size={16} strokeWidth={1.7} />
              </button>
            </div>
          </div>
        )}

        {screen === 'eye_consent' && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">Optional camera · 可选摄像头</span>
            <h1 className="runtime-title">是否启用摄像头注视估计？</h1>
            <p className="runtime-lede">
              启用后先完成校准，约需 2–3 分钟。摄像头画面只在本地处理，
              <strong>不会上传或保存原始视频</strong>；眼动结果是探索性近似指标。
              你也可以不启用，仅记录鼠标并完成实验。
            </p>
            <div className="runtime-actions">
              <button type="button" className="btn btn--primary btn--lg" onClick={() => void enableEyeTracking()}>
                <Camera size={16} strokeWidth={1.7} />
                启用摄像头
              </button>
              <button type="button" className="btn btn--soft btn--lg" onClick={declineEyeTracking}>
                <CameraOff size={16} strokeWidth={1.7} />
                不启用，仅记录鼠标
              </button>
            </div>
          </div>
        )}

        {screen === 'eye_setup' && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">Local webcam · 本地处理</span>
            <h1 className="runtime-title">正在启动本地注视估计</h1>
            <p className="runtime-lede">
              请在浏览器权限提示中选择允许摄像头。画面不会离开你的设备。
              如果无法启动，实验会自动回到仅鼠标模式。
            </p>
            <div className="spinner" style={{ margin: '30px auto 0' }} />
            {eyeSetupError && <p className="runtime-note">{eyeSetupError}</p>}
          </div>
        )}

        {screen === 'eye_calibration' && (
          <div className="calibration-screen">
            <div className="calibration-copy">
              <span className="runtime-eyebrow">Calibration · 校准</span>
              <h1 className="runtime-title">依次注视每个点并点击</h1>
              <p className="runtime-lede">
                每个点需要点击 {config.calibrationClicksPerPoint} 次。请只移动眼睛，尽量保持头部稳定。
                点击只用于本地校准，不会上传视频。
              </p>
              <p className="runtime-note">
                已完成 {calibrationCounts.filter((count) => count >= config.calibrationClicksPerPoint).length}
                {' / '}
                {CALIBRATION_GRID.length} 个校准点
              </p>
              {allCalibrationDone && (
                <button type="button" className="btn btn--primary" onClick={startValidation}>
                  开始校准质量检查
                  <ArrowRight size={15} strokeWidth={1.7} />
                </button>
              )}
            </div>
            {CALIBRATION_GRID.map((point, pointIndex) => {
              const done = calibrationCounts[pointIndex] >= config.calibrationClicksPerPoint;
              return (
                <button
                  key={`cal-${pointIndex}`}
                  type="button"
                  className={`calibration-dot${done ? ' is-done' : ''}`}
                  style={{ left: `${point.xPct}%`, top: `${point.yPct}%` }}
                  onClick={(event) => recordCalibrationClick(pointIndex, event)}
                  disabled={done}
                  aria-label={`校准点 ${pointIndex + 1}`}
                >
                  <span>{done ? <Check size={14} /> : calibrationCounts[pointIndex]}</span>
                </button>
              );
            })}
          </div>
        )}

        {screen === 'eye_validation' && (
          <div className="validation-screen">
            <div className="calibration-copy">
              <span className="runtime-eyebrow">Quality check · 质量检查</span>
              <h1 className="runtime-title">请注视出现的圆点</h1>
              <p className="runtime-lede">
                每个点停留约 1 秒。请只注视圆点，不要点击。正在检查 {validationIndex + 1} / {VALIDATION_POINTS.length}。
              </p>
              <p className="runtime-note">
                这一步用于判断注视估计是否足以用于探索性分析；未通过也不会中断实验。
              </p>
            </div>
            <span
              className="validation-dot"
              style={{
                left: `${VALIDATION_POINTS[Math.min(validationIndex, VALIDATION_POINTS.length - 1)].xPct}%`,
                top: `${VALIDATION_POINTS[Math.min(validationIndex, VALIDATION_POINTS.length - 1)].yPct}%`,
              }}
            />
          </div>
        )}

        {screen === 'eye_validation_result' && validationSummary && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">Quality result · 质量结果</span>
            <h1 className="runtime-title">
              {validationSummary.passed ? '校准质量可用' : '注视估计质量不足'}
            </h1>
            <p className="runtime-lede">{validationSummary.reason}</p>
            <div className="completion-stats" style={{ marginBottom: 24 }}>
              <div className="completion-stat">
                <div className="completion-stat__value">{validationSummary.valid_points} / {VALIDATION_POINTS.length}</div>
                <div className="completion-stat__label">有效验证点</div>
              </div>
              <div className="completion-stat">
                <div className="completion-stat__value">
                  {validationSummary.median_error_px === null
                    ? '—'
                    : `${Math.round(validationSummary.median_error_px)} px`}
                </div>
                <div className="completion-stat__label">中位验证误差</div>
              </div>
            </div>
            <p className="runtime-note">
              质量不足时结果页会明确标注，不会展示可能误导的注视热图。鼠标轨迹仍会单独记录和分析。
            </p>
            <div className="runtime-actions">
              {validationSummary.passed ? (
                <button type="button" className="btn btn--gold btn--lg" onClick={finishEyeSetup}>
                  进入正式实验
                  <ArrowRight size={16} strokeWidth={1.7} />
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn--soft" onClick={restartCalibration}>
                    <RotateCcw size={14} strokeWidth={1.7} />
                    重新校准
                  </button>
                  <button type="button" className="btn btn--primary" onClick={finishEyeSetup}>
                    仅记录鼠标，继续实验
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {screen === 'formal_ready' && block && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">Formal block · {brief.english}</span>
            <h1 className="runtime-title">正式试次即将开始</h1>
            <p className="runtime-lede">
              {brief.rule} 本 Block 共 {block.formalTrials} 个正式试次，没有逐题反馈。
            </p>
            <div className="runtime-keys">
              <span className="keycap">
                <kbd>{config.targetKey.toUpperCase()}</kbd>存在红色 O
              </span>
              <span className="keycap">
                <kbd>{config.absentKey.toUpperCase()}</kbd>不存在红色 O
              </span>
            </div>
            {eyeNotice && <p className="runtime-note">{eyeNotice}</p>}
            {eyeSetupError && (
              <p className="runtime-note" style={{ color: '#9a5c60' }}>
                摄像头未启用：{eyeSetupError} 实验将继续记录鼠标轨迹。
              </p>
            )}
            {!eyeNotice && !eyeSetupError && eyeStatusLabel && (
              <p className="runtime-note">摄像头状态：{eyeStatusLabel}。正式刺激区域不会显示摄像头画面。</p>
            )}
            <div className="runtime-actions">
              <button type="button" className="btn btn--gold btn--lg" onClick={startFormal}>
                开始正式试次
                <ArrowRight size={16} strokeWidth={1.7} />
              </button>
            </div>
            <p className="runtime-note">开始后请尽量不要刷新页面或切换标签页。进度会逐试次保存在本机。</p>
          </div>
        )}

        {screen === 'block_complete' && block && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">Block complete</span>
            <h1 className="runtime-title">本 Block 已完成</h1>
            <p className="runtime-lede">
              {brief.blockName}：{blockScores.length} / {block.formalTrials} 个正式试次
              {blockAccuracy !== null ? `，正确率 ${(blockAccuracy * 100).toFixed(0)}%` : ''}。
              三个 Block 的数据分别保存和分析，不会混合成一个条件。
            </p>
            {!isLastBlock ? (
              <>
                <p className="runtime-note">
                  下一个 Block 会先显示独立的说明页和 2 个练习试次，不会自动进入。
                </p>
                <div className="runtime-actions">
                  <button type="button" className="btn btn--gold btn--lg" onClick={completeBlock}>
                    继续下一 Block
                    <ArrowRight size={16} strokeWidth={1.7} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="runtime-note">
                  全部三个 Block 已完成。只有完成全部正式试次后，才会保存会话完成状态。
                </p>
                <div className="runtime-actions">
                  <button type="button" className="btn btn--gold btn--lg" onClick={completeBlock}>
                    完成实验并查看结果
                    <ArrowRight size={16} strokeWidth={1.7} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {showStage && (
          <div className="experiment-surface">
            <div
              className="stimulus-stage stimulus-stage--minimal"
              ref={stageRef}
              style={{ background: config.stimulusBackground }}
              role="img"
              aria-label={
                screen === 'stimulus'
                  ? '视觉搜索字母阵列'
                  : screen === 'fixation'
                    ? '注视点'
                    : screen === 'practice_feedback'
                      ? '练习反馈'
                      : '等待下一试次'
              }
            >
              {screen === 'fixation' && (
                <div
                  className="fixation-cross"
                  aria-label="注视点"
                  style={{
                    width: config.fixationCrossSizePx,
                    height: config.fixationCrossSizePx,
                  }}
                >
                  <span
                    style={{
                      height: config.fixationCrossStrokePx,
                      background: config.fixationCrossColor,
                    }}
                  />
                  <span
                    style={{
                      width: config.fixationCrossStrokePx,
                      background: config.fixationCrossColor,
                    }}
                  />
                </div>
              )}

              {screen === 'stimulus' && currentSpec && (
                <div className="vs-stage">
                  {currentSpec.items.map((item) => (
                    <span
                      key={item.id}
                      className="vs-letter"
                      style={{
                        left: `${item.xPct}%`,
                        top: `${item.yPct}%`,
                        color: item.color,
                        fontSize: config.letterSizePx,
                        fontFamily: config.stimulusFontFamily,
                        fontWeight: 400,
                        fontStyle: 'normal',
                        textShadow: 'none',
                        WebkitTextStroke: '0',
                      }}
                    >
                      {item.letter}
                    </span>
                  ))}
                </div>
              )}

              {screen === 'practice_feedback' && feedback && (
                <div className="stage-message">
                  <span
                    className={`feedback-mark ${
                      feedback.correct ? 'feedback-mark--correct' : 'feedback-mark--incorrect'
                    }`}
                  >
                    {feedback.correct ? <Check size={20} /> : <X size={20} />}
                  </span>
                  <h2>{feedback.correct ? '正确' : feedback.timedOut ? '超时' : '不正确'}</h2>
                  <p>
                    {feedback.timedOut
                      ? '本试次未在时限内作答。'
                      : feedback.correct
                        ? `反应时 ${formatMs(feedback.responseTime)}。`
                        : `正确答案：${feedback.targetPresent ? '存在红色 O' : '不存在红色 O'}。`}
                  </p>
                </div>
              )}
            </div>

            <div className="stimulus-stage__prompt">
              {screen === 'stimulus' ? (
                <>
                  <strong>阵列中是否存在红色 O？</strong>
                  <span>
                    {config.targetKey.toUpperCase()} 存在 · {config.absentKey.toUpperCase()} 不存在
                  </span>
                </>
              ) : screen === 'fixation' ? (
                <span style={{ visibility: 'hidden' }}>准备</span>
              ) : (
                <span style={{ color: 'var(--muted-light)' }}>
                  {screen === 'practice_feedback' ? '练习反馈' : ' '}
                </span>
              )}
            </div>
            <div className="trial-counter">
              {phase === 'practice' ? 'PRACTICE' : 'FORMAL'} · {blockCurrent} / {totalPerBlock}
              {block ? ` · ${brief.blockName}` : ''}
            </div>
          </div>
        )}

        {screen === 'intertrial' && (
          <span className="trial-counter" style={{ marginTop: 0 }}>
            下一试次即将开始
          </span>
        )}

        {screen === 'finishing' && (
          <div className="runtime-panel">
            {finishError ? (
              <>
                <span className="runtime-eyebrow">Save interrupted</span>
                <h1 className="runtime-title">实验尚未完成或保存需要重试</h1>
                <p className="runtime-lede">{finishError}</p>
                <div className="runtime-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void finalizeExperiment()}
                  >
                    重新保存并结束
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="runtime-eyebrow">Completing</span>
                <h1 className="runtime-title">正在整理本次实验</h1>
                <p className="runtime-lede">
                  正在确认全部正式试次并保存汇总。请不要关闭页面。
                </p>
                <div className="spinner" style={{ margin: '26px auto 0' }} />
                {sync.pending > 0 && (
                  <p className="runtime-note">
                    仍有 {sync.pending} 条记录在本机队列中，将在联网后自动上传。
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function BlockStimulusDemo({
  variant,
  targetColor,
  redColor,
  blueColor,
}: {
  variant: VisualSearchVariant;
  targetColor: string;
  redColor: string;
  blueColor: string;
}) {
  const items =
    variant === 'feature_search'
      ? [
          { letter: 'O', color: targetColor, target: true },
          { letter: 'O', color: blueColor, target: false },
          { letter: 'X', color: blueColor, target: false },
          { letter: 'O', color: blueColor, target: false },
          { letter: 'X', color: blueColor, target: false },
        ]
      : [
          { letter: 'O', color: targetColor, target: true },
          { letter: 'X', color: redColor, target: false },
          { letter: 'O', color: blueColor, target: false },
          { letter: 'X', color: redColor, target: false },
          { letter: 'O', color: blueColor, target: false },
        ];
  return (
    <div className="block-demo-stage" aria-label="Block 刺激示例">
      {items.map((item, index) => (
        <span
          key={`demo-${index}`}
          className="block-demo-letter"
          style={{ color: item.color }}
        >
          {item.letter}
        </span>
      ))}
      <p>
        {variant === 'feature_search'
          ? '红色 O 目标 · 蓝色 O / 蓝色 X 干扰项'
          : '红色 O 目标 · 红色 X / 蓝色 O 干扰项'}
      </p>
    </div>
  );
}

function getTrackerStatusLabel(tracker: GazeTracker | null): string {
  if (!tracker) return '';
  if (tracker.calibrationStatus === 'passed') {
    return `已校准（中位误差约 ${Math.round(tracker.calibrationQuality ?? 0)} px，探索性）`;
  }
  if (tracker.calibrationStatus === 'failed') return '校准未通过';
  if (tracker.status === 'declined') return '未启用（已选择仅鼠标）';
  if (tracker.status === 'unavailable') return '不可用（仅鼠标）';
  return '';
}

function normalizeConfiguredKey(key: string): string {
  if (key.startsWith('Arrow')) return key;
  return key.length === 1 ? key.toLowerCase() : key;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toScreenPoint(
  item: { xPct: number; yPct: number; xPx: number; yPx: number },
  rect: DOMRect,
) {
  return {
    screenX: round(rect.left + (item.xPct / 100) * rect.width),
    screenY: round(rect.top + (item.yPct / 100) * rect.height),
    stageX: round((item.xPct / 100) * rect.width),
    stageY: round((item.yPct / 100) * rect.height),
  };
}

function emptyMouseResult(note: string): MouseTrackingResult {
  return {
    available: false,
    sample_count: 0,
    valid_sample_count: 0,
    valid_mouse_ratio: null,
    duration_ms: 0,
    sufficient_for_metrics: false,
    path_length_px: 0,
    first_movement_direction: null,
    first_movement_angle_deg: null,
    first_movement_latency_ms: null,
    first_movement_position: null,
    first_movement_region: null,
    target_distance_normalized: null,
    target_region_relation: null,
    left_to_right_scan_ratio: null,
    right_to_left_scan_ratio: null,
    top_to_bottom_scan_ratio: null,
    bottom_to_top_scan_ratio: null,
    center_to_periphery_scan_ratio: null,
    periphery_to_center_scan_ratio: null,
    target_proximity_entered: null,
    target_first_proximity_ms: null,
    target_near_sample_ratio: null,
    samples: [],
    note,
  };
}

function emptyEyeCapture(): EyeCaptureResult {
  return {
    samples: [],
    valid_gaze_ratio: null,
    eye_tracking_status: 'not_requested',
    calibration_status: 'not_applicable',
    calibration_quality: null,
  };
}
