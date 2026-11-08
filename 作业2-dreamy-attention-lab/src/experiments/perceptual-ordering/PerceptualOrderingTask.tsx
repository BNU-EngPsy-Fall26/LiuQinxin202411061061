import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { ArrowRight, Check, RotateCcw, Send, X } from 'lucide-react';
import type {
  ExperimentBlockConfig,
  ExperimentPhase,
  OrderingVariant,
  PerceptualOrderingConfig,
  SessionSummary,
} from '@shared/types';
import { buildBlockRuns, type BlockRun } from '@shared/blocks';
import { ExperimentTopBar } from '@/components/experiment/ExperimentTopBar';
import {
  afterPaint,
  formatMs,
  monotonicNow,
} from '@/utils/timing';
import { randomSeed } from '@/utils/random';
import { useAttentionMonitor } from '@/experiments/shared/useAttentionMonitor';
import type { ExperimentRuntime } from '@/experiments/shared/useExperimentRuntime';
import {
  generateOrderingTrials,
  summarizeOrdering,
  type OrderingMove,
  type OrderingScore,
  type OrderingTrialSpec,
} from './generator';

type Screen =
  | 'practice_intro'
  | 'trial'
  | 'practice_feedback'
  | 'practice_complete'
  | 'formal_block_intro'
  | 'block_rest'
  | 'intertrial'
  | 'finishing';

interface Feedback {
  correct: boolean;
  timedOut: boolean;
  placed: number;
  correctPositions: number;
  total: number;
  positionError: number;
  responseTime: number | null;
}

interface Geometry {
  width: number;
  height: number;
}

