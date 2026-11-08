import type { LabDb } from './db.js';

export interface LiteratureSeedRecord {
  literature_id: string;
  experiment_id: 'visual-search' | 'perceptual-ordering' | 'map-alignment';
  block_variant: string | null;
  title: string;
  authors: string;
  year: number;
  journal: string | null;
  doi: string | null;
  url: string | null;
  sample_size: number | null;
  task: string;
  condition: string;
  dependent_variable: string;
  mean_value: number | null;
  sd_value: number | null;
  se_value: number | null;
  unit: string | null;
  source_page: string;
  extraction_method: string;
  comparability_note: string;
  approximate: number;
  sort_order: number;
}

/**
 * Literature records are deliberately conservative.
 *
 * Numeric values are transcribed from the reference site's design data, not
 * digitised by this project from the original papers. They are therefore
 * marked approximate and are never treated as a benchmark for significance
 * tests. Citations with no verified numeric values keep `mean_value` NULL;
 * the UI must show “暂无可比较的文献数据” for those rows.
 */
export const LITERATURE_SEED: LiteratureSeedRecord[] = [
  {
    literature_id: 'lit-vs-treisman-feature-present',
    experiment_id: 'visual-search',
    block_variant: 'feature_search',
    title: 'A feature-integration theory of attention',
    authors: 'Anne M. Treisman; Garry Gelade',
    year: 1980,
    journal: 'Cognitive Psychology 12(1), 97–136',
    doi: '10.1016/0010-0285(80)90005-5',
    url: 'https://doi.org/10.1016/0010-0285(80)90005-5',
    sample_size: null,
    task: '视觉搜索（特征搜索与联合搜索）',
    condition: '特征搜索，目标出现',
    dependent_variable: '搜索斜率',
    mean_value: 3.1,
    sd_value: null,
    se_value: null,
    unit: 'ms/item',
    source_page: '参考站点设计数据 design.json（w6.search.treisman1980）',
    extraction_method: '转录参考站点的数值；本次未从原论文图表重新数字化',
    comparability_note:
      '参考站点与本平台均使用红色 O 目标与 set size 4/8/16/24，但试次数、呈现设备与程序不同。数值为近似背景，不与个人 RT 做显著性检验。',
    approximate: 1,
    sort_order: 10,
  },
  {
    literature_id: 'lit-vs-treisman-feature-absent',
    experiment_id: 'visual-search',
    block_variant: 'feature_search',
    title: 'A feature-integration theory of attention',
    authors: 'Anne M. Treisman; Garry Gelade',
    year: 1980,
    journal: 'Cognitive Psychology 12(1), 97–136',
    doi: '10.1016/0010-0285(80)90005-5',
    url: 'https://doi.org/10.1016/0010-0285(80)90005-5',
    sample_size: null,
    task: '视觉搜索（特征搜索与联合搜索）',
    condition: '特征搜索，目标缺失',
    dependent_variable: '搜索斜率',
    mean_value: 25.1,
    sd_value: null,
    se_value: null,
    unit: 'ms/item',
    source_page: '参考站点设计数据 design.json（w6.search.treisman1980）',
    extraction_method: '转录参考站点的数值；本次未从原论文图表重新数字化',
    comparability_note:
      '参考站点与本平台均使用红色 O 目标与 4/8/16/24 的 set size；具体试次数和程序仍不同。仅作近似背景，不进行跨研究数值合并。',
    approximate: 1,
    sort_order: 11,
  },
  {
    literature_id: 'lit-vs-treisman-conjunction-present',
    experiment_id: 'visual-search',
    block_variant: 'conjunction_search',
    title: 'A feature-integration theory of attention',
    authors: 'Anne M. Treisman; Garry Gelade',
    year: 1980,
    journal: 'Cognitive Psychology 12(1), 97–136',
    doi: '10.1016/0010-0285(80)90005-5',
    url: 'https://doi.org/10.1016/0010-0285(80)90005-5',
    sample_size: null,
    task: '视觉搜索（特征搜索与联合搜索）',
    condition: '联合搜索，目标出现',
    dependent_variable: '搜索斜率',
    mean_value: 28.7,
    sd_value: null,
    se_value: null,
    unit: 'ms/item',
    source_page: '参考站点设计数据 design.json（w6.search.treisman1980）',
    extraction_method: '转录参考站点的数值；本次未从原论文图表重新数字化',
    comparability_note:
      '联合搜索的刺激组成与本地 Block 2 接近，但试次数、呈现设备与程序不同；数值只用于说明经典效应方向，不与本地均值比较。',
    approximate: 1,
    sort_order: 12,
  },
  {
    literature_id: 'lit-vs-treisman-conjunction-absent',
    experiment_id: 'visual-search',
    block_variant: 'conjunction_search',
    title: 'A feature-integration theory of attention',
    authors: 'Anne M. Treisman; Garry Gelade',
    year: 1980,
    journal: 'Cognitive Psychology 12(1), 97–136',
    doi: '10.1016/0010-0285(80)90005-5',
    url: 'https://doi.org/10.1016/0010-0285(80)90005-5',
    sample_size: null,
    task: '视觉搜索（特征搜索与联合搜索）',
    condition: '联合搜索，目标缺失',
    dependent_variable: '搜索斜率',
    mean_value: 67.1,
    sd_value: null,
    se_value: null,
    unit: 'ms/item',
    source_page: '参考站点设计数据 design.json（w6.search.treisman1980）',
    extraction_method: '转录参考站点的数值；本次未从原论文图表重新数字化',
    comparability_note:
      '参考站点与本平台均使用红色 O 与 4/8/16/24 的 set size，但试次数与程序不同；跨研究数值不可直接比较。',
    approximate: 1,
    sort_order: 13,
  },
  {
    literature_id: 'lit-vs-wolfe-50',
    experiment_id: 'visual-search',
    block_variant: null,
    title: 'Rare items often missed in visual searches',
    authors: 'Jeremy M. Wolfe; Todd S. Horowitz; Naomi M. Kenner',
    year: 2005,
    journal: 'Nature 435(7041), 439–440',
    doi: '10.1038/435439a',
    url: 'https://doi.org/10.1038/435439a',
    sample_size: null,
    task: '低概率目标视觉搜索',
    condition: '目标出现概率 50%',
    dependent_variable: '漏报率',
    mean_value: 7,
    sd_value: null,
    se_value: null,
    unit: '%',
    source_page: '参考站点设计数据 design.json（w6.lowprev.wolfe2005）',
    extraction_method: '转录参考站点的数值；原始图表页未逐项核对',
    comparability_note:
      '本平台没有操纵目标出现概率，且因变量为正确率/RT，不能把该漏报率当作本地准确率的对照。',
    approximate: 1,
    sort_order: 20,
  },
  {
    literature_id: 'lit-vs-wolfe-10',
    experiment_id: 'visual-search',
    block_variant: null,
    title: 'Rare items often missed in visual searches',
    authors: 'Jeremy M. Wolfe; Todd S. Horowitz; Naomi M. Kenner',
    year: 2005,
    journal: 'Nature 435(7041), 439–440',
    doi: '10.1038/435439a',
    url: 'https://doi.org/10.1038/435439a',
    sample_size: null,
    task: '低概率目标视觉搜索',
    condition: '目标出现概率 10%',
    dependent_variable: '漏报率',
    mean_value: 16,
    sd_value: null,
    se_value: null,
    unit: '%',
    source_page: '参考站点设计数据 design.json（w6.lowprev.wolfe2005）',
    extraction_method: '转录参考站点的数值；原始图表页未逐项核对',
    comparability_note:
      '本平台未设置低概率目标条件；该值仅说明目标概率对漏报的经典影响，不用于直接比较。',
    approximate: 1,
    sort_order: 21,
  },
  {
    literature_id: 'lit-vs-wolfe-1',
    experiment_id: 'visual-search',
    block_variant: null,
    title: 'Rare items often missed in visual searches',
    authors: 'Jeremy M. Wolfe; Todd S. Horowitz; Naomi M. Kenner',
    year: 2005,
    journal: 'Nature 435(7041), 439–440',
    doi: '10.1038/435439a',
    url: 'https://doi.org/10.1038/435439a',
    sample_size: null,
    task: '低概率目标视觉搜索',
    condition: '目标出现概率 1%',
    dependent_variable: '漏报率',
    mean_value: 30,
    sd_value: null,
    se_value: null,
    unit: '%',
    source_page: '参考站点设计数据 design.json（w6.lowprev.wolfe2005）',
    extraction_method: '转录参考站点的数值；原始图表页未逐项核对',
    comparability_note:
      '本平台未设置低概率目标条件；仅作文献背景，不进行显著性检验或跨范式合并。',
    approximate: 1,
    sort_order: 22,
  },
  {
    literature_id: 'lit-po-cleveland-mcgill',
    experiment_id: 'perceptual-ordering',
    block_variant: null,
    title:
      'Graphical Perception: Theory, Experimentation, and Application to the Development of Graphical Methods',
    authors: 'William S. Cleveland; Robert McGill',
    year: 1984,
    journal: 'Journal of the American Statistical Association 79(387), 531–554',
    doi: '10.1080/01621459.1984.10478080',
    url: 'https://doi.org/10.1080/01621459.1984.10478080',
    sample_size: null,
    task: '图形知觉的比例估计与排序',
    condition: '位置、长度、角度、面积等视觉通道的相对排序',
    dependent_variable: '知觉排序/估计（无数值均值转录）',
    mean_value: null,
    sd_value: null,
    se_value: null,
    unit: null,
    source_page: '参考站点设计数据 design.json（w7.cm.rank_ref）及原文献',
    extraction_method: '参考站点仅提供定性通道排序；未伪造数值均值',
    comparability_note:
      '参考站点采用比例估计任务；本平台当前实现为矩形面积排序，任务与刺激均不同。因此没有可直接比较的数值，界面应显示“暂无可比较的文献数据”。',
    approximate: 0,
    sort_order: 10,
  },
  {
    literature_id: 'lit-ma-levine-1982',
    experiment_id: 'map-alignment',
    block_variant: null,
    title: 'You-Are-Here Maps',
    authors: 'Marvin Levine',
    year: 1982,
    journal: 'Environment and Behavior 14(2), 221–237',
    doi: '10.1177/0013916584142006',
    url: 'https://doi.org/10.1177/0013916584142006',
    sample_size: null,
    task: 'You-are-here 地图的方位与对齐',
    condition: '地图朝向与被试朝向的关系',
    dependent_variable: '方位判断（无数值均值转录）',
    mean_value: null,
    sd_value: null,
    se_value: null,
    unit: null,
    source_page: '参考站点设计数据 design.json（w8.yah）引用',
    extraction_method: '文献引用；未从原文提取可比较的均值/标准差',
    comparability_note:
      '本平台采用简化的方位判断任务，刺激、反应与参考站点不同；没有可直接比较的数值，界面应显示“暂无可比较的文献数据”。',
    approximate: 0,
    sort_order: 10,
  },
  {
    literature_id: 'lit-ma-levine-1984',
    experiment_id: 'map-alignment',
    block_variant: null,
    title: 'The Placement and Misplacement of You-Are-Here Maps',
    authors: 'Marvin Levine; Iris Marchon; Gerard Hanley',
    year: 1984,
    journal: 'Environment and Behavior 16(2), 139–157',
    doi: '10.1177/0013916584162001',
    url: 'https://doi.org/10.1177/0013916584162001',
    sample_size: null,
    task: 'You-are-here 地图的放置与错位',
    condition: '地图位置/朝向与环境的对应关系',
    dependent_variable: '方位判断（无数值均值转录）',
    mean_value: null,
    sd_value: null,
    se_value: null,
    unit: null,
    source_page: '参考站点设计数据 design.json（w8.yah）引用',
    extraction_method: '文献引用；未从原文提取可比较的均值/标准差',
    comparability_note:
      '本平台使用简化地图与人物朝向线索，不能与原文的现场地图任务直接比较；不展示数值对照。',
    approximate: 0,
    sort_order: 11,
  },
];

export function seedLiterature(db: LabDb): void {
  const now = new Date().toISOString();
  const statement = db.prepare(
    `INSERT OR IGNORE INTO literature (
      literature_id, experiment_id, block_variant, title, authors, year, journal,
      doi, url, sample_size, task, condition, dependent_variable, mean_value,
      sd_value, se_value, unit, source_page, extraction_method,
      comparability_note, approximate, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const record of LITERATURE_SEED) {
    statement.run(
      record.literature_id,
      record.experiment_id,
      record.block_variant,
      record.title,
      record.authors,
      record.year,
      record.journal,
      record.doi,
      record.url,
      record.sample_size,
      record.task,
      record.condition,
      record.dependent_variable,
      record.mean_value,
      record.sd_value,
      record.se_value,
      record.unit,
      record.source_page,
      record.extraction_method,
      record.comparability_note,
      record.approximate,
      record.sort_order,
      now,
      now,
    );
  }
}
