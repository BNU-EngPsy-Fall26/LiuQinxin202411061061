import {
  ArrowLeftRight,
  Brain,
  GitCompareArrows,
  Map as MapIcon,
  RotateCw,
  Target,
  TrendingUp,
} from 'lucide-react';
import type {
  MapAlignmentAnalysis,
  MapBlockPositionStats,
  MapCellStats,
  MapConditionCost,
} from '@/services/api';
import { formatPercent } from '@/utils/format';

const CUES = [
  { cue: 'none' as const, label: '无人物线索', color: '#889DB3' },
  { cue: 'person' as const, label: '人物线索', color: '#6F9A80' },
];

const ROTATIONS = [0, 90, 180, 270];
const ALIGNMENT_X = [
  { key: 'aligned' as const, label: '对齐 0°' },
  { key: 'misaligned' as const, label: '错位 90/180/270°' },
];

export function MapAlignmentResults({
  analysis,
  mode,
  classAnalysis = null,
}: {
  analysis: MapAlignmentAnalysis;
  mode: 'personal' | 'group';
  classAnalysis?: MapAlignmentAnalysis | null;
}) {
  if (analysis.included_trials === 0) {
    return (
      <div className="result-stack">
        <section className="result-panel">
          <h2 className="result-panel__title">
            <MapIcon size={15} strokeWidth={1.7} /> 地图对齐分析
          </h2>
          <div className="result-warning">
            本次会话没有可纳入的新格式地图正式试次，暂时无法比较线索条件与朝向角度。
          </div>
          <p className="result-note">{analysis.note}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="result-stack ma-results">
      <ConclusionModule analysis={analysis} mode={mode} />
      <AlignmentModule
        analysis={analysis}
        mode={mode}
        classAnalysis={classAnalysis}
      />
      <CueModule analysis={analysis} mode={mode} />
      <InteractionModule analysis={analysis} mode={mode} />
      <RotationModule analysis={analysis} mode={mode} />
      <CostModule analysis={analysis} mode={mode} />
      <ErrorModule analysis={analysis} mode={mode} />
      {mode === 'group' ? (
        <BlockOrderModule
          positions={analysis.block_positions}
          mode="group"
        />
      ) : (
        <BlockOrderModule
          positions={classAnalysis?.block_positions ?? []}
          mode="class"
        />
      )}
      <MethodModule analysis={analysis} mode={mode} />
    </div>
  );
}

function ConclusionModule({
  analysis,
  mode,
}: {
  analysis: MapAlignmentAnalysis;
  mode: 'personal' | 'group';
}) {
  return (
    <section className="result-panel ma-conclusions">
      <h2 className="result-panel__title">
        <Brain size={15} strokeWidth={1.7} /> 自动结论
      </h2>
      <ol className="ma-conclusion-list">
        <li>
          <span>01</span>
          <p>{analysis.conclusions.rt}</p>
        </li>
        <li>
          <span>02</span>
          <p>{analysis.conclusions.errors}</p>
        </li>
        <li>
          <span>03</span>
          <p>{analysis.conclusions.interpretation}</p>
        </li>
      </ol>
      <div
        className={`vs-callout${analysis.cost.available ? '' : ' is-muted'}`}
      >
        <strong>
          <ArrowLeftRight size={14} strokeWidth={1.7} /> 人物线索与不对齐表现
        </strong>
        <span>{analysis.conclusions.cue}</span>
      </div>
      <span className="vs-mode-tag">
        {mode === 'group' ? '班级 / 参与者级汇总' : '个人 / 正式试次'}
      </span>
    </section>
  );
}

function AlignmentModule({
  analysis,
  mode,
  classAnalysis,
}: {
  analysis: MapAlignmentAnalysis;
  mode: 'personal' | 'group';
  classAnalysis: MapAlignmentAnalysis | null;
}) {
  const aligned = analysis.alignment.find(
    (cell) => cell.alignment === 'aligned',
  );
  const misaligned = analysis.alignment.find(
    (cell) => cell.alignment === 'misaligned',
  );
  return (
    <section className="result-panel">
      <h2 className="result-panel__title">
        <Target size={15} strokeWidth={1.7} /> 对齐 vs 错位 · 正确率与反应时
      </h2>
      <p className="result-note">
        对齐指朝向 0°（正面朝地图上方的实验楼）；错位指 90°、180°、270°
        （正面朝右侧食堂、下方图书馆或左侧教学楼）。地图方向固定。
        错误率使用全部有效正式试次，RT 只使用正确且有效的正式试次。
      </p>
      <div className="ma-condition-grid">
        <AlignmentCard state="aligned" label="对齐 0°" cell={aligned} />
        <AlignmentCard
          state="misaligned"
          label="错位 90/180/270°"
          cell={misaligned}
        />
      </div>
      {mode === 'personal' ? (
        <ClassComparison
          personal={analysis}
          classAnalysis={classAnalysis}
        />
      ) : (
        <p className="result-note">
          群体数值先按参与者汇总，再在参与者层面平均；不把所有人试次直接混合。
        </p>
      )}
    </section>
  );
}

function AlignmentCard({
  state,
  label,
  cell,
}: {
  state: 'aligned' | 'misaligned';
  label: string;
  cell: MapCellStats | undefined;
}) {
  return (
    <section
      className={`result-panel ma-condition-card${
        state === 'misaligned' ? ' is-person' : ''
      }`}
    >
      <div className="ma-condition-card__head">
        <span className="ma-condition-card__dot" />
        <strong>{label}</strong>
        <small>{cell?.n_valid ?? 0} 个有效正式试次</small>
      </div>
      <div className="result-stats">
        <div className="result-stat">
          <div className="result-stat__value">
            {formatPercent(cell?.accuracy ?? null, 1)}
          </div>
          <div className="result-stat__label">正确率</div>
        </div>
        <div className="result-stat">
          <div className="result-stat__value">
            {formatPercent(cell?.error_rate ?? null, 1)}
          </div>
          <div className="result-stat__label">错误率</div>
        </div>
        <div className="result-stat">
          <div className="result-stat__value">
            {formatMs(cell?.mean_rt_ms)}
          </div>
          <div className="result-stat__label">正确反应时均值</div>
        </div>
      </div>
      <p className="result-note">
        有效正确 RT 观测 {cell?.n_observations ?? 0} 个
        {cell && cell.n_participants > 1
          ? ` · ${cell.n_participants} 名参与者`
          : ''}
      </p>
    </section>
  );
}

function ClassComparison({
  personal,
  classAnalysis,
}: {
  personal: MapAlignmentAnalysis;
  classAnalysis: MapAlignmentAnalysis | null;
}) {
  if (!classAnalysis) {
    return (
      <div className="result-warning" style={{ marginTop: 18 }}>
        班级数据：暂无数据。你的个人结果仍可在上方查看；班级对比不会使用个人数据代替。
      </div>
    );
  }
  const classAligned = classAnalysis.alignment.find(
    (cell) => cell.alignment === 'aligned',
  );
  const classMisaligned = classAnalysis.alignment.find(
    (cell) => cell.alignment === 'misaligned',
  );
  const selfAligned = personal.alignment.find(
    (cell) => cell.alignment === 'aligned',
  );
  const selfMisaligned = personal.alignment.find(
    (cell) => cell.alignment === 'misaligned',
  );
  return (
    <>
      <h3 className="ma-subtitle">
        <GitCompareArrows size={14} strokeWidth={1.7} /> 我的数据与班级对比
      </h3>
      <div className="ma-chart-grid">
        <LineChart
          xLabels={ALIGNMENT_X.map((item) => item.label)}
          series={[
            {
              label: '我',
              color: '#6F8FAE',
              values: [
                selfAligned?.mean_rt_ms ?? null,
                selfMisaligned?.mean_rt_ms ?? null,
              ],
            },
            {
              label: '全班',
              color: '#B6996B',
              values: [
                classAligned?.mean_rt_ms ?? null,
                classMisaligned?.mean_rt_ms ?? null,
              ],
            },
          ]}
          yLabel="RT (ms)"
          valueFormatter={formatMs}
          tickFormatter={(value) => String(Math.round(value))}
          ariaLabel="对齐与错位条件下，我的正确反应时与班级平均正确反应时对比折线图"
          caption="正确 RT 均值：你的数据与班级参与者级均值。"
        />
        <LineChart
          xLabels={ALIGNMENT_X.map((item) => item.label)}
          series={[
            {
              label: '我',
              color: '#6F8FAE',
              values: [
                percentValue(selfAligned?.error_rate),
                percentValue(selfMisaligned?.error_rate),
              ],
            },
            {
              label: '全班',
              color: '#B6996B',
              values: [
                percentValue(classAligned?.error_rate),
                percentValue(classMisaligned?.error_rate),
              ],
            },
          ]}
          yLabel="错误率 (%)"
          valueFormatter={(value) => formatPercent(value / 100, 1)}
          tickFormatter={(value) => String(Math.round(value))}
          ariaLabel="对齐与错位条件下，我的错误率与班级平均错误率对比折线图"
          caption="错误率：你的数据与班级参与者级均值。"
        />
      </div>
      <p className="result-note">
        班级值来自已完成会话的参与者级汇总，不代表显著性检验；样本较少时差异不稳定。
      </p>
    </>
  );
}

function CueModule({
  analysis,
  mode,
}: {
  analysis: MapAlignmentAnalysis;
  mode: 'personal' | 'group';
}) {
  return (
    <section className="result-panel">
      <h2 className="result-panel__title">
        <MapIcon size={15} strokeWidth={1.7} /> 无人物线索 vs 人物线索
      </h2>
      <p className="result-note">
        两个 Block 使用相同地图与任务，只有地图中央的位置标记不同：
        无人物线索为普通红色位置点；人物线索为顶视人物，其朝向与“你正面朝某建筑”的文字一致。
        分析按实际线索条件分组，不按 Block 1/2 分组。
      </p>
      <div className="ma-condition-grid">
        {analysis.conditions.map((condition) => (
          <CueCard key={condition.cue ?? 'none'} condition={condition} />
        ))}
      </div>
      <p className="result-note">
        {mode === 'group'
          ? '群体数据按参与者汇总后再平均；人数很少时仅作描述。'
          : '这是你本次会话的描述性统计，没有做显著性检验。'}
      </p>
    </section>
  );
}

function CueCard({ condition }: { condition: MapCellStats }) {
  const label = condition.cue === 'person' ? '人物线索' : '无人物线索';
  return (
    <section
      className={`result-panel ma-condition-card${
        condition.cue === 'person' ? ' is-person' : ''
      }`}
    >
      <div className="ma-condition-card__head">
        <span className="ma-condition-card__dot" />
        <strong>{label}</strong>
        <small>{condition.n_valid} 个有效正式试次</small>
      </div>
      <div className="result-stats">
        <div className="result-stat">
          <div className="result-stat__value">
            {formatPercent(condition.error_rate, 1)}
          </div>
          <div className="result-stat__label">错误率</div>
        </div>
        <div className="result-stat">
          <div className="result-stat__value">
            {formatMs(condition.mean_rt_ms)}
          </div>
          <div className="result-stat__label">正确反应时均值</div>
        </div>
      </div>
      <p className="result-note">
        有效正确 RT 观测 {condition.n_observations} 个
        {condition.n_participants > 1
          ? ` · ${condition.n_participants} 名参与者`
          : ''}
      </p>
    </section>
  );
}

function InteractionModule({
  analysis,
  mode,
}: {
  analysis: MapAlignmentAnalysis;
  mode: 'personal' | 'group';
}) {
  const rts = CUES.map((series) => ({
    label: series.label,
    color: series.color,
    values: ALIGNMENT_X.map((state) => {
      const cell = analysis.interaction.find(
        (entry) =>
          entry.cue === series.cue && entry.alignment === state.key,
      );
      return cell?.mean_rt_ms ?? null;
    }),
  }));
  const errors = CUES.map((series) => ({
    label: series.label,
    color: series.color,
    values: ALIGNMENT_X.map((state) => {
      const cell = analysis.interaction.find(
        (entry) =>
          entry.cue === series.cue && entry.alignment === state.key,
      );
      return percentValue(cell?.error_rate);
    }),
  }));
  return (
    <section className="result-panel">
      <h2 className="result-panel__title">
        <TrendingUp size={15} strokeWidth={1.7} /> 线索条件 × 对齐状态的交互
      </h2>
      <p className="result-note">
        横轴为对齐/错位，两条折线分别代表无人物线索与人物线索；错位表现是重点比较对象。
        点旁数字为对应条件的均值，没有观测的条件不补 0。
      </p>
      <div className="ma-chart-grid">
        <LineChart
          xLabels={ALIGNMENT_X.map((item) => item.label)}
          series={rts}
          yLabel="RT (ms)"
          valueFormatter={formatMs}
          tickFormatter={(value) => String(Math.round(value))}
          ariaLabel="对齐与错位条件下，无人物线索和人物线索正确反应时的交互折线图"
          caption="正确 RT 均值：两种线索条件 × 对齐状态。"
        />
        <LineChart
          xLabels={ALIGNMENT_X.map((item) => item.label)}
          series={errors}
          yLabel="错误率 (%)"
          valueFormatter={(value) => formatPercent(value / 100, 1)}
          tickFormatter={(value) => String(Math.round(value))}
          ariaLabel="对齐与错位条件下，无人物线索和人物线索错误率的交互折线图"
          caption="错误率：两种线索条件 × 对齐状态。"
        />
      </div>
      <p className="result-note">
        {mode === 'group'
          ? '群体点表示参与者级均值的平均；未做显著性检验。'
          : '个人点基于本次正式试次；每个条件试次较少时波动较大，仅作探索。'}
      </p>
    </section>
  );
}

function RotationModule({
  analysis,
  mode,
}: {
  analysis: MapAlignmentAnalysis;
  mode: 'personal' | 'group';
}) {
  const rts = CUES.map((series) => ({
    label: series.label,
    color: series.color,
    values: ROTATIONS.map((rotation) => {
      const cell = analysis.cue_rotations.find(
        (entry) =>
          entry.cue === series.cue && entry.rotation_deg === rotation,
      );
      return cell?.mean_rt_ms ?? null;
    }),
  }));
  const errors = CUES.map((series) => ({
    label: series.label,
    color: series.color,
    values: ROTATIONS.map((rotation) => {
      const cell = analysis.cue_rotations.find(
        (entry) =>
          entry.cue === series.cue && entry.rotation_deg === rotation,
      );
      return percentValue(cell?.error_rate);
    }),
  }));
  return (
    <section className="result-panel">
      <h2 className="result-panel__title">
        <RotateCw size={15} strokeWidth={1.7} /> 朝向角度 × 线索条件
      </h2>
      <p className="result-note">
        0° 为对齐（面朝上方实验楼），90°、180°、270° 分别为面朝右侧食堂、
        下方图书馆、左侧教学楼。地图方向固定。每条折线对应一种实际线索条件；
        没有有效的正确 RT 或错误率时该点留空，不补 0。
      </p>
      <div className="ma-chart-grid">
        <LineChart
          xLabels={ROTATIONS.map((rotation) =>
            rotation === 0 ? '0° 对齐' : `${rotation}°`,
          )}
          series={rts}
          yLabel="RT (ms)"
          valueFormatter={formatMs}
          tickFormatter={(value) => String(Math.round(value))}
          ariaLabel="不同朝向角度下，无人物线索和人物线索正确反应时的折线图"
          caption="正确 RT 均值：朝向角度 × 线索条件。"
        />
        <LineChart
          xLabels={ROTATIONS.map((rotation) =>
            rotation === 0 ? '0° 对齐' : `${rotation}°`,
          )}
          series={errors}
          yLabel="错误率 (%)"
          valueFormatter={(value) => formatPercent(value / 100, 1)}
          tickFormatter={(value) => String(Math.round(value))}
          ariaLabel="不同朝向角度下，无人物线索和人物线索错误率的折线图"
          caption="错误率：朝向角度 × 线索条件。"
        />
      </div>
      <p className="result-note">
        {mode === 'group'
          ? '每个点表示参与者级均值的平均；未绘制置信区间，避免小样本给出过度确定的印象。'
          : '每个点表示该朝向角度下你的均值；点数少时波动较大，只作探索性参考。'}
      </p>
    </section>
  );
}

function CostModule({
  analysis,
  mode,
}: {
  analysis: MapAlignmentAnalysis;
  mode: 'personal' | 'group';
}) {
  const rows = [analysis.cost.no_cue, analysis.cost.person];
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.aligned_mean_rt_ms ?? 0,
      row.misaligned_mean_rt_ms ?? 0,
    ]),
  );
  return (
    <section className="result-panel">
      <h2 className="result-panel__title">
        <TrendingUp size={15} strokeWidth={1.7} /> 地图错位代价与人物线索
      </h2>
      <p className="result-note">
        错位代价 = 90/180/270° 的正确 RT 均值 − 0° 的正确 RT 均值。
        正值表示错位后变慢；错误率代价 = 错位错误率 − 对齐错误率。
      </p>
      <div className="ma-cost-list">
        {rows.map((row) => (
          <CostRow key={row.cue} cost={row} maxValue={maxValue} />
        ))}
      </div>
      <div
        className={`vs-callout${analysis.cost.available ? '' : ' is-muted'}`}
      >
        <strong>
          <ArrowLeftRight size={14} strokeWidth={1.7} /> 人物线索是否降低错位代价
        </strong>
        <span>{analysis.cost.conclusion}</span>
        {analysis.cost.available && (
          <span>
            RT 代价差值（无人物 − 人物）：
            {formatMsSigned(analysis.cost.cue_reduction_ms)}
            {analysis.cost.cue_reduction_error !== null
              ? `；错误率代价差值 ${(
                  analysis.cost.cue_reduction_error * 100
                ).toFixed(1)} 个百分点`
              : ''}
            。
          </span>
        )}
      </div>
      <p className="result-note">
        {mode === 'group'
          ? '群体代价先计算每名参与者的代价，再平均；不是把所有人的试次混在一起。'
          : '个人代价基于本次正式试次；朝向角度或线索条件缺少正确 RT/有效试次时显示为 “—”。'}
      </p>
    </section>
  );
}

