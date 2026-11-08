import { z } from 'zod';
import type {
  ExperimentConfig,
  ExperimentId,
  ExperimentMeta,
  MapAlignmentConfig,
  PerceptualOrderingConfig,
  VisualSearchConfig,
} from './types.js';
import { totalFormalTrials } from './blocks.js';
import {
  BLOCK_BRIEFS,
  PRACTICE_TRIALS_PER_BLOCK,
  VISUAL_SEARCH_BLOCK_ORDER,
} from './visual-search.js';

export const EXPERIMENT_META: Record<ExperimentId, ExperimentMeta> = {
  'visual-search': {
    id: 'visual-search',
    index: '01',
    zhName: '视觉搜索',
    enName: 'Visual Search',
    tagline: '在字母的星群中，寻找唯一的红色 O。',
    description:
      '三个独立 Block：颜色特征搜索、颜色×形状联合搜索、空间位置搜索。判断阵列中是否存在红色 O，记录按键、反应时、鼠标轨迹与（可选）摄像头注视估计。',
    durationLabel: '约 10–12 分钟',
    accent: 'mist',
    outcome: '搜索判断 · 反应时 · 空间位置 · 眼动/鼠标双轨指标',
  },
  'perceptual-ordering': {
    id: 'perceptual-ordering',
    index: '02',
    zhName: '图形知觉排序',
    enName: 'Perceptual Ordering',
    tagline: '不借助数字，仅凭眼睛衡量面积。',
    description:
      '把长宽比相同的矩形按面积从小到大排列。扩展块使用混合长宽比，检验形状线索对面积比较的影响。',
    durationLabel: '约 7–9 分钟',
    accent: 'lilac',
    outcome: '排序正确性 · 完成时间 · 操作记录',
  },
  'map-alignment': {
    id: 'map-alignment',
    index: '03',
    zhName: '地图对齐',
    enName: 'Map Alignment',
    tagline: '当地图不再朝北，你如何辨认方向？',
    description:
      '阅读会旋转的校园地图，判断指定建筑相对你面朝方向的方位。比较中央人物线索能否改善地图不对齐时的方向判断。',
    durationLabel: '约 6–8 分钟',
    accent: 'mint',
    outcome: '方向判断 · 正确率 · 反应时',
  },
};

const visualBlockSchema = z.object({
  block_id: z.string().min(2).max(48).regex(/^[a-z0-9_]+$/),
  block_type: z.enum(['original_block', 'extension_block']),
  label: z.string().min(2).max(60),
  variant: z.enum(['feature_search', 'conjunction_search', 'spatial_search']),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(20),
  formalTrials: z.number().int().min(1).max(200),
});

const orderingBlockSchema = z.object({
  block_id: z.string().min(2).max(48).regex(/^[a-z0-9_]+$/),
  block_type: z.enum(['original_block', 'extension_block']),
  label: z.string().min(2).max(60),
  variant: z.enum(['uniform_aspect', 'mixed_aspect']),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(20),
  formalTrials: z.number().int().min(4).max(200),
});

const mapBlockSchema = z.object({
  block_id: z.string().min(2).max(48).regex(/^[a-z0-9_]+$/),
  block_type: z.enum(['original_block', 'extension_block']),
  label: z.string().min(2).max(60),
  variant: z.enum(['no_cue', 'person_cue']),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(20),
  formalTrials: z.number().int().min(4).max(200),
});

