import type { RegionNumber, VisualSearchConfig } from '../shared/types.js';
import {
  MIN_FIT_CELL_N,
  MIN_FIT_POINTS,
  REGIONS,
  SSTS_RATIO_REFERENCE,
  TREISMAN_1980_REFERENCE,
  block3PresentCount,
  plannedRegionCounts,
  uncoveredRegions,
} from '../shared/visual-search.js';
import type { LabDb, TrialRow } from './db.js';

export interface DescriptiveStats {
  n: number;
  mean: number | null;
  sd: number | null;
  se: number | null;
  ci_low: number | null;
  ci_high: number | null;
}

export interface SearchCell {
  set_size: number;
  target_present: boolean;
  n_trials: number;
  n_observations: number;
  n_correct: number;
  accuracy: number | null;
  mean_rt_ms: number | null;
  sd_rt_ms: number | null;
  se_rt_ms: number | null;
  ci_low: number | null;
  ci_high: number | null;
  sufficient_for_fit: boolean;
}

export interface SlopeFit {
  available: boolean;
  slope_ms_per_item: number | null;
  intercept_ms: number | null;
  r_squared: number | null;
  n_points: number;
  n_observations: number;
  minimum_cell_n: number;
  reason: string | null;
}

export interface SearchSeries {
  target_present: boolean;
  cells: SearchCell[];
  fit: SlopeFit;
}

export interface SearchVariantAnalysis {
  variant: 'feature_search' | 'conjunction_search';
  block_id: string;
  block_name: string;
  planned_formal_trials: number;
  completed_formal_trials: number;
  correct_trials: number;
  accuracy: number | null;
  mean_correct_rt_ms: number | null;
  present: SearchSeries;
  absent: SearchSeries;
  ratio: number | null;
  ratio_status: 'available' | 'insufficient' | 'denominator_near_zero';
  ratio_note: string;
}

export interface SearchConclusion {
  sentences: string[];
  basis: string;
  theory_test_available: boolean;
}

export interface SearchAnalysis {
  variants: SearchVariantAnalysis[];
  conclusion: SearchConclusion;
  literature: {
    treisman: typeof TREISMAN_1980_REFERENCE;
    ssts: typeof SSTS_RATIO_REFERENCE;
  };
  note: string;
}

export interface RegionStat {
  region: RegionNumber;
  label: string;
  planned_target_count: number;
  completed_target_count: number;
  valid_response_count: number;
  correct_count: number;
  timeout_count: number;
  accuracy: number | null;
  mean_correct_rt_ms: number | null;
  sd_correct_rt_ms: number | null;
  n_participants: number;
  exploratory: boolean;
  insufficient_reason: string | null;
}

export interface SpatialGazeStats {
  available: boolean;
  usable_trials: number;
  target_present_trials: number;
  trials_with_first_fixation: number;
  first_fixation_region_counts: Array<{ region: RegionNumber; count: number }>;
  first_fixation_matches_target_count: number;
  first_fixation_match_rate: number | null;
  mean_first_fixation_distance_normalized: number | null;
  mean_first_fixation_distance_px: number | null;
  mean_target_region_visit_order: number | null;
  target_region_visit_order_counts: Record<string, number>;
  regions_with_first_fixation: number;
  sufficient: boolean;
  n_participants: number;
  note: string;
}

export interface SpatialMouseStats {
  available: boolean;
  usable_trials: number;
  target_present_trials: number;
  first_movement_region_counts: Array<{ region: RegionNumber; count: number }>;
  same_region_count: number;
  different_region_count: number;
  mean_first_movement_latency_ms: number | null;
  mean_path_length_px: number | null;
  mean_target_distance_normalized: number | null;
  sufficient: boolean;
  n_participants: number;
  note: string;
}

export interface SpatialDirectionStats {
  exploratory: boolean;
  usable_trials: number;
  n_participants: number;
  ratios: Record<string, DescriptiveStats>;
  sufficient: boolean;
  note: string;
}

export interface SpatialAnalysis {
  block_id: string;
  block_name: string;
  planned_formal_trials: number;
  completed_formal_trials: number;
  planned_present_count: number;
  planned_absent_count: number;
  completed_present_count: number;
  completed_absent_count: number;
  planned_region_counts: Record<RegionNumber, number>;
  uncovered_regions: RegionNumber[];
  regions: RegionStat[];
  absent: {
    planned: number;
    completed: number;
    correct: number;
    accuracy: number | null;
    mean_correct_rt_ms: number | null;
  };
  n_participants: number;
  coverage_warning: string | null;
  exploratory_note: string;
  gaze: SpatialGazeStats;
  mouse: SpatialMouseStats;
  direction: SpatialDirectionStats;
}

export interface HeatmapBin {
  x: number;
  y: number;
  weight: number;
}

export interface PathPoint {
  x: number;
  y: number;
  t_ms: number;
}

export interface GazePathTrial {
  trial_id: string;
  trial_index: number;
  block_id: string;
  target_present: boolean;
  target_region: RegionNumber | null;
  target_stage_x: number | null;
  target_stage_y: number | null;
  points: PathPoint[];
  sample_count: number;
  valid_gaze_ratio: number | null;
  quality_sufficient: boolean;
}

export interface MousePathTrial {
  trial_id: string;
  trial_index: number;
  block_id: string;
  target_present: boolean;
  target_region: RegionNumber | null;
  target_stage_x: number | null;
  target_stage_y: number | null;
  points: PathPoint[];
  sample_count: number;
  valid_mouse_ratio: number | null;
}

export interface GazeHeatmap {
  layout: 'normalized_stage';
  bins: HeatmapBin[];
  max_weight: number;
  sample_count: number;
  trial_count: number;
  participant_count: number;
  trials: GazePathTrial[];
  sufficient: boolean;
  note: string;
}

export interface MousePaths {
  layout: 'normalized_stage';
  trials: MousePathTrial[];
  trial_count: number;
  participant_count: number;
  note: string;
}

export interface ParticipantScatterPoint {
  present_slope: number;
  absent_slope: number;
}

