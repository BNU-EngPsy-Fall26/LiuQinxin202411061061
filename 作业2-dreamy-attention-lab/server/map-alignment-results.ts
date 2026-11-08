import type { TrialRow } from './db.js';

export type MapCueCondition = 'none' | 'person';
export type MapAlignmentState = 'aligned' | 'misaligned';
export type MapDirection = 'front' | 'back' | 'left' | 'right';

export interface MapStats {
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
  correct_answer: MapDirection;
  response: MapDirection;
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

export interface MapConclusions {
  rt: string;
  errors: string;
  interpretation: string;
  cue: string;
}

export interface MapAlignmentAnalysis {
  conditions: MapStats[];
  alignment: MapStats[];
  rotations: MapStats[];
  cue_rotations: MapStats[];
  interaction: MapStats[];
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
  conclusions: MapConclusions;
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

interface ParsedMapTrial {
  cue: MapCueCondition;
  rotation_deg: number;
  alignment: MapAlignmentState;
  target_building: string;
  target_building_zh: string;
  facing_building: string;
  facing_building_zh: string;
  correct_answer: MapDirection;
  response: MapDirection | null;
  correct: boolean;
  valid: boolean;
  rt_ms: number | null;
  block_position: number | null;
  block_order: string[] | null;
}

const ROTATIONS = [0, 90, 180, 270];
const DIRECTIONS: MapDirection[] = ['front', 'back', 'left', 'right'];
const DIRECTION_LABELS: Record<MapDirection, string> = {
  front: '前方',
  back: '后方',
  left: '左方',
  right: '右方',
};

export function analyzePersonalMapAlignment(
  trials: TrialRow[],
): MapAlignmentAnalysis {
  const parsed: ParsedMapTrial[] = [];
  let excluded = 0;
  for (const trial of trials) {
    const item = parseMapTrial(trial);
    if (item) parsed.push(item);
    else excluded += 1;
  }
  const groups = (['none', 'person'] as const).map((cue) => ({
    cue,
    trials: parsed.filter((trial) => trial.cue === cue),
  }));
  const conditions = groups.map((group) =>
    statsFromTrials(group.trials, group.cue, null, null),
  );
  const alignment = (['aligned', 'misaligned'] as const).map((state) =>
    statsFromTrials(
      parsed.filter((trial) => trial.alignment === state),
      null,
      null,
      state,
    ),
  );
  const rotations = ROTATIONS.map((rotation) =>
    statsFromTrials(
      parsed.filter((trial) => trial.rotation_deg === rotation),
      null,
      rotation,
      rotation === 0 ? 'aligned' : 'misaligned',
    ),
  );
  const cueRotations = groups.flatMap((group) =>
    ROTATIONS.map((rotation) =>
      statsFromTrials(
        group.trials.filter((trial) => trial.rotation_deg === rotation),
        group.cue,
        rotation,
        rotation === 0 ? 'aligned' : 'misaligned',
      ),
    ),
  );
  const interaction = groups.flatMap((group) =>
    (['aligned', 'misaligned'] as const).map((state) =>
      statsFromTrials(
        group.trials.filter((trial) => trial.alignment === state),
        group.cue,
        null,
        state,
      ),
    ),
  );
  const cost = buildCost(
    {
      no_cue: costForCue(parsed, 'none'),
      person: costForCue(parsed, 'person'),
    },
    'personal',
  );
  const blockPositions = [1, 2]
    .map((position) =>
      blockPositionFromTrials(
        parsed.filter((trial) => trial.block_position === position),
        position,
      ),
    )
    .filter((entry) => entry.n_trials > 0);
  const errorPairs = collectErrorPairs(parsed);
  const conclusions = buildConclusions({
    alignment,
    conditions,
    cost,
    errorPairs,
    mode: 'personal',
  });

  return {
    conditions,
    alignment,
    rotations,
    cue_rotations: cueRotations,
    interaction,
    block_positions: blockPositions,
    cost,
    conclusions,
    error_pairs: errorPairs,
    target_buildings: targetBuildingsFromParsed(parsed),
    block_order: parsed.find((trial) => trial.block_order)?.block_order ?? null,
    included_trials: parsed.length,
    excluded_trials: excluded,
    note:
      '只纳入 v4 正式试次；旧版地图试次不进入本模块。错误率使用全部有效正式试次（排除超时和无效按键）；平均 RT 只使用正确、未超时、未无效的反应。',
  };
}

export function analyzeGroupMapAlignment(
  participants: Array<{ participant_id: string; trials: TrialRow[] }>,
): MapAlignmentAnalysis {
  const personal = participants.map((participant) => ({
    participant_id: participant.participant_id,
    analysis: analyzePersonalMapAlignment(participant.trials),
  }));

  const conditions = (['none', 'person'] as const).map((cue) =>
    aggregateStats(
      personal.map((item) =>
        item.analysis.conditions.find((cell) => cell.cue === cue),
      ),
      cue,
      null,
      null,
    ),
  );
  const alignment = (['aligned', 'misaligned'] as const).map((state) =>
    aggregateStats(
      personal.map((item) =>
        item.analysis.alignment.find((cell) => cell.alignment === state),
      ),
      null,
      null,
      state,
    ),
  );
  const rotations = ROTATIONS.map((rotation) =>
    aggregateStats(
      personal.map((item) =>
        item.analysis.rotations.find(
          (cell) => cell.rotation_deg === rotation,
        ),
      ),
      null,
      rotation,
      rotation === 0 ? 'aligned' : 'misaligned',
    ),
  );
  const cueRotations = (['none', 'person'] as const).flatMap((cue) =>
    ROTATIONS.map((rotation) =>
      aggregateStats(
        personal.map((item) =>
          item.analysis.cue_rotations.find(
            (cell) =>
              cell.cue === cue && cell.rotation_deg === rotation,
          ),
        ),
        cue,
        rotation,
        rotation === 0 ? 'aligned' : 'misaligned',
      ),
    ),
  );
  const interaction = (['none', 'person'] as const).flatMap((cue) =>
    (['aligned', 'misaligned'] as const).map((state) =>
      aggregateStats(
        personal.map((item) =>
          item.analysis.interaction.find(
            (cell) => cell.cue === cue && cell.alignment === state,
          ),
        ),
        cue,
        null,
        state,
      ),
    ),
  );

  const blockPositions = [1, 2]
    .map((position) =>
      aggregateBlockPositions(
        personal.map((item) =>
          item.analysis.block_positions.find(
            (entry) => entry.position === position,
          ),
        ),
        position,
      ),
    )
    .filter((entry) => entry.n_trials > 0);

  const cost = combineCosts(
    personal.map((item) => item.analysis.cost),
    'group',
  );
  const errorPairs = mergeErrorPairs(
    personal.map((item) => item.analysis.error_pairs),
  );
  const conclusions = buildConclusions({
    alignment,
    conditions,
    cost,
    errorPairs,
    mode: 'group',
  });
  const targetBuildings = aggregateTargetBuildings(personal);
  const orders = personal
    .map((item) => item.analysis.block_order)
    .filter((order): order is string[] => Array.isArray(order));
  const firstOrder = orders[0] ?? null;
  const sharedOrder =
    firstOrder &&
    orders.every(
      (order) => order.join('|') === firstOrder.join('|'),
    )
      ? firstOrder
      : null;

  return {
    conditions,
    alignment,
    rotations,
    cue_rotations: cueRotations,
    interaction,
    block_positions: blockPositions,
    cost,
    conclusions,
    error_pairs: errorPairs,
    target_buildings: targetBuildings,
    block_order: sharedOrder,
    included_trials: sum(
      personal.map((item) => item.analysis.included_trials),
    ),
    excluded_trials: sum(
      personal.map((item) => item.analysis.excluded_trials),
    ),
    note:
      '群体图按参与者先汇总、再在参与者层面平均，避免试次多的参与者权重过大。只纳入 v4 正式试次；RT 只统计正确、未超时、未无效反应。',
  };
}

function parseMapTrial(trial: TrialRow): ParsedMapTrial | null {
  let stimulus: Record<string, unknown>;
  try {
    stimulus = JSON.parse(trial.stimulus_json) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (Number(stimulus.map_protocol_version) !== 4) return null;
  const cue =
    stimulus.person_cue === 'none'
      ? 'none'
      : stimulus.person_cue === 'person'
        ? 'person'
        : null;
  const rotationRaw = stimulus.rotation_deg;
  const headingRaw = stimulus.heading_deg;
  if (
    cue === null ||
    typeof rotationRaw !== 'number' ||
    !Number.isFinite(rotationRaw)
  ) {
    return null;
  }
  const mapRotationDeg = ((rotationRaw % 360) + 360) % 360;
  const headingDeg =
    typeof headingRaw === 'number' && Number.isFinite(headingRaw)
      ? ((headingRaw % 360) + 360) % 360
      : mapRotationDeg;
  if (headingDeg % 90 !== 0) return null;
  // Fixed-map trials store the facing angle in heading_deg (and mirror it in
  // rotation_deg for compatibility). Legacy v4 trials store only a nonzero map
  // rotation with heading_deg = 0; fall back to that so old records keep their
  // original alignment classification.
  const rotation_deg =
    headingDeg === 0 &&
    stimulus.alignment === 'misaligned' &&
    mapRotationDeg !== 0
      ? mapRotationDeg
      : headingDeg;
  if (rotation_deg % 90 !== 0) return null;
  const target_building =
    typeof stimulus.target_building === 'string'
      ? stimulus.target_building
      : null;
  const facing_building =
    typeof stimulus.facing_building === 'string'
      ? stimulus.facing_building
      : null;
  if (!target_building || !facing_building) return null;
  const correct_answer = parseDirection(
    stimulus.correct_answer ?? stimulus.target_direction,
  );
  const response = parseDirection(trial.response);
  if (!correct_answer) return null;
  const alignment: MapAlignmentState =
    stimulus.alignment === 'misaligned' || rotation_deg !== 0
      ? 'misaligned'
      : 'aligned';
  const valid =
    trial.timeout !== 1 &&
    trial.invalid_response !== 1 &&
    response !== null &&
    (trial.correct === 0 || trial.correct === 1);
  const correct = valid && trial.correct === 1;
  const rt_ms =
    valid &&
    correct &&
    trial.response_time !== null &&
    Number.isFinite(trial.response_time) &&
    trial.response_time >= 0
      ? trial.response_time
      : null;
  const blockPositionRaw = stimulus.block_presentation_order;
  const block_position =
    typeof blockPositionRaw === 'number' &&
    Number.isInteger(blockPositionRaw) &&
    blockPositionRaw >= 1 &&
    blockPositionRaw <= 2
      ? blockPositionRaw
      : null;
  const block_order = Array.isArray(stimulus.block_order)
    ? stimulus.block_order.filter(
        (value): value is string => typeof value === 'string',
      )
    : null;
  return {
    cue,
    rotation_deg,
    alignment,
    target_building,
    target_building_zh: stringOr(
      stimulus.target_building_zh,
      targetLabel(target_building),
    ),
    facing_building,
    facing_building_zh: stringOr(
      stimulus.facing_building_zh,
      targetLabel(facing_building),
    ),
    correct_answer,
    response,
    correct,
    valid,
    rt_ms,
    block_position,
    block_order,
  };
}

function parseDirection(value: unknown): MapDirection | null {
  return typeof value === 'string' &&
    (DIRECTIONS as string[]).includes(value)
    ? (value as MapDirection)
    : null;
}

function statsFromTrials(
  trials: ParsedMapTrial[],
  cue: MapCueCondition | null,
  rotation: number | null,
  alignment: MapAlignmentState | null,
): MapStats {
  const valid = trials.filter((trial) => trial.valid);
  const observations = valid
    .map((trial) => trial.rt_ms)
    .filter((value): value is number => value !== null);
  const accuracy =
    valid.length > 0
      ? round4(valid.filter((trial) => trial.correct).length / valid.length)
      : null;
  return {
    cue,
    rotation_deg: rotation,
    alignment,
    n_trials: trials.length,
    n_valid: valid.length,
    n_observations: observations.length,
    n_correct: valid.filter((trial) => trial.correct).length,
    n_participants: trials.length > 0 ? 1 : 0,
    accuracy,
    error_rate: accuracy === null ? null : round4(1 - accuracy),
    mean_rt_ms: round1OrNull(meanOrNull(observations)),
  };
}

function costForCue(
  trials: ParsedMapTrial[],
  cue: MapCueCondition,
): MapConditionCost {
  const cueTrials = trials.filter((trial) => trial.cue === cue);
  const aligned = cueTrials.filter((trial) => trial.alignment === 'aligned');
  const misaligned = cueTrials.filter(
    (trial) => trial.alignment === 'misaligned',
  );
  const alignedStats = statsFromTrials(aligned, cue, 0, 'aligned');
  const misalignedStats = statsFromTrials(
    misaligned,
    cue,
    null,
    'misaligned',
  );
  return {
    cue,
    aligned_mean_rt_ms: alignedStats.mean_rt_ms,
    misaligned_mean_rt_ms: misalignedStats.mean_rt_ms,
    misalignment_cost_ms:
      alignedStats.mean_rt_ms !== null &&
      misalignedStats.mean_rt_ms !== null
        ? round1OrNull(
            misalignedStats.mean_rt_ms - alignedStats.mean_rt_ms,
          )
        : null,
    aligned_error_rate: alignedStats.error_rate,
    misaligned_error_rate: misalignedStats.error_rate,
    error_cost:
      alignedStats.error_rate !== null &&
      misalignedStats.error_rate !== null
        ? round4(misalignedStats.error_rate - alignedStats.error_rate)
        : null,
    aligned_accuracy: alignedStats.accuracy,
    misaligned_accuracy: misalignedStats.accuracy,
    accuracy_cost:
      alignedStats.accuracy !== null && misalignedStats.accuracy !== null
        ? round4(alignedStats.accuracy - misalignedStats.accuracy)
        : null,
  };
}

function buildCost(
  costs: { no_cue: MapConditionCost; person: MapConditionCost },
  mode: 'personal' | 'group',
): MapAlignmentAnalysis['cost'] {
  const cueReductionMs =
    costs.no_cue.misalignment_cost_ms !== null &&
    costs.person.misalignment_cost_ms !== null
      ? round1OrNull(
          costs.no_cue.misalignment_cost_ms -
            costs.person.misalignment_cost_ms,
        )
      : null;
  const cueReductionError =
    costs.no_cue.error_cost !== null && costs.person.error_cost !== null
      ? round4(costs.no_cue.error_cost - costs.person.error_cost)
      : null;
  const cueReductionAccuracy =
    costs.no_cue.accuracy_cost !== null && costs.person.accuracy_cost !== null
      ? round4(
          costs.no_cue.accuracy_cost - costs.person.accuracy_cost,
        )
      : null;
  return {
    ...costs,
    cue_reduction_ms: cueReductionMs,
    cue_reduction_error: cueReductionError,
    cue_reduction_accuracy: cueReductionAccuracy,
    available: cueReductionMs !== null,
    conclusion: cueConclusion(
      cueReductionMs,
      cueReductionError,
      mode,
    ),
  };
}

function combineCosts(
  costs: Array<{
    no_cue: MapConditionCost;
    person: MapConditionCost;
  }>,
  mode: 'personal' | 'group',
): MapAlignmentAnalysis['cost'] {
  return buildCost(
    {
      no_cue: averageCost(costs.map((item) => item.no_cue)),
      person: averageCost(costs.map((item) => item.person)),
    },
    mode,
  );
}

function averageCost(costs: MapConditionCost[]): MapConditionCost {
  const cue = costs[0]?.cue ?? 'none';
  const aligned = values(costs.map((cost) => cost.aligned_mean_rt_ms));
  const misaligned = values(costs.map((cost) => cost.misaligned_mean_rt_ms));
  const costsMs = values(costs.map((cost) => cost.misalignment_cost_ms));
  const alignedError = values(costs.map((cost) => cost.aligned_error_rate));
  const misalignedError = values(
    costs.map((cost) => cost.misaligned_error_rate),
  );
  const errorCosts = values(costs.map((cost) => cost.error_cost));
  const alignedAccuracy = values(costs.map((cost) => cost.aligned_accuracy));
  const misalignedAccuracy = values(
    costs.map((cost) => cost.misaligned_accuracy),
  );
  const accuracyCosts = values(costs.map((cost) => cost.accuracy_cost));
  return {
    cue,
    aligned_mean_rt_ms: round1OrNull(meanOrNull(aligned)),
    misaligned_mean_rt_ms: round1OrNull(meanOrNull(misaligned)),
    misalignment_cost_ms: round1OrNull(meanOrNull(costsMs)),
    aligned_error_rate: meanOrNull(alignedError),
    misaligned_error_rate: meanOrNull(misalignedError),
    error_cost: round4OrNull(meanOrNull(errorCosts)),
    aligned_accuracy: meanOrNull(alignedAccuracy),
    misaligned_accuracy: meanOrNull(misalignedAccuracy),
    accuracy_cost: round4OrNull(meanOrNull(accuracyCosts)),
  };
}

function aggregateStats(
  inputs: Array<MapStats | undefined>,
  cue: MapCueCondition | null,
  rotation: number | null,
  alignment: MapAlignmentState | null,
): MapStats {
  const present = inputs.filter(
    (cell): cell is MapStats => Boolean(cell) && (cell?.n_trials ?? 0) > 0,
  );
  return {
    cue,
    rotation_deg: rotation,
    alignment,
    n_trials: sum(present.map((cell) => cell.n_trials)),
    n_valid: sum(present.map((cell) => cell.n_valid)),
    n_observations: sum(present.map((cell) => cell.n_observations)),
    n_correct: sum(present.map((cell) => cell.n_correct)),
    n_participants: present.length,
    accuracy: meanOrNull(
      present
        .map((cell) => cell.accuracy)
        .filter((value): value is number => value !== null),
    ),
    error_rate: meanOrNull(
      present
        .map((cell) => cell.error_rate)
        .filter((value): value is number => value !== null),
    ),
    mean_rt_ms: round1OrNull(
      meanOrNull(
        present
          .map((cell) => cell.mean_rt_ms)
          .filter((value): value is number => value !== null),
      ),
    ),
  };
}

function aggregateBlockPositions(
  inputs: Array<MapBlockPositionStats | undefined>,
  position: number,
): MapBlockPositionStats {
  const present = inputs.filter(
    (entry): entry is MapBlockPositionStats =>
      Boolean(entry) && (entry?.n_trials ?? 0) > 0,
  );
  return {
    position,
    n_participants: present.length,
    n_trials: sum(present.map((entry) => entry.n_trials)),
    n_valid: sum(present.map((entry) => entry.n_valid)),
    n_observations: sum(present.map((entry) => entry.n_observations)),
    accuracy: meanOrNull(
      present
        .map((entry) => entry.accuracy)
        .filter((value): value is number => value !== null),
    ),
    error_rate: meanOrNull(
      present
        .map((entry) => entry.error_rate)
        .filter((value): value is number => value !== null),
    ),
    mean_rt_ms: round1OrNull(
      meanOrNull(
        present
          .map((entry) => entry.mean_rt_ms)
          .filter((value): value is number => value !== null),
      ),
    ),
  };
}

function blockPositionFromTrials(
  trials: ParsedMapTrial[],
  position: number,
): MapBlockPositionStats {
  const stats = statsFromTrials(trials, null, null, null);
  return {
    position,
    n_participants: trials.length > 0 ? 1 : 0,
    n_trials: stats.n_trials,
    n_valid: stats.n_valid,
    n_observations: stats.n_observations,
    accuracy: stats.accuracy,
    error_rate: stats.error_rate,
    mean_rt_ms: stats.mean_rt_ms,
  };
}

function targetBuildingsFromParsed(
  trials: ParsedMapTrial[],
): MapAlignmentAnalysis['target_buildings'] {
  const map = new Map<string, ParsedMapTrial[]>();
  for (const trial of trials) {
    const list = map.get(trial.target_building) ?? [];
    list.push(trial);
    map.set(trial.target_building, list);
  }
  return [...map.entries()]
    .map(([building, entries]) => {
      const stats = statsFromTrials(entries, null, null, null);
      return {
        building,
        label: entries[0]?.target_building_zh ?? targetLabel(building),
        n_trials: stats.n_trials,
        n_valid: stats.n_valid,
        n_observations: stats.n_observations,
        n_participants: 1,
        accuracy: stats.accuracy,
        error_rate: stats.error_rate,
        mean_rt_ms: stats.mean_rt_ms,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

function aggregateTargetBuildings(
  personal: Array<{
    participant_id: string;
    analysis: MapAlignmentAnalysis;
  }>,
): MapAlignmentAnalysis['target_buildings'] {
  const map = new Map<
    string,
    Array<MapAlignmentAnalysis['target_buildings'][number]>
  >();
  for (const item of personal) {
    for (const building of item.analysis.target_buildings) {
      const list = map.get(building.building) ?? [];
      list.push(building);
      map.set(building.building, list);
    }
  }
  return [...map.entries()]
    .map(([building, entries]) => {
      const present = entries.filter((entry) => entry.n_trials > 0);
      return {
        building,
        label: entries[0]?.label ?? targetLabel(building),
        n_trials: sum(present.map((entry) => entry.n_trials)),
        n_valid: sum(present.map((entry) => entry.n_valid)),
        n_observations: sum(present.map((entry) => entry.n_observations)),
        n_participants: present.length,
        accuracy: meanOrNull(
          present
            .map((entry) => entry.accuracy)
            .filter((value): value is number => value !== null),
        ),
        error_rate: meanOrNull(
          present
            .map((entry) => entry.error_rate)
            .filter((value): value is number => value !== null),
        ),
        mean_rt_ms: round1OrNull(
          meanOrNull(
            present
              .map((entry) => entry.mean_rt_ms)
              .filter((value): value is number => value !== null),
          ),
        ),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

function collectErrorPairs(trials: ParsedMapTrial[]): MapErrorPair[] {
  const counts = new Map<string, MapErrorPair>();
  for (const trial of trials) {
    if (!trial.valid || trial.correct || !trial.response) continue;
    const key = `${trial.correct_answer}:${trial.response}`;
    const entry = counts.get(key) ?? {
      correct_answer: trial.correct_answer,
      response: trial.response,
      correct_label: DIRECTION_LABELS[trial.correct_answer],
      response_label: DIRECTION_LABELS[trial.response],
      count: 0,
    };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function mergeErrorPairs(
  groups: MapErrorPair[][],
): MapErrorPair[] {
  const counts = new Map<string, MapErrorPair>();
  for (const group of groups) {
    for (const pair of group) {
      const key = `${pair.correct_answer}:${pair.response}`;
      const entry = counts.get(key) ?? { ...pair, count: 0 };
      entry.count += pair.count;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function buildConclusions({
  alignment,
  conditions,
  cost,
  errorPairs,
  mode,
}: {
  alignment: MapStats[];
  conditions: MapStats[];
  cost: MapAlignmentAnalysis['cost'];
  errorPairs: MapErrorPair[];
  mode: 'personal' | 'group';
}): MapConclusions {
  const prefix = mode === 'group' ? '参与者层面：' : '本次数据：';
  const aligned = alignment.find((cell) => cell.alignment === 'aligned');
  const misaligned = alignment.find(
    (cell) => cell.alignment === 'misaligned',
  );
  const rt =
    aligned?.mean_rt_ms !== null &&
    aligned?.mean_rt_ms !== undefined &&
    misaligned?.mean_rt_ms !== null &&
    misaligned?.mean_rt_ms !== undefined
      ? `${prefix}对齐试次平均 RT 为 ${Math.round(
          aligned.mean_rt_ms,
        )} ms，不对齐试次为 ${Math.round(
          misaligned.mean_rt_ms,
        )} ms，相差 ${signedMs(
          misaligned.mean_rt_ms - aligned.mean_rt_ms,
        )}。`
      : `${prefix}有效正确反应时不足，暂时不能比较对齐与不对齐的 RT。`;
  const errorSentence =
    aligned?.error_rate !== null &&
    aligned?.error_rate !== undefined &&
    misaligned?.error_rate !== null &&
    misaligned?.error_rate !== undefined
      ? `错误率从对齐的 ${formatPercent(
          aligned.error_rate,
        )} 变为不对齐的 ${formatPercent(
          misaligned.error_rate,
        )}（${signedPoints(
          misaligned.error_rate - aligned.error_rate,
        )}）；${typicalErrorSentence(errorPairs)}`
      : `有效试次不足，暂时不能比较错误率。`;
  const rtCost = aligned?.mean_rt_ms !== null &&
    aligned?.mean_rt_ms !== undefined &&
    misaligned?.mean_rt_ms !== null &&
    misaligned?.mean_rt_ms !== undefined
    ? misaligned.mean_rt_ms - aligned.mean_rt_ms
    : null;
  const errorCost =
    aligned?.error_rate !== null &&
    aligned?.error_rate !== undefined &&
    misaligned?.error_rate !== null &&
    misaligned?.error_rate !== undefined
      ? misaligned.error_rate - aligned.error_rate
      : null;
  let interpretation: string;
  if (rtCost === null) {
    interpretation =
      '数据不足，无法判断地图对齐效应。这里只做描述性比较，未做显著性检验。';
  } else if (rtCost > 0 && (errorCost === null || errorCost >= 0)) {
    interpretation =
      '不对齐条件下反应更慢且错误率不低，方向与地图对齐效应一致：地图朝向与面朝方向不一致会增加心理旋转和判断负担。这是描述性结果，未做显著性检验。';
  } else if (rtCost > 0) {
    interpretation =
      '不对齐条件下反应更慢，但错误率没有同步上升，可能反映速度与准确率的权衡。这是描述性结果，未做显著性检验。';
  } else if (errorCost !== null && errorCost > 0) {
    interpretation =
      '不对齐条件下错误率更高，但 RT 没有变慢；本数据只显示部分对齐代价。这是描述性结果，未做显著性检验。';
  } else {
    interpretation =
      '本数据没有显示明显的地图对齐代价；可能受试次数量、练习或样本影响。这是描述性结果，未做显著性检验。';
  }
  const person = conditions.find((cell) => cell.cue === 'person');
  const none = conditions.find((cell) => cell.cue === 'none');
  const cue = cueConclusion(cost.cue_reduction_ms, cost.cue_reduction_error, mode) +
    (person && none
      ? ` 不对齐试次中，人物线索 RT 为 ${formatMs(
          cost.person.misaligned_mean_rt_ms,
        )}、错误率 ${formatPercent(
          cost.person.misaligned_error_rate,
        )}；无人物线索为 ${formatMs(
          cost.no_cue.misaligned_mean_rt_ms,
        )}、错误率 ${formatPercent(
          cost.no_cue.misaligned_error_rate,
        )}。`
      : '');
  return { rt, errors: errorSentence, interpretation, cue };
}

function cueConclusion(
  reductionMs: number | null,
  reductionError: number | null,
  mode: 'personal' | 'group',
): string {
  const prefix = mode === 'group' ? '参与者层面：' : '本次数据：';
  if (reductionMs === null) {
    return `${prefix}至少一个线索条件缺少有效的 0° 或不对齐正确 RT，暂时不能判断人物线索是否改善不对齐表现。`;
  }
  const rtSentence =
    reductionMs > 0
      ? `人物线索下，不对齐相对对齐的 RT 增加比无人物线索少 ${Math.round(
          reductionMs,
        )} ms`
      : reductionMs < 0
        ? `人物线索下，不对齐相对对齐的 RT 增加反而比无人物线索多 ${Math.round(
            Math.abs(reductionMs),
          )} ms`
        : '两种线索条件下的 RT 错位代价几乎相同';
  const errorSentence =
    reductionError === null
      ? ''
      : reductionError > 0
        ? `；人物线索的错误率错位代价小 ${formatPercent(reductionError)}`
        : reductionError < 0
          ? `；人物线索的错误率错位代价大 ${formatPercent(
              Math.abs(reductionError),
            )}`
          : '；两种条件的错误率错位代价几乎相同';
  return `${prefix}${rtSentence}${errorSentence}。这是描述性比较，未做显著性检验。`;
}

function typicalErrorSentence(errorPairs: MapErrorPair[]): string {
  const top = errorPairs[0];
  if (!top) return '未出现可分析的错误反应。';
  return `最常见的错误是把「${top.correct_label}」判断为「${top.response_label}」（${top.count} 次）。`;
}

function values(items: Array<number | null>): number[] {
  return items.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
}

function sum(items: number[]): number {
  return items.reduce((total, value) => total + value, 0);
}

function meanOrNull(items: number[]): number | null {
  if (items.length === 0) return null;
  return sum(items) / items.length;
}

function round1OrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

function round4OrNull(value: number | null): number | null {
  return value === null ? null : round4(value);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function targetLabel(building: string): string {
  const labels: Record<string, string> = {
    experiment: '实验楼',
    teaching: '教学楼',
    cafeteria: '食堂',
    library: '图书馆',
  };
  return labels[building] ?? building;
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} ms`;
}

function signedMs(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded} ms`;
}

function signedPoints(value: number): string {
  const points = value * 100;
  return `${points > 0 ? '+' : ''}${points.toFixed(1)} 个百分点`;
}