export const DEFAULT_VISUAL_SEARCH_CONFIG: VisualSearchConfig = {
  version: 3,
  // Interpreted as two practice trials per block in the visual-search task.
  practiceTrials: PRACTICE_TRIALS_PER_BLOCK,
  responseTimeoutMs: 4000,
  showResultsToParticipant: true,
  // The three visual-search blocks always run in the fixed order below.
  randomizeBlockOrder: false,
  blocks: VISUAL_SEARCH_BLOCK_ORDER.map((variant, order) => ({
    block_id:
      variant === 'feature_search'
        ? 'vs_feature'
        : variant === 'conjunction_search'
          ? 'vs_conjunction'
          : 'vs_spatial',
    block_type: BLOCK_BRIEFS[variant].blockType,
    label: BLOCK_BRIEFS[variant].blockLabel,
    variant,
    enabled: true,
    order,
    formalTrials:
      variant === 'feature_search' ? 10 : variant === 'conjunction_search' ? 10 : 15,
  })),
  fixationDurationMs: 500,
  postTrialDelayMs: 350,
  setSizes: [4, 8, 16, 24],
  gridColumns: 10,
  gridRows: 6,
  targetKey: 'f',
  absentKey: 'j',
  targetColor: '#e0352b',
  distractorRedColor: '#e0352b',
  distractorBlueColor: '#2a6fdb',
  stimulusBackground: '#FFFFFF',
  letterSizePx: 34,
  jitterPx: 6,
  stimulusFontFamily: 'Arial, Helvetica, sans-serif',
  stimulusFontWeight: 400,
  fixationCrossSizePx: 54,
  fixationCrossStrokePx: 2.5,
  fixationCrossColor: '#26364f',
  targetAoiRadiusPx: 150,
  mouseTracking: true,
  eyeTrackingEnabled: true,
  gazeSampleIntervalMs: 66,
  calibrationPointCount: 9,
  calibrationClicksPerPoint: 3,
  gazeValidationMaxErrorPx: 200,
  gazeMinValidRatio: 0.55,
};

export const DEFAULT_PERCEPTUAL_ORDERING_CONFIG: PerceptualOrderingConfig = {
  version: 2,
  practiceTrials: 3,
  responseTimeoutMs: 120000,
  showResultsToParticipant: true,
  randomizeBlockOrder: false,
  blocks: [
    {
      block_id: 'po_original',
      block_type: 'original_block',
      label: '原始面积排序',
      variant: 'uniform_aspect',
      enabled: true,
      order: 0,
      formalTrials: 20,
    },
    {
      block_id: 'po_mixed_aspect',
      block_type: 'extension_block',
      label: '混合长宽比排序',
      variant: 'mixed_aspect',
      enabled: true,
      order: 1,
      formalTrials: 20,
    },
  ],
  rectanglesPerTrial: 5,
  aspectRatio: 1.6,
  mixedAspectRatios: [0.62, 1, 1.55, 2.2],
  baseArea: 24000,
  difficulties: {
    easy: [0.58, 0.76, 1, 1.3, 1.65],
    medium: [0.72, 0.86, 1, 1.16, 1.35],
    hard: [0.88, 0.945, 1, 1.058, 1.12],
  },
  rectangleFill: '#A8B8D5',
  rectangleStroke: '#6D7F9E',
  stimulusBackground: '#FCFBFE',
  postTrialDelayMs: 300,
};

export const DEFAULT_MAP_ALIGNMENT_CONFIG: MapAlignmentConfig = {
  version: 4,
  // 2 practice trials per block, 4 total.
  practiceTrials: 4,
  // No response deadline: the answer window opens as soon as the stimulus paints.
  responseTimeoutMs: 0,
  showResultsToParticipant: true,
  // Condition order is counterbalanced by participant ID inside the task.
  randomizeBlockOrder: false,
  blocks: [
    {
      block_id: 'ma_no_cue',
      block_type: 'original_block',
      label: '无人物线索',
      variant: 'no_cue',
      enabled: true,
      order: 0,
      formalTrials: 15,
    },
    {
      block_id: 'ma_person_cue',
      block_type: 'extension_block',
      label: '人物线索',
      variant: 'person_cue',
      enabled: true,
      order: 1,
      formalTrials: 15,
    },
  ],
  fixationDurationMs: 500,
  postTrialDelayMs: 350,
  rotations: [0, 90, 180, 270],
  keys: {
    front: 'ArrowUp',
    back: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
  },
  mapSizePx: 560,
  cueSizePx: 38,
};

const base = {
  version: z.number().int().min(1).max(9999),
  practiceTrials: z.number().int().min(0).max(100),
  responseTimeoutMs: z.number().int().min(1000).max(180000),
  showResultsToParticipant: z.boolean(),
  randomizeBlockOrder: z.boolean(),
};

