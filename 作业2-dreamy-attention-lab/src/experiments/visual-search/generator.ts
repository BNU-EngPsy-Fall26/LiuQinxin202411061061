import type {
  BlockType,
  ExperimentBlockConfig,
  ExperimentPhase,
  RegionNumber,
  VisualSearchConfig,
  VisualSearchVariant,
} from '@shared/types';
import { allocateBalanced, describeBlockAllocation } from '@shared/blocks';
import type {
  GazeTrialMetrics,
  MouseTrialMetrics,
} from '@shared/search-metrics';
import {
  BLOCK_BRIEFS,
  REGION_NUMBERS,
  SEARCH_AREA_PX,
  block3PresentCount,
  plannedRegionCounts,
  regionAtNormalizedPoint,
  uncoveredRegions,
} from '@shared/visual-search';
import { Rng, balancedOrder, hashString } from '@/utils/random';
import { buildSummary, conditionStats, groupBy } from '@/experiments/shared/summary';

export const VIRTUAL_STAGE = { width: 860, height: 540 };

export interface GridCell {
  col: number;
  row: number;
}

export interface GeneratedStimulus {
  id: string;
  letter: 'O' | 'X';
  color: string;
  xPct: number;
  yPct: number;
  xPx: number;
  yPx: number;
  isTarget: boolean;
  gridCell: GridCell;
  region: RegionNumber;
}

export interface VisualSearchTrialSpec {
  id: string;
  blockId: string;
  blockName: string;
  blockType: BlockType;
  variant: VisualSearchVariant;
  phase: ExperimentPhase;
  setSize: number;
  targetPresent: boolean;
  targetCell: GridCell | null;
  targetRegion: RegionNumber | null;
  targetPositionPct: { x: number; y: number } | null;
  targetPositionPx: { x: number; y: number } | null;
  items: GeneratedStimulus[];
  conditionId: string;
  rngSeed: number;
  plannedFormalTrials: number;
  practiceIndex: number | null;
}

function makeTrialId(seed: string): string {
  return `vs-${hashString(seed).toString(36)}`;
}

function allCells(config: VisualSearchConfig): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < config.gridRows; row += 1) {
    for (let col = 0; col < config.gridColumns; col += 1) {
      cells.push({ col, row });
    }
  }
  return cells;
}

function cellPosition(
  cell: GridCell,
  config: VisualSearchConfig,
  rng: Rng,
): { xPx: number; yPx: number; xPct: number; yPct: number } {
  const usableW = SEARCH_AREA_PX.right - SEARCH_AREA_PX.left;
  const usableH = SEARCH_AREA_PX.bottom - SEARCH_AREA_PX.top;
  const cellW = usableW / config.gridColumns;
  const cellH = usableH / config.gridRows;
  const xPx =
    SEARCH_AREA_PX.left +
    cellW * (cell.col + 0.5) +
    (rng.next() * 2 - 1) * config.jitterPx;
  const yPx =
    SEARCH_AREA_PX.top +
    cellH * (cell.row + 0.5) +
    (rng.next() * 2 - 1) * config.jitterPx;
  return {
    xPx,
    yPx,
    xPct: (xPx / VIRTUAL_STAGE.width) * 100,
    yPct: (yPx / VIRTUAL_STAGE.height) * 100,
  };
}

function cellCenterRegion(
  cell: GridCell,
  config: VisualSearchConfig,
): RegionNumber | null {
  const usableW = SEARCH_AREA_PX.right - SEARCH_AREA_PX.left;
  const usableH = SEARCH_AREA_PX.bottom - SEARCH_AREA_PX.top;
  const cellW = usableW / config.gridColumns;
  const cellH = usableH / config.gridRows;
  const xPx = SEARCH_AREA_PX.left + cellW * (cell.col + 0.5);
  const yPx = SEARCH_AREA_PX.top + cellH * (cell.row + 0.5);
  return regionAtNormalizedPoint(xPx / VIRTUAL_STAGE.width, yPx / VIRTUAL_STAGE.height);
}

