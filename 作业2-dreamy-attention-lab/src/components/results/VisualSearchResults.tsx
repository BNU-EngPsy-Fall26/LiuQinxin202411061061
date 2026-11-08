import { useMemo, useState } from 'react';
import {
  Activity,
  Crosshair,
  Eye,
  Grid3X3,
  MapPin,
  MousePointer2,
  Move3D,
  ScatterChart,
  TrendingUp,
} from 'lucide-react';
import type {
  HeatmapBin,
  RegionStat,
  SearchVariantAnalysis,
  SpatialAnalysis,
  VisualSearchAnalysis,
} from '@/services/api';

const REGION_LABELS: Record<number, string> = {
  1: '左上',
  2: '上中',
  3: '右上',
  4: '左中',
  5: '中央',
  6: '右中',
  7: '左下',
  8: '下中',
  9: '右下',
};

const SERIES_COLORS = {
  feature_present: '#2a6fdb',
  feature_absent: '#7ea0d8',
  conjunction_present: '#a8433f',
  conjunction_absent: '#c98682',
} as const;

export function VisualSearchResults({
  analysis,
  mode,
  classAnalysis,
}: {
  analysis: VisualSearchAnalysis;
  mode: 'personal' | 'group';
  classAnalysis?: VisualSearchAnalysis | null;
}) {
  return (
    <div className="result-stack vs-results">
      <ConclusionModule analysis={analysis} mode={mode} />
      <RtSetSizeModule analysis={analysis} mode={mode} />
      <SlopeModule analysis={analysis} mode={mode} />
      <ParticipantSlopeModule analysis={analysis} />
      <GazeModule
        analysis={analysis}
        classAnalysis={classAnalysis}
        mode={mode}
      />
      <NineRegionModule analysis={analysis} />
      <RegionRtModule analysis={analysis} mode={mode} />
      <SpatialTrajectoryModule analysis={analysis} mode={mode} />
      <DirectionModule analysis={analysis} mode={mode} />
      <VisualSearchMethodPanel mode={mode} />
    </div>
  );
}

function ModuleHeader({
  index,
  title,
  icon,
  children,
}: {
  index: number;
  title: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="vs-module__header">
      <span className="vs-module__index">{String(index).padStart(2, '0')}</span>
      <div>
        <h2 className="result-panel__title">
          {icon}
          {title}
        </h2>
        {children}
      </div>
    </header>
  );
}

function ConclusionModule({
  analysis,
  mode,
}: {
  analysis: VisualSearchAnalysis;
  mode: 'personal' | 'group';
}) {
  const conclusion = analysis.search.conclusion;
  return (
    <section className="result-panel vs-module">
      <ModuleHeader
        index={1}
        title="三句话结论"
        icon={<Activity size={15} strokeWidth={1.7} />}
      >
        <p className="result-note">
          下列三句话由本次实际数据生成；没有足够观测时会直接说明无法检验，不会套用固定结论。
        </p>
      </ModuleHeader>
      <ol className="vs-conclusion">
        {conclusion.sentences.map((sentence, index) => (
          <li key={`conclusion-${index}`}>
            <span>{index + 1}</span>
            <p>{sentence}</p>
          </li>
        ))}
      </ol>
      <div className={`vs-callout ${conclusion.theory_test_available ? '' : 'is-muted'}`}>
        <strong>
          {conclusion.theory_test_available
            ? '本次数据给出了探索性斜率比较；试次较少，不用于检验理论，也未做显著性检验。'
            : '有效集合大小不足 2 个，暂时无法估计斜率。'}
        </strong>
        <span>{conclusion.basis}</span>
      </div>
      <p className="result-note">{analysis.search.note}</p>
      <span className="vs-mode-tag">
        {mode === 'group' ? '班级 / 参与者级汇总' : '个人 / 正式试次'}
      </span>
    </section>
  );
}

function RtSetSizeModule({
  analysis,
  mode,
}: {
  analysis: VisualSearchAnalysis;
  mode: 'personal' | 'group';
}) {
  return (
    <section className="result-panel vs-module">
      <ModuleHeader
        index={2}
        title="正确反应时 × Set size"
        icon={<TrendingUp size={15} strokeWidth={1.7} />}
      >
        <p className="result-note">
          只为正确、未超时、未无效的正式试次绘制均值；误差线为{' '}
          {mode === 'group' ? '参与者级 95% CI' : '个人 SE（n ≥ 2 时）'}。
          实线为目标存在，虚线为目标缺失。至少 2 个不同 set size 有正确反应时即出现探索性拟合线。
        </p>
      </ModuleHeader>
      <RtSetSizeChart variants={analysis.search.variants} mode={mode} />
      <p className="result-note">
        每个点的悬停说明给出有效观测数 n、正确 RT 与所属条件；没有观测的 set size
        不绘制点，也不补 0。
      </p>
      <div className="vs-reference-inline">
        <strong>文献斜率参照（仅背景，不做显著性检验）</strong>
        <span>
          Treisman &amp; Gelade (1980)，近似转录值：特征存在{' '}
          {analysis.search.literature.treisman.feature.present} ms/item、缺失{' '}
          {analysis.search.literature.treisman.feature.absent} ms/item；联合存在{' '}
          {analysis.search.literature.treisman.conjunction.present} ms/item、缺失{' '}
          {analysis.search.literature.treisman.conjunction.absent} ms/item。
          文献没有与本次相同的截距，因此不在 RT 折线中伪造文献曲线。
        </span>
      </div>
    </section>
  );
}