function checkBlocks(
  value: {
    blocks: Array<{
      block_id: string;
      block_type: 'original_block' | 'extension_block';
      variant: string;
      enabled: boolean;
      order: number;
      formalTrials: number;
    }>;
  },
  ctx: z.RefinementCtx,
  validOriginalVariant: string,
) {
  const ids = value.blocks.map((block) => block.block_id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'block_id 必须唯一' });
  }
  const originals = value.blocks.filter(
    (block) => block.block_type === 'original_block',
  );
  if (originals.length !== 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['blocks'],
      message: '必须且只能有一个原始实验 Block',
    });
  }
  for (const block of value.blocks) {
    if (block.block_type === 'original_block') {
      if (!block.enabled) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks'],
          message: '原始实验 Block 不能被停用',
        });
      }
      if (block.variant !== validOriginalVariant) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks'],
          message: `原始实验 Block 的 variant 必须为 ${validOriginalVariant}`,
        });
      }
    }
    if (block.formalTrials < 4) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: '每个 Block 至少 4 个正式试次',
      });
    }
  }
  const orders = value.blocks.map((block) => block.order);
  if (new Set(orders).size !== orders.length) {
    ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'Block 顺序值必须互不相同' });
  }
}

/**
 * The visual-search design is not a free collection of interchangeable
 * blocks: it is one feature block, one conjunction block and one spatial
 * block, always in that order. Researchers may change measurement settings
 * and the formal count (especially Block 3), but not create a fourth
 * condition or disable a block.
 */
function checkVisualSearchBlocks(
  value: {
    blocks: Array<{
      block_id: string;
      block_type: 'original_block' | 'extension_block';
      variant: string;
      enabled: boolean;
      order: number;
      formalTrials: number;
    }>;
  },
  ctx: z.RefinementCtx,
) {
  const ids = value.blocks.map((block) => block.block_id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'block_id 必须唯一' });
  }
  const orders = value.blocks.map((block) => block.order);
  if (new Set(orders).size !== orders.length) {
    ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'Block 顺序值必须互不相同' });
  }
  if (value.blocks.length !== 3) {
    ctx.addIssue({
      code: 'custom',
      path: ['blocks'],
      message: '视觉搜索必须且只能包含三个 Block',
    });
  }
  const expected = [
    { variant: 'feature_search', type: 'original_block', min: 4 },
    { variant: 'conjunction_search', type: 'original_block', min: 4 },
    { variant: 'spatial_search', type: 'extension_block', min: 1 },
  ] as const;
  for (const item of expected) {
    const matches = value.blocks.filter((block) => block.variant === item.variant);
    if (matches.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: `必须且只能有一个 ${item.variant} Block`,
      });
      continue;
    }
    const block = matches[0];
    if (block.block_type !== item.type) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: `${item.variant} 的 block_type 必须为 ${item.type}`,
      });
    }
    if (!block.enabled) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: '三个视觉搜索 Block 都必须启用',
      });
    }
    if (block.formalTrials < item.min) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: `${item.variant} 至少需要 ${item.min} 个正式试次`,
      });
    }
  }
  const feature = value.blocks.find((block) => block.variant === 'feature_search');
  const conjunction = value.blocks.find(
    (block) => block.variant === 'conjunction_search',
  );
  const spatial = value.blocks.find((block) => block.variant === 'spatial_search');
  if (
    feature &&
    conjunction &&
    spatial &&
    !(feature.order < conjunction.order && conjunction.order < spatial.order)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['blocks'],
      message: 'Block 顺序必须严格为特征搜索 → 联合搜索 → 空间位置搜索',
    });
  }
}