/**
 * Pick a target cell and a jittered position that provably stays inside the
 * requested nine-region cell. Jitter is never allowed to move a target into a
 * neighbouring region after the planned position has been recorded.
 */
function targetCellInRegion(
  region: RegionNumber,
  config: VisualSearchConfig,
  rng: Rng,
  used: Set<string>,
): { cell: GridCell; position: ReturnType<typeof cellPosition> } {
  const candidates = rng.shuffle(
    allCells(config).filter(
      (cell) =>
        !used.has(`${cell.col}:${cell.row}`) &&
        cellCenterRegion(cell, config) === region,
    ),
  );
  for (const cell of candidates) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const position = cellPosition(cell, config, rng);
      if (
        regionAtNormalizedPoint(position.xPct / 100, position.yPct / 100) === region
      ) {
        return { cell, position };
      }
    }
  }
  // The configured grid always leaves at least one centre cell per region;
  // this branch only guards against an extreme researcher grid.
  const fallback = allCells(config).find(
    (cell) => !used.has(`${cell.col}:${cell.row}`),
  ) ?? { col: 0, row: 0 };
  return { cell: fallback, position: cellPosition(fallback, config, rng) };
}

function distractorKinds(
  variant: VisualSearchVariant,
  count: number,
  config: VisualSearchConfig,
  rng: Rng,
): Array<{ letter: 'O' | 'X'; color: string }> {
  if (count <= 0) return [];
  const firstCount = Math.ceil(count / 2);
  const kinds =
    variant === 'feature_search'
      ? [
          ...Array.from({ length: firstCount }, () => ({
            letter: 'O' as const,
            color: config.distractorBlueColor,
          })),
          ...Array.from({ length: count - firstCount }, () => ({
            letter: 'X' as const,
            color: config.distractorBlueColor,
          })),
        ]
      : [
          ...Array.from({ length: firstCount }, () => ({
            letter: 'X' as const,
            color: config.distractorRedColor,
          })),
          ...Array.from({ length: count - firstCount }, () => ({
            letter: 'O' as const,
            color: config.distractorBlueColor,
          })),
        ];
  return rng.shuffle(kinds);
}

