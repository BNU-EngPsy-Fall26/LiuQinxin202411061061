import type { RegionNumber, VisualSearchVariant } from './types.js';

/** The search area is defined on the stimulus stage, never on the browser
 * window. These fractions split that area into nine equal regions. */
export const SEARCH_AREA = {
  left: 72 / 860,
  top: 64 / 540,
  right: 788 / 860,
  bottom: 476 / 540,
} as const;

export const SEARCH_AREA_PX = {
  width: 860,
  height: 540,
  left: 72,
  top: 64,
  right: 788,
  bottom: 476,
} as const;

export interface RegionDefinition {
  region: RegionNumber;
  row: 0 | 1 | 2;
  col: 0 | 1 | 2;
  label: string;
  short: string;
}

export const REGIONS: RegionDefinition[] = [
  { region: 1, row: 0, col: 0, label: '左上', short: '左 上' },
  { region: 2, row: 0, col: 1, label: '上中', short: '上 中' },
  { region: 3, row: 0, col: 2, label: '右上', short: '右 上' },
  { region: 4, row: 1, col: 0, label: '左中', short: '左 中' },
  { region: 5, row: 1, col: 1, label: '中央', short: '中 央' },
  { region: 6, row: 1, col: 2, label: '右中', short: '右 中' },
  { region: 7, row: 2, col: 0, label: '左下', short: '左 下' },
  { region: 8, row: 2, col: 1, label: '下中', short: '下 中' },
  { region: 9, row: 2, col: 2, label: '右下', short: '右 下' },
];

export const REGION_NUMBERS: RegionNumber[] = REGIONS.map((item) => item.region);

export function isRegionNumber(value: unknown): value is RegionNumber {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 9
  );
}

/** Map a normalised stage coordinate to one of the nine search-area regions. */
export function regionAtNormalizedPoint(
  x: number,
  y: number,
): RegionNumber | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const width = SEARCH_AREA.right - SEARCH_AREA.left;
  const height = SEARCH_AREA.bottom - SEARCH_AREA.top;
  if (width <= 0 || height <= 0) return null;
  const col = Math.min(
    2,
    Math.max(0, Math.floor(((x - SEARCH_AREA.left) / width) * 3)),
  );
  const row = Math.min(
    2,
    Math.max(0, Math.floor(((y - SEARCH_AREA.top) / height) * 3)),
  );
  return (row * 3 + col + 1) as RegionNumber;
}

export function regionDefinition(region: RegionNumber): RegionDefinition {
  return REGIONS[region - 1];
}

export function regionCenter(region: RegionNumber): { x: number; y: number } {
  const definition = regionDefinition(region);
  const width = SEARCH_AREA.right - SEARCH_AREA.left;
  const height = SEARCH_AREA.bottom - SEARCH_AREA.top;
  return {
    x: SEARCH_AREA.left + ((definition.col + 0.5) / 3) * width,
    y: SEARCH_AREA.top + ((definition.row + 0.5) / 3) * height,
  };
}

/**
 * Formal Block 3 defaults to 15 trials: nine target-present trials (one per
 * region) and six absent trials. If a researcher changes the count, the split
 * is rebalanced without inventing unobserved target locations.
 */
export function block3PresentCount(formalTrials: number): number {
  const total = Math.max(0, Math.floor(formalTrials));
  if (total === 0) return 0;
  if (total < 9) return total;
  return Math.min(total, Math.max(9, Math.round(total * 0.6)));
}

/** Planned number of target-present trials per region. The first pass gives
 * every region one planned observation; extra present trials are distributed
 * in ascending region order. For fewer than nine trials, only that many
 * regions receive a planned observation and the rest remain uncovered. */
export function plannedRegionCounts(formalTrials: number): Record<RegionNumber, number> {
  const present = block3PresentCount(formalTrials);
  const counts = Object.fromEntries(
    REGION_NUMBERS.map((region) => [region, 0]),
  ) as Record<RegionNumber, number>;
  for (let index = 0; index < present; index += 1) {
    const region = REGION_NUMBERS[index % 9];
    counts[region] += 1;
  }
  return counts;
}

export function uncoveredRegions(formalTrials: number): RegionNumber[] {
  const counts = plannedRegionCounts(formalTrials);
  return REGION_NUMBERS.filter((region) => counts[region] === 0);
}

export const VISUAL_SEARCH_BLOCK_ORDER: VisualSearchVariant[] = [
  'feature_search',
  'conjunction_search',
  'spatial_search',
];

export const PRACTICE_TRIALS_PER_BLOCK = 2;

export const TARGET_DESCRIPTION = '红色 O';
export const BLOCK1_DISTRACTOR_DESCRIPTION = '蓝色 O 与蓝色 X';
export const BLOCK2_DISTRACTOR_DESCRIPTION = '红色 X 与蓝色 O';

export const BLOCK_BRIEFS: Record<
  VisualSearchVariant,
  {
    title: string;
    english: string;
    rule: string;
    shortRule: string;
    blockLabel: string;
    blockName: string;
    blockType: 'original_block' | 'extension_block';
  }
> = {
  feature_search: {
    title: 'Block 1 · 特征搜索（颜色）',
    english: 'Feature search',
    rule: '判断阵列中是否有红色 O。干扰项是蓝色 O 和蓝色 X。',
    shortRule: '只凭颜色',
    blockLabel: 'Block 1 · 特征搜索（颜色）',
    blockName: '特征搜索（颜色）',
    blockType: 'original_block',
  },
  conjunction_search: {
    title: 'Block 2 · 联合搜索（颜色 × 形状）',
    english: 'Conjunction search',
    rule: '判断阵列中是否有红色 O。干扰项是红色 X 和蓝色 O。',
    shortRule: '颜色 × 形状',
    blockLabel: 'Block 2 · 联合搜索（颜色 × 形状）',
    blockName: '联合搜索（颜色 × 形状）',
    blockType: 'original_block',
  },
  spatial_search: {
    title: 'Block 3 · 空间位置搜索',
    english: 'Spatial location',
    rule: '判断阵列中是否有红色 O。目标可能出现在任何位置。',
    shortRule: '位置变化',
    blockLabel: 'Block 3 · 空间位置搜索',
    blockName: '空间位置搜索',
    blockType: 'extension_block',
  },
};

/**
 * Values transcribed from the reference site's design data. They are marked
 * approximate in the interface and are used for orientation only.
 */
export const TREISMAN_1980_REFERENCE = {
  citation: 'Treisman & Gelade (1980), Cognitive Psychology 12(1), 97–136',
  source:
    '参考站点 design.json 中转录的近似值；未从原论文图表重新数字化',
  feature: { present: 3.1, absent: 25.1 },
  conjunction: { present: 28.7, absent: 67.1 },
  unit: 'ms/item',
  approximate: true,
} as const;

export const SSTS_RATIO_REFERENCE = {
  value: 2,
  label: 'SSTS 教材参考（约 2:1）',
  note: '教科书常用的经验参照，仅作背景，不与个人数据做显著性检验。',
} as const;

/**
 * Exploratory slope fitting: one correct, non-timeout observation is enough
 * for a set size to count as a data point, and any two distinct set sizes are
 * enough to fit a line. With only 10 formal trials per search block this fit
 * is reported as exploratory rather than removed.
 */
export const MIN_FIT_CELL_N = 1;
export const MIN_FIT_POINTS = 2;