export interface ParticipantSlopeSummary {
  points: ParticipantScatterPoint[];
  excluded_participants: number;
  total_participants: number;
  note: string;
}

export interface VisualSearchPersonalResults {
  search: SearchAnalysis;
  spatial: SpatialAnalysis | null;
  gaze_heatmap: GazeHeatmap;
  mouse_paths: MousePaths;
  participant_slopes: ParticipantSlopeSummary;
}

export interface VisualSearchGroupResults {
  search: SearchAnalysis;
  spatial: SpatialAnalysis | null;
  gaze_heatmap: GazeHeatmap;
  mouse_paths: MousePaths;
  participant_slopes: ParticipantSlopeSummary;
}

interface ParticipantTrials {
  participant_id: string;
  session_id: string;
  trials: TrialRow[];
}

const DIRECTION_KEYS = [
  'left_to_right',
  'right_to_left',
  'top_to_bottom',
  'bottom_to_top',
  'center_to_periphery',
  'periphery_to_center',
] as const;

export function analyzePersonalVisualSearch(
  db: LabDb,
  sessionId: string,
  trials: TrialRow[],
  config: VisualSearchConfig,
): VisualSearchPersonalResults {
  const search = analyzeSearch([{ participant_id: '', session_id: sessionId, trials }], config, false);
  const spatialTrials = trialsForVariant(trials, config, 'spatial_search');
  const spatial = buildSpatial(
    [{ participant_id: '', session_id: sessionId, trials: spatialTrials }],
    config,
    false,
  );
  const gazeHeatmap = buildGazeHeatmap(
    db,
    [{ participant_id: '', session_id: sessionId, trials }],
    config,
    false,
  );
  const mousePaths = buildMousePaths(
    db,
    [{ participant_id: '', session_id: sessionId, trials }],
    false,
  );
  const participantSlopes = buildParticipantSlopes(
    [{ participant_id: '', session_id: sessionId, trials }],
    config,
  );
  return {
    search,
    spatial,
    gaze_heatmap: gazeHeatmap,
    mouse_paths: mousePaths,
    participant_slopes: participantSlopes,
  };
}

export function analyzeGroupVisualSearch(
  db: LabDb,
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
): VisualSearchGroupResults {
  const search = analyzeSearch(participants, config, true);
  const spatialParticipants = participants.map((participant) => ({
    ...participant,
    trials: trialsForVariant(participant.trials, config, 'spatial_search'),
  }));
  const spatial = buildSpatial(spatialParticipants, config, true);
  return {
    search,
    spatial,
    gaze_heatmap: buildGazeHeatmap(db, participants, config, true),
    mouse_paths: buildMousePaths(db, participants, true),
    participant_slopes: buildParticipantSlopes(participants, config),
  };
}

function analyzeSearch(
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
  group: boolean,
): SearchAnalysis {
  const variants = (['feature_search', 'conjunction_search'] as const).map(
    (variant) => analyzeSearchVariant(participants, config, variant, group),
  );
  return {
    variants,
    conclusion: buildConclusion(variants, participants.length, group),
    literature: {
      treisman: TREISMAN_1980_REFERENCE,
      ssts: SSTS_RATIO_REFERENCE,
    },
    note: group
      ? '班级数值按参与者先计算再汇总，避免把同一参与者的多个试次当作独立个体。探索性斜率使用至少 2 个不同 set size 的有效正确反应时；每 Block 仅 10 个正式试次时，斜率只作参考。'
      : '个人数值仅来自正式试次；练习、超时与错误反应不计入正确反应时。探索性斜率只要求至少 2 个不同 set size 有有效正确反应时，试次少时仅供探索性参考。',
  };
}

function analyzeSearchVariant(
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
  variant: 'feature_search' | 'conjunction_search',
  group: boolean,
): SearchVariantAnalysis {
  const block = config.blocks.find((candidate) => candidate.variant === variant);
  const blockId = block?.block_id ?? variant;
  const blockName = block?.label ?? (variant === 'feature_search' ? '特征搜索' : '联合搜索');
  const allTrials = participants.flatMap((participant) =>
    trialsForVariant(participant.trials, config, variant),
  );
  const completed = allTrials.filter((trial) => trial.phase === 'formal');
  const correct = completed.filter((trial) => trial.correct === 1);
  const correctRts = correct
    .filter((trial) => trial.timeout === 0 && trial.response_time !== null)
    .map((trial) => trial.response_time as number);

  const presentCells = group
    ? groupCells(participants, config, variant, true)
    : personalCells(allTrials, config, variant, true);
  const absentCells = group
    ? groupCells(participants, config, variant, false)
    : personalCells(allTrials, config, variant, false);

  const present: SearchSeries = {
    target_present: true,
    cells: presentCells,
    fit: fitSeries(presentCells),
  };
  const absent: SearchSeries = {
    target_present: false,
    cells: absentCells,
    fit: fitSeries(absentCells),
  };

  const presentSlope = present.fit.slope_ms_per_item;
  const absentSlope = absent.fit.slope_ms_per_item;
  let ratio: number | null = null;
  let ratioStatus: SearchVariantAnalysis['ratio_status'] = 'insufficient';
  let ratioNote = '目标存在或缺失序列不足 2 个有效 set size，无法计算缺失/存在斜率比。';
  if (presentSlope !== null && absentSlope !== null) {
    if (Math.abs(presentSlope) < 0.5) {
      ratioStatus = 'denominator_near_zero';
      ratioNote = '目标存在斜率接近 0 ms/item，比值不稳定，因此报告 NA。';
    } else {
      ratio = round2(absentSlope / presentSlope);
      ratioStatus = 'available';
      ratioNote = '比值 = 目标缺失斜率 ÷ 目标存在斜率；基于少量试次，仅作探索性描述，不做显著性检验。';
    }
  }

  return {
    variant,
    block_id: blockId,
    block_name: blockName,
    planned_formal_trials: block?.formalTrials ?? 0,
    completed_formal_trials: completed.length,
    correct_trials: correct.length,
    accuracy:
      completed.length > 0 ? round4(correct.length / completed.length) : null,
    mean_correct_rt_ms:
      correctRts.length > 0 ? round1(mean(correctRts) ?? 0) : null,
    present,
    absent,
    ratio,
    ratio_status: ratioStatus,
    ratio_note: ratioNote,
  };
}

