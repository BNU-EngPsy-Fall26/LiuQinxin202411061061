import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Database,
  Download,
  Eye,
  LoaderCircle,
  LogOut,
  MousePointer2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { ExperimentConfig, ExperimentId } from '@shared/types';
import { EXPERIMENT_IDS } from '@shared/types';
import { EXPERIMENT_META, validateConfig } from '@shared/config';
import {
  api,
  ApiError,
  exportUrl,
  type LiteratureRecord,
  type MeasurementSamples,
  type ResearcherOverview,
  type ResearcherParticipant,
  type ResearcherSession,
} from '@/services/api';
import { MouseTrajectory } from '@/components/results/TrajectoryPlot';
import { formatDateTime, formatPercent } from '@/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type Tab = 'overview' | 'data' | 'participants' | 'config' | 'literature';

interface ConfigBundle {
  experiment_id: ExperimentId;
  meta: (typeof EXPERIMENT_META)[ExperimentId];
  config: ExperimentConfig;
  defaults: ExperimentConfig;
}

interface SessionFilters {
  experiment_id: string;
  status: string;
  participant_id: string;
  phase: string;
  block_id: string;
  eye_tracking_status: string;
  min_valid_gaze_ratio: string;
}

interface DetailData {
  session: Record<string, unknown>;
  trials: Array<Record<string, unknown>>;
}

const PAGE_SIZE = 25;