export const visualSearchConfigSchema = z
  .object({
    ...base,
    blocks: z.array(visualBlockSchema).min(1).max(8),
    fixationDurationMs: z.number().int().min(100).max(5000),
    postTrialDelayMs: z.number().int().min(0).max(3000),
    setSizes: z.array(z.number().int().min(2).max(120)).min(1).max(6),
    gridColumns: z.number().int().min(3).max(14),
    gridRows: z.number().int().min(3).max(10),
    targetKey: z.string().min(1).max(20),
    absentKey: z.string().min(1).max(20),
    targetColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    distractorRedColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    distractorBlueColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    stimulusBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    letterSizePx: z.number().int().min(18).max(64),
    jitterPx: z.number().int().min(0).max(30),
    stimulusFontFamily: z.string().min(1).max(100),
    stimulusFontWeight: z.literal(400),
    fixationCrossSizePx: z.number().int().min(16).max(120),
    fixationCrossStrokePx: z.number().min(1).max(8),
    fixationCrossColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    targetAoiRadiusPx: z.number().int().min(60).max(260),
    mouseTracking: z.boolean(),
    eyeTrackingEnabled: z.boolean(),
    gazeSampleIntervalMs: z.number().int().min(16).max(250),
    calibrationPointCount: z.union([z.literal(5), z.literal(9)]),
    calibrationClicksPerPoint: z.number().int().min(1).max(6),
    gazeValidationMaxErrorPx: z.number().int().min(80).max(500),
    gazeMinValidRatio: z.number().min(0.1).max(0.95),
  })
  .superRefine((value, ctx) => {
    checkVisualSearchBlocks(value, ctx);
    if (value.practiceTrials !== PRACTICE_TRIALS_PER_BLOCK) {
      ctx.addIssue({
        code: 'custom',
        path: ['practiceTrials'],
        message: `视觉搜索每个 Block 必须恰好有 ${PRACTICE_TRIALS_PER_BLOCK} 个练习试次`,
      });
    }
    if (value.targetKey.toLowerCase() === value.absentKey.toLowerCase()) {
      ctx.addIssue({
        code: 'custom',
        path: ['absentKey'],
        message: '目标键与缺席键必须不同',
      });
    }
    const capacity = value.gridColumns * value.gridRows;
    for (const size of value.setSizes) {
      if (size > capacity) {
        ctx.addIssue({
          code: 'custom',
          path: ['setSizes'],
          message: `集合大小 ${size} 超过网格容量 ${capacity}`,
        });
      }
    }
  });

export const perceptualOrderingConfigSchema = z
  .object({
    ...base,
    blocks: z.array(orderingBlockSchema).min(1).max(8),
    rectanglesPerTrial: z.number().int().min(3).max(8),
    aspectRatio: z.number().min(1).max(3),
    mixedAspectRatios: z.array(z.number().min(0.4).max(3)).min(2).max(8),
    baseArea: z.number().int().min(4000).max(100000),
    difficulties: z.object({
      easy: z.array(z.number().positive()).min(3).max(8),
      medium: z.array(z.number().positive()).min(3).max(8),
      hard: z.array(z.number().positive()).min(3).max(8),
    }),
    rectangleFill: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    rectangleStroke: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    stimulusBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    postTrialDelayMs: z.number().int().min(0).max(3000),
  })
  .superRefine((value, ctx) => {
    checkBlocks(value, ctx, 'uniform_aspect');
    for (const key of ['easy', 'medium', 'hard'] as const) {
      const ratios = value.difficulties[key];
      if (ratios.length !== value.rectanglesPerTrial) {
        ctx.addIssue({
          code: 'custom',
          path: ['difficulties', key],
          message: `难度 ${key} 的面积倍率数量需等于每试次矩形数`,
        });
      }
      const sorted = [...ratios].sort((a, b) => a - b);
      if (sorted.some((n, i) => i > 0 && n <= sorted[i - 1])) {
        ctx.addIssue({
          code: 'custom',
          path: ['difficulties', key],
          message: `难度 ${key} 的面积倍率必须互不相同`,
        });
      }
    }
  });