function personalCells(
  trials: TrialRow[],
  config: VisualSearchConfig,
  variant: 'feature_search' | 'conjunction_search',
  targetPresent: boolean,
): SearchCell[] {
  const relevant = trials.filter(
    (trial) =>
      trial.phase === 'formal' &&
      variantOf(trial, config) === variant &&
      trial.target_present === (targetPresent ? 1 : 0),
  );
  return [...config.setSizes]
    .sort((a, b) => a - b)
    .map((setSize) => {
      const cell = relevant.filter((trial) => trial.set_size === setSize);
      const correctRt = cell
        .filter(
          (trial) =>
            trial.correct === 1 &&
            trial.timeout === 0 &&
            trial.invalid_response === 0 &&
            trial.response_time !== null,
        )
        .map((trial) => trial.response_time as number);
      const stats = describe(correctRt);
      return {
        set_size: setSize,
        target_present: targetPresent,
        n_trials: cell.length,
        n_observations: correctRt.length,
        n_correct: cell.filter((trial) => trial.correct === 1).length,
        accuracy:
          cell.length > 0
            ? round4(cell.filter((trial) => trial.correct === 1).length / cell.length)
            : null,
        mean_rt_ms: stats.mean,
        sd_rt_ms: stats.sd,
        se_rt_ms: stats.se,
        ci_low: stats.ci_low,
        ci_high: stats.ci_high,
        sufficient_for_fit: correctRt.length >= MIN_FIT_CELL_N,
      };
    });
}

function groupCells(
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
  variant: 'feature_search' | 'conjunction_search',
  targetPresent: boolean,
): SearchCell[] {
  const personal = participants.map((participant) =>
    personalCells(participant.trials, config, variant, targetPresent),
  );
  return [...config.setSizes]
    .sort((a, b) => a - b)
    .map((setSize) => {
      const cellValues = personal
        .map((cells) => cells.find((cell) => cell.set_size === setSize))
        .filter((cell): cell is SearchCell => Boolean(cell));
      const participating = cellValues.filter((cell) => cell.n_trials > 0);
      const participantMeans = participating
        .map((cell) => cell.mean_rt_ms)
        .filter((value): value is number => value !== null);
      const stats = describe(participantMeans);
      const nTrials = participating.reduce((sum, cell) => sum + cell.n_trials, 0);
      const nCorrect = participating.reduce((sum, cell) => sum + cell.n_correct, 0);
      return {
        set_size: setSize,
        target_present: targetPresent,
        n_trials: nTrials,
        n_observations: participantMeans.length,
        n_correct: nCorrect,
        accuracy:
          nTrials > 0 ? round4(nCorrect / nTrials) : null,
        mean_rt_ms: stats.mean,
        sd_rt_ms: stats.sd,
        se_rt_ms: stats.se,
        ci_low: stats.ci_low,
        ci_high: stats.ci_high,
        sufficient_for_fit: participantMeans.length >= MIN_FIT_CELL_N,
      };
    });
}

export function fitSeries(cells: SearchCell[]): SlopeFit {
  const populated = cells.filter((cell) => cell.n_trials > 0);
  const usable = populated.filter(
    (cell) =>
      cell.n_observations >= MIN_FIT_CELL_N &&
      cell.mean_rt_ms !== null,
  );
  const base = {
    available: false,
    slope_ms_per_item: null,
    intercept_ms: null,
    r_squared: null,
    n_points: 0,
    n_observations: 0,
    minimum_cell_n: MIN_FIT_CELL_N,
  };
  if (populated.length === 0) {
    return { ...base, reason: '没有正式试次，无法估计斜率。' };
  }
  if (usable.length < MIN_FIT_POINTS) {
    return {
      ...base,
      n_points: usable.length,
      n_observations: usable.reduce((sum, cell) => sum + cell.n_observations, 0),
      reason: `只有 ${usable.length} 个 set size 有有效正确反应时，至少需要 ${MIN_FIT_POINTS} 个不同 set size 才能估计探索性斜率。`,
    };
  }
  const xs = usable.map((cell) => cell.set_size);
  const ys = usable.map((cell) => cell.mean_rt_ms as number);
  const xMean = mean(xs) as number;
  const yMean = mean(ys) as number;
  const covariance = xs.reduce(
    (sum, x, index) => sum + (x - xMean) * (ys[index] - yMean),
    0,
  );
  const variance = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  if (variance === 0) {
    return { ...base, reason: '所有 set size 相同，无法估计斜率。' };
  }
  const slope = covariance / variance;
  const intercept = yMean - slope * xMean;
  const total = ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0);
  const residual = ys.reduce(
    (sum, y, index) => sum + (y - (intercept + slope * xs[index])) ** 2,
    0,
  );
  return {
    available: true,
    slope_ms_per_item: round1(slope),
    intercept_ms: round1(intercept),
    r_squared: total > 0 ? round4(Math.max(0, 1 - residual / total)) : null,
    n_points: usable.length,
    n_observations: usable.reduce((sum, cell) => sum + cell.n_observations, 0),
    minimum_cell_n: MIN_FIT_CELL_N,
    reason: null,
  };
}

