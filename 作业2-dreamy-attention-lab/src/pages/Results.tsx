import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Eye,
  LoaderCircle,
  MousePointer2,
  Users,
} from 'lucide-react';
import type { ExperimentId } from '@shared/types';
import { isExperimentId } from '@shared/types';
import { EXPERIMENT_META } from '@shared/config';
import { api, ApiError, type GroupResults, type LiteratureRecord, type PersonalResults } from '@/services/api';
import { getParticipantId } from '@/services/localStore';
import { VisualSearchResults } from '@/components/results/VisualSearchResults';
import { MapAlignmentResults } from '@/components/results/MapAlignmentResults';
import { formatPercent } from '@/utils/format';

type Tab = 'mine' | 'group' | 'literature';

const EYE_STATUS_LABEL: Record<string, string> = {
  not_requested: '未请求',
  declined: '已拒绝',
  unavailable: '不可用',
  calibrated: '已校准',
  poor_quality: '质量不足',
  calibration_failed: '校准失败',
};

export function ResultsPage() {
  const { experimentId: rawId } = useParams();
  const [searchParams] = useSearchParams();
  const experimentId: ExperimentId | null =
    rawId && isExperimentId(rawId) ? rawId : null;
  const [sessionId, setSessionId] = useState(searchParams.get('session') ?? '');
  const [participantId, setParticipantId] = useState(
    () => searchParams.get('participant') ?? getParticipantId() ?? '',
  );
  const [tab, setTab] = useState<Tab>('mine');
  const [personal, setPersonal] = useState<PersonalResults | null>(null);
  const [group, setGroup] = useState<GroupResults | null>(null);
  const [literature, setLiterature] = useState<LiteratureRecord[]>([]);
  const [literatureMessage, setLiteratureMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null);

  const meta = experimentId ? EXPERIMENT_META[experimentId] : null;

  const loadPersonal = useCallback(async () => {
    if (!experimentId || !participantId || !sessionId) return;
    setLoading(true);
    setError('');
    try {
      const personalResult = await api.personalResults(
        experimentId,
        participantId,
        sessionId,
      );
      setPersonal(personalResult);
      if (
        experimentId === 'visual-search' ||
        experimentId === 'map-alignment'
      ) {
        // Personal panels offer in-place personal/class comparisons. Load the
        // class aggregate opportunistically; a failure must not hide personal
        // results or fabricate a class layer.
        void api
          .groupResults(experimentId, participantId, sessionId)
          .then((groupResult) => setGroup(groupResult))
          .catch(() => undefined);
      }
      setLoadedTab('mine');
    } catch (caught) {
      setPersonal(null);
      setError(
        caught instanceof ApiError && caught.code === 'RESULTS_DISABLED'
          ? '研究者已关闭本次实验的个人结果展示。你仍可查看全体统计与文献背景。'
          : caught instanceof Error
            ? caught.message
            : '无法读取个人结果。',
      );
    } finally {
      setLoading(false);
    }
  }, [experimentId, participantId, sessionId]);

  const loadGroup = useCallback(async () => {
    if (!experimentId) return;
    setLoading(true);
    setError('');
    try {
      setGroup(
        await api.groupResults(
          experimentId,
          participantId || undefined,
          sessionId || undefined,
        ),
      );
      setLoadedTab('group');
    } catch (caught) {
      setGroup(null);
      setError(caught instanceof Error ? caught.message : '无法读取群体统计。');
    } finally {
      setLoading(false);
    }
  }, [experimentId, participantId, sessionId]);

  const loadLiterature = useCallback(async () => {
    if (!experimentId) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.literature(experimentId);
      setLiterature(response.records);
      setLiteratureMessage(response.comparison.message);
      setLoadedTab('literature');
    } catch (caught) {
      setLiterature([]);
      setError(caught instanceof Error ? caught.message : '无法读取文献数据。');
    } finally {
      setLoading(false);
    }
  }, [experimentId]);

  useEffect(() => {
    if (tab === 'mine') void loadPersonal();
    if (tab === 'group') void loadGroup();
    if (tab === 'literature') void loadLiterature();
  }, [tab, loadPersonal, loadGroup, loadLiterature]);

  if (!experimentId || !meta) {
    return (
      <div className="result-page">
        <div className="empty-state">未找到该实验。</div>
        <Link to="/experiments" className="btn btn--primary">
          返回实验目录
        </Link>
      </div>
    );
  }

  return (
    <div className="result-page">
      <header className="result-header">
        <Link to={`/experiments`} className="result-back">
          <ArrowLeft size={14} strokeWidth={1.7} />
          实验目录
        </Link>
        <span className="eyebrow">Results · {meta.enName}</span>
        <h1 className="result-title">{meta.zhName} · 结果</h1>
        <p className="result-lede">
          个人数据、全体参与者统计与文献背景分开呈现。眼动与鼠标是两条独立测量轨道，
          不会合并成“真实扫描轨迹”；群体数据只使用正式试次。
        </p>
      </header>

      <div className="result-tabs" role="tablist" aria-label="结果层级">
        {(
          [
            ['mine', '我的数据', BarChart3],
            ['group', '全体参与者', Users],
            ['literature', '参考文献', BookOpen],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`result-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} strokeWidth={1.7} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'mine' && (!sessionId || !participantId) && (
        <div className="result-panel">
          <h2 className="result-panel__title">读取我的结果</h2>
          <p className="result-note">
            需要本次会话的会话编号与被试编号。完成实验后，结果页链接会自动带入这两个编号。
          </p>
          <div className="result-inline-form">
            <label>
              被试编号
              <input
                value={participantId}
                onChange={(event) => setParticipantId(event.target.value.trim())}
                placeholder="例如 P-2026-001"
              />
            </label>
            <label>
              会话编号
              <input
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value.trim())}
                placeholder="sess-…"
              />
            </label>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => void loadPersonal()}
            >
              读取
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="config-error" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="result-loading">
          <LoaderCircle className="spinner" size={20} />
          正在读取数据…
        </div>
      )}

      {!loading && tab === 'mine' && personal && (
        <PersonalPanel
          data={personal}
          classVisual={group?.visual_search ?? null}
          classMap={group?.map_alignment ?? null}
        />
      )}

      {!loading && tab === 'group' && group && <GroupPanel data={group} />}

      {!loading && tab === 'literature' && (
        <LiteraturePanel records={literature} message={literatureMessage} />
      )}

      {!loading &&
        loadedTab !== tab &&
        !error &&
        (tab !== 'mine' || (sessionId && participantId)) && (
          <div className="result-loading">
            <LoaderCircle className="spinner" size={18} />
            切换到该视图后加载…
          </div>
        )}
    </div>
  );
}

function PersonalPanel({
  data,
  classVisual,
  classMap,
}: {
  data: PersonalResults;
  classVisual: GroupResults['visual_search'];
  classMap: GroupResults['map_alignment'];
}) {
  const p = data.personal;
  const eye = p.eye;
  const quadrantBars = Object.entries(eye.first_fixation_quadrants).map(
    ([label, value]) => ({ label: quadrantLabel(label), value, display: String(value) }),
  );
  const directionBars = Object.entries(p.mouse.first_movement_directions).map(
    ([label, value]) => ({ label: directionLabel(label), value, display: String(value) }),
  );
  const eyeRatioBars = ratioBars(eye.direction_ratios);
  const mouseRatioBars = ratioBars(p.mouse.direction_ratios);

  return (
    <div className="result-stack">
      {p.visual_search && (
        <VisualSearchResults
          analysis={p.visual_search}
          mode="personal"
          classAnalysis={classVisual}
        />
      )}
      {p.map_alignment && (
        <MapAlignmentResults
          analysis={p.map_alignment}
          mode="personal"
          classAnalysis={classMap}
        />
      )}
      <div className="result-stats">
        <Stat label="正式试次" value={String(p.formal_trials)} />
        <Stat label="有效试次" value={String(p.valid_trials)} />
        <Stat label="正确率" value={formatPercent(p.accuracy, 1)} />
        <Stat label="平均 RT" value={formatMs(p.mean_response_time_ms)} />
        <Stat label="中位 RT" value={formatMs(p.median_response_time_ms)} />
        <Stat label="超时" value={String(p.timeout_count)} />
      </div>

      <div className="result-grid">
        <section className="result-panel">
          <h2 className="result-panel__title">
            <Eye size={15} strokeWidth={1.7} /> 眼动质量
          </h2>
          <div className="result-pills">
            {[...new Set(p.trials.map((trial) => trial.eye_tracking_status))].map(
              (status) => (
                <span className="result-pill" key={status}>
                  {EYE_STATUS_LABEL[status] ?? status}
                </span>
              ),
            )}
          </div>
          <p className="result-note">{eye.note}</p>
          <div className="result-mini-stats">
            <MiniStat label="可用眼动试次" value={`${eye.usable_trials}`} />
            <MiniStat
              label="平均有效注视比例"
              value={eye.mean_valid_gaze_ratio === null ? '—' : formatPercent(eye.mean_valid_gaze_ratio, 1)}
            />
            <MiniStat
              label="校准中位误差"
              value={eye.median_calibration_error_px === null ? '—' : `${Math.round(eye.median_calibration_error_px)} px`}
            />
            {eye.mean_target_first_fixation_ms !== null && (
              <MiniStat
                label="目标 AOI 首次注视"
                value={formatMs(eye.mean_target_first_fixation_ms)}
              />
            )}
            {eye.mean_quadrant_transitions !== null && (
              <MiniStat
                label="平均象限转换"
                value={eye.mean_quadrant_transitions.toFixed(1)}
              />
            )}
          </div>
          {eye.sufficient ? (
            <>
              <BarChart
                data={quadrantBars}
                unit="次"
                caption="首次注视落在大范围象限/中心 AOI 的次数。WebGazer 不能可靠识别单个字母；该指标为探索性。"
              />
              {eyeRatioBars.length > 0 && (
                <BarChart
                  data={eyeRatioBars}
                  unit="%"
                  max={100}
                  caption="相邻注视点位移派生的方向比例（0–100%）。每对方向在对应轴上互补；这是派生、探索性指标，不是真实扫描路径。"
                />
              )}
              <p className="result-note">
                有效眼动试次 {eye.usable_trials} 个，其中 {eye.trials_with_target_fixation} 个记录到目标 AOI 首次注视时间。
                眼动坐标不参与鼠标轨迹叠加。
              </p>
            </>
          ) : (
            <div className="result-warning">
              有效注视不足，因此不展示注视热图或搜索方向结论。这并不影响行为数据与鼠标数据。
            </div>
          )}
        </section>

        <section className="result-panel">
          <h2 className="result-panel__title">
            <MousePointer2 size={15} strokeWidth={1.7} /> 鼠标行为（汇总）
          </h2>
          <div className="result-mini-stats">
            <MiniStat label="可用试次" value={String(p.mouse.usable_trials)} />
            <MiniStat
              label="平均路径长度"
              value={
                p.mouse.mean_path_length_px === null
                  ? '—'
                  : `${Math.round(p.mouse.mean_path_length_px)} px`
              }
            />
          </div>
          <p className="result-note">{p.mouse.note}</p>
          {directionBars.length > 0 && (
            <BarChart
              data={directionBars}
              unit="次"
              caption="首次鼠标移动方向分布（试次数）。这是行为代理指标，不是眼动方向。"
            />
          )}
          {mouseRatioBars.length > 0 && (
            <BarChart
              data={mouseRatioBars}
              unit="%"
              max={100}
              caption="鼠标样本位移派生的方向比例（0–100%）。与眼动分开计算，不能解释为注视方向。"
            />
          )}
          {p.mouse.usable_trials === 0 && (
            <div className="result-warning">本次会话没有可用的鼠标轨迹样本。</div>
          )}
        </section>
      </div>

      <section className="result-panel result-panel--method">
        <h2 className="result-panel__title">指标定义</h2>
        <ul className="result-list">
          <li><strong>直接记录：</strong>试次正确性、按键、RT（performance.now，试次起点到反应）、鼠标坐标与眼动采样。</li>
          <li><strong>派生指标：</strong>正确率、平均/中位 RT、有效注视比例、鼠标路径长度、首次移动方向。</li>
          <li><strong>探索性指标：</strong>首次注视象限、目标 AOI 首次注视时间、象限转换。WebGazer 为网络摄像头估计，误差较大。</li>
          <li>练习试次、超时试次与无效反应不计入正确率与 RT 统计；原始试次仍保留在导出数据中。</li>
        </ul>
      </section>
    </div>
  );
}

function GroupPanel({ data }: { data: GroupResults }) {
  const accuracyBars = data.blocks.map((block) => ({
    label: block.label,
    value: block.accuracy.mean === null ? 0 : block.accuracy.mean * 100,
    display:
      block.accuracy.mean === null
        ? '—'
        : `${block.accuracy.mean.toFixed(1)}%`,
  }));
  const rtBars = data.blocks.map((block) => ({
    label: block.label,
    value: block.mean_response_time_ms.mean ?? 0,
    display: formatMs(block.mean_response_time_ms.mean),
  }));
  const accuracyIntervals = data.blocks.map((block) => ({
    label: block.label,
    mean:
      block.accuracy.mean === null ? null : block.accuracy.mean * 100,
    low: block.accuracy.ci_low === null ? null : block.accuracy.ci_low * 100,
    high: block.accuracy.ci_high === null ? null : block.accuracy.ci_high * 100,
    meanDisplay: formatPercent(block.accuracy.mean, 1),
    ciDisplay: formatCi(block.accuracy.ci_low, block.accuracy.ci_high, true),
  }));
  const rtIntervals = data.blocks.map((block) => ({
    label: block.label,
    mean: block.mean_response_time_ms.mean,
    low: block.mean_response_time_ms.ci_low,
    high: block.mean_response_time_ms.ci_high,
    meanDisplay: formatMs(block.mean_response_time_ms.mean),
    ciDisplay: formatCi(
      block.mean_response_time_ms.ci_low,
      block.mean_response_time_ms.ci_high,
    ),
  }));
  const groupEyeRatioBars = statsRatioBars(data.eye.direction_ratios);
  const groupMouseRatioBars = statsRatioBars(data.mouse.direction_ratios);

  if (data.n_participants === 0) {
    return (
      <div className="result-panel">
        <h2 className="result-panel__title">全体参与者</h2>
        <div className="empty-state">尚无已完成会话，暂不能计算群体统计。</div>
      </div>
    );
  }

  return (
    <div className="result-stack">
      {data.visual_search && (
        <VisualSearchResults analysis={data.visual_search} mode="group" />
      )}
      {data.map_alignment && (
        <MapAlignmentResults analysis={data.map_alignment} mode="group" />
      )}
      {data.sample_warning && (
        <div className="result-warning" role="status">
          {data.sample_warning}
        </div>
      )}
      <div className="result-stats">
        <Stat label="参与者 N" value={String(data.n_participants)} />
        <Stat
          label="正确率均值"
          value={formatPercent(data.group.accuracy.mean, 1)}
        />
        <Stat
          label="正确率 SD"
          value={
            data.group.accuracy.sd === null
              ? '—'
              : `${(data.group.accuracy.sd * 100).toFixed(1)}%`
          }
        />
        <Stat
          label="平均 RT 均值"
          value={formatMs(data.group.mean_response_time_ms.mean)}
        />
        <Stat
          label="平均 RT SD"
          value={formatMs(data.group.mean_response_time_ms.sd)}
        />
      </div>

      {data.viewer_position && (
        <section className="result-panel">
          <h2 className="result-panel__title">我的位置</h2>
          <p className="result-note">
            你的正确率位于群体第 {formatPercent(data.viewer_position.accuracy_percentile === null ? null : data.viewer_position.accuracy_percentile / 100, 0)} 百分位
            {data.viewer_position.mean_rt_percentile === null
              ? '。'
              : `；你的平均 RT 位于第 ${formatPercent(data.viewer_position.mean_rt_percentile / 100, 0)} 百分位（越低越快）。`}
            百分位只作描述，不代表显著性。
          </p>
        </section>
      )}

      <section className="result-panel">
        <h2 className="result-panel__title">Block 群体统计</h2>
        <p className="result-note">
          先按参与者汇总，再计算 N、均值、SD 与 95% CI；不使用试次级合并，
          避免试次多的参与者权重过大。仅包含已完成会话的正式试次。
        </p>
        <div className="result-pills">
          {data.blocks.map((block) => (
            <span className="result-pill" key={`group-meta-${block.block_id}`}>
              {block.label} ·{' '}
              {block.block_type === 'original_block' ? '原始条件' : '扩展条件'} ·{' '}
              {block.n} 名参与者
            </span>
          ))}
        </div>
        <BarChart
          data={accuracyBars}
          unit="%"
          max={100}
          caption={`每个 Block 的参与者级正确率均值；N = ${data.n_participants}。`}
        />
        <IntervalChart
          data={accuracyIntervals}
          unit="%"
          max={100}
          caption="点表示参与者级正确率均值，横线表示 95% CI。区间很宽时只作描述。"
        />
        <IntervalChart
          data={rtIntervals}
          unit="ms"
          caption="点表示参与者级平均 RT，横线表示 95% CI；RT 只统计正确且未超时的试次。"
        />
        <BarChart
          data={rtBars}
          unit="ms"
          caption={`每个 Block 的参与者级平均 RT；N = ${data.n_participants}。RT 只统计正确且未超时的试次。`}
        />
      </section>

      <div className="result-grid">
        <section className="result-panel">
          <h2 className="result-panel__title">群体眼动</h2>
          <p className="result-note">{data.eye.note}</p>
          <div className="result-mini-stats">
            <MiniStat label="有可用眼动的参与者" value={String(data.eye.participants_with_usable_gaze)} />
            <MiniStat
              label="平均有效注视比例"
              value={
                data.eye.mean_valid_gaze_ratio.mean === null
                  ? '—'
                  : formatPercent(data.eye.mean_valid_gaze_ratio.mean, 1)
              }
            />
          </div>
          {!data.eye.usable && (
            <div className="result-warning">
              群体眼动样本不足，不展示眼动热图或方向性结论。
            </div>
          )}
          {data.eye.usable && groupEyeRatioBars.length > 0 && (
            <BarChart
              data={groupEyeRatioBars}
              unit="%"
              max={100}
              caption={`参与者级方向比例均值（N = ${data.eye.participants_with_usable_gaze} 名有可用眼动的参与者）。派生自注视点位移，不能视为真实扫描路径。`}
            />
          )}
        </section>
        <section className="result-panel">
          <h2 className="result-panel__title">群体鼠标</h2>
          <p className="result-note">{data.mouse.note}</p>
          <div className="result-mini-stats">
            <MiniStat label="有鼠标数据的参与者" value={String(data.mouse.participants_with_mouse)} />
            <MiniStat
              label="平均路径长度"
              value={
                data.mouse.mean_path_length_px.mean === null
                  ? '—'
                  : `${Math.round(data.mouse.mean_path_length_px.mean)} px`
              }
            />
          </div>
          {groupMouseRatioBars.length > 0 && (
            <BarChart
              data={groupMouseRatioBars}
              unit="%"
              max={100}
              caption={`参与者级鼠标方向比例均值（N = ${data.mouse.participants_with_mouse} 名有有效鼠标数据的参与者）。与眼动分别统计。`}
            />
          )}
        </section>
      </div>

      <section className="result-panel result-panel--method">
        <h2 className="result-panel__title">统计规则与限制</h2>
        <p className="result-note">{data.limitation}</p>
        <ul className="result-list">
          <li>每名参与者只取该实验最近一次已完成会话；同一参与者的重复会话不重复计入。</li>
          <li>练习试次不进入群体统计；超时与无效反应按个人统计同一规则处理。</li>
          <li>眼动统计只使用校准通过且有效注视比例达到阈值的试次；鼠标统计只使用有效鼠标数据。</li>
          <li>不展示任何参与者身份信息；N &lt; 10 时均值与 CI 不稳定，只作描述。</li>
          <li>未对个人数据与文献均值做显著性检验，也未将眼动与鼠标坐标合并为扫描轨迹。</li>
        </ul>
      </section>
    </div>
  );
}

function LiteraturePanel({
  records,
  message,
}: {
  records: LiteratureRecord[];
  message: string;
}) {
  return (
    <div className="result-stack">
      <div className="result-warning" role="status">
        {message}
      </div>
      <section className="result-panel">
        <h2 className="result-panel__title">文献来源与可比较性</h2>
        <p className="result-note">
          下列文献优先来自参考站点及其经典引用；数值仅为背景，不从本平台个人数据推断文献结论。
          来源、提取方式与不可比原因逐条保留。
        </p>
        {records.length === 0 ? (
          <div className="empty-state">暂无可比较的文献数据。</div>
        ) : (
          <div className="literature-cards">
            {records.map((record) => (
              <article className="literature-card" key={record.literature_id}>
                <header className="literature-card__head">
                  <span className="literature-card__year">{record.year}</span>
                  <div>
                    <h3>{record.title}</h3>
                    <p className="result-note">
                      {record.authors} ({record.year}). {record.journal ?? ''}
                      {record.doi ? (
                        <>
                          {' '}
                          <a
                            href={record.url ?? `https://doi.org/${record.doi}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            DOI
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                </header>

                <div className="literature-card__value">
                  {record.mean_value === null ? (
                    <strong>无数值</strong>
                  ) : (
                    <>
                      <strong>
                        {record.mean_value}
                        {record.unit ? ` ${record.unit}` : ''}
                      </strong>
                      <span>
                        {record.approximate
                          ? '近似/转录值 · 背景数值，不可直接比较'
                          : '背景数值，不可直接比较'}
                      </span>
                    </>
                  )}
                  <small>
                    {record.sample_size
                      ? `N = ${record.sample_size}`
                      : '原文样本量未转录'}
                  </small>
                </div>

                <dl className="literature-card__facts">
                  <div>
                    <dt>任务</dt>
                    <dd>{record.task}</dd>
                  </div>
                  <div>
                    <dt>条件</dt>
                    <dd>{record.condition}</dd>
                  </div>
                  <div>
                    <dt>因变量</dt>
                    <dd>{record.dependent_variable}</dd>
                  </div>
                  <div>
                    <dt>来源与提取</dt>
                    <dd>
                      {record.source_page}
                      <span>{record.extraction_method}</span>
                    </dd>
                  </div>
                  <div className="literature-card__wide">
                    <dt>可比性说明</dt>
                    <dd>{record.comparability_note}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="result-panel result-panel--method">
        <h2 className="result-panel__title">解读限制</h2>
        <ul className="result-list">
          <li>不把文献均值当作本平台的“标准答案”，也不对个人/群体均值与文献均值做显著性检验。</li>
          <li>参考站点的刺激、set size、反应方式与本平台不同；即使因变量名称相同，也不强行合并。</li>
          <li>标注“近似/转录值”的数字来自参考站点设计数据，不是本次从原论文图表重新数字化的结果。</li>
          <li>没有可比较数值时，只展示理论背景，并明确写出“暂无可比较的文献数据”。</li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="result-stat">
      <div className="result-stat__value">{value}</div>
      <div className="result-stat__label">{label}</div>
    </div>
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

function BarChart({
  data,
  unit,
  max,
  caption,
}: {
  data: Array<{ label: string; value: number; display: string }>;
  unit: string;
  max?: number;
  caption: string;
}) {
  const top = max ?? Math.max(...data.map((item) => item.value), 1);
  return (
    <figure className="result-chart">
      <div className="result-chart__rows" role="img" aria-label={caption}>
        {data.map((item) => (
          <div className="result-chart__row" key={item.label}>
            <span className="result-chart__label" title={item.label}>
              {item.label}
            </span>
            <span className="result-chart__track">
              <span
                className="result-chart__fill"
                style={{ width: `${top > 0 ? Math.min(100, (item.value / top) * 100) : 0}%` }}
              />
            </span>
            <span className="result-chart__value">{item.display}</span>
          </div>
        ))}
      </div>
      <figcaption>
        {unit === '%' ? '横轴：百分比 (0–100%)。' : `横轴：${unit}。`} {caption}
      </figcaption>
    </figure>
  );
}

interface IntervalDatum {
  label: string;
  mean: number | null;
  low: number | null;
  high: number | null;
  meanDisplay: string;
  ciDisplay: string;
}

function IntervalChart({
  data,
  unit,
  max,
  caption,
}: {
  data: IntervalDatum[];
  unit: string;
  max?: number;
  caption: string;
}) {
  const values = data
    .flatMap((item) => [item.mean, item.low, item.high])
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const top = max ?? Math.max(...values, 1);
  return (
    <figure className="result-chart result-chart--interval">
      <div className="result-chart__rows" role="img" aria-label={caption}>
        {data.map((item) => {
          const mean = item.mean;
          const low = item.low === null ? null : Math.max(0, item.low);
          const high = item.high === null ? null : Math.min(top, item.high);
          const canDraw = mean !== null && low !== null && high !== null;
          return (
            <div className="result-chart__row" key={item.label}>
              <span className="result-chart__label" title={item.label}>
                {item.label}
              </span>
              <span className="result-chart__interval-track">
                {canDraw && (
                  <>
                    <span
                      className="result-chart__interval-range"
                      style={{
                        left: `${(low / top) * 100}%`,
                        width: `${Math.max(1, ((high - low) / top) * 100)}%`,
                      }}
                    />
                    <span
                      className="result-chart__interval-mean"
                      style={{ left: `${(mean / top) * 100}%` }}
                    />
                  </>
                )}
                {!canDraw && <span className="result-chart__interval-empty">NA</span>}
              </span>
              <span className="result-chart__value result-chart__value--interval">
                <strong>{item.meanDisplay}</strong>
                <small>{item.ciDisplay}</small>
              </span>
            </div>
          );
        })}
      </div>
      <figcaption>
        {unit === '%' ? '横轴：百分比 (0–100%)。' : `横轴：${unit}。`} {caption}
      </figcaption>
    </figure>
  );
}

function formatMs(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value)} ms`;
}

function formatCi(low: number | null, high: number | null, percent = false): string {
  if (low === null || high === null) return '—';
  return percent
    ? `${(low * 100).toFixed(1)}–${(high * 100).toFixed(1)}%`
    : `${Math.round(low)}–${Math.round(high)} ms`;
}

function quadrantLabel(value: string): string {
  const labels: Record<string, string> = {
    upper_left: '左上',
    upper_right: '右上',
    lower_left: '左下',
    lower_right: '右下',
    center: '中央',
    other: '其他',
  };
  return labels[value] ?? value;
}

function directionLabel(value: string): string {
  const labels: Record<string, string> = {
    left: '左',
    right: '右',
    up: '上',
    down: '下',
    stationary: '静止',
    other: '其他',
  };
  return labels[value] ?? value;
}


const RATIO_LABELS: Record<string, string> = {
  left_to_right: '左→右',
  right_to_left: '右→左',
  top_to_bottom: '上→下',
  bottom_to_top: '下→上',
  center_to_periphery: '中心→外周',
  periphery_to_center: '外周→中心',
  left_to_right_transition_ratio: '左→右',
  right_to_left_transition_ratio: '右→左',
  top_to_bottom_transition_ratio: '上→下',
  bottom_to_top_transition_ratio: '下→上',
  center_to_periphery_transition_ratio: '中心→外周',
  periphery_to_center_transition_ratio: '外周→中心',
};

function ratioBars(ratios: Record<string, number | null>) {
  return Object.entries(ratios)
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([key, value]) => ({
      label: RATIO_LABELS[key] ?? key,
      value: value * 100,
      display: `${(value * 100).toFixed(1)}%`,
    }));
}

function statsRatioBars(ratios: Record<string, { mean: number | null }>) {
  return Object.entries(ratios)
    .filter(
      (entry): entry is [string, { mean: number }] => entry[1].mean !== null,
    )
    .map(([key, stats]) => ({
      label: RATIO_LABELS[key] ?? key,
      value: stats.mean * 100,
      display: `${(stats.mean * 100).toFixed(1)}%`,
    }));
}
