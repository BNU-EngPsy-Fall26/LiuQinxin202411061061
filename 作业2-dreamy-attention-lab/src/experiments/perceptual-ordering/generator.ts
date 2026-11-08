import type {
  BlockType,
  Difficulty,
  ExperimentBlockConfig,
  ExperimentPhase,
  OrderingVariant,
  PerceptualOrderingConfig,
  SessionSummary,
} from '@shared/types';
import { allocateBalanced, describeBlockAllocation } from '@shared/blocks';
import { Rng, balancedOrder, hashString } from '@/utils/random';
import { round } from '@/utils/timing';
import { buildSummary } from '@/experiments/shared/summary';

export const ORDERING_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export interface OrderingRectangle {
  id: string;
  areaRatio: number;
  area: number;
  aspectRatio: number;
  trueRank: number;
  initialPosition: number;
}

export interface OrderingTrialSpec {
  id: string;
  blockId: string;
  blockType: BlockType;
  variant: OrderingVariant;
  phase: ExperimentPhase;
  difficulty: Difficulty;
  conditionId: string;
  rectangles: OrderingRectangle[];
  initialOrder: string[];
  rngSeed: number;
}

export interface OrderingMove {
  type: 'drag' | 'click';
  rectangle_id: string;
  from: string;
  to: string;
  swapped_with: string | null;
  elapsed_ms: number;
}

export interface OrderingScore {
  trialIndex: number;
  blockId: string;
  blockType: BlockType;
  variant: OrderingVariant;
  conditionId: string;
  difficulty: Difficulty;
  correct: boolean;
  positionError: number;
  completedCount: number;
  responseTime: number | null;
  timeout: boolean;
  operations: number;
}

function makeTrialId(seed: string): string {
  return `po-${hashString(seed).toString(36)}`;
}

function buildOrderingTrial({
  config,
  phase,
  block,
  difficulty,
  index,
  seed,
}: {
  config: PerceptualOrderingConfig;
  phase: ExperimentPhase;
  block: ExperimentBlockConfig<OrderingVariant>;
  difficulty: Difficulty;
  index: number;
  seed: string;
}): OrderingTrialSpec {
  const ratios = config.difficulties[difficulty];
  const trialSeed = `${seed}:${block.block_id}:${phase}:${difficulty}:${index}`;
  const rng = new Rng(trialSeed);
  const aspectPool = rng.shuffle([...config.mixedAspectRatios]);
  const rectangles = ratios.map((ratio, ratioIndex) => {
    const aspectRatio =
      block.variant === 'mixed_aspect'
        ? aspectPool[ratioIndex % Math.max(1, aspectPool.length)] ??
          config.mixedAspectRatios[ratioIndex % config.mixedAspectRatios.length]
        : config.aspectRatio;
    return {
      id: `r${ratioIndex + 1}`,
      areaRatio: ratio,
      area: config.baseArea * ratio,
      aspectRatio,
      trueRank: 0,
      initialPosition: 0,
    };
  });
  const ranked = [...rectangles].sort((a, b) => a.area - b.area);
  ranked.forEach((rectangle, rank) => {
    rectangle.trueRank = rank;
  });

  let initialOrder = rng.shuffle(rectangles.map((rectangle) => rectangle.id));
  let attempts = 0;
  while (
    attempts < 12 &&
    (isSameOrder(initialOrder, ranked.map((rectangle) => rectangle.id)) ||
      isSameOrder(
        initialOrder,
        ranked.map((rectangle) => rectangle.id).reverse(),
      ))
  ) {
    initialOrder = rng.shuffle(initialOrder);
    attempts += 1;
  }
  initialOrder.forEach((id, position) => {
    const rectangle = rectangles.find((item) => item.id === id);
    if (rectangle) rectangle.initialPosition = position;
  });

  return {
    id: makeTrialId(trialSeed),
    blockId: block.block_id,
    blockType: block.block_type,
    variant: block.variant,
    phase,
    difficulty,
    conditionId:
      block.variant === 'mixed_aspect'
        ? `mixed_${difficulty}`
        : `ordering_${difficulty}`,
    rectangles,
    initialOrder,
    rngSeed: hashString(trialSeed),
  };
}