function buildConclusion(
  variants: SearchVariantAnalysis[],
  participantCount: number,
  group: boolean,
): SearchConclusion {
  const feature = variants.find((variant) => variant.variant === 'feature_search');
  const conjunction = variants.find(
    (variant) => variant.variant === 'conjunction_search',
  );
  const sentenceFor = (
    label: string,
    analysis: SearchVariantAnalysis | undefined,
  ): string => {
    if (!analysis || analysis.completed_formal_trials === 0) {
      return `${label}没有正式试次数据，无法评价该项表现。`;
    }
    const accuracy =
      analysis.accuracy === null
        ? '正确率未知'
        : `正确率 ${(analysis.accuracy * 100).toFixed(1)}%`;
    const rt =
      analysis.mean_correct_rt_ms === null
        ? '正确反应时缺失'
        : `正确反应平均 ${Math.round(analysis.mean_correct_rt_ms)} ms`;
    const presentFit = analysis.present.fit.available
      ? `目标存在斜率 ${analysis.present.fit.slope_ms_per_item?.toFixed(1)} ms/item`
      : '目标存在斜率因不足 2 个有效 set size 未估计';
    const absentFit = analysis.absent.fit.available
      ? `目标缺失斜率 ${analysis.absent.fit.slope_ms_per_item?.toFixed(1)} ms/item`
      : '目标缺失斜率因不足 2 个有效 set size 未估计';
    return `${label}完成 ${analysis.completed_formal_trials}/${analysis.planned_formal_trials} 个正式试次，${accuracy}，${rt}；${presentFit}，${absentFit}。`;
  };

  const sentences = [
    sentenceFor('特征搜索 Block', feature),
    sentenceFor('联合搜索 Block', conjunction),
  ];
  const featureFit =
    feature?.present.fit.available === true &&
    feature?.absent.fit.available === true;
  const conjunctionFit =
    conjunction?.present.fit.available === true &&
    conjunction?.absent.fit.available === true;
  if (featureFit && conjunctionFit) {
    const featureSlope = feature?.present.fit.slope_ms_per_item as number;
    const conjunctionSlope = conjunction?.present.fit.slope_ms_per_item as number;
    const difference = round1(conjunctionSlope - featureSlope);
    const direction = difference > 0 ? '高于' : difference < 0 ? '低于' : '等于';
    sentences.push(
      `联合搜索的目标存在斜率${direction}特征搜索 ${Math.abs(difference).toFixed(1)} ms/item；该差异来自少量试次的探索性拟合，只作描述，未做显著性检验，也不能据此检验特征整合理论。`,
    );
  } else {
    sentences.push(
      `由于至少一个 Block 少于 2 个有有效正确反应时的 set size，本次数据不足以估计探索性斜率；上述数值只描述已完成试次，不能据此推断搜索机制。`,
    );
  }
  return {
    sentences,
    basis: group
      ? `基于 ${participantCount} 名参与者最近一次已完成会话的正式试次；先按参与者汇总。`
      : '基于本次会话的正式试次；练习、超时和错误反应时已排除。',
    theory_test_available: featureFit && conjunctionFit,
  };
}

function buildParticipantSlopes(
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
): ParticipantSlopeSummary {
  let excluded = 0;
  const points: ParticipantScatterPoint[] = [];
  for (const participant of participants) {
    const cells = personalCells(participant.trials, config, 'conjunction_search', true);
    const absentCells = personalCells(
      participant.trials,
      config,
      'conjunction_search',
      false,
    );
    const presentFit = fitSeries(cells);
    const absentFit = fitSeries(absentCells);
    if (
      presentFit.available &&
      absentFit.available &&
      presentFit.slope_ms_per_item !== null &&
      absentFit.slope_ms_per_item !== null
    ) {
      points.push({
        present_slope: presentFit.slope_ms_per_item,
        absent_slope: absentFit.slope_ms_per_item,
      });
    } else {
      excluded += 1;
    }
  }
  return {
    points,
    excluded_participants: excluded,
    total_participants: participants.length,
    note:
      points.length === 0
        ? '没有参与者在联合搜索 Block 中同时具备目标存在与缺失的、至少 2 个 set size 的探索性斜率；不绘制虚构散点。'
        : '每个点代表一名参与者；x 为目标存在斜率，y 为目标缺失斜率。参考线表示缺失/存在斜率比 1:1 与 2:1。斜率基于少量试次，仅作探索。',
  };
}