function buildTrial({
  config,
  phase,
  block,
  setSize,
  targetPresent,
  targetRegion,
  seed,
  practiceIndex = null,
}: {
  config: VisualSearchConfig;
  phase: ExperimentPhase;
  block: ExperimentBlockConfig<VisualSearchVariant>;
  setSize: number;
  targetPresent: boolean;
  targetRegion: RegionNumber | null;
  seed: string;
  practiceIndex?: number | null;
}): VisualSearchTrialSpec {
  const rng = new Rng(seed);
  const used = new Set<string>();
  let targetCell: GridCell | null = null;
  let targetPosition: ReturnType<typeof cellPosition> | null = null;

  if (targetPresent) {
    if (targetRegion !== null) {
      const selected = targetCellInRegion(targetRegion, config, rng, used);
      targetCell = selected.cell;
      targetPosition = selected.position;
    } else {
      const cells = rng.shuffle(allCells(config));
      const cell = cells[0] ?? { col: 0, row: 0 };
      targetCell = cell;
      targetPosition = cellPosition(cell, config, rng);
    }
    used.add(`${targetCell.col}:${targetCell.row}`);
  }

  const distractorCount = Math.max(0, setSize - (targetPresent ? 1 : 0));
  const candidates = rng
    .shuffle(allCells(config))
    .filter((cell) => !used.has(`${cell.col}:${cell.row}`))
    .slice(0, distractorCount);
  const kinds = distractorKinds(block.variant, distractorCount, config, rng);
  const rendered = rng.shuffle([
    ...candidates.map((cell, index) => ({
      cell,
      kind: kinds[index] ?? {
        letter: 'O' as const,
        color: config.distractorBlueColor,
      },
      isTarget: false,
    })),
    ...(targetCell && targetPosition
      ? [
          {
            cell: targetCell,
            kind: { letter: 'O' as const, color: config.targetColor },
            isTarget: true,
          },
        ]
      : []),
  ]);

  const items: GeneratedStimulus[] = rendered.map((item, index) => {
    // The target item must be rendered at exactly the position that was
    // recorded for target_x/target_y; re-jittering it here would make the
    // saved coordinates disagree with what the participant actually saw.
    const position =
      item.isTarget && targetPosition
        ? targetPosition
        : cellPosition(item.cell, config, rng);
    return {
      id: `item-${index}`,
      letter: item.kind.letter,
      color: item.kind.color,
      ...position,
      isTarget: item.isTarget,
      gridCell: item.cell,
      region:
        regionAtNormalizedPoint(position.xPct / 100, position.yPct / 100) ?? 5,
    };
  });

  const positionedTarget = targetPosition
    ? {
        xPct: targetPosition.xPct,
        yPct: targetPosition.yPct,
        xPx: targetPosition.xPx,
        yPx: targetPosition.yPx,
      }
    : null;
  const actualRegion = positionedTarget
    ? regionAtNormalizedPoint(
        positionedTarget.xPct / 100,
        positionedTarget.yPct / 100,
      )
    : null;
  // Record the region the target was actually drawn in; requestedRegion is
  // only a placement plan. This keeps target_region consistent with the
  // per-item coordinates even under an extreme researcher grid.
  const resolvedRegion = targetPresent
    ? actualRegion ?? targetRegion
    : null;

  const conditionId = targetPresent
    ? `${block.variant}_${resolvedRegion ?? 'any'}_${setSize}_present`
    : `${block.variant}_${setSize}_absent`;

  return {
    id: makeTrialId(seed),
    blockId: block.block_id,
    blockName: BLOCK_BRIEFS[block.variant].blockName,
    blockType: block.block_type,
    variant: block.variant,
    phase,
    setSize,
    targetPresent,
    targetCell: targetPresent ? targetCell : null,
    targetRegion: resolvedRegion,
    targetPositionPct: positionedTarget
      ? { x: positionedTarget.xPct, y: positionedTarget.yPct }
      : null,
    targetPositionPx: positionedTarget
      ? { x: positionedTarget.xPx, y: positionedTarget.yPx }
      : null,
    items,
    conditionId,
    rngSeed: hashString(seed),
    plannedFormalTrials: block.formalTrials,
    practiceIndex,
  };
}

function generatePractice(
  config: VisualSearchConfig,
  block: ExperimentBlockConfig<VisualSearchVariant>,
  seed: string,
): VisualSearchTrialSpec[] {
  const sizes = [...config.setSizes].sort((a, b) => a - b);
  const presentSize = sizes[0] ?? 4;
  const absentSize = sizes[1] ?? presentSize;
  return [
    buildTrial({
      config,
      phase: 'practice',
      block,
      setSize: presentSize,
      targetPresent: true,
      targetRegion: null,
      seed: `${seed}:${block.block_id}:practice:present`,
      practiceIndex: 0,
    }),
    buildTrial({
      config,
      phase: 'practice',
      block,
      setSize: absentSize,
      targetPresent: false,
      targetRegion: null,
      seed: `${seed}:${block.block_id}:practice:absent`,
      practiceIndex: 1,
    }),
  ];
}

export function generateVisualSearchPractice({
  config,
  block,
  seed,
}: {
  config: VisualSearchConfig;
  block: ExperimentBlockConfig<VisualSearchVariant>;
  seed: string;
}): VisualSearchTrialSpec[] {
  return generatePractice(config, block, seed);
}