export function PerceptualOrderingTask({
  config,
  runtime,
  onComplete,
}: {
  config: PerceptualOrderingConfig;
  runtime: ExperimentRuntime;
  onComplete: (summary: SessionSummary, sessionId: string) => void;
}) {
  const seedRef = useRef(randomSeed());
  const originalBlock = useMemo(
    () =>
      (config.blocks.find((block) => block.block_type === 'original_block') ??
        config.blocks[0]) as ExperimentBlockConfig<OrderingVariant> | undefined,
    [config.blocks],
  );
  const [practiceTrials] = useState<OrderingTrialSpec[]>(() =>
    originalBlock
      ? generateOrderingTrials({
          config,
          phase: 'practice',
          count: config.practiceTrials,
          seed: `${seedRef.current}:practice`,
          block: originalBlock,
        })
      : [],
  );
  const formalRuns = useMemo<BlockRun<OrderingTrialSpec>[]>(
    () =>
      buildBlockRuns(config, `${seedRef.current}:formal`, (block, count) =>
        generateOrderingTrials({
          config,
          phase: 'formal',
          count,
          seed: `${seedRef.current}:formal`,
          block: block as ExperimentBlockConfig<OrderingVariant>,
        }),
      ),
    [config],
  );
  const formalTrials = useMemo(
    () => formalRuns.flatMap((run) => run.trials),
    [formalRuns],
  );

  const [screen, setScreen] = useState<Screen>('practice_intro');
  const [phase, setPhase] = useState<ExperimentPhase>('practice');
  const [index, setIndex] = useState(0);
  const [blockRunIndex, setBlockRunIndex] = useState(0);
  const [pool, setPool] = useState<string[]>([]);
  const [slots, setSlots] = useState<Array<string | null>>(
    Array(config.rectanglesPerTrial).fill(null),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finishError, setFinishError] = useState('');
  const [saving, setSaving] = useState(false);
  const [runId, setRunId] = useState(0);

  const poolRef = useRef<string[]>([]);
  const slotsRef = useRef<Array<string | null>>([]);
  const movesRef = useRef<OrderingMove[]>([]);
  const onsetRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const formalScoresRef = useRef<OrderingScore[]>([]);
  const practiceScoresRef = useRef<OrderingScore[]>([]);
  const lastSaveRef = useRef<Promise<void> | null>(null);
  const completedRef = useRef(false);
  const practiceCompletedRef = useRef(false);

  const attentionMonitor = useAttentionMonitor();
  const attentionRef = useRef(attentionMonitor);
  attentionRef.current = attentionMonitor;

  const trials = phase === 'practice' ? practiceTrials : formalTrials;
  const currentSpec = trials[index] ?? null;

  const currentRun = useMemo(() => {
    if (phase === 'practice') return formalRuns[0] ?? null;
    return (
      formalRuns.find(
        (run) =>
          index >= run.startIndex &&
          index < run.startIndex + run.trials.length,
      ) ??
      formalRuns[formalRuns.length - 1] ??
      null
    );
  }, [formalRuns, index, phase]);
  const currentBlock =
    phase === 'practice'
      ? originalBlock ?? null
      : (currentRun?.block as ExperimentBlockConfig<OrderingVariant> | undefined) ??
        null;

  const stateRef = useRef({
    screen,
    phase,
    index,
    currentSpec,
    currentBlock,
    currentRun,
    pool,
    slots,
  });
  stateRef.current = {
    screen,
    phase,
    index,
    currentSpec,
    currentBlock,
    currentRun,
    pool,
    slots,
  };

  const maxRectWidth = useMemo(() => {
    const viewport = typeof window === 'undefined' ? 1200 : window.innerWidth;
    // The clamp applies to the largest raw width, so no per-rectangle aspect
    // ratio or area ratio can be distorted by CSS sizing.
    const stageWidth = Math.min(viewport - 48, 1000);
    const gaps = 10 * Math.max(0, config.rectanglesPerTrial - 1);
    const slotWidth = (stageWidth - gaps) / config.rectanglesPerTrial;
    const slotContentWidth = slotWidth - 26;
    return Math.max(8, Math.min(150, slotContentWidth));
  }, [config.rectanglesPerTrial]);

  const geometry = useMemo<Record<string, Geometry>>(() => {
    if (!currentSpec) return {};
    const raw = currentSpec.rectangles.map((rectangle) => ({
      rectangle,
      width: Math.sqrt(rectangle.area * rectangle.aspectRatio),
    }));
    const maxRawWidth = Math.max(...raw.map((entry) => entry.width));
    const scale = maxRawWidth > 0 ? maxRectWidth / maxRawWidth : 0;
    const result: Record<string, Geometry> = {};
    for (const entry of raw) {
      const width = entry.width * scale;
      result[entry.rectangle.id] = {
        width: Math.round(width * 10) / 10,
        height: Math.round((width / entry.rectangle.aspectRatio) * 10) / 10,
      };
    }
    return result;
  }, [currentSpec, maxRectWidth]);

  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  const prepareTrial = (spec: OrderingTrialSpec) => {
    poolRef.current = [...spec.initialOrder];
    slotsRef.current = Array(spec.rectangles.length).fill(null);
    movesRef.current = [];
    onsetRef.current = null;
    lockedRef.current = false;
    setPool([...poolRef.current]);
    setSlots([...slotsRef.current]);
    setSelected(null);
    setDragging(null);
    setDropTarget(null);
  };

  const recordMove = (
    type: 'drag' | 'click',
    rectangleId: string,
    from: string,
    to: string,
    swappedWith: string | null,
  ) => {
    const onset = onsetRef.current;
    movesRef.current.push({
      type,
      rectangle_id: rectangleId,
      from,
      to,
      swapped_with: swappedWith,
      elapsed_ms:
        onset === null ? 0 : Math.round((monotonicNow() - onset) * 10) / 10,
    });
  };

  const moveItem = (
    rectangleId: string,
    target: 'pool' | number,
    type: 'drag' | 'click',
  ) => {
    if (lockedRef.current) return;
    const currentPool = poolRef.current;
    const currentSlots = slotsRef.current;
    const sourceSlotIndex = currentSlots.findIndex((id) => id === rectangleId);
    const inPool = currentPool.includes(rectangleId);
    if (sourceSlotIndex < 0 && !inPool) return;

    if (target === 'pool') {
      if (sourceSlotIndex < 0) return;
      const nextSlots = [...currentSlots];
      nextSlots[sourceSlotIndex] = null;
      const nextPool = [...currentPool, rectangleId];
      recordMove(type, rectangleId, `slot-${sourceSlotIndex + 1}`, 'pool', null);
      poolRef.current = nextPool;
      slotsRef.current = nextSlots;
      setPool(nextPool);
      setSlots(nextSlots);
      setSelected(null);
      return;
    }

    if (sourceSlotIndex === target) {
      setSelected(null);
      return;
    }
    const occupant = currentSlots[target];
    const nextSlots = [...currentSlots];
    let nextPool = [...currentPool];
    if (sourceSlotIndex >= 0) {
      nextSlots[sourceSlotIndex] = occupant ?? null;
      nextSlots[target] = rectangleId;
    } else {
      nextPool = nextPool.filter((id) => id !== rectangleId);
      if (occupant) nextPool.push(occupant);
      nextSlots[target] = rectangleId;
    }
    recordMove(
      type,
      rectangleId,
      sourceSlotIndex >= 0 ? `slot-${sourceSlotIndex + 1}` : 'pool',
      `slot-${target + 1}`,
      occupant,
    );
    poolRef.current = nextPool;
    slotsRef.current = nextSlots;
    setPool(nextPool);
    setSlots(nextSlots);
    setSelected(null);
  };

  const finishTrial = useCallback(
    (timedOut: boolean) => {
      if (lockedRef.current) return;
      const state = stateRef.current;
      const spec = state.currentSpec;
      const block = state.currentBlock;
      if (!spec || !block || state.screen !== 'trial') return;
      const onset = onsetRef.current;
      if (onset === null) return;
      lockedRef.current = true;
      if (deadlineRef.current !== null) {
        window.clearTimeout(deadlineRef.current);
        deadlineRef.current = null;
      }
      const monitor = attentionRef.current;
      const attention = monitor.snapshot();
      monitor.disarmTrial();

      const responseTime = timedOut ? null : Math.max(0, monotonicNow() - onset);
      const currentSlots = slotsRef.current;
      const drawnGeometry = geometryRef.current;
      const placed = currentSlots.filter((id): id is string => id !== null).length;
      const complete = placed === spec.rectangles.length;
      const correctPositions = currentSlots.filter((id, position) => {
        if (!id) return false;
        const rectangle = spec.rectangles.find((item) => item.id === id);
        return rectangle?.trueRank === position;
      }).length;
      let errorAccumulator = 0;
      const finalOrder = currentSlots.map((id, position) => {
        if (!id) {
          errorAccumulator += spec.rectangles.length;
          return null;
        }
        const rectangle = spec.rectangles.find((item) => item.id === id);
        if (!rectangle) {
          errorAccumulator += spec.rectangles.length;
          return null;
        }
        errorAccumulator += Math.abs(rectangle.trueRank - position);
        return {
          position: position + 1,
          rectangle_id: id,
          correct_rank: rectangle.trueRank + 1,
          area_ratio: rectangle.areaRatio,
          aspect_ratio: rectangle.aspectRatio,
          display_width_px: drawnGeometry[id]?.width ?? null,
          display_height_px: drawnGeometry[id]?.height ?? null,
        };
      });
      const positionError =
        Math.round((errorAccumulator / spec.rectangles.length) * 100) / 100;
      const correct =
        complete &&
        finalOrder.every(
          (entry) => entry !== null && entry.correct_rank === entry.position,
        );
      const elapsed = Math.max(0, monotonicNow() - onset);
      const idByRank = [...spec.rectangles].sort((a, b) => a.trueRank - b.trueRank);
      const correctOrder = idByRank.map((rectangle) => rectangle.id);
      const responseSequence = currentSlots
        .map((id) => {
          if (!id) return 0;
          const rectangle = spec.rectangles.find((item) => item.id === id);
          return rectangle ? rectangle.trueRank + 1 : 0;
        })
        .join('-');
      const run = state.currentRun;
      const blockTrialIndex =
        run && state.phase === 'formal'
          ? state.index - run.startIndex + 1
          : state.index + 1;

      const draft = {
        blockId: block.block_id,
        blockType: block.block_type,
        conditionId: spec.conditionId,
        trialIndex: state.index + 1,
        phase: state.phase,
        stimulusOnset: onset,
        responseTime,
        response: complete ? responseSequence : null,
        correct,
        timeout: timedOut,
        invalidResponse: false,
        stimulus: {
          task: 'perceptual-ordering',
          difficulty: spec.difficulty,
          rectangle_count: spec.rectangles.length,
          display_note:
            'Each rectangle is sized from its own area and aspect ratio. On-screen sizes preserve area ratios; no numeric areas were shown to the participant.',
          rectangles: spec.rectangles.map((rectangle) => ({
            rectangle_id: rectangle.id,
            area_ratio: rectangle.areaRatio,
            area: rectangle.area,
            aspect_ratio: rectangle.aspectRatio,
            correct_rank: rectangle.trueRank + 1,
            initial_position: rectangle.initialPosition + 1,
            display_width_px: drawnGeometry[rectangle.id]?.width ?? null,
            display_height_px: drawnGeometry[rectangle.id]?.height ?? null,
          })),
          initial_order: spec.initialOrder,
          correct_order: correctOrder,
          fill: config.rectangleFill,
          stroke: config.rectangleStroke,
          background: config.stimulusBackground,
        },
        responseData: {
          initial_order: spec.initialOrder,
          final_order: finalOrder,
          response_sequence: responseSequence,
          complete,
          missing_slots: currentSlots
            .map((id, position) => (id === null ? position + 1 : null))
            .filter((position): position is number => position !== null),
          position_error: positionError,
          placed_count: placed,
          operations: movesRef.current,
          operation_count: movesRef.current.length,
          elapsed_ms: Math.round(elapsed * 10) / 10,
          timed_out: timedOut,
        },
        tracking: {
          mouse_tracking: {
            available: false,
            note: 'Ordering records discrete drag/click operations, not continuous pointer trajectories.',
          },
          eye_tracking: {
            available: false,
            reason: 'not_applicable',
            note: 'Camera eye tracking is only used in the visual-search task.',
          },
          attention,
        },
        metadata: {
          phase: state.phase,
          block_id: block.block_id,
          block_type: block.block_type,
          block_label: block.label,
          block_variant: block.variant,
          block_trial_index: blockTrialIndex,
          block_trial_count: block.formalTrials,
          resolved_block_order: formalRuns.map((item) => item.block.block_id),
          trial_number_within_phase: state.index + 1,
          trial_seed: spec.rngSeed,
          session_seed: seedRef.current,
          response_deadline_ms: config.responseTimeoutMs,
          post_trial_delay_ms: config.postTrialDelayMs,
          geometry_scale_max_width_px: maxRectWidth,
          browser_timing_note:
            'Completion time uses performance.now(); browser display latency is not photodiode-verified.',
        },
      };

      const savePromise = runtime
        .recordTrial(draft)
        .then(() => undefined)
        .catch((error: unknown) => {
          console.error('ordering trial save failed', error);
        });
      lastSaveRef.current = savePromise;

      const score: OrderingScore = {
        trialIndex: state.index + 1,
        blockId: block.block_id,
        blockType: block.block_type,
        variant: block.variant,
        conditionId: spec.conditionId,
        difficulty: spec.difficulty,
        correct,
        positionError,
        completedCount: placed,
        responseTime,
        timeout: timedOut,
        operations: movesRef.current.length,
      };
      if (state.phase === 'formal') {
        formalScoresRef.current.push(score);
        const runIndex = formalRuns.findIndex(
          (item) => item.block.block_id === block.block_id,
        );
        const isBlockComplete =
          run && state.index + 1 >= run.startIndex + run.trials.length;
        if (isBlockComplete) {
          setBlockRunIndex(runIndex);
          setScreen('block_rest');
        } else {
          setScreen('intertrial');
        }
      } else {
        practiceScoresRef.current.push(score);
        setFeedback({
          correct,
          timedOut,
          placed,
          correctPositions,
          total: spec.rectangles.length,
          positionError,
          responseTime,
        });
        setScreen('practice_feedback');
      }
    },
    [config, formalRuns, maxRectWidth, runtime],
  );

  const finishRef = useRef(finishTrial);
  finishRef.current = finishTrial;

  useEffect(() => {
    if (screen !== 'trial' || !currentSpec) return;
    let active = true;
    const cancelFrames = afterPaint((onset) => {
      if (!active) return;
      onsetRef.current = onset;
      attentionRef.current.armTrial();
      deadlineRef.current = window.setTimeout(() => {
        finishRef.current(true);
      }, config.responseTimeoutMs);
    });
    return () => {
      active = false;
      cancelFrames();
      if (deadlineRef.current !== null) {
        window.clearTimeout(deadlineRef.current);
        deadlineRef.current = null;
      }
    };
  }, [screen, currentSpec, config.responseTimeoutMs, runId]);

  useEffect(() => {
    if (screen !== 'practice_feedback') return;
    const timer = window.setTimeout(() => {
      if (index + 1 < practiceTrials.length) {
        const next = practiceTrials[index + 1];
        prepareTrial(next);
        setIndex(index + 1);
        setScreen('trial');
      } else {
        practiceCompletedRef.current = true;
        setScreen('practice_complete');
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [screen, index, practiceTrials]);

  useEffect(() => {
    if (screen !== 'intertrial') return;
    const timer = window.setTimeout(() => {
      if (index + 1 < formalTrials.length) {
        const next = formalTrials[index + 1];
        prepareTrial(next);
        setIndex(index + 1);
        setScreen('trial');
      } else {
        setScreen('finishing');
        void finalizeRef.current();
      }
    }, Math.max(150, config.postTrialDelayMs));
    return () => window.clearTimeout(timer);
  }, [screen, index, formalTrials, config.postTrialDelayMs]);

  const finalizeExperiment = useCallback(async () => {
    if (completedRef.current) return;
    setSaving(true);
    setFinishError('');
    try {
      await lastSaveRef.current;
      await runtime.ensureSession();
      const summary = summarizeOrdering(
        formalScoresRef.current,
        formalTrials.length,
        practiceCompletedRef.current,
      );
      const sessionId = await runtime.complete(summary);
      completedRef.current = true;
      onComplete(summary, sessionId);
    } catch (error) {
      console.error('ordering finalization failed', error);
      setFinishError(
        error instanceof Error ? error.message : '实验结束数据保存失败，请重试。',
      );
      setSaving(false);
    }
  }, [formalTrials.length, onComplete, runtime]);

  const finalizeRef = useRef(finalizeExperiment);
  finalizeRef.current = finalizeExperiment;

  useEffect(() => {
    if (phase !== 'formal' || screen === 'finishing') return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase, screen]);

  const beginPractice = (reset = false) => {
    if (reset) {
      practiceScoresRef.current = [];
      practiceCompletedRef.current = false;
    }
    if (practiceTrials.length === 0) {
      practiceCompletedRef.current = true;
      setPhase('formal');
      setIndex(0);
      setBlockRunIndex(0);
      setScreen('formal_block_intro');
      return;
    }
    setPhase('practice');
    setIndex(0);
    setFeedback(null);
    prepareTrial(practiceTrials[0]);
    setScreen('trial');
  };

  const openFormalIntro = () => {
    formalScoresRef.current = [];
    setPhase('formal');
    setIndex(0);
    setBlockRunIndex(0);
    setScreen('formal_block_intro');
  };

  const beginBlock = (runIndex: number) => {
    const run = formalRuns[runIndex];
    if (!run) return;
    setPhase('formal');
    setBlockRunIndex(runIndex);
    setIndex(run.startIndex);
    prepareTrial(run.trials[0]);
    setScreen('trial');
  };

  const continueAfterRest = () => {
    const nextIndex = blockRunIndex + 1;
    if (nextIndex < formalRuns.length) {
      setBlockRunIndex(nextIndex);
      setScreen('formal_block_intro');
    } else {
      setScreen('finishing');
      void finalizeRef.current();
    }
  };

  const trialRects = currentSpec?.rectangles ?? [];
  const byId = (id: string) => trialRects.find((rectangle) => rectangle.id === id);
  const allFilled = slots.every((id) => id !== null);

  const handleItemClick = (id: string, origin: 'pool' | number) => {
    if (lockedRef.current) return;
    if (selected === null) {
      setSelected(id);
      return;
    }
    if (selected === id) {
      setSelected(null);
      return;
    }
    if (origin === 'pool') {
      setSelected(id);
      return;
    }
    moveItem(selected, origin, 'click');
  };

  const handleDropOnSlot = (event: DragEvent, slotIndex: number) => {
    event.preventDefault();
    setDropTarget(null);
    const id =
      event.dataTransfer.getData('text/plain') ||
      dragging ||
      selected;
    setDragging(null);
    if (!id) return;
    moveItem(id, slotIndex, 'drag');
  };

  const handleDropOnPool = (event: DragEvent) => {
    event.preventDefault();
    setDropTarget(null);
    const id =
      event.dataTransfer.getData('text/plain') ||
      dragging ||
      selected;
    setDragging(null);
    if (!id) return;
    moveItem(id, 'pool', 'drag');
  };

  const total = trials.length;
  const currentForBar =
    screen === 'practice_intro' || screen === 'formal_block_intro'
      ? 0
      : screen === 'practice_complete' || screen === 'finishing'
        ? total
        : Math.min(index + 1, total);
  const blockCurrent =
    phase === 'practice'
      ? Math.min(index + 1, practiceTrials.length)
      : currentRun
        ? Math.max(1, index - currentRun.startIndex + 1)
        : 0;
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
        title="图形知觉排序"
        phase={phase}
        current={currentForBar}
        total={total}
        blockLabel={phase === 'formal' ? currentBlock?.label : undefined}
        blockCurrent={blockCurrent}
        blockTotal={phase === 'formal' ? currentBlock?.formalTrials : undefined}
        allowExit={screen !== 'trial'}
      />
      <main className="experiment-main">
        {screen === 'practice_intro' && (
          <div className="runtime-panel">
            <span className="practice-badge">Practice · 练习阶段</span>
            <h1 className="runtime-title">按面积从小到大排序</h1>
            <p className="runtime-lede">
              每个试次有 {config.rectanglesPerTrial} 个矩形。请按面积
              <strong>从小到大</strong>排列，最左最小，最右最大。练习有反馈，不计入正式分析。
            </p>
            <div className="runtime-keys" style={{ gap: 22 }}>
              <span className="status-inline">拖动矩形到排序位置</span>
              <span className="status-inline">或先点矩形，再点位置</span>
            </div>
            <div className="runtime-actions">
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={() => beginPractice()}
              >
                开始练习
                <ArrowRight size={16} strokeWidth={1.7} />
              </button>
            </div>
            <p className="runtime-note">
              正式阶段没有逐试次对错反馈；操作次数与每次放置的时间会被记录。
            </p>
          </div>
        )}

        {screen === 'practice_complete' && (
          <div className="runtime-panel">
            <span className="practice-badge">Practice complete</span>
            <h1 className="runtime-title">练习完成</h1>
            <p className="runtime-lede">
              你已完成 {practiceScoresRef.current.length} 个练习试次。
              练习不计入正式数据；正式阶段分为 {formalRuns.length} 个独立 Block，
              共 {formalTrials.length} 个试次。
            </p>
            <div className="runtime-actions">
              <button
                type="button"
                className="btn btn--soft"
                onClick={() => beginPractice(true)}
              >
                <RotateCcw size={14} strokeWidth={1.7} />
                再练习一次
              </button>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={openFormalIntro}
              >
                开始正式实验
                <ArrowRight size={16} strokeWidth={1.7} />
              </button>
            </div>
            <p className="runtime-note">
              原始条件与新增条件各自成为独立 Block，不会混合随机。
            </p>
          </div>
        )}

        {screen === 'formal_block_intro' && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">
              Formal block {Math.min(blockRunIndex + 1, formalRuns.length)} / {formalRuns.length}
            </span>
            <h1 className="runtime-title">{formalRuns[blockRunIndex]?.block.label ?? '正式实验'}</h1>
            <p className="runtime-lede">
              {formalRuns[blockRunIndex]?.block.block_type === 'original_block'
                ? '本 Block 的矩形长宽比相同。'
                : '本 Block 的矩形长宽比不同，仍按面积排序。'}
              {' '}共 {formalRuns[blockRunIndex]?.block.formalTrials ?? 0} 个正式试次。
            </p>
            <div className="runtime-keys" style={{ gap: 22 }}>
              <span className="status-inline">最左侧 = 面积最小</span>
              <span className="status-inline">最右侧 = 面积最大</span>
            </div>
            <div className="block-list">
              {formalRuns.map((run, runIndex) => (
                <span
                  key={run.block.block_id}
                  className={`block-chip${runIndex === blockRunIndex ? ' is-current' : ''}${
                    runIndex < blockRunIndex ? ' is-done' : ''
                  }`}
                >
                  {run.block.label}
                  <small>{run.block.block_type === 'original_block' ? '原始' : '扩展'}</small>
                </span>
              ))}
            </div>
            <div className="runtime-actions">
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={() => beginBlock(blockRunIndex)}
              >
                开始本 Block
                <ArrowRight size={16} strokeWidth={1.7} />
              </button>
            </div>
            <p className="runtime-note">
              开始后请尽量不要刷新页面或切换标签页。Block 之间会显示休息页。
            </p>
          </div>
        )}

        {screen === 'block_rest' && completedRun && (
          <div className="runtime-panel">
            <span className="runtime-eyebrow">Block complete · 休息</span>
            <h1 className="runtime-title">本 Block 已完成</h1>
            <p className="runtime-lede">
              {completedRun.block.label}：{completedScores.length} / {completedRun.block.formalTrials} 个试次
              {completedAccuracy !== null
                ? `，完全正确率 ${(completedAccuracy * 100).toFixed(0)}%`
                : ''}
              。数据按 Block 独立保存。
            </p>
            {nextRun ? (
              <>
                <p className="runtime-note">
                  下一个 Block：{nextRun.block.label}（{nextRun.block.formalTrials} 个正式试次，
                  {nextRun.block.block_type === 'original_block' ? '原始条件' : '扩展条件'}）。
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

        {screen === 'trial' && currentSpec && (
          <div className="ordering-stage">
            <div className="ordering-instruction">
              <strong>按面积从小到大排列</strong>
              <span>
                拖动矩形到下方位置，或点击选择后点击目标位置 · 已放入的可以交换
              </span>
            </div>

            <div
              className={`ordering-pool${dropTarget === 'pool' ? ' is-drop-target' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                if (dropTarget !== 'pool') setDropTarget('pool');
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={handleDropOnPool}
            >
              {pool.map((id) => {
                const rectangle = byId(id);
                const size = geometry[id];
                if (!rectangle || !size) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`rect-item${selected === id ? ' is-selected' : ''}${
                      dragging === id ? ' is-dragging' : ''
                    }`}
                    style={{
                      width: size.width,
                      height: size.height,
                      ['--rect-fill' as string]: config.rectangleFill,
                      ['--rect-stroke' as string]: config.rectangleStroke,
                    }}
                    draggable
                    aria-pressed={selected === id}
                    onClick={() => handleItemClick(id, 'pool')}
                    onDragStart={(event) => {
                      setDragging(id);
                      event.dataTransfer.setData('text/plain', id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                  >
                    <span className="sr-only">可排序矩形</span>
                  </button>
                );
              })}
            </div>

            <div className="ordering-slots-label">
              <span>Smaller · 较小</span>
              <span>Larger · 较大</span>
            </div>
            <div
              className="ordering-slots"
              style={{
                gridTemplateColumns: `repeat(${currentSpec.rectangles.length}, minmax(0, 1fr))`,
              }}
            >
              {slots.map((id, slotIndex) => {
                const rectangle = id ? byId(id) : null;
                const size = id ? geometry[id] : null;
                return (
                  <div
                    key={`slot-${slotIndex}`}
                    className={`ordering-slot${
                      dropTarget === `slot-${slotIndex}` ? ' is-drop-target' : ''
                    }`}
                    data-slot={slotIndex + 1}
                    role="group"
                    tabIndex={0}
                    aria-label={`排序位置 ${slotIndex + 1}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (dropTarget !== `slot-${slotIndex}`) {
                        setDropTarget(`slot-${slotIndex}`);
                      }
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(event) => handleDropOnSlot(event, slotIndex)}
                    onClick={() => {
                      if (lockedRef.current) return;
                      if (selected && selected !== id) {
                        moveItem(selected, slotIndex, 'click');
                      } else if (id && selected === null) {
                        setSelected(id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      if (lockedRef.current) return;
                      if (selected) moveItem(selected, slotIndex, 'click');
                      else if (id) setSelected(id);
                    }}
                  >
                    {rectangle && size && id && (
                      <button
                        type="button"
                        className={`rect-item rect-item--slot${
                          selected === id ? ' is-selected' : ''
                        }`}
                        style={{
                          width: size.width,
                          height: size.height,
                          ['--rect-fill' as string]: config.rectangleFill,
                          ['--rect-stroke' as string]: config.rectangleStroke,
                        }}
                        draggable
                        aria-pressed={selected === id}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleItemClick(id, slotIndex);
                        }}
                        onDragStart={(event) => {
                          setDragging(id);
                          event.dataTransfer.setData('text/plain', id);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropTarget(null);
                        }}
                      >
                        <span className="sr-only">已排序矩形</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="ordering-actions">
              <span className="ordering-progress">
                已放入 {slots.filter(Boolean).length} / {slots.length}
                {selected ? ' · 已选中一个矩形' : ''}
              </span>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!allFilled || lockedRef.current}
                onClick={() => finishTrial(false)}
              >
                <Send size={14} strokeWidth={1.7} />
                提交排序
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  if (lockedRef.current) return;
                  prepareTrial(currentSpec);
                  setRunId((value) => value + 1);
                }}
              >
                重置本试次
              </button>
            </div>
          </div>
        )}

        {screen === 'practice_feedback' && feedback && currentSpec && (
          <div className="runtime-panel runtime-panel--wide">
            <span
              className={`feedback-mark ${
                feedback.correct ? 'feedback-mark--correct' : 'feedback-mark--incorrect'
              }`}
              style={{ margin: '0 auto 16px' }}
            >
              {feedback.correct ? <Check size={20} /> : <X size={20} />}
            </span>
            <h1 className="runtime-title" style={{ marginTop: 0 }}>
              {feedback.correct
                ? '正确'
                : feedback.timedOut
                  ? '本试次超时'
                  : '还不是完全正确的顺序'}
            </h1>
            <p className="runtime-lede">
              {feedback.timedOut
                ? '时间上限已到，本试次按当前排序记录。'
                : feedback.correct
                  ? `全部 ${feedback.total} 个位置都正确${
                      feedback.responseTime !== null
                        ? `，用时 ${formatMs(feedback.responseTime)}`
                        : ''
                    }。`
                  : `已放入 ${feedback.placed} / ${feedback.total}，其中位置正确 ${feedback.correctPositions} 个；平均位置误差 ${feedback.positionError.toFixed(2)}。`}
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                gap: 7,
                marginTop: 24,
                flexWrap: 'wrap',
              }}
              aria-label="正确顺序示意"
            >
              {[...currentSpec.rectangles]
                .sort((a, b) => a.trueRank - b.trueRank)
                .map((rectangle) => {
                  const size = geometry[rectangle.id];
                  if (!size) return null;
                  return (
                    <span
                      key={rectangle.id}
                      style={{
                        width: size.width * 0.46,
                        height: size.height * 0.46,
                        background: config.rectangleFill,
                        border: `1px solid ${config.rectangleStroke}`,
                        borderRadius: 4,
                        display: 'inline-block',
                      }}
                    />
                  );
                })}
            </div>
            <p className="runtime-note">上方是本次的正确顺序示意。请准备下一个练习试次…</p>
          </div>
        )}

        {screen === 'intertrial' && (
          <span className="trial-counter">下一试次即将开始</span>
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
                <p className="runtime-lede">正在保存排序记录与汇总，请不要关闭页面。</p>
                {saving && <div className="spinner" style={{ margin: '26px auto 0' }} />}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