function buildSpatial(
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
  group: boolean,
): SpatialAnalysis | null {
  const block = config.blocks.find(
    (candidate) => candidate.variant === 'spatial_search',
  );
  if (!block) return null;
  const plannedFormal = block.formalTrials;
  const plannedPresent = block3PresentCount(plannedFormal);
  const plannedAbsent = Math.max(0, plannedFormal - plannedPresent);
  const plannedCounts = plannedRegionCounts(plannedFormal);
  const allTrials = participants.flatMap((participant) =>
    participant.trials.filter(
      (trial) =>
        trial.phase === 'formal' &&
        variantOf(trial, config) === 'spatial_search',
    ),
  );
  if (allTrials.length === 0) {
    return null;
  }
  const completedPresent = allTrials.filter((trial) => trial.target_present === 1);
  const completedAbsent = allTrials.filter((trial) => trial.target_present === 0);
  // A participant who never reached Block 3 must not inflate the group sample
  // size for the spatial modules.
  const spatialParticipants = group
    ? participants.filter((participant) =>
        participant.trials.some(
          (trial) =>
            trial.phase === 'formal' &&
            variantOf(trial, config) === 'spatial_search',
        ),
      ).length
    : 1;

  const regions = REGIONS.map((definition) => {
    const regionTrials = completedPresent.filter(
      (trial) => trial.target_region === definition.region,
    );
    const trialStats = regionTrialStats(regionTrials);
    if (!group) {
      return {
        region: definition.region,
        label: definition.label,
        planned_target_count: plannedCounts[definition.region] ?? 0,
        ...trialStats,
        n_participants: regionTrials.length > 0 ? 1 : 0,
        exploratory: regionTrials.length <= 1,
        insufficient_reason:
          regionTrials.length === 0
            ? '该区域没有可分析的目标试次。'
            : regionTrials.length === 1
              ? '该区域只有 1 个目标试次，位置效应只能作为探索性观察。'
              : trialStats.valid_response_count === 0
                ? '该区域没有有效反应。'
                : trialStats.correct_count === 0
                  ? '该区域没有正确反应时，平均正确反应时报告为 NA。'
                  : null,
      };
    }
    const perParticipant = participants.map((participant) =>
      participant.trials.filter(
        (trial) =>
          trial.phase === 'formal' &&
          variantOf(trial, config) === 'spatial_search' &&
          trial.target_present === 1 &&
          trial.target_region === definition.region,
      ),
    );
    const nonEmpty = perParticipant.filter((list) => list.length > 0);
    const accuracyValues = nonEmpty
      .map((list) => accuracyOf(list))
      .filter((value): value is number => value !== null);
    const rtValues = nonEmpty
      .map((list) => meanCorrectRt(list))
      .filter((value): value is number => value !== null);
    const rtStats = describe(rtValues);
    return {
      region: definition.region,
      label: definition.label,
      planned_target_count: plannedCounts[definition.region] ?? 0,
      completed_target_count: nonEmpty.reduce((sum, list) => sum + list.length, 0),
      valid_response_count: nonEmpty.reduce(
        (sum, list) => sum + list.filter(isValidResponse).length,
        0,
      ),
      correct_count: nonEmpty.reduce(
        (sum, list) => sum + list.filter((trial) => trial.correct === 1).length,
        0,
      ),
      timeout_count: nonEmpty.reduce(
        (sum, list) => sum + list.filter((trial) => trial.timeout === 1).length,
        0,
      ),
      accuracy: accuracyValues.length > 0 ? round4(mean(accuracyValues) as number) : null,
      mean_correct_rt_ms: rtStats.mean,
      sd_correct_rt_ms: rtStats.sd,
      n_participants: nonEmpty.length,
      exploratory: nonEmpty.length <= 1,
      insufficient_reason:
        nonEmpty.length === 0
          ? '班级中没有参与者在该区域完成目标试次。'
          : nonEmpty.length === 1
            ? '仅 1 名参与者在该区域有数据，不能代表班级位置效应。'
            : rtStats.mean === null
              ? '该区域没有正确反应时。'
              : null,
    };
  });

  const absent = {
    planned: plannedAbsent,
    completed: completedAbsent.length,
    correct: completedAbsent.filter((trial) => trial.correct === 1).length,
    accuracy: accuracyOf(completedAbsent),
    mean_correct_rt_ms: meanCorrectRt(completedAbsent),
  };

  const gaze = spatialGazeStats(participants, config, group);
  const mouse = spatialMouseStats(participants, config, group);
  const direction = spatialDirectionStats(participants, config, group);
  const completedRegionSet = new Set(
    completedPresent
      .map((trial) => trial.target_region)
      .filter((region): region is RegionNumber => isRegion(region)),
  );
  const requiredUncovered = uncoveredRegions(plannedFormal).filter(
    (region) => plannedCounts[region] === 0,
  );
  const missingCompleted = REGIONS.map((definition) => definition.region).filter(
    (region) => plannedCounts[region] > 0 && !completedRegionSet.has(region),
  );
  const coverageParts: string[] = [];
  if (requiredUncovered.length > 0) {
    coverageParts.push(
      `计划中未覆盖的区域：${requiredUncovered.join('、')}。`,
    );
  }
  if (missingCompleted.length > 0) {
    coverageParts.push(
      `计划覆盖但当前数据中尚无完成试次的区域：${missingCompleted.join('、')}；系统不会补造位置数据。`,
    );
  }
  return {
    block_id: block.block_id,
    block_name: block.label,
    planned_formal_trials: plannedFormal,
    completed_formal_trials: allTrials.length,
    planned_present_count: plannedPresent,
    planned_absent_count: plannedAbsent,
    completed_present_count: completedPresent.length,
    completed_absent_count: completedAbsent.length,
    planned_region_counts: plannedCounts,
    uncovered_regions: [...new Set([...requiredUncovered, ...missingCompleted])],
    regions,
    absent,
    n_participants: spatialParticipants,
    coverage_warning:
      coverageParts.length > 0 ? coverageParts.join(' ') : null,
    exploratory_note:
      'Block 3 为探索性空间分析。默认 15 个正式试次中每个区域只有 1 个计划目标，因此不能据此推断稳定的位置效应；所有区域统计都按目标存在试次计算，目标缺失试次不进入九区域。',
    gaze,
    mouse,
    direction,
  };
}

function regionTrialStats(trials: TrialRow[]) {
  const valid = trials.filter(isValidResponse);
  const correct = trials.filter((trial) => trial.correct === 1);
  const correctRts = correct
    .filter((trial) => trial.timeout === 0 && trial.response_time !== null)
    .map((trial) => trial.response_time as number);
  const stats = describe(correctRts);
  return {
    completed_target_count: trials.length,
    valid_response_count: valid.length,
    correct_count: correct.length,
    timeout_count: trials.filter((trial) => trial.timeout === 1).length,
    accuracy: trials.length > 0 ? round4(correct.length / trials.length) : null,
    mean_correct_rt_ms: stats.mean,
    sd_correct_rt_ms: stats.sd,
  };
}