function generateSearchBlock(
  config: VisualSearchConfig,
  block: ExperimentBlockConfig<VisualSearchVariant>,
  count: number,
  seed: string,
): VisualSearchTrialSpec[] {
  const sizes = [...config.setSizes].sort((a, b) => a - b);
  const conditions = sizes.flatMap((setSize) => [
    { setSize, present: true as const },
    { setSize, present: false as const },
  ]);
  const allocation = allocateBalanced(
    count,
    conditions.map((condition) => `${condition.setSize}_${condition.present}`),
  );
  const specs: VisualSearchTrialSpec[] = [];
  for (const condition of conditions) {
    const conditionCount =
      allocation[`${condition.setSize}_${condition.present}`] ?? 0;
    for (let index = 0; index < conditionCount; index += 1) {
      specs.push(
        buildTrial({
          config,
          phase: 'formal',
          block,
          setSize: condition.setSize,
          targetPresent: condition.present,
          targetRegion: null,
          seed: `${seed}:${block.block_id}:formal:${condition.setSize}:${condition.present}:${index}`,
        }),
      );
    }
  }
  return balancedOrder(
    specs,
    (spec) => `${spec.setSize}_${spec.targetPresent}`,
    `${seed}:${block.block_id}:order`,
    2,
  );
}

function regionSequenceWithCounts(
  counts: Record<RegionNumber, number>,
  seed: string,
): RegionNumber[] {
  const pool: RegionNumber[] = [];
  for (const region of REGION_NUMBERS) {
    for (let index = 0; index < counts[region]; index += 1) pool.push(region);
  }
  const rng = new Rng(seed);
  const acceptable = (candidate: RegionNumber[]) => {
    for (let index = 2; index < candidate.length; index += 1) {
      const rows = [candidate[index - 2], candidate[index - 1], candidate[index]].map(
        (region) => Math.floor((region - 1) / 3),
      );
      const cols = [candidate[index - 2], candidate[index - 1], candidate[index]].map(
        (region) => (region - 1) % 3,
      );
      if (rows[0] === rows[1] && rows[1] === rows[2]) return false;
      if (cols[0] === cols[1] && cols[1] === cols[2]) return false;
    }
    return true;
  };
  let best = rng.shuffle(pool);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (acceptable(best)) return best;
    best = rng.shuffle(pool);
  }
  return best;
}

function interleavePresence(
  present: VisualSearchTrialSpec[],
  absent: VisualSearchTrialSpec[],
  seed: string,
): VisualSearchTrialSpec[] {
  const total = present.length + absent.length;
  const pattern = [
    ...Array.from({ length: present.length }, () => true),
    ...Array.from({ length: absent.length }, () => false),
  ];
  const rng = new Rng(seed);
  const acceptable = (candidate: boolean[]) => {
    let run = 1;
    let hasPair = false;
    for (let index = 1; index < candidate.length; index += 1) {
      if (candidate[index] === candidate[index - 1]) {
        run += 1;
        hasPair = true;
        if (run > 2) return false;
      } else {
        run = 1;
      }
    }
    // A perfect fixed alternation is rejected when both trial types exist.
    const alternates = candidate.every(
      (value, index) => index < 2 || value === candidate[index - 2],
    );
    return (present.length === 0 || absent.length === 0 || hasPair) && !alternates;
  };
  let order = rng.shuffle(pattern);
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (acceptable(order)) break;
    order = rng.shuffle(pattern);
  }
  let presentIndex = 0;
  let absentIndex = 0;
  return order.map((isPresent) =>
    isPresent ? present[presentIndex++] : absent[absentIndex++],
  ).slice(0, total);
}