export function ResearcherDashboardPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [pageError, setPageError] = useState('');
  const [overview, setOverview] = useState<ResearcherOverview | null>(null);
  const [participants, setParticipants] = useState<ResearcherParticipant[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [sessions, setSessions] = useState<ResearcherSession[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<SessionFilters>({
    experiment_id: '',
    status: '',
    participant_id: '',
    phase: '',
    block_id: '',
    eye_tracking_status: '',
    min_valid_gaze_ratio: '',
  });
  const [filterDraft, setFilterDraft] = useState<SessionFilters>(filters);
  const [configs, setConfigs] = useState<ConfigBundle[]>([]);
  const [selectedConfigId, setSelectedConfigId] =
    useState<ExperimentId>('visual-search');
  const [configText, setConfigText] = useState('');
  const [configIssues, setConfigIssues] = useState<string[]>([]);
  const [configNotice, setConfigNotice] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [literature, setLiterature] = useState<LiteratureRecord[]>([]);
  const [literatureLoading, setLiteratureLoading] = useState(false);
  const [literatureDraft, setLiteratureDraft] = useState<Record<string, unknown>>(
    emptyLiteratureDraft(),
  );
  const [literatureNotice, setLiteratureNotice] = useState('');
  const [literatureError, setLiteratureError] = useState('');
  const [editingLiteratureId, setEditingLiteratureId] = useState<string | null>(
    null,
  );

  const handleError = useCallback(
    (error: unknown): boolean => {
      if (error instanceof ApiError && error.status === 401) {
        navigate('/researcher/login', { replace: true });
        return true;
      }
      setPageError(
        error instanceof Error ? error.message : '请求失败，请稍后重试。',
      );
      return false;
    },
    [navigate],
  );

  useEffect(() => {
    let active = true;
    void api
      .researcherMe()
      .then((me) => {
        if (!active) return;
        if (me.authenticated) setAuthenticated(true);
        else navigate('/researcher/login', { replace: true });
      })
      .catch(() => {
        if (active) navigate('/researcher/login', { replace: true });
      })
      .finally(() => {
        if (active) setCheckingAuth(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api.overview());
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const loadParticipants = useCallback(
    async (search = '') => {
      try {
        const response = await api.participants(search);
        setParticipants(response.participants);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError],
  );

  const loadConfigs = useCallback(async () => {
    try {
      const response = await api.configs();
      setConfigs(response.configs);
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const loadLiterature = useCallback(async () => {
    setLiteratureLoading(true);
    try {
      const response = await api.researcherLiterature();
      setLiterature(response.records);
      setLiteratureError('');
    } catch (error) {
      handleError(error);
    } finally {
      setLiteratureLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    if (!authenticated) return;
    void loadOverview();
    void loadParticipants();
    void loadConfigs();
    void loadLiterature();
  }, [authenticated, loadOverview, loadParticipants, loadConfigs, loadLiterature]);

  const loadSessions = useCallback(async () => {
    if (!authenticated) return;
    setSessionsLoading(true);
    try {
      const response = await api.sessions({
        experiment_id: filters.experiment_id,
        participant_id: filters.participant_id,
        status: filters.status,
        block_id: filters.block_id,
        eye_tracking_status: filters.eye_tracking_status,
        min_valid_gaze_ratio: filters.min_valid_gaze_ratio,
        limit: PAGE_SIZE,
        offset,
      });
      setSessions(response.sessions);
      setSessionTotal(response.total);
      setPageError('');
    } catch (error) {
      handleError(error);
    } finally {
      setSessionsLoading(false);
    }
  }, [authenticated, filters, offset, handleError]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const selectedBundle = useMemo(
    () => configs.find((item) => item.experiment_id === selectedConfigId) ?? null,
    [configs, selectedConfigId],
  );

  useEffect(() => {
    if (!selectedBundle) return;
    setConfigText(JSON.stringify(selectedBundle.config, null, 2));
    setConfigIssues([]);
    setConfigNotice('');
  }, [selectedBundle]);

  const openDetail = async (sessionId: string) => {
    setDetailLoading(true);
    setDetailError('');
    setDetail({ session: { session_id: sessionId }, trials: [] });
    try {
      const response = await api.sessionDetail(sessionId);
      setDetail({
        session: response.session,
        trials: response.trials,
      });
    } catch (error) {
      if (!handleError(error)) {
        setDetailError(
          error instanceof Error ? error.message : '无法读取会话详情。',
        );
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const saveConfig = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configText);
    } catch {
      setConfigIssues(['JSON 语法错误，请检查括号、引号与逗号。']);
      setConfigNotice('');
      return;
    }
    const validation = validateConfig(selectedConfigId, parsed);
    if (!validation.success) {
      setConfigIssues(validation.issues);
      setConfigNotice('');
      return;
    }
    setSavingConfig(true);
    setConfigIssues([]);
    setConfigNotice('');
    try {
      const response = await api.updateConfig(selectedConfigId, validation.data);
      setConfigs((previous) =>
        previous.map((item) =>
          item.experiment_id === selectedConfigId
            ? { ...item, config: response.config }
            : item,
        ),
      );
      setConfigText(JSON.stringify(response.config, null, 2));
      setConfigNotice('配置已保存。新配置只会影响此后创建的会话；已完成试次保留原配置快照。');
    } catch (error) {
      if (error instanceof ApiError) {
        const issues = Array.isArray(error.details)
          ? error.details.map((item) =>
              typeof item === 'string' ? item : JSON.stringify(item),
            )
          : [];
        setConfigIssues(issues.length > 0 ? issues : [error.message]);
      } else {
        handleError(error);
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const resetConfig = async () => {
    setSavingConfig(true);
    setConfigIssues([]);
    setConfigNotice('');
    try {
      const response = await api.resetConfig(selectedConfigId);
      setConfigs((previous) =>
        previous.map((item) =>
          item.experiment_id === selectedConfigId
            ? { ...item, config: response.config }
            : item,
        ),
      );
      setConfigText(JSON.stringify(response.config, null, 2));
      setConfigNotice('已恢复为平台默认参数，并生成新的配置版本。');
    } catch (error) {
      handleError(error);
    } finally {
      setSavingConfig(false);
      setResetOpen(false);
    }
  };

  const editableConfig = useMemo(() => {
    try {
      return JSON.parse(configText) as ExperimentConfig;
    } catch {
      return selectedBundle?.config ?? null;
    }
  }, [configText, selectedBundle]);

  const patchConfig = (patcher: (config: ExperimentConfig) => ExperimentConfig) => {
    try {
      const parsed = JSON.parse(configText) as ExperimentConfig;
      setConfigText(JSON.stringify(patcher(parsed), null, 2));
      setConfigIssues([]);
      setConfigNotice('');
    } catch {
      setConfigIssues(['JSON 语法错误，无法修改 Block。请先修正 JSON。']);
    }
  };

  const updateBlock = (
    blockId: string,
    patch: Partial<ExperimentConfig['blocks'][number]>,
  ) => {
    patchConfig((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.block_id === blockId ? { ...block, ...patch } : block,
      ),
    }));
  };

  const saveLiteratureDraft = async () => {
    setLiteratureError('');
    setLiteratureNotice('');
    try {
      const response = editingLiteratureId
        ? await api.updateLiterature(editingLiteratureId, literatureDraft)
        : await api.createLiterature(literatureDraft);
      setLiterature((previous) =>
        editingLiteratureId
          ? previous.map((record) =>
              record.literature_id === editingLiteratureId
                ? response.record
                : record,
            )
          : [...previous, response.record],
      );
      setLiteratureDraft(emptyLiteratureDraft());
      setEditingLiteratureId(null);
      setLiteratureNotice('文献记录已保存。数值必须来自可核对来源，禁止编造均值/标准差。');
    } catch (error) {
      setLiteratureError(
        error instanceof Error ? error.message : '文献记录保存失败。',
      );
    }
  };

  const removeLiterature = async (id: string) => {
    setLiteratureError('');
    setLiteratureNotice('');
    try {
      await api.deleteLiterature(id);
      setLiterature((previous) =>
        previous.filter((record) => record.literature_id !== id),
      );
      if (editingLiteratureId === id) {
        setEditingLiteratureId(null);
        setLiteratureDraft(emptyLiteratureDraft());
      }
    } catch (error) {
      setLiteratureError(
        error instanceof Error ? error.message : '删除文献记录失败。',
      );
    }
  };

  const setDraft = (key: string, value: unknown) => {
    setLiteratureDraft((previous) => ({ ...previous, [key]: value }));
  };

  const setDraftNumber = (key: string, value: string) => {
    setDraft(key, value === '' ? null : Number(value));
  };

  const beginEditLiterature = (record: LiteratureRecord) => {
    setEditingLiteratureId(record.literature_id);
    setLiteratureDraft({
      experiment_id: record.experiment_id,
      block_variant: record.block_variant,
      title: record.title,
      authors: record.authors,
      year: record.year,
      journal: record.journal,
      doi: record.doi,
      url: record.url,
      sample_size: record.sample_size,
      task: record.task,
      condition: record.condition,
      dependent_variable: record.dependent_variable,
      mean_value: record.mean_value,
      sd_value: record.sd_value,
      se_value: record.se_value,
      unit: record.unit,
      source_page: record.source_page,
      extraction_method: record.extraction_method,
      comparability_note: record.comparability_note,
      approximate: record.approximate,
      sort_order: record.sort_order,
    });
    setLiteratureNotice('');
    setLiteratureError('');
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      navigate('/researcher/login', { replace: true });
    }
  };

  const applyFilters = () => {
    setFilters(filterDraft);
    setOffset(0);
  };

  const resetFilters = () => {
    const empty = {
      experiment_id: '',
      status: '',
      participant_id: '',
      phase: '',
      block_id: '',
      eye_tracking_status: '',
      min_valid_gaze_ratio: '',
    };
    setFilterDraft(empty);
    setFilters(empty);
    setOffset(0);
  };

  const applyParticipantFilter = (participantId: string) => {
    const next = { ...filters, participant_id: participantId };
    setFilters(next);
    setFilterDraft(next);
    setOffset(0);
    setTab('data');
  };

  const csvHref = exportUrl('csv', {
    experiment_id: filters.experiment_id,
    participant_id: filters.participant_id,
    status: filters.status,
    phase: filters.phase,
    block_id: filters.block_id,
    eye_tracking_status: filters.eye_tracking_status,
    min_valid_gaze_ratio: filters.min_valid_gaze_ratio,
  });
  const jsonHref = exportUrl('json', {
    experiment_id: filters.experiment_id,
    participant_id: filters.participant_id,
    status: filters.status,
    phase: filters.phase,
    block_id: filters.block_id,
    eye_tracking_status: filters.eye_tracking_status,
    min_valid_gaze_ratio: filters.min_valid_gaze_ratio,
  });

  if (checkingAuth) {
    return (
      <div className="admin-page">
        <div className="loading-screen">
          <LoaderCircle className="spinner" size={24} />
          正在验证研究者身份…
        </div>
      </div>
    );
  }

  if (!authenticated) return null;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <span className="eyebrow">Researcher console</span>
          <h1>实验数据台</h1>
          <p className="section-lede" style={{ marginTop: 8 }}>
            查看配置版本、被试完成状态和逐试次原始记录。导出文件包含用于 SPSS / R / Python 的扁平字段。
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--soft btn--sm"
            onClick={() => {
              void loadOverview();
              void loadParticipants(participantSearch);
              void loadSessions();
            }}
          >
            <RefreshCw size={13} strokeWidth={1.7} />
            刷新
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => void logout()}>
            <LogOut size={13} strokeWidth={1.7} />
            退出
          </button>
        </div>
      </header>

      <div className="config-tabs" role="tablist" aria-label="研究者后台分区">
        {(
          [
            ['overview', '概览', BarChart3],
            ['data', '数据与会话', Database],
            ['participants', '被试', Users],
            ['config', '实验配置', Settings2],
            ['literature', '文献数据', BookOpen],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`config-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={13} strokeWidth={1.7} style={{ marginRight: 6, verticalAlign: -2 }} />
            {label}
          </button>
        ))}
      </div>

      {pageError && (
        <div className="config-error" role="alert" style={{ marginBottom: 16 }}>
          {pageError}
        </div>
      )}

      {tab === 'overview' && (
        <OverviewPanel
          overview={overview}
          onOpenSession={(id) => void openDetail(id)}
          onOpenData={() => setTab('data')}
        />
      )}

      {tab === 'data' && (
        <div className="admin-panel">
          <div className="admin-panel__head">
            <h2>逐试次数据</h2>
            <div className="admin-actions">
              <a className="btn btn--soft btn--sm" href={csvHref}>
                <Download size={13} strokeWidth={1.7} />
                导出 CSV
              </a>
              <a className="btn btn--outline btn--sm" href={jsonHref}>
                <Download size={13} strokeWidth={1.7} />
                导出 JSON
              </a>
            </div>
          </div>
          <div className="admin-filters">
            <div className="field-compact">
              <label htmlFor="filter-experiment">实验</label>
              <select
                id="filter-experiment"
                value={filterDraft.experiment_id}
                onChange={(event) =>
                  setFilterDraft({ ...filterDraft, experiment_id: event.target.value })
                }
              >
                <option value="">全部实验</option>
                {EXPERIMENT_IDS.map((id) => (
                  <option value={id} key={id}>
                    {EXPERIMENT_META[id].zhName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-compact">
              <label htmlFor="filter-status">状态</label>
              <select
                id="filter-status"
                value={filterDraft.status}
                onChange={(event) =>
                  setFilterDraft({ ...filterDraft, status: event.target.value })
                }
              >
                <option value="">全部状态</option>
                <option value="completed">已完成</option>
                <option value="in_progress">进行中</option>
              </select>
            </div>
            <div className="field-compact">
              <label htmlFor="filter-participant">被试编号</label>
              <input
                id="filter-participant"
                value={filterDraft.participant_id}
                onChange={(event) =>
                  setFilterDraft({ ...filterDraft, participant_id: event.target.value })
                }
                placeholder="精确匹配"
              />
            </div>
            <div className="field-compact">
              <label htmlFor="filter-phase">导出阶段</label>
              <select
                id="filter-phase"
                value={filterDraft.phase}
                onChange={(event) =>
                  setFilterDraft({ ...filterDraft, phase: event.target.value })
                }
              >
                <option value="">练习 + 正式</option>
                <option value="formal">仅正式</option>
                <option value="practice">仅练习</option>
              </select>
            </div>
            <div className="field-compact">
              <label htmlFor="filter-block">Block</label>
              <input
                id="filter-block"
                value={filterDraft.block_id}
                onChange={(event) =>
                  setFilterDraft({ ...filterDraft, block_id: event.target.value })
                }
                placeholder="例如 vs_spatial"
              />
            </div>
            <div className="field-compact">
              <label htmlFor="filter-eye">眼动状态</label>
              <select
                id="filter-eye"
                value={filterDraft.eye_tracking_status}
                onChange={(event) =>
                  setFilterDraft({
                    ...filterDraft,
                    eye_tracking_status: event.target.value,
                  })
                }
              >
                <option value="">全部</option>
                <option value="calibrated">已校准</option>
                <option value="poor_quality">质量不足</option>
                <option value="declined">拒绝</option>
                <option value="unavailable">不可用</option>
                <option value="not_requested">未请求</option>
              </select>
            </div>
            <div className="field-compact">
              <label htmlFor="filter-gaze">最低有效注视比例</label>
              <input
                id="filter-gaze"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={filterDraft.min_valid_gaze_ratio}
                onChange={(event) =>
                  setFilterDraft({
                    ...filterDraft,
                    min_valid_gaze_ratio: event.target.value,
                  })
                }
                placeholder="0.55"
              />
            </div>
            <button type="button" className="btn btn--primary btn--sm" onClick={applyFilters}>
              <Search size={13} strokeWidth={1.7} />
              应用
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={resetFilters}>
              重置
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>被试</th>
                  <th>实验</th>
                  <th>开始时间</th>
                  <th>状态</th>
                  <th>试次</th>
                  <th>正确率</th>
                  <th>平均 RT</th>
                  <th>配置</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessionsLoading && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">
                        <LoaderCircle className="spinner" size={18} />
                      </div>
                    </td>
                  </tr>
                )}
                {!sessionsLoading && sessions.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">没有符合条件的会话。</div>
                    </td>
                  </tr>
                )}
                {!sessionsLoading &&
                  sessions.map((session) => {
                    const summary = session.summary ?? {};
                    return (
                      <tr key={session.session_id}>
                        <td className="strong mono">{session.participant_id}</td>
                        <td>{EXPERIMENT_META[session.experiment_id].zhName}</td>
                        <td>{formatDateTime(session.started_at)}</td>
                        <td>
                          <StatusBadge status={session.status} />
                        </td>
                        <td>
                          {session.formal_trial_count ?? 0} /{' '}
                          {session.trial_count ?? 0}
                        </td>
                        <td>{formatPercent(asNumber(summary.accuracy), 1)}</td>
                        <td>{formatRt(asNumber(summary.mean_response_time_ms))}</td>
                        <td className="mono">v{session.config_version}</td>
                        <td>
                          <button
                            type="button"
                            className="kebab-button"
                            title="查看会话详情"
                            onClick={() => void openDetail(session.session_id)}
                          >
                            <Eye size={14} strokeWidth={1.7} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              共 {sessionTotal} 个会话 · 第 {Math.floor(offset / PAGE_SIZE) + 1} 页
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn--soft btn--sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                上一页
              </button>
              <button
                type="button"
                className="btn btn--soft btn--sm"
                disabled={offset + PAGE_SIZE >= sessionTotal}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'participants' && (
        <div className="admin-panel">
          <div className="admin-panel__head">
            <h2>被试列表</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={participantSearch}
                onChange={(event) => setParticipantSearch(event.target.value)}
                placeholder="搜索编号"
                className="input"
                style={{ height: 34, minWidth: 170, fontSize: 11 }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void loadParticipants(participantSearch);
                }}
              />
              <button
                type="button"
                className="btn btn--soft btn--sm"
                onClick={() => void loadParticipants(participantSearch)}
              >
                <Search size={13} strokeWidth={1.7} />
                搜索
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>被试编号</th>
                  <th>会话数</th>
                  <th>参与实验</th>
                  <th>首次出现</th>
                  <th>最近参与</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {participants.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">尚无被试数据。</div>
                    </td>
                  </tr>
                )}
                {participants.map((participant) => (
                  <tr key={participant.participant_id}>
                    <td className="strong mono">{participant.participant_id}</td>
                    <td>{participant.session_count}</td>
                    <td>
                      {participant.experiments
                        .map((id) =>
                          id in EXPERIMENT_META
                            ? EXPERIMENT_META[id as ExperimentId].zhName
                            : id,
                        )
                        .join(' · ')}
                    </td>
                    <td>{formatDateTime(participant.first_seen_at)}</td>
                    <td>{formatDateTime(participant.last_seen_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => applyParticipantFilter(participant.participant_id)}
                      >
                        查看数据
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div className="admin-panel">
          <div className="admin-panel__head">
            <h2>实验配置</h2>
            <span className="config-json-note">
              {selectedBundle
                ? `当前版本 v${selectedBundle.config.version} · 保存后自动递增`
                : '加载中'}
            </span>
          </div>
          <div className="admin-panel__body">
            <div className="config-tabs" style={{ marginBottom: 16 }}>
              {EXPERIMENT_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`config-tab${selectedConfigId === id ? ' active' : ''}`}
                  onClick={() => setSelectedConfigId(id)}
                >
                  {EXPERIMENT_META[id].zhName}
                </button>
              ))}
            </div>

            {selectedBundle ? (
              <>
                <div className="notice" style={{ marginBottom: 14 }}>
                  修改仅影响此后创建的新会话。已保存试次保留当时的完整配置快照。
                  所有字段由服务端 Zod 模式校验；正式实验的随机化、刺激参数与计时逻辑不可在此绕过。
                </div>
                {editableConfig && (
                  <div className="config-block-editor">
                    <div className="config-block-editor__head">
                      <div>
                        <strong>Block 配置</strong>
                        <p className="config-json-note">
                          原始实验 Block 的 variant、正式试次数与启用状态被锁定；扩展 Block
                          可单独启用/停用、调整正式试次数与顺序。更改需点击下方“校验并保存”。
                        </p>
                      </div>
                      <label className="config-toggle">
                        <input
                          type="checkbox"
                          checked={editableConfig.randomizeBlockOrder}
                          onChange={(event) =>
                            patchConfig((current) => ({
                              ...current,
                              randomizeBlockOrder: event.target.checked,
                            }))
                          }
                        />
                        随机化 Block 顺序
                      </label>
                    </div>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>启用</th>
                            <th>Block</th>
                            <th>类型</th>
                            <th>Variant</th>
                            <th>正式试次</th>
                            <th>顺序</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editableConfig.blocks.map((block) => {
                            const original = block.block_type === 'original_block';
                            return (
                              <tr key={block.block_id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={block.enabled}
                                    disabled={original}
                                    aria-label={`启用 ${block.label}`}
                                    onChange={(event) =>
                                      updateBlock(block.block_id, {
                                        enabled: event.target.checked,
                                      })
                                    }
                                  />
                                </td>
                                <td>
                                  <strong>{block.label}</strong>
                                  <div className="config-json-note mono">
                                    {block.block_id}
                                  </div>
                                </td>
                                <td>{original ? '原始条件（锁定）' : '扩展条件'}</td>
                                <td className="mono">{block.variant}</td>
                                <td>
                                  <input
                                    type="number"
                                    min={4}
                                    max={200}
                                    value={block.formalTrials}
                                    disabled={original}
                                    aria-label={`${block.label} 正式试次数`}
                                    onChange={(event) =>
                                      updateBlock(block.block_id, {
                                        formalTrials:
                                          Number.parseInt(event.target.value, 10) || 4,
                                      })
                                    }
                                    style={{ width: 74 }}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={block.order}
                                    aria-label={`${block.label} 顺序`}
                                    onChange={(event) =>
                                      updateBlock(block.block_id, {
                                        order:
                                          Number.parseInt(event.target.value, 10) || 0,
                                      })
                                    }
                                    style={{ width: 62 }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="config-field config-field--full">
                  <label htmlFor="config-json">配置 JSON</label>
                  <textarea
                    id="config-json"
                    value={configText}
                    onChange={(event) => {
                      setConfigText(event.target.value);
                      setConfigIssues([]);
                      setConfigNotice('');
                    }}
                    spellCheck={false}
                    rows={24}
                    style={{ minHeight: 520 }}
                  />
                  <span className="config-json-note">
                    数组如 setSizes 使用 JSON 数组；布尔值使用 true / false。
                    修改后请先检查是否有跨字段约束错误。
                  </span>
                </div>
                {configIssues.length > 0 && (
                  <div className="config-error" role="alert">
                    {configIssues.map((issue) => (
                      <div key={issue}>· {issue}</div>
                    ))}
                  </div>
                )}
                {configNotice && (
                  <div className="notice notice--mint" style={{ marginTop: 12 }} role="status">
                    {configNotice}
                  </div>
                )}
                <div className="admin-actions" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={savingConfig}
                    onClick={() => void saveConfig()}
                  >
                    {savingConfig ? <LoaderCircle size={13} /> : null}
                    校验并保存
                  </button>
                  <button
                    type="button"
                    className="btn btn--soft btn--sm"
                    onClick={() => {
                      try {
                        setConfigText(JSON.stringify(JSON.parse(configText), null, 2));
                        setConfigIssues([]);
                      } catch {
                        setConfigIssues(['JSON 语法错误，无法格式化。']);
                      }
                    }}
                  >
                    格式化
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    disabled={savingConfig}
                    onClick={() => setResetOpen(true)}
                  >
                    恢复默认
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setConfigText(JSON.stringify(selectedBundle.config, null, 2));
                      setConfigIssues([]);
                      setConfigNotice('');
                    }}
                  >
                    放弃修改
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <LoaderCircle className="spinner" size={18} />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'literature' && (
        <div className="result-stack">
          <div className="admin-panel">
            <div className="admin-panel__head">
              <h2>文献数据管理</h2>
              <span className="config-json-note">
                仅允许真实来源；来源、提取方式与可比性说明为必填
              </span>
            </div>
            <div className="admin-panel__body">
              <div className="result-warning">
                文献均值/标准差必须来自可核对来源。参考站点转录值需标记“近似/转录值”；
                没有可比较数值时保留 mean 为空，参与者端会显示“暂无可比较的文献数据”。
                不允许用模拟数据冒充论文数据。
              </div>
              {literatureError && <div className="config-error">{literatureError}</div>}
              {literatureNotice && (
                <div className="notice notice--mint" role="status">
                  {literatureNotice}
                </div>
              )}
              <div className="literature-form">
                <Field label="实验">
                  <select
                    value={String(literatureDraft.experiment_id ?? 'visual-search')}
                    onChange={(event) => setDraft('experiment_id', event.target.value)}
                  >
                    {EXPERIMENT_IDS.map((id) => (
                      <option value={id} key={id}>
                        {EXPERIMENT_META[id].zhName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Block variant（可空）">
                  <input
                    value={draftText(literatureDraft.block_variant)}
                    onChange={(event) =>
                      setDraft('block_variant', event.target.value || null)
                    }
                  />
                </Field>
                <Field label="标题" wide>
                  <input
                    value={draftText(literatureDraft.title)}
                    onChange={(event) => setDraft('title', event.target.value)}
                  />
                </Field>
                <Field label="作者" wide>
                  <input
                    value={draftText(literatureDraft.authors)}
                    onChange={(event) => setDraft('authors', event.target.value)}
                  />
                </Field>
                <Field label="年份">
                  <input
                    type="number"
                    value={draftText(literatureDraft.year)}
                    onChange={(event) => setDraftNumber('year', event.target.value)}
                  />
                </Field>
                <Field label="期刊/出处">
                  <input
                    value={draftText(literatureDraft.journal)}
                    onChange={(event) => setDraft('journal', event.target.value || null)}
                  />
                </Field>
                <Field label="DOI">
                  <input
                    value={draftText(literatureDraft.doi)}
                    onChange={(event) => setDraft('doi', event.target.value || null)}
                  />
                </Field>
                <Field label="URL">
                  <input
                    value={draftText(literatureDraft.url)}
                    onChange={(event) => setDraft('url', event.target.value || null)}
                  />
                </Field>
                <Field label="样本量（原文）">
                  <input
                    type="number"
                    value={draftText(literatureDraft.sample_size)}
                    onChange={(event) => setDraftNumber('sample_size', event.target.value)}
                  />
                </Field>
                <Field label="任务">
                  <input
                    value={draftText(literatureDraft.task)}
                    onChange={(event) => setDraft('task', event.target.value)}
                  />
                </Field>
                <Field label="条件">
                  <input
                    value={draftText(literatureDraft.condition)}
                    onChange={(event) => setDraft('condition', event.target.value)}
                  />
                </Field>
                <Field label="因变量">
                  <input
                    value={draftText(literatureDraft.dependent_variable)}
                    onChange={(event) =>
                      setDraft('dependent_variable', event.target.value)
                    }
                  />
                </Field>
                <Field label="均值（无则留空）">
                  <input
                    type="number"
                    step="any"
                    value={draftText(literatureDraft.mean_value)}
                    onChange={(event) => setDraftNumber('mean_value', event.target.value)}
                  />
                </Field>
                <Field label="SD（无则留空）">
                  <input
                    type="number"
                    step="any"
                    value={draftText(literatureDraft.sd_value)}
                    onChange={(event) => setDraftNumber('sd_value', event.target.value)}
                  />
                </Field>
                <Field label="SE（无则留空）">
                  <input
                    type="number"
                    step="any"
                    value={draftText(literatureDraft.se_value)}
                    onChange={(event) => setDraftNumber('se_value', event.target.value)}
                  />
                </Field>
                <Field label="单位">
                  <input
                    value={draftText(literatureDraft.unit)}
                    onChange={(event) => setDraft('unit', event.target.value || null)}
                  />
                </Field>
                <Field label="来源页/图表" wide>
                  <input
                    value={draftText(literatureDraft.source_page)}
                    onChange={(event) => setDraft('source_page', event.target.value)}
                  />
                </Field>
                <Field label="提取方式" wide>
                  <input
                    value={draftText(literatureDraft.extraction_method)}
                    onChange={(event) =>
                      setDraft('extraction_method', event.target.value)
                    }
                  />
                </Field>
                <Field label="可比性说明" wide>
                  <textarea
                    rows={3}
                    value={draftText(literatureDraft.comparability_note)}
                    onChange={(event) =>
                      setDraft('comparability_note', event.target.value)
                    }
                  />
                </Field>
                <Field label="排序值">
                  <input
                    type="number"
                    value={draftText(literatureDraft.sort_order)}
                    onChange={(event) => setDraftNumber('sort_order', event.target.value)}
                  />
                </Field>
                <label className="config-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(literatureDraft.approximate)}
                    onChange={(event) => setDraft('approximate', event.target.checked)}
                  />
                  近似/转录值
                </label>
              </div>
              <div className="admin-actions" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => void saveLiteratureDraft()}
                >
                  <Plus size={13} strokeWidth={1.7} />
                  {editingLiteratureId ? '更新记录' : '新增记录'}
                </button>
                {editingLiteratureId && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setEditingLiteratureId(null);
                      setLiteratureDraft(emptyLiteratureDraft());
                    }}
                  >
                    取消编辑
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--soft btn--sm"
                  onClick={() => void loadLiterature()}
                >
                  <RefreshCw size={13} strokeWidth={1.7} />
                  刷新
                </button>
              </div>
            </div>
          </div>

          <div className="admin-panel">
            <div className="admin-panel__head">
              <h2>全部文献记录</h2>
              <span className="config-json-note">{literature.length} 条</span>
            </div>
            {literatureLoading ? (
              <div className="empty-state">
                <LoaderCircle className="spinner" size={18} />
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>实验</th>
                      <th>文献</th>
                      <th>条件 / DV</th>
                      <th>数值</th>
                      <th>来源</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {literature.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">暂无文献记录。</div>
                        </td>
                      </tr>
                    )}
                    {literature.map((record) => (
                      <tr key={record.literature_id}>
                        <td>{EXPERIMENT_META[record.experiment_id].zhName}</td>
                        <td>
                          <strong>{record.title}</strong>
                          <div className="config-json-note">
                            {record.authors} ({record.year})
                          </div>
                        </td>
                        <td>
                          {record.condition}
                          <div className="config-json-note">
                            {record.dependent_variable}
                          </div>
                        </td>
                        <td>
                          {record.mean_value === null
                            ? '无数值'
                            : `${record.mean_value}${record.unit ? ` ${record.unit}` : ''}`}
                          {record.approximate ? ' · 近似' : ''}
                        </td>
                        <td>
                          {record.source_page}
                          <div className="config-json-note">
                            {record.extraction_method}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => beginEditLiterature(record)}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => void removeLiterature(record.literature_id)}
                              aria-label={`删除 ${record.title}`}
                            >
                              <Trash2 size={12} strokeWidth={1.7} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="恢复默认配置？"
        description="这会覆盖当前实验参数并生成新的版本号。历史会话及其配置快照不会被修改。"
        confirmLabel="恢复默认"
        cancelLabel="取消"
        destructive
        onConfirm={() => void resetConfig()}
      />

      <SessionDetailDialog
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}

function OverviewPanel({
  overview,
  onOpenSession,
  onOpenData,
}: {
  overview: ResearcherOverview | null;
  onOpenSession: (sessionId: string) => void;
  onOpenData: () => void;
}) {
  if (!overview) {
    return (
      <div className="admin-panel">
        <div className="empty-state">
          <LoaderCircle className="spinner" size={18} />
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="admin-stats">
        <div className="admin-stat">
          <div className="admin-stat__value">{overview.totals.participants}</div>
          <div className="admin-stat__label">Unique participants</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat__value">{overview.totals.sessions}</div>
          <div className="admin-stat__label">Sessions</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat__value">{overview.totals.completed_sessions}</div>
          <div className="admin-stat__label">Completed</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat__value">{overview.totals.trials}</div>
          <div className="admin-stat__label">Trials recorded</div>
        </div>
      </div>

      <div className="admin-grid">
        <div className="admin-panel">
          <div className="admin-panel__head">
            <h2>实验项目</h2>
            <span className="config-json-note">全部模块</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>实验</th>
                  <th>会话</th>
                  <th>完成</th>
                  <th>被试</th>
                  <th>正式试次</th>
                </tr>
              </thead>
              <tbody>
                {overview.per_experiment.map((item) => (
                  <tr key={item.experiment_id}>
                    <td className="strong">{item.zhName}</td>
                    <td>{item.sessions}</td>
                    <td>{item.completed}</td>
                    <td>{item.participants}</td>
                    <td>{item.formal_trials}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel__head">
            <h2>最近会话</h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenData}>
              全部数据
              <ArrowLeft size={12} style={{ transform: 'rotate(180deg)' }} />
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>被试</th>
                  <th>实验</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overview.recent_sessions.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">还没有会话。参与者完成练习后会出现在这里。</div>
                    </td>
                  </tr>
                )}
                {overview.recent_sessions.slice(0, 8).map((session) => (
                  <tr key={session.session_id}>
                    <td className="strong mono">{session.participant_id}</td>
                    <td>{EXPERIMENT_META[session.experiment_id].zhName}</td>
                    <td>
                      <StatusBadge status={session.status} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="kebab-button"
                        onClick={() => onOpenSession(session.session_id)}
                      >
                        <Eye size={14} strokeWidth={1.7} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="admin-panel" style={{ marginTop: 20 }}>
        <div className="admin-panel__head">
          <h2>导出说明</h2>
        </div>
        <div className="admin-panel__body" style={{ display: 'grid', gap: 12 }}>
          <span className="config-json-note">
            CSV 含固定核心列与被展平的 <code>stimulus.*</code>、<code>response_data.*</code>、
            <code>tracking.*</code>、<code>metadata.*</code> 字段，可直接在 R、Python 或 SPSS 中读取。
            JSON 按会话分组并保留完整嵌套结构。
          </span>
          <div className="admin-actions">
            <a className="btn btn--soft btn--sm" href={exportUrl('csv', {})}>
              <Download size={13} strokeWidth={1.7} />
              全部试次 CSV
            </a>
            <a className="btn btn--outline btn--sm" href={exportUrl('json', {})}>
              <Database size={13} strokeWidth={1.7} />
              全部会话 JSON
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

function SessionDetailDialog({
  detail,
  loading,
  error,
  onClose,
}: {
  detail: DetailData | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const open = detail !== null;
  const session = detail?.session ?? {};
  const summary = session.summary_json;
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="detail-dialog__panel"
          style={{
            position: 'fixed',
            top: '5vh',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 101,
            width: 'min(1100px, 92vw)',
          }}
          aria-describedby={undefined}
        >
          <div className="detail-dialog__head">
            <div>
              <Dialog.Title className="dialog-title">会话详情</Dialog.Title>
              <p className="config-json-note" style={{ marginTop: 4 }}>
                {String(session.participant_id ?? '')} ·{' '}
                {String(session.experiment_id ?? '')} ·{' '}
                {String(session.session_id ?? '')}
              </p>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="kebab-button" aria-label="关闭">
                <X size={15} strokeWidth={1.7} />
              </button>
            </Dialog.Close>
          </div>
          <div className="detail-dialog__body">
            {loading && (
              <div className="empty-state">
                <LoaderCircle className="spinner" size={20} />
              </div>
            )}
            {error && <div className="config-error">{error}</div>}
            {!loading && !error && detail && (
              <>
                <div className="session-meta">
                  <div className="session-meta__cell">
                    <span>Status</span>
                    <strong>{String(session.status ?? '—')}</strong>
                  </div>
                  <div className="session-meta__cell">
                    <span>Started</span>
                    <strong>{formatDateTime(String(session.started_at ?? ''))}</strong>
                  </div>
                  <div className="session-meta__cell">
                    <span>Completed</span>
                    <strong>{formatDateTime(asString(session.completed_at))}</strong>
                  </div>
                  <div className="session-meta__cell">
                    <span>Config version</span>
                    <strong>v{String(session.config_version ?? '—')}</strong>
                  </div>
                </div>

                {summary && (
                  <details style={{ marginBottom: 18 }}>
                    <summary className="config-json-note" style={{ cursor: 'pointer' }}>
                      汇总与配置快照
                    </summary>
                    <pre
                      style={{
                        marginTop: 10,
                        padding: 14,
                        borderRadius: 12,
                        background: 'rgba(234, 243, 252, 0.45)',
                        fontSize: 10,
                        lineHeight: 1.6,
                        overflow: 'auto',
                        maxHeight: 300,
                      }}
                    >
                      {JSON.stringify(
                        {
                          summary,
                          environment: session.environment_json,
                          config: session.config_snapshot,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>阶段</th>
                        <th>Block / 条件</th>
                        <th>按键</th>
                        <th>正确</th>
                        <th>RT</th>
                        <th>眼动 / 鼠标</th>
                        <th>记录</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.trials.length === 0 && (
                        <tr>
                          <td colSpan={8}>
                            <div className="empty-state">该会话尚无试次记录。</div>
                          </td>
                        </tr>
                      )}
                      {detail.trials.map((trial) => (
                        <TrialRow
                          key={String(trial.trial_id)}
                          trial={trial}
                          sessionId={String(session.session_id ?? '')}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TrialRow({
  trial,
  sessionId,
}: {
  trial: Record<string, unknown>;
  sessionId: string;
}) {
  const [samples, setSamples] = useState<MeasurementSamples | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [samplesError, setSamplesError] = useState('');

  const loadSamples = async () => {
    if (samples || loadingSamples) return;
    setLoadingSamples(true);
    setSamplesError('');
    try {
      setSamples(
        await api.trialSamplesResearcher(sessionId, String(trial.trial_id)),
      );
    } catch (error) {
      setSamplesError(
        error instanceof Error ? error.message : '无法读取测量样本。',
      );
    } finally {
      setLoadingSamples(false);
    }
  };

  return (
    <tr>
      <td className="mono">{String(trial.trial_index ?? '')}</td>
      <td>{String(trial.phase ?? '')}</td>
      <td className="mono">
        {String(trial.block_id ?? '')}
        <div className="config-json-note">{String(trial.condition_id ?? '')}</div>
      </td>
      <td className="mono">{trial.response === null ? '—' : String(trial.response)}</td>
      <td>{trial.correct === null ? '—' : trial.correct ? '✓' : '✕'}</td>
      <td>{formatRt(asNumber(trial.response_time))}</td>
      <td>
        {String(trial.eye_tracking_status ?? '—')}
        <div className="config-json-note">
          注视 {formatPercent(asNumber(trial.valid_gaze_ratio), 0)} · 鼠标{' '}
          {formatPercent(asNumber(trial.valid_mouse_ratio), 0)}
        </div>
      </td>
      <td>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={loadingSamples}
          onClick={() => void loadSamples()}
        >
          <MousePointer2 size={12} strokeWidth={1.7} />
          {loadingSamples ? '读取…' : '轨迹'}
        </button>
        {samplesError && <div className="config-error">{samplesError}</div>}
        {samples && (
          <div className="trial-sample-view">
            <MouseTrajectory samples={samples.mouse_samples} compact />
            <div className="config-json-note">
              眼动样本 {samples.gaze_samples.length} · 鼠标样本{' '}
              {samples.mouse_samples.length}。两条轨道分开显示，不合并。
            </div>
          </div>
        )}
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--muted-light)' }}>
            JSON
          </summary>
          <pre
            style={{
              maxWidth: 460,
              whiteSpace: 'pre-wrap',
              fontSize: 9.5,
              lineHeight: 1.55,
              marginTop: 8,
            }}
          >
            {JSON.stringify(
              {
                stimulus: trial.stimulus_json,
                response: trial.response_json,
                tracking: trial.tracking_json,
                metadata: trial.metadata_json,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </td>
    </tr>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field-compact${wide ? ' field-compact--wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function draftText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function emptyLiteratureDraft(): Record<string, unknown> {
  return {
    experiment_id: 'visual-search',
    block_variant: null,
    title: '',
    authors: '',
    year: new Date().getFullYear(),
    journal: null,
    doi: null,
    url: null,
    sample_size: null,
    task: '',
    condition: '',
    dependent_variable: '',
    mean_value: null,
    sd_value: null,
    se_value: null,
    unit: null,
    source_page: '',
    extraction_method: '',
    comparability_note: '',
    approximate: false,
    sort_order: 100,
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function formatRt(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} ms`;
}
