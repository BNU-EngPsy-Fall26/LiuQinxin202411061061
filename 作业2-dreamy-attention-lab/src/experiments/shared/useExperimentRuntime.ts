import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BlockType,
  CalibrationStatus,
  CompletionSubmission,
  ExperimentConfig,
  ExperimentId,
  ExperimentPhase,
  EyeTrackingStatus,
  GazeSampleInput,
  MouseSampleInput,
  RegionNumber,
  SessionSummary,
  TrialSubmission,
} from '@shared/types';
import {
  queueCompletion,
  queueSession,
  queueTrial,
} from '@/services/offlineQueue';
import {
  clearActiveSession,
  collectEnvironment,
  getOrCreateActiveSession,
  saveLocalSummary,
} from '@/services/localStore';
import { bufferHw2Trial } from '@/services/hw2Upload';

export interface TrialDraft {
  trialId?: string;
  blockId: string;
  blockName?: string | null;
  blockType: BlockType;
  conditionId: string;
  trialIndex: number;
  phase: ExperimentPhase;
  stimulusOnset: number;
  responseTime: number | null;
  response: string | null;
  correct: boolean | null;
  targetPresent?: boolean | null;
  targetRegion?: RegionNumber | null;
  targetX?: number | null;
  targetY?: number | null;
  setSize?: number | null;
  stimulusType?: string | null;
  plannedFormalTrials?: number | null;
  completedFormalTrials?: number | null;
  windowBlur?: boolean;
  gazeAvailable?: boolean;
  gazeQuality?: string | null;
  timeout: boolean;
  invalidResponse: boolean;
  eyeTrackingStatus?: EyeTrackingStatus;
  calibrationStatus?: CalibrationStatus;
  calibrationQuality?: number | null;
  validGazeRatio?: number | null;
  validMouseRatio?: number | null;
  stimulus: Record<string, unknown>;
  responseData: Record<string, unknown>;
  tracking: Record<string, unknown>;
  metadata: Record<string, unknown>;
  gazeSamples?: GazeSampleInput[];
  mouseSamples?: MouseSampleInput[];
}

export interface ExperimentRuntime {
  sessionId: string;
  startedAt: string;
  sessionSeed: string;
  ensureSession: () => Promise<void>;
  recordTrial: (draft: TrialDraft) => Promise<TrialSubmission>;
  complete: (summary: SessionSummary) => Promise<string>;
  hasCompleted: boolean;
}

function makeId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((byte, index) => {
      const value = index === 6 ? (byte & 0x0f) | 0x40 : index === 8 ? (byte & 0x3f) | 0x80 : byte;
      return value.toString(16).padStart(2, '0');
    })
    .join('')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

export function useExperimentRuntime({
  participantId,
  experimentId,
  config,
  configVersion,
}: {
  participantId: string;
  experimentId: ExperimentId;
  config: ExperimentConfig;
  configVersion: number;
}): ExperimentRuntime {
  const initialSession = useRef(
    getOrCreateActiveSession(participantId, experimentId, configVersion),
  );
  const sessionIdRef = useRef<string>(initialSession.current.session_id);
  const startedAtRef = useRef<string>(initialSession.current.started_at);
  const seedRef = useRef<string>(initialSession.current.seed);
  const sessionPromiseRef = useRef<Promise<void> | null>(null);
  const hasCompletedRef = useRef(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const environmentRef = useRef<Record<string, unknown> | null>(null);

  const ensureSession = useCallback((): Promise<void> => {
    if (sessionPromiseRef.current) return sessionPromiseRef.current;
    if (!environmentRef.current) {
      environmentRef.current = collectEnvironment(config);
    }
    const payload = {
      session_id: sessionIdRef.current,
      participant_id: participantId,
      experiment_id: experimentId,
      started_at: startedAtRef.current,
      completed_at: null,
      status: 'in_progress' as const,
      config_version: configVersion,
      config_snapshot: config,
      environment: environmentRef.current,
    };
    sessionPromiseRef.current = queueSession(payload);
    return sessionPromiseRef.current;
  }, [config, configVersion, experimentId, participantId]);

  useEffect(() => {
    void ensureSession();
  }, [ensureSession]);

  const recordTrial = useCallback(
    async (draft: TrialDraft): Promise<TrialSubmission> => {
      await ensureSession();
      const submission: TrialSubmission = {
        participant_id: participantId,
        experiment_id: experimentId,
        session_id: sessionIdRef.current,
        trial_id: draft.trialId ?? makeId(),
        block_id: draft.blockId,
        block_name: draft.blockName ?? null,
        block_type: draft.blockType,
        condition_id: draft.conditionId,
        trial_index: draft.trialIndex,
        phase: draft.phase,
        stimulus_onset: draft.stimulusOnset,
        response_time: draft.responseTime,
        response: draft.response,
        correct: draft.correct,
        target_present: draft.targetPresent ?? null,
        target_region: draft.targetRegion ?? null,
        target_x: draft.targetX ?? null,
        target_y: draft.targetY ?? null,
        set_size: draft.setSize ?? null,
        stimulus_type: draft.stimulusType ?? null,
        planned_formal_trials: draft.plannedFormalTrials ?? null,
        completed_formal_trials: draft.completedFormalTrials ?? null,
        window_blur: draft.windowBlur ?? false,
        gaze_available: draft.gazeAvailable ?? false,
        gaze_quality: draft.gazeQuality ?? null,
        timestamp: new Date().toISOString(),
        timeout: draft.timeout,
        invalid_response: draft.invalidResponse,
        eye_tracking_status: draft.eyeTrackingStatus ?? 'not_requested',
        calibration_status: draft.calibrationStatus ?? 'not_applicable',
        calibration_quality: draft.calibrationQuality ?? null,
        valid_gaze_ratio: draft.validGazeRatio ?? null,
        valid_mouse_ratio: draft.validMouseRatio ?? null,
        stimulus: draft.stimulus,
        response_data: draft.responseData,
        tracking: draft.tracking,
        metadata: draft.metadata,
        gaze_samples: draft.gazeSamples,
        mouse_samples: draft.mouseSamples,
      };
      // Keep a compact, upload-ready copy for the course platform. Raw gaze
      // and mouse samples remain in the project's own trial record.
      bufferHw2Trial(experimentId, sessionIdRef.current, submission);
      await queueTrial(submission);
      return submission;
    },
    [ensureSession, experimentId, participantId],
  );

  const complete = useCallback(
    async (summary: SessionSummary): Promise<string> => {
      if (hasCompletedRef.current) return sessionIdRef.current;
      hasCompletedRef.current = true;
      await ensureSession();
      const completedAt = new Date().toISOString();
      const payload: CompletionSubmission = {
        session_id: sessionIdRef.current,
        completed_at: completedAt,
        summary,
      };
      saveLocalSummary(sessionIdRef.current, summary, experimentId);
      await queueCompletion(payload);
      clearActiveSession(participantId, experimentId, sessionIdRef.current);
      setHasCompleted(true);
      return sessionIdRef.current;
    },
    [ensureSession, experimentId, participantId],
  );

  return {
    sessionId: sessionIdRef.current,
    startedAt: startedAtRef.current,
    sessionSeed: seedRef.current,
    ensureSession,
    recordTrial,
    complete,
    hasCompleted,
  };
}