function CostRow({
  cost,
  maxValue,
}: {
  cost: MapConditionCost;
  maxValue: number;
}) {
  const label = cost.cue === 'person' ? '人物线索' : '无人物线索';
  return (
    <div className="ma-cost-row">
      <div className="ma-cost-row__label">
        <span
          className={`ma-condition-card__dot${
            cost.cue === 'person' ? ' is-person' : ''
          }`}
        />
        <strong>{label}</strong>
        <small>错位代价 {formatMsSigned(cost.misalignment_cost_ms)}</small>
      </div>
      <div className="ma-cost-row__bars">
        <CostBar
          label="0° 对齐"
          value={cost.aligned_mean_rt_ms}
          maxValue={maxValue}
          tone="aligned"
        />
        <CostBar
          label="90/180/270° 错位"
          value={cost.misaligned_mean_rt_ms}
          maxValue={maxValue}
          tone="misaligned"
        />
      </div>
      <div className="ma-cost-row__accuracy">
        <span>错误率代价</span>
        <strong>
          {cost.error_cost === null
            ? '—'
            : `${(cost.error_cost * 100).toFixed(1)} pp`}
        </strong>
      </div>
    </div>
  );
}

function CostBar({
  label,
  value,
  maxValue,
  tone,
}: {
  label: string;
  value: number | null;
  maxValue: number;
  tone: 'aligned' | 'misaligned';
}) {
  const width = value === null ? 0 : Math.max(2, (value / maxValue) * 100);
  return (
    <div className="ma-cost-bar">
      <span className="ma-cost-bar__label">{label}</span>
      <div className="ma-cost-bar__track">
        <span
          className={`ma-cost-bar__fill is-${tone}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="ma-cost-bar__value">{formatMs(value)}</span>
    </div>
  );
}

function ErrorModule({
  analysis,
  mode,
}: {
  analysis: MapAlignmentAnalysis;
  mode: 'personal' | 'group';
}) {
  const top = analysis.error_pairs.slice(0, 5);
  const max = Math.max(1, ...top.map((pair) => pair.count));
  return (
    <section className="result-panel">
      <h2 className="result-panel__title">
        <GitCompareArrows size={15} strokeWidth={1.7} /> 典型错误方向
      </h2>
      <p className="result-note">
        只统计有效但错误的正式试次。每一条表示把正确方向误答成另一个方向的次数；
        次数越多的错误越具有代表性。
      </p>
      {top.length === 0 ? (
        <div className="result-warning">
          本数据未出现可分析的错误反应；这不等同于“不会犯错”，也可能与试次数量有关。
        </div>
      ) : (
        <div className="ma-error-list">
          {top.map((pair) => (
            <div
              className="ma-error-row"
              key={`${pair.correct_answer}-${pair.response}`}
            >
              <span className="ma-error-row__label">
                正确「{pair.correct_label}」→ 误答「{pair.response_label}」
              </span>
              <div className="ma-error-row__track">
                <span
                  className="ma-error-row__fill"
                  style={{ width: `${Math.max(4, (pair.count / max) * 100)}%` }}
                />
              </div>
              <strong>{pair.count} 次</strong>
            </div>
          ))}
        </div>
      )}
      <p className="result-note">
        {mode === 'group'
          ? '群体错误次数为参与者试次计数之和；不同参与者试次数可能不同，描述性更强。'
          : '个人错误次数直接来自本次正式试次；练习试次不计入。'}
      </p>
    </section>
  );
}

function BlockOrderModule({
  positions,
  mode,
}: {
  positions: MapBlockPositionStats[];
  mode: 'group' | 'class';
}) {
  if (positions.length === 0) {
    return (
      <section className="result-panel">
        <h2 className="result-panel__title">
          <GitCompareArrows size={15} strokeWidth={1.7} /> Block 呈现顺序
        </h2>
        <div className="result-warning">班级数据：暂无数据。</div>
        <p className="result-note">
          该比较仅在存在已完成班级会话时显示；不会用个人数据代替班级数据。
        </p>
      </section>
    );
  }
  const maxRt = Math.max(
    1,
    ...positions.map((entry) => entry.mean_rt_ms ?? 0),
  );
  return (
    <section className="result-panel">
      <h2 className="result-panel__title">
        <GitCompareArrows size={15} strokeWidth={1.7} /> Block 呈现顺序（描述性）
      </h2>
      <p className="result-note">
        Block 1/2 指实际呈现顺序，不绑定线索条件。若存在练习或疲劳效应，两个位置的差异可能反映顺序，
        不能直接解释为线索条件效应；线索分析以上方的实际条件分组为准。
      </p>
      <div className="ma-block-order">
        {positions.map((entry) => (
          <div className="ma-block-card" key={entry.position}>
            <div className="ma-block-card__head">
              <strong>Block {entry.position}</strong>
              <small>{entry.n_participants} 名参与者</small>
            </div>
            <div className="result-stats">
              <div className="result-stat">
                <div className="result-stat__value">
                  {formatMs(entry.mean_rt_ms)}
                </div>
                <div className="result-stat__label">正确 RT 均值</div>
              </div>
              <div className="result-stat">
                <div className="result-stat__value">
                  {formatPercent(entry.error_rate, 1)}
                </div>
                <div className="result-stat__label">错误率</div>
              </div>
            </div>
            <div className="ma-block-card__bar">
              <span
                style={{
                  width: `${
                    entry.mean_rt_ms === null
                      ? 0
                      : Math.max(4, (entry.mean_rt_ms / maxRt) * 100)
                  }%`,
                }}
              />
            </div>
            <p className="result-note">
              有效正式试次 {entry.n_valid} · 有效正确 RT 观测 {entry.n_observations}
            </p>
          </div>
        ))}
      </div>
      <p className="result-note">
        {mode === 'class'
          ? '该模块展示班级数据；个人面板中没有班级会话时会显示“暂无数据”。'
          : '该模块按参与者级汇总，先平均每名参与者，再比较两个呈现位置。'}
      </p>
    </section>
  );
}

interface ChartSeries {
  label: string;
  color: string;
  values: Array<number | null>;
}

function LineChart({
  xLabels,
  series,
  yLabel,
  valueFormatter,
  tickFormatter,
  ariaLabel,
  caption,
}: {
  xLabels: string[];
  series: ChartSeries[];
  yLabel: string;
  valueFormatter: (value: number) => string;
  tickFormatter: (value: number) => string;
  ariaLabel: string;
  caption: string;
}) {
  const width = 760;
  const height = 310;
  const padding = { left: 62, right: 24, top: 26, bottom: 56 };
  const values = series
    .flatMap((item) => item.values)
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return (
      <div className="result-warning">
        没有可绘制的数据；超时与错误反应没有被替换为 0。
      </div>
    );
  }
  const maxY = niceMax(Math.max(...values) * 1.12);
  const xScale = (index: number) =>
    padding.left +
    (index / Math.max(1, xLabels.length - 1)) *
      (width - padding.left - padding.right);
  const yScale = (value: number) =>
    height -
    padding.bottom -
    (value / maxY) * (height - padding.top - padding.bottom);
  const yTicks = Array.from({ length: 5 }, (_, index) => (maxY / 4) * index);

  return (
    <figure className="vs-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <rect
          x={padding.left}
          y={padding.top}
          width={width - padding.left - padding.right}
          height={height - padding.top - padding.bottom}
          fill="#fcfbf7"
          stroke="#ece7da"
        />
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="#e9e4d8"
              strokeWidth="1"
            />
            <text
              x={padding.left - 10}
              y={yScale(tick) + 3}
              textAnchor="end"
              className="vs-chart__tick"
            >
              {tickFormatter(tick)}
            </text>
          </g>
        ))}
        {xLabels.map((label, index) => (
          <g key={`x-${label}-${index}`}>
            <line
              x1={xScale(index)}
              x2={xScale(index)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="#efeadd"
              strokeWidth="1"
            />
            <text
              x={xScale(index)}
              y={height - padding.bottom + 24}
              textAnchor="middle"
              className="vs-chart__axis"
            >
              {label}
            </text>
          </g>
        ))}
        {series.map((item) => {
          const points = item.values.map((value, index) =>
            value === null
              ? null
              : { x: xScale(index), y: yScale(value), value, index },
          );
          const segments = buildSegments(points);
          return (
            <g key={item.label}>
              {segments.map((segment, index) => (
                <polyline
                  key={`segment-${index}`}
                  points={segment
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {points.map(
                (point) =>
                  point && (
                    <g key={`${item.label}-${point.index}`}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="5"
                        fill="#fffefb"
                        stroke={item.color}
                        strokeWidth="2.4"
                      />
                      <text
                        x={point.x}
                        y={point.y - 11}
                        textAnchor="middle"
                        className="vs-chart__tick vs-chart__tick--small"
                        fill={item.color}
                      >
                        {valueFormatter(point.value).replace(' ms', '')}
                      </text>
                      <title>
                        {item.label} · {xLabels[point.index]} ·{' '}
                        {valueFormatter(point.value)}
                      </title>
                    </g>
                  ),
              )}
            </g>
          );
        })}
        <text
          x={14}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${height / 2})`}
          className="vs-chart__axis"
        >
          {yLabel}
        </text>
      </svg>
      <figcaption>{caption}</figcaption>
      <div className="vs-legend" aria-label="图例">
        {series.map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

function buildSegments<T extends { x: number; y: number } | null>(
  points: T[],
): Array<Array<NonNullable<T>>> {
  const segments: Array<Array<NonNullable<T>>> = [];
  let current: Array<NonNullable<T>> = [];
  for (const point of points) {
    if (point) current.push(point);
    else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  return segments.filter((segment) => segment.length > 1);
}

function MethodModule({
  analysis,
  mode,
}: {
  analysis: MapAlignmentAnalysis;
  mode: 'personal' | 'group';
}) {
  const order =
    analysis.block_order && analysis.block_order.length === 2
      ? `本次 Block 呈现顺序：${analysis.block_order
          .map((variant) => (variant === 'person_cue' ? '人物线索' : '无人物线索'))
          .join(' → ')}。`
      : '';
  return (
    <section className="result-panel result-panel--method">
      <h2 className="result-panel__title">指标定义与数据范围</h2>
      <ul className="result-list">
        <li>
          <strong>设计：</strong>共 2 个 Block，一个使用无人物线索、一个使用人物线索；
          顺序在被试间按稳定被试编号平衡。每个 Block 先练习 2 次，再完成 15 个正式试次。
          两个 Block 内部都包含对齐（0°）与错位（90°/180°/270°）试次。
        </li>
        <li>
          <strong>朝向与正确方向：</strong>地图方向固定；文字写出你正面朝的建筑，
          四种朝向分别为上方实验楼（0°）、右侧食堂（90°）、下方图书馆（180°）、
          左侧教学楼（270°）。目标建筑与面朝建筑不重复，正确方向由目标方位减去朝向角度决定：
          相对 0°=前方、90°=右方、180°=后方、270°=左方。{order}
        </li>
        <li>
          <strong>即时反应：</strong>地图、朝向文字和问题同时出现，出现后立即可按键；
          RT 从刺激呈现开始计时，没有预览延迟、倒计时或延迟解锁。
        </li>
        <li>
          <strong>统计：</strong>错误率使用全部有效正式试次；平均 RT 只使用正确、未超时、未无效的反应；
          练习试次不进入分析。缺失数据不补 0，也不使用个人数据冒充班级数据。
        </li>
        <li>
          <strong>限制：</strong>本模块为描述性比较，未做显著性检验；
          {mode === 'group'
            ? '群体 N 较小时均值和差值不稳定。'
            : '个人每个条件试次较少时，折线可能波动较大。'}
        </li>
      </ul>
      <p className="result-note">
        纳入 {analysis.included_trials} 个试次
        {analysis.excluded_trials > 0
          ? `；${analysis.excluded_trials} 个旧格式或无法解析的试次未纳入本模块`
          : ''}
        。{analysis.note}
      </p>
    </section>
  );
}

function percentValue(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(value)
    ? null
    : value * 100;
}

function formatMs(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `${Math.round(value)} ms`;
}

function formatMsSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded} ms`;
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}
