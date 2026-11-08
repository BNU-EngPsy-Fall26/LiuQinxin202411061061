import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowRight,
  Check,
  Compass,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  ExperimentBlockConfig,
  ExperimentPhase,
  MapAlignmentConfig,
  MapVariant,
  RelativeDirection,
  SessionSummary,
} from '@shared/types';
import { buildBlockRuns, type BlockRun } from '@shared/blocks';
import { ExperimentTopBar } from '@/components/experiment/ExperimentTopBar';
import {
  afterPaint,
  formatMs,
  isEditableTarget,
  monotonicNow,
  normalizeKey,
} from '@/utils/timing';
import { hashString, randomSeed } from '@/utils/random';
import { getParticipantId } from '@/services/localStore';
import { configKeyLabel } from '@/experiments/shared/keys';
import { useAttentionMonitor } from '@/experiments/shared/useAttentionMonitor';
import type { ExperimentRuntime } from '@/experiments/shared/useExperimentRuntime';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import {
  generateMapTrials,
  RELATIVE_DIRECTIONS,
  summarizeMapAlignment,
  type MapScore,
  type MapTrialSpec,
} from './generator';
import { MapScene } from './MapScene';

type Screen =
  | 'practice_intro'
  | 'fixation'
  | 'question'
  | 'practice_feedback'
  | 'practice_complete'
  | 'formal_block_intro'
  | 'block_rest'
  | 'intertrial'
  | 'finishing';

interface PracticeFeedback {
  correct: boolean;
  timedOut: boolean;
  response: RelativeDirection | null;
  expected: RelativeDirection;
  responseTime: number | null;
}

const RELATIVE_LABEL: Record<RelativeDirection, string> = {
  front: '前方',
  back: '后方',
  left: '左方',
  right: '右方',
};

const DIRECTION_KEYS = RELATIVE_DIRECTIONS.map((direction) => direction.key);