export const mapAlignmentConfigSchema = z
  .object({
    ...base,
    blocks: z.array(mapBlockSchema).min(1).max(8),
    // 0 disables the deadline entirely.
    responseTimeoutMs: z.number().int().min(0).max(180000),
    fixationDurationMs: z.number().int().min(100).max(5000),
    postTrialDelayMs: z.number().int().min(0).max(3000),
    rotations: z
      .array(z.number().int().min(0).max(359))
      .min(1)
      .refine(
        (values) => values.every((value) => value % 90 === 0),
        '朝向角度必须是 90 的整数倍',
      )
      .refine(
        (values) => new Set(values).size === values.length,
        '朝向角度不能重复',
      )
      .refine(
        (values) => values.includes(0),
        '朝向角度必须包含 0°（对齐条件）',
      ),
    keys: z.object({
      front: z.string().min(1).max(30),
      back: z.string().min(1).max(30),
      left: z.string().min(1).max(30),
      right: z.string().min(1).max(30),
    }),
    mapSizePx: z.number().int().min(360).max(760),
    cueSizePx: z.number().int().min(24).max(72),
  })
  .superRefine((value, ctx) => {
    checkBlocks(value, ctx, 'no_cue');
    const keys = Object.values(value.keys).map((key) => key.toLowerCase());
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['keys'],
        message: '四个方向反应键必须互不相同',
      });
    }
    const variants = value.blocks.map((block) => block.variant);
    if (new Set(variants).size !== variants.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: '同一提示条件只能出现在一个 Block 中',
      });
    }
  });

export const CONFIG_SCHEMAS = {
  'visual-search': visualSearchConfigSchema,
  'perceptual-ordering': perceptualOrderingConfigSchema,
  'map-alignment': mapAlignmentConfigSchema,
} as const;

export const DEFAULT_CONFIGS: Record<ExperimentId, ExperimentConfig> = {
  'visual-search': DEFAULT_VISUAL_SEARCH_CONFIG,
  'perceptual-ordering': DEFAULT_PERCEPTUAL_ORDERING_CONFIG,
  'map-alignment': DEFAULT_MAP_ALIGNMENT_CONFIG,
};

export function cloneDefaultConfig(id: ExperimentId): ExperimentConfig {
  return structuredClone(DEFAULT_CONFIGS[id]);
}

/**
 * Fields that define the original, reference-compatible task. Researchers may
 * configure extension blocks and measurement options, but these values are
 * restored from the shipped defaults so an experiment cannot silently replace
 * its original condition.
 */
const ORIGINAL_LOCKED_FIELDS: Record<ExperimentId, string[]> = {
  'visual-search': [
    'fixationDurationMs',
    'responseTimeoutMs',
    'setSizes',
    'gridColumns',
    'gridRows',
    'targetKey',
    'absentKey',
    'targetColor',
    'distractorRedColor',
    'distractorBlueColor',
    'stimulusBackground',
    'letterSizePx',
    'jitterPx',
    'stimulusFontFamily',
    'stimulusFontWeight',
    'fixationCrossSizePx',
    'fixationCrossStrokePx',
    'fixationCrossColor',
    'targetAoiRadiusPx',
  ],
  'perceptual-ordering': [
    'rectanglesPerTrial',
    'aspectRatio',
    'baseArea',
    'difficulties',
    'rectangleFill',
    'rectangleStroke',
    'stimulusBackground',
    'responseTimeoutMs',
  ],
  'map-alignment': [
    'fixationDurationMs',
    'rotations',
    'keys',
    'mapSizePx',
    'responseTimeoutMs',
  ],
};

export function enforceOriginalConditions(
  id: ExperimentId,
  config: ExperimentConfig,
): ExperimentConfig {
  const defaults = cloneDefaultConfig(id);
  const next = structuredClone(config) as unknown as Record<string, unknown>;
  for (const field of ORIGINAL_LOCKED_FIELDS[id]) {
    next[field] = structuredClone(
      (defaults as unknown as Record<string, unknown>)[field],
    );
  }
  const defaultsByVariant = new Map(
    defaults.blocks.map((block) => [block.variant, block] as const),
  );
  next.blocks = config.blocks.map((block) => {
    const defaultBlock = defaultsByVariant.get(block.variant);
    if (!defaultBlock || block.block_type !== 'original_block') return block;
    return {
      ...block,
      label: defaultBlock.label,
      variant: defaultBlock.variant,
      enabled: true,
      // Blocks 1 and 2 keep their fixed 10 formal trials. The spatial block is
      // intentionally configurable and rebalanced by the generator.
      formalTrials: defaultBlock.formalTrials,
    };
  });
  return next as unknown as ExperimentConfig;
}

