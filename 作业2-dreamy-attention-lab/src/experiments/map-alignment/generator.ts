import type {
  BlockType,
  ExperimentBlockConfig,
  ExperimentPhase,
  MapAlignment,
  MapAlignmentConfig,
  MapVariant,
  PersonCue,
  RelativeDirection,
  SessionSummary,
} from '@shared/types';
import { allocateBalanced } from '@shared/blocks';
import { Rng, balancedOrder, hashString } from '@/utils/random';
import {
  buildSummary,
  conditionStats,
  groupBy,
} from '@/experiments/shared/summary';

export const MAP_ALIGNMENTS: MapAlignment[] = ['aligned', 'misaligned'];
export const PERSON_CUES: PersonCue[] = ['none', 'person'];
export const DEFAULT_ROTATIONS = [0, 90, 180, 270];

export const RELATIVE_DIRECTIONS: Array<{
  key: RelativeDirection;
  zh: string;
  deg: number;
}> = [
  { key: 'front', zh: '前方', deg: 0 },
  { key: 'right', zh: '右方', deg: 90 },
  { key: 'back', zh: '后方', deg: 180 },
  { key: 'left', zh: '左方', deg: 270 },
];

export const MAP_CENTER = 280;

const BUILDING_SPECS = [
  {
    id: 'experiment',
    zh: '实验楼',
    bearingDeg: 0,
    radius: 150,
    width: 62,
    height: 48,
    tone: 0,
  },
  {
    id: 'teaching',
    zh: '教学楼',
    bearingDeg: 270,
    radius: 154,
    width: 58,
    height: 50,
    tone: 1,
  },
  {
    id: 'cafeteria',
    zh: '食堂',
    bearingDeg: 90,
    radius: 146,
    width: 60,
    height: 46,
    tone: 2,
  },
  {
    id: 'library',
    zh: '图书馆',
    bearingDeg: 180,
    radius: 156,
    width: 56,
    height: 48,
    tone: 3,
  },
] as const;

export type CampusBuildingId = (typeof BUILDING_SPECS)[number]['id'];

export interface CampusBuilding {
  id: CampusBuildingId;
  zh: string;
  bearingDeg: number;
  radius: number;
  width: number;
  height: number;
  tone: number;
  x: number;
  y: number;
}

export const CAMPUS_BUILDINGS: CampusBuilding[] = BUILDING_SPECS.map(
  (building) => ({
    ...building,
    x:
      MAP_CENTER +
      building.radius * Math.sin((building.bearingDeg * Math.PI) / 180),
    y:
      MAP_CENTER -
      building.radius * Math.cos((building.bearingDeg * Math.PI) / 180),
  }),
);

export interface MapTrialSpec {
  id: string;
  blockId: string;
  blockType: BlockType;
  blockPresentationOrder: number;
  variant: MapVariant;
  phase: ExperimentPhase;
  alignment: MapAlignment;
  cue: PersonCue;
  conditionId: string;
  heading: 'building';
  headingDeg: number;
  headingZh: string;
  facingBuilding: CampusBuildingId;
  facingBuildingZh: string;
  facingBuildingWorldBearingDeg: number;
  facingBuildingScreenBearingDeg: number;
  rotationDeg: number;
  mapRotationDeg: number;
  compassNorthScreenDeg: number;
  personScreenHeadingDeg: number;
  targetBuilding: CampusBuildingId;
  targetBuildingZh: string;
  targetDirection: RelativeDirection;
  targetDirectionZh: string;
  targetWorldBearingDeg: number;
  targetScreenBearingDeg: number;
  targetLocalX: number;
  targetLocalY: number;
  targetScreenX: number;
  targetScreenY: number;
  targetRadius: number;
  rngSeed: number;
}