export function MapAlignmentTask({
  config,
  runtime,
  onComplete,
}: {
  config: MapAlignmentConfig;
  runtime: ExperimentRuntime;
  onComplete: (summary: SessionSummary, sessionId: string) => void;
}) {
  const seedRef = useRef(randomSeed());
  const participantIdRef = useRef(getParticipantId() ?? 'anonymous');
  const counterbalanceFlip = useMemo(
    () => hashString(participantIdRef.current) % 2 === 1,
    [],
  );
  const enabledBlocks = useMemo(() => {
    const active = config.blocks
      .filter((block) => block.enabled)
      .sort((a, b) => a.order - b.order) as Array<
      ExperimentBlockConfig<MapVariant>
    >;
    // Alternate the two cue-condition blocks by participant ID so the
    // condition order is counterbalanced across the sample.
    const ordered = counterbalanceFlip ? [...active].reverse() : active;
    return ordered.map((block, index) => ({ ...block, order: index }));
  }, [config.blocks, counterbalanceFlip]);
  const blockConfig = useMemo(
    () => ({ ...config, blocks: enabledBlocks, randomizeBlockOrder: false }),
    [config, enabledBlocks],
  );
  const practiceRuns = useMemo<
    Array<{ block: ExperimentBlockConfig<MapVariant>; trials: MapTrialSpec[] }>
  >(() => {
    const perBlock = Math.max(
      1,
      Math.round(config.practiceTrials / Math.max(enabledBlocks.length, 1)),
    );
    return enabledBlocks.map((block, blockIndex) => ({
      block,
      trials: generateMapTrials({
        config,
        phase: 'practice',
        count: perBlock,
        seed: `${seedRef.current}:practice:${block.block_id}`,
        block,
        blockPresentationOrder: blockIndex + 1,
      }),
    }));
  }, [config, enabledBlocks]);
  const formalRuns = useMemo<BlockRun<MapTrialSpec>[]>(
    () =>
      buildBlockRuns(blockConfig, `${seedRef.current}:formal`, (block, count) => {
        const blockIndex = enabledBlocks.findIndex(
          (candidate) => candidate.block_id === block.block_id,
        );
        return generateMapTrials({
          config,
          phase: 'formal',
          count,
          seed: `${seedRef.current}:formal`,
          block: block as ExperimentBlockConfig<MapVariant>,
          blockPresentationOrder: blockIndex + 1,
        });
      }),
    [blockConfig, config, enabledBlocks],
  );
  const formalTrials = useMemo(
    () => formalRuns.flatMap((run) => run.trials),
    [formalRuns],
  );

  const [screen, setScreen] = useState<Screen>('practice_intro');
  const [phase, setPhase] = useState<ExperimentPhase>('practice');
  const [index, setIndex] = useState(0);
  const [blockRunIndex, setBlockRunIndex] = useState(0);
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [finishError, setFinishError] = useState('');
  const sync = useSyncStatus();

  const mapFrameRef = useRef<HTMLDivElement>(null);
  const stageRectRef = useRef<DOMRect | null>(null);
  const mapOnsetRef = useRef<number | null>(null);
  const questionOnsetRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const invalidKeysRef = useRef<string[]>([]);
  const formalScoresRef = useRef<MapScore[]>([]);
  const practiceScoresRef = useRef<MapScore[]>([]);
  const lastSaveRef = useRef<Promise<void> | null>(null);
  const completedRef = useRef(false);
  const practiceCompletedRef = useRef(false);
  const attentionMonitor = useAttentionMonitor();
  const attentionRef = useRef(attentionMonitor);
  attentionRef.current = attentionMonitor;

  const currentRun =
    phase === 'practice'
      ? practiceRuns[blockRunIndex] ?? null
      : formalRuns[blockRunIndex] ?? null;
  const currentBlock = currentRun?.block ?? null;
  const trials = currentRun?.trials ?? [];
  const currentSpec = trials[index] ?? null;

  const stateRef = useRef({
    screen,
    phase,
    index,
    blockRunIndex,
    currentSpec,
    currentBlock,
    currentRun,
  });
  stateRef.current = {
    screen,
    phase,
    index,
    blockRunIndex,
    currentSpec,
    currentBlock,
    currentRun,
  };

  const keyMap = useMemo(() => {
    const map = new Map<string, RelativeDirection>();
    for (const direction of DIRECTION_KEYS) {
      map.set(normalizeConfiguredKey(config.keys[direction]), direction);
    }
    return map;
  }, [config.keys]);

  const finishTrial = useCallback(
    (response: RelativeDirection | null, timedOut: boolean) => {
      if (lockedRef.current) return;
      const state = stateRef.current;
      const spec = state.currentSpec;
      const block = state.currentBlock;
      if (!spec || !block || state.screen !== 'question') return;
      const questionOnset = questionOnsetRef.current;
      if (questionOnset === null) return;
      lockedRef.current = true;

      const responseTime = timedOut
        ? null
        : Math.max(0, monotonicNow() - questionOnset);
      const monitor = attentionRef.current;
      const attentionSnapshot = monitor.snapshot();
      monitor.disarmTrial();
      const invalidKeys = [...invalidKeysRef.current];
      const correct = response !== null && response === spec.targetDirection;
      const stageRect = stageRectRef.current;
      const mapOnset = mapOnsetRef.current;
      const currentPhase = state.phase;
      const currentIndex = state.index;
      const run = state.currentRun;
      const globalFormalIndex =
        formalRuns
          .slice(0, state.blockRunIndex)
          .reduce((total, item) => total + item.trials.length, 0) +
        currentIndex +
        1;
      const blockTrialIndex = currentIndex + 1;
      const blockTrialCount = run?.trials.length ?? currentIndex + 1;

      const draft = {
        trialId: spec.id,
        blockId: block.block_id,
        blockType: block.block_type,
        conditionId: spec.conditionId,
        trialIndex: currentPhase === 'formal' ? globalFormalIndex : blockTrialIndex,
        phase: currentPhase,
        stimulusOnset: questionOnset,
        responseTime,
        response,
        correct,
        timeout: timedOut,
        invalidResponse: invalidKeys.length > 0,
        stimulus: {
          map_protocol_version: 4,
          alignment: spec.alignment,
          person_cue: spec.cue,
          cue_condition: block.variant,
          block_presentation_order: state.blockRunIndex + 1,
          block_trial_index: blockTrialIndex,
          block_order: formalRuns.map((item) => item.block.variant),
          condition_cell: spec.conditionId,
          heading: spec.heading,
          heading_deg: spec.headingDeg,
          heading_label_zh: spec.headingZh,
          facing_building: spec.facingBuilding,
          facing_building_zh: spec.facingBuildingZh,
          facing_building_world_bearing_deg: spec.facingBuildingWorldBearingDeg,
          facing_building_screen_bearing_deg: spec.facingBuildingScreenBearingDeg,
          rotation_deg: spec.headingDeg,
          map_rotation_deg: spec.mapRotationDeg,
          compass_north_screen_deg: spec.compassNorthScreenDeg,
          person_screen_heading_deg: spec.personScreenHeadingDeg,
          target_building: spec.targetBuilding,
          target_building_zh: spec.targetBuildingZh,
          target_direction: spec.targetDirection,
          correct_answer: spec.targetDirection,
          target_world_bearing_deg: spec.targetWorldBearingDeg,
          target_screen_bearing_deg: spec.targetScreenBearingDeg,
          target_radius_in_viewbox: spec.targetRadius,
          target_local_position: {
            x: spec.targetLocalX,
            y: spec.targetLocalY,
          },
          target_screen_position: {
            x: spec.targetScreenX,
            y: spec.targetScreenY,
          },
          map_viewbox: 560,
          map_size_px_config: config.mapSizePx,
          cue_size_px_config: config.cueSizePx,
          rendered_stage_rect: stageRect
            ? {
                width: round(stageRect.width),
                height: round(stageRect.height),
                top: round(stageRect.top),
                left: round(stageRect.left),
              }
            : null,
          rng_seed: spec.rngSeed,
          device_pixel_ratio: window.devicePixelRatio,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        },
        responseData: {
          key: response,
          participant_response: response,
          correct_answer: spec.targetDirection,
          expected_direction: spec.targetDirection,
          key_binding: config.keys,
          invalid_keys: invalidKeys,
          timed_out: timedOut,
          map_onset_before_response_ms:
            mapOnset === null ? null : round(questionOnset - mapOnset),
        },
        tracking: {
          eye_tracking: {
            available: false,
            status: 'not_requested',
            reason: 'not_applicable',
            calibration_quality: null,
            note:
              'Camera eye tracking is only used in the visual-search task. Keyboard responses are not gaze.',
          },
          mouse_used_for_response: false,
          attention: attentionSnapshot,
        },
        metadata: {
          phase: currentPhase,
          block_id: block.block_id,
          block_type: block.block_type,
          block_label: block.label,
          block_variant: block.variant,
          cue_condition: block.variant,
          block_presentation_order: state.blockRunIndex + 1,
          block_trial_index: blockTrialIndex,
          block_trial_count: blockTrialCount,
          resolved_block_order: formalRuns.map((item) => item.block.block_id),
          trial_number_within_phase: currentIndex + 1,
          session_seed: seedRef.current,
          fixation_duration_ms: config.fixationDurationMs,
          response_deadline_ms: null,
          map_onset_ms: mapOnset,
          stimulus_onset_definition:
            'map, heading text and question are painted together; the response clock starts at that paint and keys are accepted immediately',
          timing_clock: 'performance.now()',
          condition_order: formalRuns.map((item) => item.block.variant),
          counterbalance_flip: counterbalanceFlip,
          alignment_definition:
            'The map orientation is fixed. Heading 0 degrees means the participant faces the building at map top (aligned); headings 90, 180 and 270 degrees mean facing the building at map right, bottom and left (misaligned).',
          map_rotation_convention:
            'The campus map, building labels, and compass never rotate. Only the participant heading changes between trials.',
          cue_definition:
            'none = ordinary red location marker at map centre; person = top-down person at map centre whose body and head point toward the named facing building. The person provides orientation information only and never changes the correct answer.',
          browser_timing_note:
            'Onsets are captured after two animation frames with performance.now(); browser display latency is not photodiode-verified.',
        },
      };

      const savePromise = runtime
        .recordTrial(draft)
        .then(() => undefined)
        .catch((error: unknown) => {
          console.error('map alignment trial save failed', error);
        });
      lastSaveRef.current = savePromise;

      const score: MapScore = {
        trialIndex:
          currentPhase === 'formal' ? globalFormalIndex : blockTrialIndex,
        blockId: block.block_id,
        blockType: block.block_type,
        blockPresentationOrder: state.blockRunIndex + 1,
        variant: block.variant as MapVariant,
        alignment: spec.alignment,
        cue: spec.cue,
        rotationDeg: spec.headingDeg,
        targetBuilding: spec.targetBuilding,
        targetBuildingZh: spec.targetBuildingZh,
        targetDirection: spec.targetDirection,
        response,
        correct,
        responseTime,
        timeout: timedOut,
      };

      if (currentPhase === 'formal') {
        formalScoresRef.current.push(score);
        const isBlockComplete =
          currentIndex + 1 >= (run?.trials.length ?? 0);
        if (isBlockComplete) {
          setScreen('block_rest');
        } else {
          setScreen('intertrial');
        }
      } else {
        practiceScoresRef.current.push(score);
        setFeedback({
          correct,
          timedOut,
          response,
          expected: spec.targetDirection,
          responseTime,
        });
        setScreen('practice_feedback');
      }
    },
    [config, formalRuns, runtime],
  );

  const finishRef = useRef(finishTrial);
  finishRef.current = finishTrial;

  // Fixation interval; no preview pause follows it.
  useEffect(() => {
    if (screen !== 'fixation') return;
    lockedRef.current = false;
    mapOnsetRef.current = null;
    questionOnsetRef.current = null;
    invalidKeysRef.current = [];
    const timer = window.setTimeout(() => {
      setScreen('question');
    }, config.fixationDurationMs);
    return () => window.clearTimeout(timer);
  }, [screen, index, phase, config.fixationDurationMs]);

  // Map, heading and question are painted together. The response clock and
  // keyboard acceptance begin at that paint; there is no deadline.
  useEffect(() => {
    if (screen !== 'question' || !currentSpec) return;
    let active = true;
    const cancelFrames = afterPaint((now) => {
      if (!active) return;
      if (questionOnsetRef.current === null) {
        mapOnsetRef.current = now;
        questionOnsetRef.current = now;
        stageRectRef.current =
          mapFrameRef.current?.getBoundingClientRect() ?? null;
        attentionRef.current.armTrial();
      }
    });
    return () => {
      active = false;
      cancelFrames();
    };
  }, [screen, currentSpec]);

  // Direction responses are accepted only during the question phase.
  useEffect(() => {
    if (screen !== 'question') return;
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (questionOnsetRef.current === null) return;
      const key = normalizeKey(event);
      const direction = keyMap.get(key);
      if (direction) {
        event.preventDefault();
        finishRef.current(direction, false);
        return;
      }
      if (
        ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(
          event.key,
        ) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key.startsWith('Arrow') || event.key.length === 1) {
        if (event.key.startsWith('Arrow') || event.key === ' ') {
          event.preventDefault();
        }
        invalidKeysRef.current.push(key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen, keyMap]);

  // Practice feedback auto-advances; feedback is never shown in formal trials.
  useEffect(() => {
    if (screen !== 'practice_feedback') return;
    const timer = window.setTimeout(() => {
      if (index + 1 < trials.length) {
        setIndex(index + 1);
        setScreen('fixation');
      } else {
        practiceCompletedRef.current = true;
        setScreen('practice_complete');
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [screen, index, trials.length]);

  const finalizeExperiment = useCallback(async () => {
    if (completedRef.current) return;
    setFinishError('');
    try {
      await lastSaveRef.current;
      await runtime.ensureSession();
      const summary = summarizeMapAlignment(
        formalScoresRef.current,
        formalTrials.length,
        practiceCompletedRef.current,
      );
      const sessionId = await runtime.complete(summary);
      completedRef.current = true;
      onComplete(summary, sessionId);
    } catch (error) {
      console.error('map alignment finalization failed', error);
      setFinishError(
        error instanceof Error ? error.message : '实验结束数据保存失败，请重试。',
      );
    }
  }, [formalTrials.length, onComplete, runtime]);

  const finalizeRef = useRef(finalizeExperiment);
  finalizeRef.current = finalizeExperiment;

  // Inter-trial interval; the next trial starts with a fixation cross.
  useEffect(() => {
    if (screen !== 'intertrial') return;
    const delay = Math.max(120, config.postTrialDelayMs);
    const timer = window.setTimeout(() => {
      if (index + 1 < trials.length) {
        setIndex(index + 1);
        setScreen('fixation');
      } else {
        setScreen('block_rest');
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [screen, index, trials.length, config.postTrialDelayMs]);

  // Warn before accidental page unload during the formal phase.
  useEffect(() => {
    if (phase !== 'formal' || screen === 'finishing') return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase, screen]);

  const beginExperiment = () => {
    setBlockRunIndex(0);
    setPhase('practice');
    setIndex(0);
    setFeedback(null);
    setScreen('formal_block_intro');
  };

  const beginBlockPractice = () => {
    if (!currentRun || currentRun.trials.length === 0) {
      practiceCompletedRef.current = true;
      setPhase('formal');
      setIndex(0);
      setScreen('fixation');
      return;
    }
    setPhase('practice');
    setIndex(0);
    setFeedback(null);
    setScreen('fixation');
  };

  const repeatPractice = () => {
    if (currentBlock) {
      practiceScoresRef.current = practiceScoresRef.current.filter(
        (score) => score.blockId !== currentBlock.block_id,
      );
    }
    practiceCompletedRef.current = false;
    beginBlockPractice();
  };

  const beginBlockFormal = () => {
    setPhase('formal');
    setIndex(0);
    setFeedback(null);
    setScreen('fixation');
  };

  const continueAfterRest = () => {
    const nextIndex = blockRunIndex + 1;
    if (nextIndex < formalRuns.length) {
      setBlockRunIndex(nextIndex);
      setPhase('practice');
      setIndex(0);
      setFeedback(null);
      setScreen('formal_block_intro');
    } else {
      setScreen('finishing');
      void finalizeRef.current();
    }
  };

  const currentPracticeScores = practiceScoresRef.current.filter(
    (score) => score.blockId === currentBlock?.block_id,
  );
  const practiceAccuracy =
    currentPracticeScores.length > 0
      ? currentPracticeScores.filter((score) => score.correct).length /
        currentPracticeScores.length
      : null;
  const practiceTimed = currentPracticeScores.filter(
    (score) => score.correct && score.responseTime !== null,
  );
  const practiceMeanRt =
    practiceTimed.length > 0
      ? practiceTimed.reduce((sum, score) => sum + (score.responseTime ?? 0), 0) /
        practiceTimed.length
      : null;

  const total = trials.length;
  const showStage =
    screen === 'fixation' ||
    screen === 'question' ||
    screen === 'practice_feedback';
  const currentForBar =
    screen === 'practice_intro' || screen === 'formal_block_intro'
      ? 0
      : screen === 'practice_complete' || screen === 'finishing'
        ? total
        : Math.min(index + 1, total);
  const headingBarVisible =
    screen === 'question' || screen === 'practice_feedback';
  const blockCurrent = Math.min(index + 1, total);
  const completedRun = formalRuns[blockRunIndex] ?? null;
  const nextRun = formalRuns[blockRunIndex + 1] ?? null;
  const completedScores = formalScoresRef.current.filter(
    (score) => score.blockId === completedRun?.block.block_id,
  );
  const completedAccuracy =
    completedScores.length > 0
      ? completedScores.filter((score) => score.correct).length /
        completedScores.length
      : null;

  return (
    <div className="experiment-page">
      <ExperimentTopBar
        title="地图定向"
        phase={phase}
        current={currentForBar}
        total={total}
        blockLabel={
          currentBlock
            ? `Block ${blockRunIndex + 1} · ${currentBlock.label}`
            : undefined
        }
        blockCurrent={blockCurrent}
        blockTotal={total}
        allowExit={screen !== 'fixation' && screen !== 'question'}
      />
      <main className="experiment-main">
        {screen === 'practice_intro' && (
          <div className="runtime-panel">
            <span className="practice-badge">Practice · 练习阶段</span>
            <h1 className="runtime-title">指定建筑在你的哪个方向</h1>
            <p className="runtime-lede">
              校园地图中央是你的位置，地图方向固定。每次会用文字告诉你正面朝哪一栋建筑，
              带金色标记的建筑是目标。请判断目标建筑相对你面朝方向的前、后、左、右。
              每个 Block 先做有反馈的练习，再进入正式试次。
            </p>
            <div className="runtime-keys">
              {RELATIVE_DIRECTIONS.map((direction) => (
                <span className="keycap" key={direction.key}>
                  <kbd>{configKeyLabel(config.keys[direction.key])}</kbd>
                  {direction.zh}
                </span>
              ))}
            </div>
            <p className="runtime-note">
              共 {formalRuns.length} 个 Block，每个 Block 2 次练习 + 15 个正式试次。
              无人物线索和人物线索的先后顺序在被试间平衡。
            </p>
            <div className="runtime-actions">
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={beginExperiment}
              >
                开始 Block 1 · {enabledBlocks[0]?.label ?? '练习'}
                <ArrowRight size={16} strokeWidth={1.7} />
              </button>
            </div>
            <p className="runtime-note">
              {sync.online ? '数据会自动保存。' : '当前处于离线状态，数据将暂存在本机。'}
            </p>
          </div>
        )}

        {screen === 'practice_complete' && (
          <div className="runtime-panel">
            <span className="practice-badge">Practice complete</span>
            <h1 className="runtime-title">练习完成</h1>
            <p className="runtime-lede">
              Block {blockRunIndex + 1} · {currentBlock?.label ?? '当前条件'}：
              你已完成 {currentPracticeScores.length} 个练习试次
              {practiceAccuracy !== null
                ? `，练习正确率为 ${(practiceAccuracy * 100).toFixed(0)}%`
                : ''}
              {practiceMeanRt !== null
                ? `，正确反应平均 ${Math.round(practiceMeanRt)} ms`
                : ''}
              。练习不计入正式数据。
            </p>
            <div className="runtime-actions">
              <button type="button" className="btn btn--soft" onClick={repeatPractice}>
                <RotateCcw size={14} strokeWidth={1.7} />
                再练习一次
              </button>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={beginBlockFormal}
              >
                开始本 Block 正式试次
                <ArrowRight size={16} strokeWidth={1.7} />
              </button>
            </div>
            <p className="runtime-note">
              本 Block 共 {currentBlock?.formalTrials ?? 15} 个正式试次，包含
              0°、90°、180°、270° 四种朝向。地图、朝向文字和问题会同时出现，
              出现后即可按键，没有倒计时。
            </p>
          </div>
        )}

        {screen === 'formal_block_intro' && currentBlock && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">
              Block {Math.min(blockRunIndex + 1, formalRuns.length)} / {formalRuns.length}
            </span>
            <h1 className="runtime-title">
              Block {blockRunIndex + 1} · {currentBlock.label}
            </h1>
            <p className="runtime-lede">
              {currentBlock.variant === 'person_cue'
                ? '地图中央有一个俯视人物，人物朝向与文字提示一致。'
                : '地图中央只有普通红色位置标记。'}
              {' '}地图方向固定，但每次的朝向不同，可能是 0°、90°、180° 或 270°；
              建筑名称始终正立。先完成 2 次有反馈练习，再进入{' '}
              {currentBlock.formalTrials} 个正式试次。
            </p>
            <div className="runtime-keys">
              {RELATIVE_DIRECTIONS.map((direction) => (
                <span className="keycap" key={direction.key}>
                  <kbd>{configKeyLabel(config.keys[direction.key])}</kbd>
                  {direction.zh}
                </span>
              ))}
            </div>
            <div className="block-list">
              {formalRuns.map((run, runIndex) => (
                <span
                  key={run.block.block_id}
                  className={`block-chip${runIndex === blockRunIndex ? ' is-current' : ''}${
                    runIndex < blockRunIndex ? ' is-done' : ''
                  }`}
                >
                  Block {runIndex + 1} · {run.block.label}
                  <small>{runIndex < blockRunIndex ? '已完成' : runIndex === blockRunIndex ? '当前' : '稍后'}</small>
                </span>
              ))}
            </div>
            <div className="runtime-actions">
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={beginBlockPractice}
              >
                开始本 Block 练习
                <ArrowRight size={16} strokeWidth={1.7} />
              </button>
            </div>
            <p className="runtime-note">
              练习有反馈；正式试次无反馈。问题出现后立即可以按键，不设作答倒计时。
            </p>
          </div>
        )}

        {screen === 'block_rest' && completedRun && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">Block complete · 休息</span>
            <h1 className="runtime-title">本 Block 已完成</h1>
            <p className="runtime-lede">
              Block {blockRunIndex + 1} · {completedRun.block.label}：
              {completedScores.length} / {completedRun.block.formalTrials} 个正式试次
              {completedAccuracy !== null
                ? `，正确率 ${(completedAccuracy * 100).toFixed(0)}%`
                : ''}
              。数据按实际线索条件保存。
            </p>
            {nextRun ? (
              <>
                <p className="runtime-note">
                  下一个 Block：Block {blockRunIndex + 2} · {nextRun.block.label}
                  （先 2 次练习，再 {nextRun.block.formalTrials} 个正式试次）。
                </p>
                <div className="runtime-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    onClick={continueAfterRest}
                  >
                    继续下一 Block
                    <ArrowRight size={16} strokeWidth={1.7} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="runtime-note">全部 Block 已完成，接下来整理并保存数据。</p>
                <div className="runtime-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    onClick={continueAfterRest}
                  >
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
            <div className="map-stage">
              <div
                className="map-heading-bar"
                style={{ visibility: headingBarVisible ? 'visible' : 'hidden' }}
              >
                <Compass size={13} strokeWidth={1.6} />
                {currentSpec ? (
                  <span>
                    你正面朝 <strong>{currentSpec.facingBuildingZh}</strong>
                    <span style={{ marginLeft: 14, color: 'var(--muted-light)' }}>
                      目标：{currentSpec.targetBuildingZh} · 右上角指南针指向北
                    </span>
                  </span>
                ) : (
                  <span>你正面朝 —</span>
                )}
              </div>

              <div
                className="map-frame"
                ref={mapFrameRef}
                style={{
                  width: `min(86vw, ${config.mapSizePx}px, 58vh)`,
                }}
              >
                {screen === 'fixation' || !currentSpec ? (
                  <div className="fixation" aria-label="注视点">
                    +
                  </div>
                ) : (
                  <MapScene spec={currentSpec} cueSizePx={config.cueSizePx} />
                )}
              </div>

              <div className="map-question" aria-live="polite">
                {screen === 'question' && (
                  <>
                    <strong>
                      {currentSpec
                        ? `「${currentSpec.targetBuildingZh}」位于你的哪个方向？`
                        : '目标建筑位于你的哪个方向？'}
                    </strong>
                    <span>按方向键作答 · 只需判断相对方向</span>
                  </>
                )}
                {screen === 'practice_feedback' && feedback && (
                  <>
                    <strong
                      style={{
                        color: feedback.correct ? '#4f7760' : '#9a5c60',
                      }}
                    >
                      {feedback.correct ? (
                        <span
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
                        >
                          <Check size={18} strokeWidth={2} /> 正确
                        </span>
                      ) : (
                        <span
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
                        >
                          <X size={18} strokeWidth={2} />
                          {feedback.timedOut ? '超时' : '不正确'}
                        </span>
                      )}
                    </strong>
                    <span>
                      {feedback.timedOut
                        ? `本试次未在时限内作答。正确方向：${RELATIVE_LABEL[feedback.expected]}。`
                        : feedback.correct
                          ? `反应时 ${formatMs(feedback.responseTime)}。`
                          : `你选择了${RELATIVE_LABEL[feedback.response ?? feedback.expected]}，正确方向是${RELATIVE_LABEL[feedback.expected]}。`}
                    </span>
                  </>
                )}
                {screen === 'fixation' && (
                  <strong style={{ visibility: 'hidden' }}>准备</strong>
                )}
              </div>

              <div className="map-key-guide">
                {RELATIVE_DIRECTIONS.map((direction) => (
                  <span className="map-key" key={direction.key}>
                    <kbd>{configKeyLabel(config.keys[direction.key])}</kbd>
                    {direction.zh}
                  </span>
                ))}
              </div>
            </div>

            <div className="trial-counter" style={{ marginTop: 14 }}>
              {phase === 'practice' ? 'PRACTICE' : 'FORMAL'} ·{' '}
              {Math.min(index + 1, total)} / {total}
              {currentBlock
                ? ` · Block ${blockRunIndex + 1} · ${currentBlock.label}`
                : ''}
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
                <h1 className="runtime-title">数据保存需要重试</h1>
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
                  正在保存汇总并确认逐试次数据。请不要关闭页面。
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

function normalizeConfiguredKey(key: string): string {
  if (key.startsWith('Arrow')) return key;
  return key.length === 1 ? key.toLowerCase() : key;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