export function generateOrderingTrials({
  config,
  phase,
  count,
  seed,
  block,
}: {
  config: PerceptualOrderingConfig;
  phase: ExperimentPhase;
  count: number;
  seed: string;
  block?: ExperimentBlockConfig<OrderingVariant>;
}): OrderingTrialSpec[] {
  const activeBlock = (block ??
    config.blocks.find((candidate) => candidate.block_type === 'original_block') ??
    config.blocks[0]) as ExperimentBlockConfig<OrderingVariant> | undefined;
  if (!activeBlock) return [];
  const allocation = allocateBalanced(
    count,
    ORDERING_DIFFICULTIES.map(String),
  );
  const specs: OrderingTrialSpec[] = [];
  for (const difficulty of ORDERING_DIFFICULTIES) {
    const difficultyCount = allocation[difficulty] ?? 0;
    for (let index = 0; index < difficultyCount; index += 1) {
      specs.push(
        buildOrderingTrial({
          config,
          phase,
          block: activeBlock,
          difficulty,
          index,
          seed,
        }),
      );
    }
  }
  if (phase === 'formal') {
    return balancedOrder(
      specs,
      (spec) => spec.difficulty,
      `${seed}:${activeBlock.block_id}:order`,
      2,
    );
  }
  return specs;
}

export function describeOrderingAllocation(
  count: number,
): string {
  return describeBlockAllocation(
    allocateBalanced(count, ORDERING_DIFFICULTIES.map(String)),
    count,
  );
}

function isSameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function summarizeOrdering(
  scores: OrderingScore[],
  totalFormal: number,
  practiceCompleted: boolean,
): SessionSummary {
  const byDifficulty: Record<string, unknown> = {};
  const byBlock: Record<string, unknown> = {};
  for (const difficulty of ORDERING_DIFFICULTIES) {
    const group = scores.filter((score) => score.difficulty === difficulty);
    const timed = group.filter((score) => !score.timeout && score.responseTime !== null);
    byDifficulty[difficulty] = {
      n: group.length,
      exact_accuracy:
        group.length > 0
          ? round(
              group.filter((score) => score.correct).length / group.length,
              4,
            )
          : null,
      mean_position_error:
        group.length > 0
          ? round(
              group.reduce((sum, score) => sum + score.positionError, 0) /
                group.length,
              2,
            )
          : null,
      mean_operations:
        group.length > 0
          ? round(
              group.reduce((sum, score) => sum + score.operations, 0) /
                group.length,
              2,
            )
          : null,
      mean_completion_time_ms:
        timed.length > 0
          ? round(
              timed.reduce((sum, score) => sum + (score.responseTime ?? 0), 0) /
                timed.length,
              1,
            )
          : null,
      timeout_rate:
        group.length > 0
          ? round(
              group.filter((score) => score.timeout).length / group.length,
              4,
            )
          : null,
    };
  }
  for (const [blockId, group] of Object.entries(
    groupByBlock(scores),
  )) {
    byBlock[blockId] = {
      n: group.length,
      block_type: group[0]?.blockType ?? null,
      variant: group[0]?.variant ?? null,
      accuracy:
        group.length > 0
          ? round(group.filter((score) => score.correct).length / group.length, 4)
          : null,
      mean_completion_time_ms:
        group.filter((score) => score.responseTime !== null).length > 0
          ? round(
              mean(
                group
                  .filter((score) => score.responseTime !== null)
                  .map((score) => score.responseTime as number),
              ),
              1,
            )
          : null,
      mean_position_error:
        group.length > 0
          ? round(
              group.reduce((sum, score) => sum + score.positionError, 0) /
                group.length,
              2,
            )
          : null,
    };
  }
  return buildSummary({
    formalTrials: scores.map((score) => ({
      correct: score.correct,
      responseTime: score.responseTime,
      timeout: score.timeout,
      conditionId: score.conditionId,
    })),
    totalFormal,
    practiceCompleted,
    details: {
      task: 'perceptual-ordering',
      metric_note:
        'Accuracy is exact complete ordering. Position error is the mean absolute deviation from the correct rank (0 = perfect).',
      by_difficulty: byDifficulty,
      by_block: byBlock,
      mean_position_error:
        scores.length > 0
          ? round(
              scores.reduce((sum, score) => sum + score.positionError, 0) /
                scores.length,
              2,
            )
          : null,
      mean_operations:
        scores.length > 0
          ? round(
              scores.reduce((sum, score) => sum + score.operations, 0) /
                scores.length,
              2,
            )
          : null,
    },
  });
}

function groupByBlock(
  scores: OrderingScore[],
): Record<string, OrderingScore[]> {
  const result: Record<string, OrderingScore[]> = {};
  for (const score of scores) {
    (result[score.blockId] ??= []).push(score);
  }
  return result;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