export interface MapScore {
  trialIndex: number;
  blockId: string;
  blockType: BlockType;
  variant: MapVariant;
  alignment: MapAlignment;
  cue: PersonCue;
  blockPresentationOrder: number;
  rotationDeg: number;
  targetBuilding: CampusBuildingId;
  targetBuildingZh: string;
  targetDirection: RelativeDirection;
  response: RelativeDirection | null;
  correct: boolean;
  responseTime: number | null;
  timeout: boolean;
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function rotatePoint(
  x: number,
  y: number,
  degrees: number,
  center = MAP_CENTER,
): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const dx = x - center;
  const dy = y - center;
  return {
    x: center + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function bearingOf(x: number, y: number, center = MAP_CENTER): number {
  return normalizeDegrees(
    (Math.atan2(x - center, center - y) * 180) / Math.PI,
  );
}

/** Screen-relative direction when the participant always faces screen-up. */
export function relativeDirectionForBearing(
  bearingDeg: number,
): (typeof RELATIVE_DIRECTIONS)[number] {
  const normalized = normalizeDegrees(bearingDeg);
  return (
    RELATIVE_DIRECTIONS.find(
      (direction) => Math.abs(normalizeDegrees(normalized - direction.deg)) < 0.001,
    ) ?? RELATIVE_DIRECTIONS[0]
  );
}

export function rotationsFor(config: MapAlignmentConfig): number[] {
  const configured = Array.isArray(config.rotations)
    ? config.rotations.filter(
        (value) =>
          Number.isFinite(value) &&
          value >= 0 &&
          value < 360 &&
          value % 90 === 0,
      )
    : [];
  const unique = [...new Set(configured)].sort((a, b) => a - b);
  if (unique.length === 0) return [...DEFAULT_ROTATIONS];
  if (!unique.includes(0)) unique.unshift(0);
  return unique;
}

export function generateMapTrials({
  config,
  phase,
  count,
  seed,
  block,
  blockPresentationOrder = 1,
}: {
  config: MapAlignmentConfig;
  phase: ExperimentPhase;
  count: number;
  seed: string;
  block?: ExperimentBlockConfig<MapVariant>;
  blockPresentationOrder?: number;
}): MapTrialSpec[] {
  const activeBlock = (block ??
    config.blocks.find((candidate) => candidate.block_type === 'original_block') ??
    config.blocks[0]) as ExperimentBlockConfig<MapVariant> | undefined;
  if (!activeBlock || count <= 0) return [];

  const cue = cueForVariant(activeBlock.variant);
  const headings = rotationsFor(config).filter((heading) =>
    CAMPUS_BUILDINGS.some((building) => building.bearingDeg === heading),
  );
  if (headings.length === 0) return [];
  const rng = new Rng(
    `${seed}:${activeBlock.block_id}:${phase}:map-cells`,
  );
  const formalBalanced =
    phase === 'formal' && count === 15 && headings.length === 4;

  const headingCounts = new Map<number, number>();
  if (formalBalanced) {
    // 15 formal trials: 0 / 90 / 180 / 270 occur 3 / 4 / 4 / 4 times.
    // Facing 0 degrees remains the only aligned angle.
    for (const heading of headings) {
      headingCounts.set(heading, heading === 0 ? 3 : 4);
    }
  } else {
    const shuffledHeadings = rng.shuffle(headings);
    const allocation = allocateBalanced(
      count,
      shuffledHeadings.map((heading) => String(heading)),
    );
    for (const heading of shuffledHeadings) {
      headingCounts.set(heading, allocation[String(heading)] ?? 0);
    }
  }

  const cells: Array<{ heading: number; building: CampusBuilding }> = [];
  const buildingByBearing = (bearing: number) =>
    CAMPUS_BUILDINGS.find(
      (building) => building.bearingDeg === normalizeDegrees(bearing),
    );

  for (const heading of headings) {
    const headingCount = headingCounts.get(heading) ?? 0;
    if (headingCount <= 0) continue;
    const facing = buildingByBearing(heading);
    if (!facing) continue;
    const targets = CAMPUS_BUILDINGS.filter(
      (building) => building.id !== facing.id,
    );
    if (formalBalanced) {
      for (const target of targets) {
        cells.push({ heading, building: target });
      }
    } else {
      const allocation = allocateBalanced(
        headingCount,
        rng.shuffle(targets.map((building) => building.id)),
      );
      for (const target of targets) {
        const targetCount = allocation[target.id] ?? 0;
        for (let index = 0; index < targetCount; index += 1) {
          cells.push({ heading, building: target });
        }
      }
    }
  }

  if (formalBalanced) {
    // The three misaligned headings get one extra trial each. Assign offsets
    // 90 / 180 / 270 exactly once so every correct answer (right/back/left)
    // occurs five times overall, while keeping target buildings balanced.
    // "Front" never occurs because the target never equals the facing building.
    const longHeadings = headings.filter(
      (heading) => (headingCounts.get(heading) ?? 0) === 4,
    );
    const offsets = [90, 180, 270];
    const directionOrders = permutations(offsets);
    const baseCounts = new Map<string, number>();
    for (const cell of cells) {
      baseCounts.set(
        cell.building.id,
        (baseCounts.get(cell.building.id) ?? 0) + 1,
      );
    }
    let bestOrder = directionOrders[0] ?? offsets;
    let bestSpread = Number.POSITIVE_INFINITY;
    for (const order of rng.shuffle(directionOrders)) {
      const counts = new Map(baseCounts);
      let valid = true;
      for (const [index, heading] of longHeadings.entries()) {
        const offset = order[index];
        if (offset === undefined) {
          valid = false;
          break;
        }
        const target = buildingByBearing(heading + offset);
        if (!target) {
          valid = false;
          break;
        }
        counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
      }
      if (!valid) continue;
      const values = [...counts.values()];
      const spread = Math.max(...values) - Math.min(...values);
      if (spread < bestSpread) {
        bestSpread = spread;
        bestOrder = order;
      }
    }
    for (const [index, heading] of longHeadings.entries()) {
      const offset = bestOrder[index];
      if (offset === undefined) continue;
      const target = buildingByBearing(heading + offset);
      if (target) cells.push({ heading, building: target });
    }
  }

  const seen = new Map<string, number>();
  const specs: MapTrialSpec[] = cells.map((cell) => {
    const cellKey = `${cell.heading}:${cell.building.id}`;
    const occurrence = seen.get(cellKey) ?? 0;
    seen.set(cellKey, occurrence + 1);
    const trialSeed = `${seed}:${activeBlock.block_id}:${phase}:${cue}:${cell.heading}:${cell.building.id}:${occurrence}`;
    const facingBuilding = buildingByBearing(cell.heading)!;
    const targetScreenBearing = cell.building.bearingDeg;
    const relative = relativeDirectionForBearing(
      normalizeDegrees(targetScreenBearing - cell.heading),
    );
    const alignment: MapAlignment =
      cell.heading === 0 ? 'aligned' : 'misaligned';
    return {
      id: `ma-${hashString(trialSeed).toString(36)}`,
      blockId: activeBlock.block_id,
      blockType: activeBlock.block_type,
      blockPresentationOrder,
      variant: activeBlock.variant,
      phase,
      alignment,
      cue,
      conditionId: `${activeBlock.variant}_heading${cell.heading}`,
      heading: 'building',
      headingDeg: cell.heading,
      headingZh: `面朝${facingBuilding.zh}`,
      facingBuilding: facingBuilding.id,
      facingBuildingZh: facingBuilding.zh,
      facingBuildingWorldBearingDeg: facingBuilding.bearingDeg,
      facingBuildingScreenBearingDeg: cell.heading,
      rotationDeg: 0,
      mapRotationDeg: 0,
      compassNorthScreenDeg: 0,
      personScreenHeadingDeg: cell.heading,
      targetBuilding: cell.building.id,
      targetBuildingZh: cell.building.zh,
      targetDirection: relative.key,
      targetDirectionZh: relative.zh,
      targetWorldBearingDeg: cell.building.bearingDeg,
      targetScreenBearingDeg: targetScreenBearing,
      targetLocalX: round1(cell.building.x),
      targetLocalY: round1(cell.building.y),
      targetScreenX: round1(cell.building.x),
      targetScreenY: round1(cell.building.y),
      targetRadius: cell.building.radius,
      rngSeed: hashString(trialSeed),
    };
  });

  return balancedOrder(
    specs,
    (spec) => `${spec.alignment}:${spec.headingDeg}`,
    `${seed}:${activeBlock.block_id}:${phase}:order`,
    2,
  );
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) {
      result.push([items[index], ...tail]);
    }
  }
  return result;
}