function generateSpatialBlock(
  config: VisualSearchConfig,
  block: ExperimentBlockConfig<VisualSearchVariant>,
  count: number,
  seed: string,
): VisualSearchTrialSpec[] {
  const sizes = [...config.setSizes].sort((a, b) => a - b);
  const presentCount = block3PresentCount(count);
  const absentCount = Math.max(0, count - presentCount);
  const regionCounts = plannedRegionCounts(count);
  const presentRegions = regionSequenceWithCounts(
    regionCounts,
    `${seed}:${block.block_id}:regions`,
  );

  const sizeAllocationPresent = allocateBalanced(
    presentCount,
    sizes.map(String),
  );
  const presentSizePool: number[] = [];
  for (const size of sizes) {
    for (let index = 0; index < (sizeAllocationPresent[String(size)] ?? 0); index += 1) {
      presentSizePool.push(size);
    }
  }
  const shuffledPresentSizes = new Rng(
    `${seed}:${block.block_id}:present-sizes`,
  ).shuffle(presentSizePool);

  const presentSpecs: VisualSearchTrialSpec[] = presentRegions.map(
    (region, index) =>
      buildTrial({
        config,
        phase: 'formal',
        block,
        setSize: shuffledPresentSizes[index] ?? sizes[0] ?? 4,
        targetPresent: true,
        targetRegion: region,
        seed: `${seed}:${block.block_id}:formal:present:${region}:${index}`,
      }),
  );

  const sizeAllocationAbsent = allocateBalanced(absentCount, sizes.map(String));
  const absentSpecs: VisualSearchTrialSpec[] = [];
  for (const size of sizes) {
    const sizeCount = sizeAllocationAbsent[String(size)] ?? 0;
    for (let index = 0; index < sizeCount; index += 1) {
      absentSpecs.push(
        buildTrial({
          config,
          phase: 'formal',
          block,
          setSize: size,
          targetPresent: false,
          targetRegion: null,
          seed: `${seed}:${block.block_id}:formal:absent:${size}:${index}`,
        }),
      );
    }
  }
  return interleavePresence(
    presentSpecs,
    absentSpecs,
    `${seed}:${block.block_id}:presence-order`,
  );
}

export function generateVisualSearchTrials({
  config,
  phase,
  count,
  seed,
  block,
}: {
  config: VisualSearchConfig;
  phase: ExperimentPhase;
  count: number;
  seed: string;
  block?: ExperimentBlockConfig<VisualSearchVariant>;
}): VisualSearchTrialSpec[] {
  const activeBlock = (block ??
    config.blocks.find((candidate) => candidate.variant === 'feature_search') ??
    config.blocks[0]) as ExperimentBlockConfig<VisualSearchVariant> | undefined;
  if (!activeBlock) return [];
  if (phase === 'practice') {
    return generatePractice(config, activeBlock, seed);
  }
  if (activeBlock.variant === 'spatial_search') {
    return generateSpatialBlock(config, activeBlock, count, seed);
  }
  return generateSearchBlock(config, activeBlock, count, seed);
}

export function describeVisualSearchAllocation(
  config: VisualSearchConfig,
  block: ExperimentBlockConfig<VisualSearchVariant>,
): string {
  if (block.variant === 'spatial_search') {
    const present = block3PresentCount(block.formalTrials);
    const counts = plannedRegionCounts(block.formalTrials);
    const uncovered = uncoveredRegions(block.formalTrials);
    return `${block.formalTrials} trials: ${present} target-present, ${block.formalTrials - present} target-absent. Planned target observations by region: ${Object.entries(
      counts,
    )
      .map(([region, count]) => `R${region}=${count}`)
      .join(', ')}.${
      uncovered.length > 0
        ? ` Regions ${uncovered.join(', ')} are not covered at this trial count.`
        : ''
    }`;
  }
  const conditions = config.setSizes.flatMap((setSize) => [
    `${setSize}_present`,
    `${setSize}_absent`,
  ]);
  return describeBlockAllocation(
    allocateBalanced(block.formalTrials, conditions),
    block.formalTrials,
  );
}

export interface VisualSearchScore {
  trialId: string;
  trialIndex: number;
  blockId: string;
  blockName: string;
  blockType: BlockType;
  variant: VisualSearchVariant;
  correct: boolean | null;
  responseTime: number | null;
  timeout: boolean;
  targetPresent: boolean;
  targetRegion: RegionNumber | null;
  targetX: number | null;
  targetY: number | null;
  setSize: number;
  conditionId: string;
  mouseAvailable: boolean;
  gazeAvailable: boolean;
  gazeQuality: string;
  gazeValidRatio: number | null;
  eyeTrackingStatus: string;
  gazeMetrics: GazeTrialMetrics;
  mouseMetrics: MouseTrialMetrics;
  windowBlur: boolean;
}