function RtSetSizeChart({
  variants,
  mode,
}: {
  variants: SearchVariantAnalysis[];
  mode: 'personal' | 'group';
}) {
  const width = 780;
  const height = 330;
  const padding = { left: 58, right: 26, top: 22, bottom: 48 };
  const allCells = variants.flatMap((variant) => [
    ...variant.present.cells,
    ...variant.absent.cells,
  ]);
  const setSizes = [...new Set(allCells.map((cell) => cell.set_size))].sort(
    (a, b) => a - b,
  );
  const values = allCells
    .flatMap((cell) => [
      cell.mean_rt_ms,
      cell.ci_low,
      cell.ci_high,
      cell.mean_rt_ms === null || cell.se_rt_ms === null
        ? null
        : cell.mean_rt_ms + cell.se_rt_ms,
    ])
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (setSizes.length === 0 || values.length === 0) {
    return (
      <div className="result-warning">
        没有可绘制的正确反应时。超时与错误反应没有被替换为 0。
      </div>
    );
  }
  const maxY = niceMax(Math.max(...values, 1));
  const xScale = (value: number) =>
    padding.left +
    ((value - setSizes[0]) / Math.max(1, setSizes[setSizes.length - 1] - setSizes[0])) *
      (width - padding.left - padding.right);
  const yScale = (value: number) =>
    height -
    padding.bottom -
    (value / maxY) * (height - padding.top - padding.bottom);
  const yTicks = Array.from({ length: 5 }, (_, index) => (maxY / 4) * index);
  const series = variants.flatMap((variant) =>
    [
      {
        key: `${variant.variant}_present`,
        label:
          variant.variant === 'feature_search' ? '特征 · 存在' : '联合 · 存在',
        color:
          variant.variant === 'feature_search'
            ? SERIES_COLORS.feature_present
            : SERIES_COLORS.conjunction_present,
        dash: undefined,
        data: variant.present,
      },
      {
        key: `${variant.variant}_absent`,
        label:
          variant.variant === 'feature_search' ? '特征 · 缺失' : '联合 · 缺失',
        color:
          variant.variant === 'feature_search'
            ? SERIES_COLORS.feature_absent
            : SERIES_COLORS.conjunction_absent,
        dash: '6 4',
        data: variant.absent,
      },
    ].map((item) => ({ ...item, variant })),
  );

  return (
    <figure className="vs-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`正确反应时随 set size 变化，${mode === 'group' ? '班级' : '个人'}数据`}
      >
        <rect
          x={padding.left}
          y={padding.top}
          width={width - padding.left - padding.right}
          height={height - padding.top - padding.bottom}
          fill="#fcfbf7"
        />
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="#e4e1d7"
              strokeWidth={1}
            />
            <text
              x={padding.left - 9}
              y={yScale(tick) + 4}
              textAnchor="end"
              className="vs-chart__tick"
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}
        {setSizes.map((size) => (
          <g key={`x-${size}`}>
            <line
              x1={xScale(size)}
              x2={xScale(size)}
              y1={height - padding.bottom}
              y2={height - padding.bottom + 5}
              stroke="#b9b4a6"
            />
            <text
              x={xScale(size)}
              y={height - padding.bottom + 21}
              textAnchor="middle"
              className="vs-chart__tick"
            >
              {size}
            </text>
          </g>
        ))}
        <text
          x={(padding.left + width - padding.right) / 2}
          y={height - 6}
          textAnchor="middle"
          className="vs-chart__axis"
        >
          Set size（项目数）
        </text>
        <text
          x={15}
          y={(padding.top + height - padding.bottom) / 2}
          textAnchor="middle"
          transform={`rotate(-90 15 ${(padding.top + height - padding.bottom) / 2})`}
          className="vs-chart__axis"
        >
          正确 RT（ms）
        </text>

        {series.map((item) => {
          const cells = item.data.cells.filter(
            (cell) => cell.mean_rt_ms !== null,
          );
          const path = cells
            .map(
              (cell, index) =>
                `${index === 0 ? 'M' : 'L'} ${xScale(cell.set_size)} ${yScale(
                  cell.mean_rt_ms as number,
                )}`,
            )
            .join(' ');
          const fit = item.data.fit;
          return (
            <g key={item.key}>
              {path && (
                <path
                  d={path}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2}
                  strokeDasharray={item.dash}
                />
              )}
              {fit.available &&
                fit.slope_ms_per_item !== null &&
                fit.intercept_ms !== null &&
                setSizes.length > 0 && (
                  <line
                    x1={xScale(setSizes[0])}
                    x2={xScale(setSizes[setSizes.length - 1])}
                    y1={yScale(
                      fit.intercept_ms + fit.slope_ms_per_item * setSizes[0],
                    )}
                    y2={yScale(
                      fit.intercept_ms +
                        fit.slope_ms_per_item *
                          setSizes[setSizes.length - 1],
                    )}
                    stroke={item.color}
                    strokeWidth={1}
                    strokeDasharray="2 5"
                    opacity={0.65}
                  />
                )}
              {cells.map((cell) => {
                const showError =
                  cell.mean_rt_ms !== null &&
                  cell.se_rt_ms !== null &&
                  cell.n_observations > 1;
                return (
                  <g key={`${item.key}-${cell.set_size}`}>
                    {showError && (
                      <line
                        x1={xScale(cell.set_size)}
                        x2={xScale(cell.set_size)}
                        y1={yScale(
                          Math.max(0, (cell.mean_rt_ms as number) - (cell.se_rt_ms as number)),
                        )}
                        y2={yScale((cell.mean_rt_ms as number) + (cell.se_rt_ms as number))}
                        stroke={item.color}
                        strokeWidth={1.4}
                      />
                    )}
                    <circle
                      cx={xScale(cell.set_size)}
                      cy={yScale(cell.mean_rt_ms as number)}
                      r={4.2}
                      fill={item.color}
                      stroke="#fff"
                      strokeWidth={1.4}
                    >
                      <title>
                        {item.label} · {cell.set_size} 项 ·{' '}
                        {formatMs(cell.mean_rt_ms)} · n={cell.n_observations}
                      </title>
                    </circle>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="vs-legend">
        {series.map((item) => (
          <span key={`legend-${item.key}`}>
            <i
              style={{
                background: item.color,
                opacity: item.dash ? 0.6 : 1,
              }}
            />
            {item.label}
          </span>
        ))}
        <span>
          <i className="vs-legend__error" />
          误差线
        </span>
      </div>
      <figcaption>
        点表示每个 set size 的正确 RT 均值；虚线为至少 2 个 set size 的探索性拟合。
        {mode === 'group' ? '班级均值先按参与者计算。' : '个人每格通常只有 1 个观测，误差线可能缺失。'}
      </figcaption>
    </figure>
  );
}

function SlopeModule({
  analysis,
  mode,
}: {
  analysis: VisualSearchAnalysis;
  mode: 'personal' | 'group';
}) {
  const literature = analysis.search.literature;
  return (
    <section className="result-panel vs-module">
      <ModuleHeader
        index={3}
        title="搜索斜率与缺失 / 存在斜率比"
        icon={<Crosshair size={15} strokeWidth={1.7} />}
      >
        <p className="result-note">
          斜率单位为 ms/item，来自正确反应 RT 对 set size 的最小二乘拟合；至少 2 个不同
          set size 有有效数据即可估计，负斜率也如实显示。正式试次较少时，
          斜率仅供探索性参考。比值 = 目标缺失斜率 ÷ 目标存在斜率；存在斜率接近 0 或数据不足时报告 NA。
        </p>
      </ModuleHeader>
      <div className="vs-slope-grid">
        {analysis.search.variants.map((variant) => {
          const present = variant.present.fit;
          const absent = variant.absent.fit;
          const maxSlope = Math.max(
            Math.abs(present.slope_ms_per_item ?? 0),
            Math.abs(absent.slope_ms_per_item ?? 0),
            1,
          );
          return (
            <article className="vs-slope-card" key={variant.variant}>
              <div className="vs-slope-card__head">
                <strong>
                  {variant.variant === 'feature_search' ? '特征搜索' : '联合搜索'}
                </strong>
                <span>{mode === 'group' ? '参与者级' : '个人'}</span>
              </div>
              {[
                ['存在', present, SERIES_COLORS.feature_present],
                ['缺失', absent, SERIES_COLORS.conjunction_present],
              ].map(([label, fit, color]) => {
                const typedFit = fit as typeof present;
                const slope = typedFit.slope_ms_per_item;
                return (
                  <div className="vs-slope-row" key={`${variant.variant}-${label}`}>
                    <span>{label as string}</span>
                    {typedFit.available && slope !== null ? (
                      <>
                        <div className="vs-slope-track">
                          <span
                            style={{
                              width: `${Math.max(
                                2,
                                (Math.abs(slope) / maxSlope) * 100,
                              )}%`,
                              background: color as string,
                            }}
                          />
                        </div>
                        <strong>{slope.toFixed(1)}</strong>
                      </>
                    ) : (
                      <div className="vs-slope-na">
                        <span>NA</span>
                        <small>{typedFit.reason}</small>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="vs-slope-ratio">
                <span>缺失 / 存在</span>
                <strong>
                  {variant.ratio === null ? 'NA' : `${variant.ratio.toFixed(2)} : 1`}
                </strong>
              </div>
              <p className="result-note">{variant.ratio_note}</p>
              <p className="result-note">
                拟合：{present.available ? `特征存在 R²=${formatNumber(present.r_squared)}，` : ''}
                {absent.available ? `缺失 R²=${formatNumber(absent.r_squared)}，` : ''}
                每个 set size 最低有效 n={present.minimum_cell_n}；有效 set size 少于 2 个时保留原因。
              </p>
            </article>
          );
        })}
      </div>
      <div className="vs-literature-grid">
        <div>
          <span>Treisman &amp; Gelade (1980)</span>
          <strong>
            特征 {literature.treisman.feature.present} /{' '}
            {literature.treisman.feature.absent}
          </strong>
          <small>存在 / 缺失，ms/item，近似转录</small>
        </div>
        <div>
          <span>Treisman &amp; Gelade (1980)</span>
          <strong>
            联合 {literature.treisman.conjunction.present} /{' '}
            {literature.treisman.conjunction.absent}
          </strong>
          <small>存在 / 缺失，ms/item，近似转录</small>
        </div>
        <div>
          <span>{literature.ssts.label}</span>
          <strong>{literature.ssts.value.toFixed(2)} : 1</strong>
          <small>只作背景说明，不做显著性检验</small>
        </div>
      </div>
      <p className="result-note">
        {literature.treisman.source}。文献数值没有与本平台数据合并，也没有把教材经验值当作标准答案。
      </p>
    </section>
  );
}

function ParticipantSlopeModule({
  analysis,
}: {
  analysis: VisualSearchAnalysis;
}) {
  const summary = analysis.participant_slopes;
  return (
    <section className="result-panel vs-module">
      <ModuleHeader
        index={4}
        title="每位参与者的联合搜索斜率"
        icon={<ScatterChart size={15} strokeWidth={1.7} />}
      >
        <p className="result-note">
          x = 目标存在斜率，y = 目标缺失斜率。参考线为比值 1:1 与 2:1。
          一个点代表一名参与者；至少 2 个 set size 有有效数据才绘制，缺少数据者不生成虚构点。
          少量试次得到的斜率仅作探索性参考。
        </p>
      </ModuleHeader>
      {summary.points.length === 0 ? (
        <div className="result-warning">
          <strong>样本不足，未绘制散点。</strong>
          <span>
            共 {summary.total_participants} 名参与者，{summary.excluded_participants}{' '}
            名不足 2 个有效 set size，无法估计联合搜索斜率。{summary.note}
          </span>
        </div>
      ) : (
        <>
          <ParticipantScatter
            points={summary.points}
            excluded={summary.excluded_participants}
            total={summary.total_participants}
          />
          <p className="result-note">{summary.note}</p>
          {summary.points.length === 1 && (
            <div className="vs-callout is-muted">
              只有 1 个有效散点，不能描述班级分布或稳定斜率关系，仅作探索性展示。
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ParticipantScatter({
  points,
  excluded,
  total,
}: {
  points: Array<{ present_slope: number; absent_slope: number }>;
  excluded: number;
  total: number;
}) {
  const width = 620;
  const height = 380;
  const padding = { left: 62, right: 26, top: 30, bottom: 52 };
  const bound = niceMax(
    Math.max(
      ...points.flatMap((point) => [
        Math.abs(point.present_slope),
        Math.abs(point.absent_slope),
      ]),
      1,
    ),
  );
  const min = Math.min(-10, ...points.map((point) => Math.min(point.present_slope, point.absent_slope)));
  const max = bound;
  const xScale = (value: number) =>
    padding.left +
    ((value - min) / (max - min)) * (width - padding.left - padding.right);
  const yScale = (value: number) =>
    height -
    padding.bottom -
    ((value - min) / (max - min)) * (height - padding.top - padding.bottom);
  const ticks = niceTicks(min, max, 5);
  return (
    <figure className="vs-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="参与者联合搜索斜率散点图">
        <rect
          x={padding.left}
          y={padding.top}
          width={width - padding.left - padding.right}
          height={height - padding.top - padding.bottom}
          fill="#fcfbf7"
        />
        {ticks.map((tick) => (
          <g key={`scatter-${tick}`}>
            <line
              x1={xScale(tick)}
              x2={xScale(tick)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="#e4e1d7"
            />
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="#e4e1d7"
            />
            <text x={xScale(tick)} y={height - padding.bottom + 18} textAnchor="middle" className="vs-chart__tick">
              {Math.round(tick)}
            </text>
            <text x={padding.left - 9} y={yScale(tick) + 4} textAnchor="end" className="vs-chart__tick">
              {Math.round(tick)}
            </text>
          </g>
        ))}
        <line
          x1={xScale(0)}
          x2={xScale(0)}
          y1={padding.top}
          y2={height - padding.bottom}
          stroke="#9e998c"
        />
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={yScale(0)}
          y2={yScale(0)}
          stroke="#9e998c"
        />
        {[1, 2].map((ratio) => (
          <line
            key={`ratio-${ratio}`}
            x1={xScale(0)}
            y1={yScale(0)}
            x2={xScale(max)}
            y2={yScale(ratio * max)}
            stroke={ratio === 1 ? '#2a6fdb' : '#b08a3e'}
            strokeDasharray="5 4"
            opacity={0.55}
          />
        ))}
        <text x={xScale(max) - 8} y={yScale(max) + 14} textAnchor="end" className="vs-chart__axis">
          1:1
        </text>
        <text
          x={xScale(max) - 8}
          y={yScale(2 * max) + 14}
          textAnchor="end"
          className="vs-chart__axis"
        >
          2:1
        </text>
        {points.map((point, index) => (
          <circle
            key={`point-${index}`}
            cx={xScale(point.present_slope)}
            cy={yScale(point.absent_slope)}
            r={5}
            fill="#b08a3e"
            fillOpacity={0.8}
            stroke="#fff"
            strokeWidth={1.4}
          >
            <title>
              存在 {point.present_slope.toFixed(1)} ms/item，缺失{' '}
              {point.absent_slope.toFixed(1)} ms/item
            </title>
          </circle>
        ))}
        <text
          x={(padding.left + width - padding.right) / 2}
          y={height - 9}
          textAnchor="middle"
          className="vs-chart__axis"
        >
          目标存在斜率（ms/item）
        </text>
        <text
          x={16}
          y={(padding.top + height - padding.bottom) / 2}
          textAnchor="middle"
          transform={`rotate(-90 16 ${(padding.top + height - padding.bottom) / 2})`}
          className="vs-chart__axis"
        >
          目标缺失斜率（ms/item）
        </text>
      </svg>
      <figcaption>
        有效散点 {points.length} / {total} 人；排除 {excluded} 人。
      </figcaption>
    </figure>
  );
}

function GazeModule({
  analysis,
  classAnalysis,
  mode,
}: {
  analysis: VisualSearchAnalysis;
  classAnalysis?: VisualSearchAnalysis | null;
  mode: 'personal' | 'group';
}) {
  const [scope, setScope] = useState<'personal' | 'class'>(
    mode === 'group' ? 'class' : 'personal',
  );
  const dataset =
    scope === 'class' && classAnalysis ? classAnalysis : analysis;
  const heatmap = dataset.gaze_heatmap;
  const mouse = dataset.mouse_paths;
  const mouseDensity = useMemo(() => aggregatePathDensity(mouse.trials), [mouse.trials]);
  const canClass = Boolean(classAnalysis);

  return (
    <section className="result-panel vs-module">
      <ModuleHeader
        index={5}
        title="眼动热图与鼠标密度"
        icon={<Eye size={15} strokeWidth={1.7} />}
      >
        <p className="result-note">
          WebGazer 摄像头估计是探索性指标，不是专业眼动仪。热图把校准通过且有效注视达标的正式试次汇总到同一刺激坐标；
          鼠标密度图由鼠标采样点单独汇总，不混入眼动图层。这里不逐试次展开原始轨迹。
        </p>
      </ModuleHeader>

      <div className="vs-control-row">
        <div className="vs-segmented" role="group" aria-label="个人或班级">
          <button
            type="button"
            className={scope === 'personal' ? 'active' : ''}
            onClick={() => setScope('personal')}
            disabled={mode === 'group'}
            title={mode === 'group' ? '班级视图中不展示其他参与者身份数据' : undefined}
          >
            个人
          </button>
          <button
            type="button"
            className={scope === 'class' ? 'active' : ''}
            onClick={() => setScope('class')}
            disabled={!canClass}
            title={!canClass ? '暂无班级数据' : undefined}
          >
            班级
          </button>
        </div>
      </div>

      <div className="vs-scope-note">
        <span className={`vs-mode-tag ${scope === 'class' ? 'is-gold' : ''}`}>
          {scope === 'class' ? '班级' : '个人'}
        </span>
        <span>
          {scope === 'class'
            ? '班级热图只合并相同 860×540 刺激布局与相同归一化坐标的试次；不同布局不混合。'
            : `个人共有 ${heatmap.trial_count} 个可用眼动试次、${mouse.trial_count} 个可用鼠标试次。`}
        </span>
      </div>

      <div className="vs-spatial-plots">
        <figure className="vs-spatial-figure">
          <figcaption>
            <strong>眼动 · 跨试次热图</strong>
            <span>
              汇总 {heatmap.trial_count} 个可用试次 / {heatmap.participant_count} 名参与者
            </span>
          </figcaption>
          {heatmap.sufficient ? (
            <SpatialPlot bins={heatmap.bins} maxWeight={heatmap.max_weight} variant="gaze" />
          ) : (
            <div className="result-warning">
              <strong>有效眼动样本不足，不展示热图。</strong>
              <span>{heatmap.note}</span>
              <span>
                可用试次 {heatmap.trial_count}，有效样本 {heatmap.sample_count}，
                参与者 {heatmap.participant_count}。这不是“没有搜索行为”，而是眼动质量不足。
              </span>
            </div>
          )}
          <p className="result-note">{heatmap.note}</p>
          <div className="vs-mini-grid">
            <MiniStat label="眼动试次" value={String(heatmap.trial_count)} />
            <MiniStat label="采样点" value={String(heatmap.sample_count)} />
            <MiniStat label="参与者" value={String(heatmap.participant_count)} />
          </div>
        </figure>

        <figure className="vs-spatial-figure">
          <figcaption>
            <strong>
              <MousePointer2 size={13} strokeWidth={1.7} /> 鼠标密度（不是注视）
            </strong>
            <span>
              汇总 {mouse.trial_count} 个可用试次 / {mouse.participant_count} 名参与者
            </span>
          </figcaption>
          {mouse.trials.length > 0 ? (
            <SpatialPlot
              bins={mouseDensity.bins}
              maxWeight={mouseDensity.maxWeight}
              variant="mouse"
            />
          ) : (
            <div className="empty-state">没有可汇总的鼠标轨迹。</div>
          )}
          <p className="result-note">{mouse.note}</p>
          <div className="vs-mini-grid">
            <MiniStat label="鼠标试次" value={String(mouse.trial_count)} />
            <MiniStat label="参与者" value={String(mouse.participant_count)} />
          </div>
        </figure>
      </div>
    </section>
  );
}

function aggregatePathDensity(
  trials: VisualSearchAnalysis['mouse_paths']['trials'],
): { bins: HeatmapBin[]; maxWeight: number } {
  const columns = 24;
  const rows = 16;
  const cells = new Map<string, { x: number; y: number; weight: number }>();
  for (const trial of trials) {
    for (const point of trial.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const column = Math.max(0, Math.min(columns - 1, Math.floor(point.x * columns)));
      const row = Math.max(0, Math.min(rows - 1, Math.floor(point.y * rows)));
      const key = `${column}:${row}`;
      const bin = cells.get(key) ?? {
        x: (column + 0.5) / columns,
        y: (row + 0.5) / rows,
        weight: 0,
      };
      bin.weight += 1;
      cells.set(key, bin);
    }
  }
  const bins = [...cells.values()];
  return {
    bins,
    maxWeight: bins.reduce((max, bin) => Math.max(max, bin.weight), 0),
  };
}

function SpatialPlot({
  bins,
  maxWeight,
  variant,
}: {
  bins: HeatmapBin[];
  maxWeight: number;
  variant: 'gaze' | 'mouse';
}) {
  const width = 860;
  const height = 540;
  const search = { x: 72, y: 64, width: 716, height: 412 };
  const color = variant === 'mouse' ? '#3b627c' : '#c9a24a';
  return (
    <svg
      className="vs-spatial-plot"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={variant === 'mouse' ? '鼠标密度图' : '眼动热图'}
    >
      <rect width={width} height={height} fill="#fffdf8" stroke="#e4e1d7" />
      <rect
        x={search.x}
        y={search.y}
        width={search.width}
        height={search.height}
        fill="none"
        stroke="#e8e3d5"
        strokeWidth={1}
      />
      {[1, 2].map((index) => (
        <g key={`region-line-${index}`} stroke="#eee9dd" strokeDasharray="3 5">
          <line
            x1={search.x + (search.width / 3) * index}
            x2={search.x + (search.width / 3) * index}
            y1={search.y}
            y2={search.y + search.height}
          />
          <line
            x1={search.x}
            x2={search.x + search.width}
            y1={search.y + (search.height / 3) * index}
            y2={search.y + (search.height / 3) * index}
          />
        </g>
      ))}
      {bins.map((bin) => {
        const radius =
          maxWeight > 0 ? 5 + 17 * Math.sqrt(bin.weight / maxWeight) : 5;
        return (
          <circle
            key={`${bin.x}-${bin.y}`}
            cx={bin.x * width}
            cy={bin.y * height}
            r={radius}
            fill={color}
            opacity={
              maxWeight > 0 ? 0.08 + 0.58 * Math.sqrt(bin.weight / maxWeight) : 0.15
            }
          >
            <title>{bin.weight} 个采样点</title>
          </circle>
        );
      })}
    </svg>
  );
}

function NineRegionModule({ analysis }: { analysis: VisualSearchAnalysis }) {
  const spatial = analysis.spatial;
  if (!spatial) {
    return (
      <section className="result-panel vs-module">
        <ModuleHeader
          index={6}
          title="九区域目标分布"
          icon={<Grid3X3 size={15} strokeWidth={1.7} />}
        />
        <div className="result-warning">
          Block 3 尚无正式试次数据。不会补造计划位置或完成的试次。
        </div>
      </section>
    );
  }
  return (
    <section className="result-panel vs-module">
      <ModuleHeader
        index={6}
        title="九区域目标分布"
        icon={<Grid3X3 size={15} strokeWidth={1.7} />}
      >
        <p className="result-note">
          计划、完成、有效、正确是不同计数，分开显示。目标缺失试次不分配到任何区域；
          九区域只统计目标存在试次。默认 15 个正式试次时每个区域只有 1 个计划目标，
          因此位置比较是探索性的。
        </p>
      </ModuleHeader>
      <SpatialCounts spatial={spatial} />
      <div className="vs-region-grid vs-region-grid--data">
        {spatial.regions.map((region) => (
          <RegionCell key={region.region} region={region} />
        ))}
      </div>
      <div className="result-pills">
        <span className="result-pill">计划目标 {spatial.planned_present_count}</span>
        <span className="result-pill">完成目标 {spatial.completed_present_count}</span>
        <span className="result-pill">完成缺失 {spatial.completed_absent_count}</span>
        <span className="result-pill">未覆盖区域 {spatial.uncovered_regions.length}</span>
        <span className="result-pill">缺失目标不进入九区域</span>
      </div>
      {spatial.coverage_warning && (
        <div className="result-warning">{spatial.coverage_warning}</div>
      )}
      <p className="result-note">{spatial.exploratory_note}</p>
    </section>
  );
}

function SpatialCounts({ spatial }: { spatial: SpatialAnalysis }) {
  return (
    <div className="vs-mini-grid vs-mini-grid--wide">
      <MiniStat
        label="Block 3 正式试次"
        value={`${spatial.completed_formal_trials} / ${spatial.planned_formal_trials}`}
      />
      <MiniStat
        label="目标存在"
        value={`${spatial.completed_present_count} / 计划 ${spatial.planned_present_count}`}
      />
      <MiniStat
        label="目标缺失"
        value={`${spatial.completed_absent_count} / 计划 ${spatial.planned_absent_count}`}
      />
      <MiniStat
        label="缺失正确率 / RT"
        value={`${formatPercent(spatial.absent.accuracy)} · ${formatMs(
          spatial.absent.mean_correct_rt_ms,
        )}`}
      />
      <MiniStat label="参与者" value={String(spatial.n_participants)} />
      <MiniStat
        label="未覆盖区域"
        value={
          spatial.uncovered_regions.length === 0
            ? '无'
            : spatial.uncovered_regions.join('、')
        }
      />
    </div>
  );
}

function RegionCell({ region }: { region: RegionStat }) {
  const hasEnough = region.completed_target_count >= 2 && region.mean_correct_rt_ms !== null;
  return (
    <div className={`vs-region-cell ${hasEnough ? 'has-data' : 'is-insufficient'}`}>
      <div className="vs-region-cell__head">
        <strong>{region.region}</strong>
        <span>{region.label}</span>
      </div>
      <div className="vs-region-cell__numbers">
        <span>
          计划 <b>{region.planned_target_count}</b>
        </span>
        <span>
          完成 <b>{region.completed_target_count}</b>
        </span>
        <span>
          有效 <b>{region.valid_response_count}</b>
        </span>
        <span>
          正确 <b>{region.correct_count}</b>
        </span>
      </div>
      <div className="vs-region-cell__metric">
        正确率 {formatPercent(region.accuracy)} ·{' '}
        {region.mean_correct_rt_ms === null
          ? 'RT：NA'
          : `RT：${Math.round(region.mean_correct_rt_ms)} ms`}
      </div>
      <div className="vs-region-cell__foot">
        {region.completed_target_count === 0
          ? '无目标试次'
          : `n=${
              region.n_participants > 1
                ? `${region.n_participants} 人`
                : `${region.completed_target_count} 次`
            }`}
        {region.insufficient_reason
          ? ` · ${region.insufficient_reason}`
          : region.exploratory
            ? ' · 探索性'
            : ' · 描述性'}
      </div>
    </div>
  );
}

function RegionRtModule({
  analysis,
  mode,
}: {
  analysis: VisualSearchAnalysis;
  mode: 'personal' | 'group';
}) {
  const spatial = analysis.spatial;
  return (
    <section className="result-panel vs-module">
      <ModuleHeader
        index={7}
        title="九个目标位置的反应时"
        icon={<MapPin size={15} strokeWidth={1.7} />}
      >
        <p className="result-note">
          只使用目标存在、正确且未超时的试次。点为平均正确 RT，竖线为
          {mode === 'group' ? '参与者级 95% CI（n ≥ 2 时）' : '个人 SE（n ≥ 2 时）'}；
          没有有效数据的区域留空，不绘制 0 或均值替代值。
        </p>
      </ModuleHeader>
      {!spatial ? (
        <div className="result-warning">Block 3 尚无正式试次数据。</div>
      ) : (
        <>
          <RegionRtPlot
            regions={spatial.regions}
            mode={mode}
            color={mode === 'group' ? '#a8433f' : '#2a6fdb'}
          />
          <div className="result-warning vs-warning--soft">
            <strong>探索性警告：</strong>
            默认 15 个正式试次中每个区域仅 1 个计划目标；每个点的 n 很小，不能据此推断稳定位置效应。
          </div>
          <p className="result-note">
            区域 1–9 是刺激搜索区域按实际边界等分的 3×3：1 左上、2 上中、3 右上、4 左中、5 中央、6 右中、7 左下、8 下中、9 右下。
            目标缺失试次不进入本图。
          </p>
        </>
      )}
    </section>
  );
}

function RegionRtPlot({
  regions,
  mode,
  color,
}: {
  regions: RegionStat[];
  mode: 'personal' | 'group';
  color: string;
}) {
  const width = 760;
  const height = 330;
  const padding = { left: 58, right: 24, top: 22, bottom: 56 };
  const values = regions
    .flatMap((region) => [
      region.mean_correct_rt_ms,
      region.mean_correct_rt_ms !== null &&
      mode === 'group' &&
      region.sd_correct_rt_ms !== null &&
      region.n_participants > 1
        ? region.mean_correct_rt_ms +
          1.96 * (region.sd_correct_rt_ms / Math.sqrt(region.n_participants))
        : null,
    ])
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return (
      <div className="result-warning">
        九个区域都没有可用的正确反应时。未用 0 或推测值填补。
      </div>
    );
  }
  const maxY = niceMax(Math.max(...values, 1));
  const xStep = (width - padding.left - padding.right) / 9;
  const yScale = (value: number) =>
    height -
    padding.bottom -
    (value / maxY) * (height - padding.top - padding.bottom);
  const yTicks = Array.from({ length: 5 }, (_, index) => (maxY / 4) * index);
  return (
    <figure className="vs-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="九个区域正确反应时点图">
        <rect
          x={padding.left}
          y={padding.top}
          width={width - padding.left - padding.right}
          height={height - padding.top - padding.bottom}
          fill="#fcfbf7"
        />
        {yTicks.map((tick) => (
          <g key={`region-y-${tick}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="#e4e1d7"
            />
            <text
              x={padding.left - 9}
              y={yScale(tick) + 4}
              textAnchor="end"
              className="vs-chart__tick"
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}
        {regions.map((region) => {
          const x = padding.left + xStep * (region.region - 0.5);
          const ci =
            region.mean_correct_rt_ms !== null &&
            mode === 'group' &&
            region.sd_correct_rt_ms !== null &&
            region.n_participants > 1
              ? 1.96 *
                (region.sd_correct_rt_ms / Math.sqrt(region.n_participants))
              : null;
          return (
            <g key={`region-point-${region.region}`}>
              <line
                x1={x}
                x2={x}
                y1={height - padding.bottom}
                y2={height - padding.bottom + 5}
                stroke="#b9b4a6"
              />
              <text
                x={x}
                y={height - padding.bottom + 21}
                textAnchor="middle"
                className="vs-chart__tick"
              >
                {region.region}
              </text>
              <text
                x={x}
                y={height - padding.bottom + 37}
                textAnchor="middle"
                className="vs-chart__tick vs-chart__tick--small"
              >
                {mode === 'group'
                  ? `n=${region.n_participants}`
                  : `n=${region.completed_target_count}`}
              </text>
              {region.mean_correct_rt_ms !== null && (
                <>
                  {ci !== null && (
                    <line
                      x1={x}
                      x2={x}
                      y1={yScale(Math.max(0, region.mean_correct_rt_ms - ci))}
                      y2={yScale(region.mean_correct_rt_ms + ci)}
                      stroke={color}
                      strokeWidth={1.5}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={yScale(region.mean_correct_rt_ms)}
                    r={4.5}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={1.4}
                  >
                    <title>
                      区域 {region.region} · {region.label} · RT{' '}
                      {formatMs(region.mean_correct_rt_ms)} ·{' '}
                      {mode === 'group'
                        ? `${region.n_participants} 名参与者`
                        : `${region.completed_target_count} 次`}
                    </title>
                  </circle>
                </>
              )}
            </g>
          );
        })}
        <text
          x={(padding.left + width - padding.right) / 2}
          y={height - 6}
          textAnchor="middle"
          className="vs-chart__axis"
        >
          目标所在区域（1–9）
        </text>
        <text
          x={15}
          y={(padding.top + height - padding.bottom) / 2}
          textAnchor="middle"
          transform={`rotate(-90 15 ${(padding.top + height - padding.bottom) / 2})`}
          className="vs-chart__axis"
        >
          平均正确 RT（ms）
        </text>
      </svg>
      <figcaption>
        {mode === 'group'
          ? '每个点先按参与者求区域均值，再汇总；不能把试次当作独立个体。'
          : '每个点只代表本次会话的少量试次。'}
      </figcaption>
    </figure>
  );
}

function SpatialTrajectoryModule({
  analysis,
  mode,
}: {
  analysis: VisualSearchAnalysis;
  mode: 'personal' | 'group';
}) {
  const spatial = analysis.spatial;
  return (
    <section className="result-panel vs-module">
      <ModuleHeader
        index={8}
        title="空间位置与搜索轨迹"
        icon={<Move3D size={15} strokeWidth={1.7} />}
      >
        <p className="result-note">
          眼动首次注视与鼠标首次移动是两条独立轨道。首次注视区域来自 I-DT 停留点；
          鼠标首次移动方向与路径长度不参与眼动计算，也不被解释为注视。
        </p>
      </ModuleHeader>
      {!spatial ? (
        <div className="result-warning">Block 3 尚无正式试次数据。</div>
      ) : (
        <div className="vs-trajectory-grid">
          <article className="vs-track-card">
            <header>
              <span className="vs-track-badge">眼动 · WebGazer</span>
              <strong>首次注视与目标位置</strong>
            </header>
            {!spatial.gaze.available ? (
              <div className="result-warning">
                本次没有可用眼动。不能从鼠标轨迹推断首次注视。
              </div>
            ) : (
              <>
                <div className="vs-mini-grid">
                  <MiniStat
                    label="可用目标试次"
                    value={`${spatial.gaze.usable_trials} / ${spatial.gaze.target_present_trials}`}
                  />
                  <MiniStat
                    label="首次注视匹配目标区"
                    value={formatPercent(spatial.gaze.first_fixation_match_rate)}
                  />
                  <MiniStat
                    label="首次注视到目标距离"
                    value={formatDistance(
                      spatial.gaze.mean_first_fixation_distance_normalized,
                      spatial.gaze.mean_first_fixation_distance_px,
                    )}
                  />
                  <MiniStat
                    label="目标区首次进入顺序"
                    value={
                      spatial.gaze.mean_target_region_visit_order === null
                        ? '—'
                        : `第 ${spatial.gaze.mean_target_region_visit_order.toFixed(1)} 个停留点`
                    }
                  />
                  <MiniStat
                    label="覆盖首次注视区域"
                    value={`${spatial.gaze.regions_with_first_fixation} / 9`}
                  />
                  <MiniStat
                    label="参与者"
                    value={String(spatial.gaze.n_participants)}
                  />
                </div>
                <RegionCountGrid
                  counts={spatial.gaze.first_fixation_region_counts}
                  label="首次注视区域次数"
                />
                {!spatial.gaze.sufficient && (
                  <div className="result-warning vs-warning--soft">
                    <strong>眼动不足：</strong>
                    {spatial.gaze.note}
                  </div>
                )}
                {spatial.gaze.sufficient && (
                  <p className="result-note">{spatial.gaze.note}</p>
                )}
              </>
            )}
          </article>

          <article className="vs-track-card">
            <header>
              <span className="vs-track-badge is-mouse">鼠标 · 行为代理</span>
              <strong>首次移动与路径</strong>
            </header>
            {!spatial.mouse.available ? (
              <div className="result-warning">没有达到质量阈值的鼠标轨迹样本。</div>
            ) : (
              <>
                <div className="vs-mini-grid">
                  <MiniStat
                    label="可用目标试次"
                    value={`${spatial.mouse.usable_trials} / ${spatial.mouse.target_present_trials}`}
                  />
                  <MiniStat
                    label="首次移动进入目标区"
                    value={`${spatial.mouse.same_region_count} 次同区 / ${spatial.mouse.different_region_count} 次异区`}
                  />
                  <MiniStat
                    label="首次移动潜伏期"
                    value={formatMs(spatial.mouse.mean_first_movement_latency_ms)}
                  />
                  <MiniStat
                    label="平均路径长度"
                    value={
                      spatial.mouse.mean_path_length_px === null
                        ? '—'
                        : `${Math.round(spatial.mouse.mean_path_length_px)} px`
                    }
                  />
                  <MiniStat
                    label="首次移动位置到目标"
                    value={
                      spatial.mouse.mean_target_distance_normalized === null
                        ? '—'
                        : spatial.mouse.mean_target_distance_normalized.toFixed(3)
                    }
                  />
                  <MiniStat
                    label="参与者"
                    value={String(spatial.mouse.n_participants)}
                  />
                </div>
                <RegionCountGrid
                  counts={spatial.mouse.first_movement_region_counts}
                  label="首次移动区域次数"
                />
                <p className="result-note">{spatial.mouse.note}</p>
              </>
            )}
          </article>
        </div>
      )}
      <p className="result-note">
        {mode === 'group'
          ? '班级轨迹指标只汇总达到质量阈值的试次，并按参与者计数；没有把不同参与者的原始坐标拼成一条“班级扫描路径”。'
          : '个人轨迹只来自本次会话；目标标记显示实际刺激位置，目标缺失试次不伪造目标位置。'}
      </p>
    </section>
  );
}

function RegionCountGrid({
  counts,
  label,
}: {
  counts: Array<{ region: number; count: number }>;
  label: string;
}) {
  const max = Math.max(...counts.map((item) => item.count), 1);
  return (
    <div className="vs-count-grid" role="img" aria-label={label}>
      {counts.map((item) => (
        <div
          key={`${label}-${item.region}`}
          className="vs-count-cell"
          style={{
            background:
              item.count > 0
                ? `rgba(176, 138, 62, ${0.08 + 0.34 * (item.count / max)})`
                : 'transparent',
          }}
        >
          <span>{item.region}</span>
          <strong>{item.count}</strong>
          <small>{REGION_LABELS[item.region]}</small>
        </div>
      ))}
    </div>
  );
}

function DirectionModule({
  analysis,
  mode,
}: {
  analysis: VisualSearchAnalysis;
  mode: 'personal' | 'group';
}) {
  const direction = analysis.spatial?.direction;
  const entries = direction
    ? Object.entries(direction.ratios).map(([key, stats]) => ({
        key,
        label: DIRECTION_LABELS[key] ?? key,
        stats,
      }))
    : [];
  const maxMean = Math.max(
    ...entries.map((entry) => entry.stats.mean ?? 0),
    0.01,
  );
  return (
    <section className="result-panel vs-module">
      <ModuleHeader
        index={9}
        title="九区域搜索方向"
        icon={<Activity size={15} strokeWidth={1.7} />}
      >
        <p className="result-note">
          方向比例来自完整有效注视序列中相邻停留点的移动方向。至少需要 3 个有效停留点；
          两个注视点不足以推断搜索策略。本模块始终是探索性的，不推断稳定策略。
        </p>
      </ModuleHeader>
      {!direction ? (
        <div className="result-warning">Block 3 尚无正式试次数据。</div>
      ) : !direction.sufficient ? (
        <div className="result-warning">
          <strong>方向指标不可用。</strong>
          <span>
            具有至少 3 个有效注视停留点的试次为 {direction.usable_trials}，
            参与者 {direction.n_participants}。{direction.note}
          </span>
        </div>
      ) : (
        <>
          <div className="vs-direction-list">
            {entries.map((entry) => (
              <div className="vs-direction-row" key={entry.key}>
                <span>{entry.label}</span>
                <div className="vs-slope-track">
                  <span
                    style={{
                      width: `${Math.max(
                        1,
                        ((entry.stats.mean ?? 0) / maxMean) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <strong>{formatPercent(entry.stats.mean, 1)}</strong>
                <small>
                  n={mode === 'group' ? entry.stats.n : direction.usable_trials}
                </small>
              </div>
            ))}
          </div>
          <div className="vs-callout is-muted">
            <strong>探索性：</strong>
            {direction.note}
          </div>
          <p className="result-note">
            有效方向试次 {direction.usable_trials}；参与者 {direction.n_participants}。
            眼动方向与鼠标方向分开计算；这里的“方向”不是目标朝向，也不是策略标签。
          </p>
        </>
      )}
    </section>
  );
}

function VisualSearchMethodPanel({ mode }: { mode: 'personal' | 'group' }) {
  return (
    <section className="result-panel result-panel--method vs-module">
      <h2 className="result-panel__title">视觉搜索指标定义与限制</h2>
      <ul className="result-list">
        <li>
          <strong>三个独立 Block：</strong>Block 1 特征搜索（颜色）、Block 2
          联合搜索（颜色 × 形状）、Block 3 空间位置搜索。Blocks 不合并、不互相替代。
        </li>
        <li>
          <strong>练习排除：</strong>每个 Block 的 2 个练习试次带即时反馈，但不进入任何正式统计。
        </li>
        <li>
          <strong>RT：</strong>正确、未超时、未无效反应的试次才进入均值与斜率；超时不会被当作正常 RT，缺失不会被填为 0。
        </li>
        <li>
          <strong>斜率：</strong>对正确反应 RT 与 set size 做最小二乘拟合；至少 2 个不同 set size 有有效数据即可估计，负斜率如实保留。正式试次较少时，斜率仅供探索性参考，不做显著性检验。
        </li>
        <li>
          <strong>九区域：</strong>搜索区域按实际刺激边界等分为 3×3，区域分析只使用目标存在试次；目标缺失时位置字段为 null，不补造坐标。
        </li>
        <li>
          <strong>双轨测量：</strong>WebGazer 注视估计与鼠标轨迹分开记录、统计和可视化。鼠标不是眼动；眼动是探索性近似，不等同于专业眼动仪。
        </li>
        <li>
          <strong>班级口径：</strong>群体统计取每名参与者最近一次已完成会话，先按参与者汇总再计算；{mode === 'group' ? '当前为班级视图。' : '个人视图不混入其他参与者。'}
        </li>
        <li>
          <strong>不做的事：</strong>不伪造数据、文献或位置；不做个人/文献显著性检验；不从少量注视或少量试次推断稳定策略。
        </li>
      </ul>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="result-mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined
    ? 'NA'
    : `${(value * 100).toFixed(digits)}%`;
}

function formatMs(value: number | null | undefined): string {
  return value === null || value === undefined ? 'NA' : `${Math.round(value)} ms`;
}

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? 'NA' : value.toFixed(1);
}

function formatDistance(
  normalized: number | null,
  pixels: number | null,
): string {
  if (normalized === null && pixels === null) return 'NA';
  const parts: string[] = [];
  if (normalized !== null) parts.push(normalized.toFixed(3));
  if (pixels !== null) parts.push(`${Math.round(pixels)} px`);
  return parts.join(' · ');
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const normalized = value / base;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * base;
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rawStep = span / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / power;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    power;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.001; value += step) {
    ticks.push(Math.round(value * 1000) / 1000);
  }
  return ticks;
}

const DIRECTION_LABELS: Record<string, string> = {
  left_to_right: '左 → 右',
  right_to_left: '右 → 左',
  top_to_bottom: '上 → 下',
  bottom_to_top: '下 → 上',
  center_to_periphery: '中心 → 外周',
  periphery_to_center: '外周 → 中心',
};