function spatialGazeStats(
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
  group: boolean,
): SpatialGazeStats {
  const usable: Array<{
    participant_id: string;
    trial: TrialRow;
    eye: Record<string, unknown>;
  }> = [];
  let targetPresentTrials = 0;
  for (const participant of participants) {
    for (const trial of participant.trials) {
      if (
        trial.phase !== 'formal' ||
        variantOf(trial, config) !== 'spatial_search'
      ) {
        continue;
      }
      if (trial.target_present !== 1) continue;
      targetPresentTrials += 1;
      if (!isUsableGaze(trial, config)) continue;
      const tracking = safeParseObject(trial.tracking_json);
      const eye = asObject(tracking.eye_tracking);
      usable.push({ participant_id: participant.participant_id, trial, eye });
    }
  }
  const firstCounts = regionCountMap();
  let matches = 0;
  let firstAvailable = 0;
  const distances: number[] = [];
  const distancesPx: number[] = [];
  const visitOrders: number[] = [];
  const visitOrderCounts: Record<string, number> = {};
  for (const item of usable) {
    const region = item.eye.first_fixation_region;
    if (isRegion(region)) {
      firstCounts[region] += 1;
      firstAvailable += 1;
      if (item.trial.target_region === region) matches += 1;
    }
    if (
      typeof item.eye.target_distance_normalized === 'number' &&
      Number.isFinite(item.eye.target_distance_normalized)
    ) {
      distances.push(item.eye.target_distance_normalized);
    }
    if (
      typeof item.eye.target_distance_px === 'number' &&
      Number.isFinite(item.eye.target_distance_px)
    ) {
      distancesPx.push(item.eye.target_distance_px);
    }
    if (
      typeof item.eye.target_region_visit_order === 'number' &&
      Number.isFinite(item.eye.target_region_visit_order)
    ) {
      visitOrders.push(item.eye.target_region_visit_order);
      const key = String(item.eye.target_region_visit_order);
      visitOrderCounts[key] = (visitOrderCounts[key] ?? 0) + 1;
    }
  }
  const participantIds = new Set(usable.map((item) => item.participant_id));
  const sufficient = group
    ? participantIds.size >= 3 && usable.length >= 5
    : usable.length >= 5;
  return {
    available: usable.length > 0,
    usable_trials: usable.length,
    target_present_trials: targetPresentTrials,
    trials_with_first_fixation: firstAvailable,
    first_fixation_region_counts: REGIONS.map((definition) => ({
      region: definition.region,
      count: firstCounts[definition.region],
    })),
    first_fixation_matches_target_count: matches,
    first_fixation_match_rate:
      firstAvailable > 0 ? round4(matches / firstAvailable) : null,
    mean_first_fixation_distance_normalized:
      distances.length > 0 ? round4(mean(distances) as number) : null,
    mean_first_fixation_distance_px:
      distancesPx.length > 0 ? round1(mean(distancesPx) as number) : null,
    mean_target_region_visit_order:
      visitOrders.length > 0 ? round2(mean(visitOrders) as number) : null,
    target_region_visit_order_counts: visitOrderCounts,
    regions_with_first_fixation: new Set(
      usable
        .map((item) => item.eye.first_fixation_region)
        .filter((region): region is RegionNumber => isRegion(region)),
    ).size,
    sufficient,
    n_participants: participantIds.size,
    note: sufficient
      ? '仅使用校准通过且有效注视比例达到阈值的 Block 3 目标存在试次。首次注视区域来自 I-DT 停留点，分辨率为大范围九区域，不能定位到单个字母；WebGazer 为探索性估计。'
      : '有效眼动试次不足，首次注视与目标距离只作缺失/探索性说明；鼠标轨迹为单独测量，不能替代注视。',
  };
}

function spatialMouseStats(
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
  group: boolean,
): SpatialMouseStats {
  const usable: Array<{
    participant_id: string;
    mouse: Record<string, unknown>;
  }> = [];
  let targetPresentTrials = 0;
  for (const participant of participants) {
    for (const trial of participant.trials) {
      if (
        trial.phase !== 'formal' ||
        variantOf(trial, config) !== 'spatial_search'
      ) {
        continue;
      }
      if (trial.target_present !== 1) continue;
      targetPresentTrials += 1;
      if (trial.valid_mouse_ratio === null || trial.valid_mouse_ratio < 0.8) {
        continue;
      }
      const tracking = safeParseObject(trial.tracking_json);
      const mouse = asObject(tracking.mouse_tracking);
      if (mouse.sufficient_for_metrics !== true) continue;
      usable.push({ participant_id: participant.participant_id, mouse });
    }
  }
  const firstCounts = regionCountMap();
  let same = 0;
  let different = 0;
  const latencies: number[] = [];
  const paths: number[] = [];
  const distances: number[] = [];
  for (const item of usable) {
    const region = item.mouse.first_movement_region;
    if (isRegion(region)) firstCounts[region] += 1;
    if (item.mouse.target_region_relation === 'same_region') same += 1;
    if (item.mouse.target_region_relation === 'different_region') different += 1;
    if (typeof item.mouse.first_movement_latency_ms === 'number') {
      latencies.push(item.mouse.first_movement_latency_ms);
    }
    if (typeof item.mouse.path_length_px === 'number') {
      paths.push(item.mouse.path_length_px);
    }
    if (typeof item.mouse.target_distance_normalized === 'number') {
      distances.push(item.mouse.target_distance_normalized);
    }
  }
  const participantIds = new Set(usable.map((item) => item.participant_id));
  return {
    available: usable.length > 0,
    usable_trials: usable.length,
    target_present_trials: targetPresentTrials,
    first_movement_region_counts: REGIONS.map((definition) => ({
      region: definition.region,
      count: firstCounts[definition.region],
    })),
    same_region_count: same,
    different_region_count: different,
    mean_first_movement_latency_ms:
      latencies.length > 0 ? round1(mean(latencies) as number) : null,
    mean_path_length_px:
      paths.length > 0 ? round1(mean(paths) as number) : null,
    mean_target_distance_normalized:
      distances.length > 0 ? round4(mean(distances) as number) : null,
    sufficient: group
      ? participantIds.size >= 3 && usable.length >= 5
      : usable.length >= 5,
    n_participants: participantIds.size,
    note:
      '鼠标轨迹是刺激区域内指针移动的行为代理指标，不是眼动。首次移动方向、路径长度与目标距离与注视指标分开计算，绝不合并进眼动热图或扫描路径。',
  };
}