export function summarizeVisualSearch(
  scores: VisualSearchScore[],
  totalFormal: number,
  practiceCompleted: boolean,
  blocks: ExperimentBlockConfig<VisualSearchVariant>[],
) {
  const formal = scores;
  const bySetSize: Record<string, unknown> = {};
  const byPresence: Record<string, unknown> = {};
  const byRegion: Record<string, unknown> = {};
  const byBlock: Record<string, unknown> = {};
  const sizes = groupBy(formal, (score) => String(score.setSize));
  for (const [key, group] of Object.entries(sizes)) {
    bySetSize[key] = conditionStats(
      group.map((score) => ({
        correct: score.correct,
        responseTime: score.responseTime,
        timeout: score.timeout,
      })),
    );
  }
  const presences = groupBy(formal, (score) =>
    score.targetPresent ? 'present' : 'absent',
  );
  for (const [key, group] of Object.entries(presences)) {
    byPresence[key] = conditionStats(
      group.map((score) => ({
        correct: score.correct,
        responseTime: score.responseTime,
        timeout: score.timeout,
      })),
    );
  }
  const regions = groupBy(
    formal.filter((score) => score.targetRegion !== null),
    (score) => String(score.targetRegion),
  );
  for (const [key, group] of Object.entries(regions)) {
    byRegion[key] = conditionStats(
      group.map((score) => ({
        correct: score.correct,
        responseTime: score.responseTime,
        timeout: score.timeout,
      })),
    );
  }
  for (const [key, group] of Object.entries(groupBy(formal, (score) => score.blockId))) {
    byBlock[key] = {
      block_name: group[0]?.blockName ?? null,
      block_type: group[0]?.blockType ?? null,
      variant: group[0]?.variant ?? null,
      ...conditionStats(
        group.map((score) => ({
          correct: score.correct,
          responseTime: score.responseTime,
          timeout: score.timeout,
        })),
      ),
    };
  }
  const spatialBlock = blocks.find((block) => block.variant === 'spatial_search');
  const spatialScores = spatialBlock
    ? formal.filter((score) => score.blockId === spatialBlock.block_id)
    : [];
  const spatialPresent = spatialScores.filter((score) => score.targetPresent);
  const regionTrialCounts: Record<string, number> = {};
  const regionValidCounts: Record<string, number> = {};
  for (const score of spatialPresent) {
    if (score.targetRegion === null) continue;
    const key = String(score.targetRegion);
    regionTrialCounts[key] = (regionTrialCounts[key] ?? 0) + 1;
    if (!score.timeout && score.responseTime !== null) {
      regionValidCounts[key] = (regionValidCounts[key] ?? 0) + 1;
    }
  }
  const validGaze = formal.filter(
    (score) =>
      score.gazeMetrics.quality_sufficient &&
      score.gazeAvailable &&
      score.eyeTrackingStatus !== 'declined' &&
      score.eyeTrackingStatus !== 'unavailable',
  );
  const declined = formal.filter((score) => score.eyeTrackingStatus === 'declined');
  const unavailable = formal.filter(
    (score) => score.eyeTrackingStatus === 'unavailable',
  );
  const poorQuality = formal.filter(
    (score) => score.eyeTrackingStatus === 'poor_quality',
  );
  const mouseUsable = formal.filter(
    (score) => score.mouseMetrics.sufficient_for_metrics,
  );
  const meanValidGaze = meanOrNull(
    validGaze
      .map((score) => score.gazeMetrics.valid_gaze_ratio)
      .filter((value): value is number => value !== null),
  );
  const targetFixationTimes = validGaze
    .map((score) => score.gazeMetrics.target_first_fixation_ms)
    .filter((value): value is number => value !== null);
  const gazeDirections = meanDirectionRatios(
    validGaze,
    (score) => score.gazeMetrics,
  );
  const mouseDirections = meanDirectionRatios(
    mouseUsable,
    (score) => score.mouseMetrics,
  );
  const firstFixationRegions: Record<string, number> = {};
  for (const score of validGaze) {
    const region = score.gazeMetrics.first_fixation_region;
    if (typeof region === 'number') {
      firstFixationRegions[String(region)] =
        (firstFixationRegions[String(region)] ?? 0) + 1;
    }
  }
  return buildSummary({
    formalTrials: formal,
    totalFormal,
    practiceCompleted,
    details: {
      by_block: byBlock,
      blocks: blocks.map((block) => ({
        block_id: block.block_id,
        block_name: BLOCK_BRIEFS[block.variant].blockName,
        block_type: block.block_type,
        variant: block.variant,
        planned_formal_trials: block.formalTrials,
        completed_formal_trials: formal.filter(
          (score) => score.blockId === block.block_id,
        ).length,
      })),
      by_set_size: bySetSize,
      by_target_presence: byPresence,
      by_target_region: byRegion,
      spatial: spatialBlock
        ? {
            block_id: spatialBlock.block_id,
            planned_formal_trials: spatialBlock.formalTrials,
            completed_formal_trials: spatialScores.length,
            target_present_count: spatialPresent.length,
            target_absent_count: spatialScores.length - spatialPresent.length,
            region_trial_counts: regionTrialCounts,
            region_valid_counts: regionValidCounts,
            planned_region_counts: plannedRegionCounts(spatialBlock.formalTrials),
            uncovered_regions: uncoveredRegions(spatialBlock.formalTrials),
            exploratory: true,
            note:
              'Block 3 provides at most one planned observation per region at the default 15 formal trials. Region effects are descriptive and exploratory; they cannot establish stable location effects.',
          }
        : null,
      eye_tracking: {
        usable_trials: validGaze.length,
        declined_trials: declined.length,
        unavailable_trials: unavailable.length,
        poor_quality_trials: poorQuality.length,
        mean_valid_gaze_ratio: meanValidGaze,
        first_fixation_regions: firstFixationRegions,
        trials_with_target_fixation: targetFixationTimes.length,
        mean_target_first_fixation_ms: meanOrNull(targetFixationTimes),
        mean_direction_ratios: gazeDirections,
        note:
          'WebGazer estimates are reported only when calibration passed and enough valid samples were recorded. AOIs are the nine large search-area regions, never individual letters. Direction ratios use the fixation sequence when at least three fixations are available.',
      },
      mouse_tracking: {
        usable_trials: mouseUsable.length,
        first_movement_directions: Object.fromEntries(
          Object.entries(
            groupBy(
              mouseUsable.filter(
                (score) => score.mouseMetrics.first_movement_direction !== null,
              ),
              (score) => score.mouseMetrics.first_movement_direction as string,
            ),
          ).map(([key, group]) => [key, group.length]),
        ),
        mean_direction_ratios: mouseDirections,
        note:
          'Mouse trajectories are behavioural proxies, not eye-tracking measurements. They are stored and analysed separately from gaze.',
      },
      eye_tracking_statuses: Object.fromEntries(
        Object.entries(groupBy(formal, (score) => score.eyeTrackingStatus)).map(
          ([key, group]) => [key, group.length],
        ),
      ),
      window_blur_trials: formal.filter((score) => score.windowBlur).length,
    },
  });
}

const DIRECTION_RATIO_KEYS = [
  'left_to_right_transition_ratio',
  'right_to_left_transition_ratio',
  'top_to_bottom_transition_ratio',
  'bottom_to_top_transition_ratio',
  'center_to_periphery_transition_ratio',
  'periphery_to_center_transition_ratio',
] as const;

type DirectionRatioSource = Record<
  (typeof DIRECTION_RATIO_KEYS)[number],
  number | null
>;

function meanDirectionRatios(
  scores: VisualSearchScore[],
  pick: (score: VisualSearchScore) => DirectionRatioSource,
): Record<string, number | null> {
  return Object.fromEntries(
    DIRECTION_RATIO_KEYS.map((key) => [
      key,
      meanOrNull(
        scores
          .map((score) => pick(score)[key])
          .filter((value): value is number => value !== null),
      ),
    ]),
  );
}

function meanOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}