/**
 * Upgrade a pre-block config (v1) to the current block model.
 *
 * Legacy top-level `formalTrials` described a single undifferentiated formal
 * phase. It is not carried into one oversized original block: the Phase 2
 * design fixes 20 formal trials per block, keeps the original conditions as
 * `original_block`, and adds extension conditions as separate blocks. The
 * legacy row's stimulus/timing fields are preserved via the spread.
 */
export function normalizeConfigInput(id: ExperimentId, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const defaults = cloneDefaultConfig(id);
  if (id === 'visual-search' && Array.isArray(record.blocks)) {
    const storedVariants = new Set(
      (record.blocks as Array<Record<string, unknown>>).map((block) => block.variant),
    );
    const hasLegacyShape =
      storedVariants.has('letter_search') ||
      !storedVariants.has('feature_search') ||
      !storedVariants.has('conjunction_search');
    if (hasLegacyShape) {
      // Preserve measurement preferences, but replace an obsolete red-T
      // condition with the current three-block design. Silent fallback would
      // leave the production database serving invalid stimuli.
      const core = defaults as unknown as Record<string, unknown>;
      const migrated = {
        ...defaults,
        ...record,
        version: Math.max(3, Number(record.version) || 0),
        practiceTrials: PRACTICE_TRIALS_PER_BLOCK,
        randomizeBlockOrder: false,
        blocks: structuredClone(defaults.blocks),
      } as unknown as Record<string, unknown>;
      // Old configurations described a red T. Preserve measurement choices,
      // but never preserve obsolete stimulus/timing parameters.
      for (const field of ORIGINAL_LOCKED_FIELDS['visual-search']) {
        migrated[field] = structuredClone(core[field]);
      }
      return migrated;
    }
  }
  if (id === 'map-alignment' && Array.isArray(record.blocks)) {
    const variants = new Set(
      (record.blocks as Array<Record<string, unknown>>).map(
        (block) => block.variant,
      ),
    );
    const storedBlocks = record.blocks as Array<Record<string, unknown>>;
    const current =
      Number(record.version) >= 4 &&
      variants.size === 2 &&
      variants.has('no_cue') &&
      variants.has('person_cue') &&
      Array.isArray(record.rotations) &&
      storedBlocks.every((block) => block.formalTrials === 15) &&
      record.practiceTrials === 4 &&
      record.responseTimeoutMs === 0 &&
      !('mapPreviewDurationMs' in record);
    if (!current) {
      // Version 4 uses two condition blocks with 15 formal trials each, a
      // building-based heading, and immediate responding. Historical
      // sessions/trials are never rewritten; only the served config changes.
      const mapDefaults = defaults as MapAlignmentConfig;
      return {
        ...defaults,
        ...record,
        version: Math.max(4, Number(record.version) || 0),
        practiceTrials: mapDefaults.practiceTrials,
        randomizeBlockOrder: false,
        blocks: structuredClone(defaults.blocks),
        responseTimeoutMs: 0,
        fixationDurationMs: mapDefaults.fixationDurationMs,
        postTrialDelayMs: mapDefaults.postTrialDelayMs,
      };
    }
  }
  if (Array.isArray(record.blocks) && record.blocks.length > 0) {
    return { ...defaults, ...record };
  }
  return {
    ...defaults,
    ...record,
    randomizeBlockOrder:
      typeof record.randomizeBlockOrder === 'boolean'
        ? record.randomizeBlockOrder
        : false,
    blocks: defaults.blocks.map((block) => ({ ...block })),
  };
}

export function validateConfig(
  id: ExperimentId,
  value: unknown,
): { success: true; data: ExperimentConfig } | { success: false; issues: string[] } {
  const normalized = normalizeConfigInput(id, value);
  const result = CONFIG_SCHEMAS[id].safeParse(normalized);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map(
        (issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`,
      ),
    };
  }
  return { success: true, data: result.data as ExperimentConfig };
}

export function configSummary(id: ExperimentId, config: ExperimentConfig) {
  return {
    id,
    version: config.version,
    practice_trials: config.practiceTrials,
    formal_trials: totalFormalTrials(config),
    blocks: config.blocks,
    randomize_block_order: config.randomizeBlockOrder,
    show_results_to_participant: config.showResultsToParticipant,
  };
}