function spatialDirectionStats(
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
  group: boolean,
): SpatialDirectionStats {
  const perParticipant: Record<string, number | null>[] = [];
  let usableTrials = 0;
  for (const participant of participants) {
    const sums = new Map<string, number>();
    const counts = new Map<string, number>();
    let usable = 0;
    for (const trial of participant.trials) {
      if (
        trial.phase !== 'formal' ||
        variantOf(trial, config) !== 'spatial_search' ||
        !isUsableGaze(trial, config)
      ) {
        continue;
      }
      const tracking = safeParseObject(trial.tracking_json);
      const eye = asObject(tracking.eye_tracking);
      const ratios = asObject(eye.direction_ratios);
      const fixationCount =
        typeof eye.fixation_count === 'number' ? eye.fixation_count : 0;
      if (fixationCount < 3) continue;
      let hasAny = false;
      for (const key of DIRECTION_KEYS) {
        const value = ratios[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          sums.set(key, (sums.get(key) ?? 0) + value);
          counts.set(key, (counts.get(key) ?? 0) + 1);
          hasAny = true;
        }
      }
      if (hasAny) {
        usable += 1;
        usableTrials += 1;
      }
    }
    if (usable > 0) {
      perParticipant.push(
        Object.fromEntries(
          DIRECTION_KEYS.map((key) => {
            const count = counts.get(key) ?? 0;
            return [
              key,
              count > 0 ? round4((sums.get(key) as number) / count) : null,
            ];
          }),
        ),
      );
    }
  }
  const ratios: Record<string, DescriptiveStats> = {};
  for (const key of DIRECTION_KEYS) {
    const values = perParticipant
      .map((record) => record[key])
      .filter((value): value is number => typeof value === 'number');
    ratios[key] = describe(values);
  }
  const sufficient = group
    ? perParticipant.length >= 3 && usableTrials >= 5
    : usableTrials >= 3;
  return {
    exploratory: true,
    usable_trials: usableTrials,
    n_participants: perParticipant.length,
    ratios,
    sufficient,
    note: sufficient
      ? '方向比例来自完整有效注视序列中相邻 I-DT 停留点的位移方向，仅描述 Block 3 的探索性搜索方向。至少需要 3 个有效停留点；两个停留点不能推断策略，结果不支持稳定的方向性结论。'
      : '具有至少 3 个有效注视停留点的试次不足，方向指标报告为 NA；不根据两个注视点推断搜索策略。',
  };
}

function buildGazeHeatmap(
  db: LabDb,
  participants: ParticipantTrials[],
  config: VisualSearchConfig,
  group: boolean,
): GazeHeatmap {
  const grid = 30;
  const rows = 20;
  const bins = new Map<string, number>();
  const trials: GazePathTrial[] = [];
  let sampleCount = 0;
  const participantIds = new Set<string>();
  const usableTrials: Array<{
    participant_id: string;
    trial: TrialRow;
  }> = [];
  for (const participant of participants) {
    for (const trial of participant.trials) {
      if (trial.phase !== 'formal' || !isUsableGaze(trial, config)) continue;
      usableTrials.push({ participant_id: participant.participant_id, trial });
    }
  }
  const sampleStatement = db.prepare(
    `SELECT sample_index, screen_x, screen_y, normalized_x, normalized_y, valid, t_ms
     FROM gaze_samples
     WHERE trial_id = ? AND valid = 1
     ORDER BY sample_index ASC`,
  );
  for (const { participant_id, trial } of usableTrials) {
    const stimulus = safeParseObject(trial.stimulus_json);
    const stage = asObject(stimulus.stage_rect);
    const stageLeft = numberOr(stage.left, 0);
    const stageTop = numberOr(stage.top, 0);
    const stageWidth = Math.max(1, numberOr(stage.width, 1));
    const stageHeight = Math.max(1, numberOr(stage.height, 1));
    const raw = sampleStatement.all(trial.trial_id) as unknown as Array<
      Record<string, unknown>
    >;
    const points: PathPoint[] = [];
    for (const sample of raw) {
      const point = stagePoint(sample, stageLeft, stageTop, stageWidth, stageHeight);
      if (!point) continue;
      points.push(point);
    }
    if (points.length === 0) continue;
    sampleCount += points.length;
    participantIds.add(participant_id);
    for (const point of points) {
      const column = Math.min(grid - 1, Math.max(0, Math.floor(point.x * grid)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(point.y * rows)));
      const key = `${column}:${row}`;
      bins.set(key, (bins.get(key) ?? 0) + 1);
    }
    trials.push({
      trial_id: trial.trial_id,
      trial_index: trial.trial_index,
      block_id: trial.block_id,
      target_present: trial.target_present === 1,
      target_region: isRegion(trial.target_region) ? trial.target_region : null,
      target_stage_x: numberOr(stimulus.target_x_stage, NaN) * (stageWidth / 860),
      target_stage_y: numberOr(stimulus.target_y_stage, NaN) * (stageHeight / 540),
      points: downsample(points, 90),
      sample_count: points.length,
      valid_gaze_ratio: trial.valid_gaze_ratio,
      quality_sufficient: true,
    });
  }
  const binList: HeatmapBin[] = [...bins.entries()].map(([key, weight]) => {
    const [column, row] = key.split(':').map(Number);
    return {
      x: round4((column + 0.5) / grid),
      y: round4((row + 0.5) / rows),
      weight,
    };
  });
  const selectedTrials = group ? trials.slice(0, 18) : trials.slice(0, 60);
  const sufficient = group
    ? participantIds.size >= 3 && trials.length >= 5
    : trials.length >= 5;
  return {
    layout: 'normalized_stage',
    bins: binList,
    max_weight: binList.reduce((max, bin) => Math.max(max, bin.weight), 0),
    sample_count: sampleCount,
    trial_count: trials.length,
    participant_count: participantIds.size,
    trials: selectedTrials,
    sufficient,
    note: sufficient
      ? '热图仅汇总校准通过且有效注视比例达标的正式试次，坐标统一映射到相同的 860×540 刺激空间。个人与班级视图不会把鼠标轨迹混入眼动热图。WebGazer 为探索性近似，误差通常达到数度视角。'
      : '有效眼动试次不足，热图不能代表稳定注视分布；不展示推断性结论。鼠标轨迹仍单独显示。',
  };
}