function cueForVariant(variant: MapVariant): PersonCue {
  return variant === 'person_cue' ? 'person' : 'none';
}

export function variantLabel(variant: MapVariant): string {
  return variant === 'person_cue' ? '人物线索' : '无人物线索';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeMapAlignment(
  scores: MapScore[],
  totalFormal: number,
  practiceCompleted: boolean,
): SessionSummary {
  const byAlignment = conditionGroups(scores, (score) => score.alignment);
  const byCue = conditionGroups(scores, (score) => score.cue);
  const byRotation = conditionGroups(scores, (score) =>
    String(score.rotationDeg),
  );
  const byCueRotation = conditionGroups(
    scores,
    (score) => `${score.cue}_rot${score.rotationDeg}`,
  );
  const byCueAlignment = conditionGroups(
    scores,
    (score) => `${score.cue}_${score.alignment}`,
  );
  const byBlockPosition = conditionGroups(scores, (score) =>
    String(score.blockPresentationOrder),
  );
  const byBlock = conditionGroups(scores, (score) => score.blockId);
  const byTargetBuilding = conditionGroups(
    scores,
    (score) => score.targetBuilding,
  );
  const byTargetDirection = conditionGroups(
    scores,
    (score) => score.targetDirection,
  );
  return buildSummary({
    formalTrials: scores.map((score) => ({
      correct: score.correct,
      responseTime: score.responseTime,
      timeout: score.timeout,
      conditionId: `${score.cue}_rot${score.rotationDeg}`,
    })),
    totalFormal,
    practiceCompleted,
    details: {
      task: 'map-alignment',
      by_block: byBlock,
      by_alignment: byAlignment,
      by_cue: byCue,
      by_rotation: byRotation,
      by_cue_rotation: byCueRotation,
      by_cue_alignment: byCueAlignment,
      by_block_position: byBlockPosition,
      by_target_building: byTargetBuilding,
      by_target_direction: byTargetDirection,
      misalignment_cost: {
        no_cue: cueCost(scores, 'none'),
        person: cueCost(scores, 'person'),
      },
      rotation_definition:
        'Participant heading angle on a fixed map. 0 degrees = facing the building at map top (aligned); 90/180/270 degrees = facing the building at map right/bottom/left (misaligned). The map never rotates.',
      cue_definition:
        'none = ordinary red location marker at map centre; person = top-down person at map centre whose body and head point toward the named facing building. The two conditions share the fixed map, heading text, and correct answer.',
      note: 'Error rate uses all valid formal trials. Mean RT uses correct, non-timeout, non-invalid responses only. Stimulus and question appear together; no preview delay or response deadline.',
    },
  });
}

function cueCost(scores: MapScore[], cue: PersonCue) {
  const cueScores = scores.filter((score) => score.cue === cue);
  const aligned = conditionStats(
    cueScores
      .filter((score) => score.rotationDeg === 0)
      .map(toScored),
  );
  const misaligned = conditionStats(
    cueScores
      .filter((score) => score.rotationDeg !== 0)
      .map(toScored),
  );
  return {
    aligned,
    misaligned,
    rt_cost_ms:
      aligned.mean_rt_ms !== null && misaligned.mean_rt_ms !== null
        ? Math.round((misaligned.mean_rt_ms - aligned.mean_rt_ms) * 10) / 10
        : null,
    accuracy_cost:
      aligned.accuracy !== null && misaligned.accuracy !== null
        ? Math.round((aligned.accuracy - misaligned.accuracy) * 10000) / 10000
        : null,
  };
}

function toScored(score: MapScore) {
  return {
    correct: score.correct,
    responseTime: score.responseTime,
    timeout: score.timeout,
    conditionId: `${score.cue}_rot${score.rotationDeg}`,
  };
}

function conditionGroups(
  scores: MapScore[],
  keyOf: (score: MapScore) => string,
): Record<string, unknown> {
  const groups = groupBy(scores, keyOf);
  const result: Record<string, unknown> = {};
  for (const [key, group] of Object.entries(groups)) {
    result[key] = conditionStats(group.map(toScored));
  }
  return result;
}