function buildMousePaths(
  db: LabDb,
  participants: ParticipantTrials[],
  group: boolean,
): MousePaths {
  const trials: MousePathTrial[] = [];
  const participantIds = new Set<string>();
  const statement = db.prepare(
    `SELECT sample_index, x, y, normalized_x, normalized_y, valid, t_ms
     FROM mouse_samples
     WHERE trial_id = ? AND valid = 1
     ORDER BY sample_index ASC`,
  );
  for (const participant of participants) {
    for (const trial of participant.trials) {
      if (
        trial.phase !== 'formal' ||
        trial.valid_mouse_ratio === null ||
        trial.valid_mouse_ratio < 0.8
      ) {
        continue;
      }
      const tracking = safeParseObject(trial.tracking_json);
      const mouse = asObject(tracking.mouse_tracking);
      if (mouse.sufficient_for_metrics !== true) continue;
      const raw = statement.all(trial.trial_id) as unknown as Array<
        Record<string, unknown>
      >;
      const points = raw
        .map((sample) => ({
          x: numberOr(sample.normalized_x, NaN),
          y: numberOr(sample.normalized_y, NaN),
          t_ms: numberOr(sample.t_ms, 0),
        }))
        .filter(
          (point) =>
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.x >= 0 &&
            point.x <= 1 &&
            point.y >= 0 &&
            point.y <= 1,
        );
      if (points.length === 0) continue;
      participantIds.add(participant.participant_id);
      const stimulus = safeParseObject(trial.stimulus_json);
      trials.push({
        trial_id: trial.trial_id,
        trial_index: trial.trial_index,
        block_id: trial.block_id,
        target_present: trial.target_present === 1,
        target_region: isRegion(trial.target_region) ? trial.target_region : null,
        target_stage_x: numberOr(stimulus.target_x_stage, NaN),
        target_stage_y: numberOr(stimulus.target_y_stage, NaN),
        points: downsample(points, 90),
        sample_count: points.length,
        valid_mouse_ratio: trial.valid_mouse_ratio,
      });
    }
  }
  return {
    layout: 'normalized_stage',
    trials: group ? trials.slice(0, 18) : trials,
    trial_count: trials.length,
    participant_count: participantIds.size,
    note:
      '鼠标轨迹坐标按刺激空间归一化，与眼动热图分层保存和展示。它不是注视、扫描路径或注意分配。',
  };
}

function stagePoint(
  sample: Record<string, unknown>,
  left: number,
  top: number,
  width: number,
  height: number,
): PathPoint | null {
  const screenX = numberOr(sample.screen_x, NaN);
  const screenY = numberOr(sample.screen_y, NaN);
  let x: number;
  let y: number;
  if (Number.isFinite(screenX) && Number.isFinite(screenY)) {
    x = (screenX - left) / width;
    y = (screenY - top) / height;
  } else {
    const normalizedX = numberOr(sample.normalized_x, NaN);
    const normalizedY = numberOr(sample.normalized_y, NaN);
    if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
      return null;
    }
    // Fallback for legacy rows without screen coordinates: viewport-normalized
    // sampling is already the stage coordinate in the standard layout.
    x = normalizedX;
    y = normalizedY;
  }
  if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) return null;
  return {
    x: round4(Math.min(1, Math.max(0, x))),
    y: round4(Math.min(1, Math.max(0, y))),
    t_ms: round1(numberOr(sample.t_ms, 0)),
  };
}

function downsample(points: PathPoint[], limit: number): PathPoint[] {
  if (points.length <= limit) return points;
  const stride = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * stride)]);
}

function trialsForVariant(
  trials: TrialRow[],
  config: VisualSearchConfig,
  variant: string,
): TrialRow[] {
  return trials.filter(
    (trial) => trial.phase === 'formal' && variantOf(trial, config) === variant,
  );
}

function variantOf(trial: TrialRow, config: VisualSearchConfig): string {
  if (trial.stimulus_type) return trial.stimulus_type;
  return (
    config.blocks.find((block) => block.block_id === trial.block_id)?.variant ??
    ''
  );
}

function isValidResponse(trial: TrialRow): boolean {
  return (
    trial.timeout === 0 &&
    trial.invalid_response === 0 &&
    trial.response_time !== null &&
    trial.response !== null
  );
}

function accuracyOf(trials: TrialRow[]): number | null {
  if (trials.length === 0) return null;
  return round4(trials.filter((trial) => trial.correct === 1).length / trials.length);
}

function meanCorrectRt(trials: TrialRow[]): number | null {
  const values = trials
    .filter(
      (trial) =>
        trial.correct === 1 &&
        trial.timeout === 0 &&
        trial.invalid_response === 0 &&
        trial.response_time !== null,
    )
    .map((trial) => trial.response_time as number);
  return values.length > 0 ? round1(mean(values) as number) : null;
}

function isUsableGaze(trial: TrialRow, config: VisualSearchConfig): boolean {
  const threshold = (config as unknown as { gazeMinValidRatio?: number })
    .gazeMinValidRatio;
  const minimum = typeof threshold === 'number' ? threshold : 0.55;
  return (
    trial.eye_tracking_status === 'calibrated' &&
    trial.valid_gaze_ratio !== null &&
    trial.valid_gaze_ratio >= minimum
  );
}

function isRegion(value: unknown): value is RegionNumber {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 9
  );
}

function regionCountMap(): Record<RegionNumber, number> {
  return Object.fromEntries(
    REGIONS.map((definition) => [definition.region, 0]),
  ) as Record<RegionNumber, number>;
}

export function describe(values: number[]): DescriptiveStats {
  const clean = values.filter((value) => Number.isFinite(value));
  const n = clean.length;
  if (n === 0) {
    return { n: 0, mean: null, sd: null, se: null, ci_low: null, ci_high: null };
  }
  const avg = mean(clean) as number;
  if (n === 1) {
    return {
      n,
      mean: round2(avg),
      sd: null,
      se: null,
      ci_low: null,
      ci_high: null,
    };
  }
  const variance =
    clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const se = sd / Math.sqrt(n);
  return {
    n,
    mean: round2(avg),
    sd: round2(sd),
    se: round2(se),
    ci_low: round2(avg - 1.96 * se),
    ci_high: round2(avg + 1.96 * se),
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safeParseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
