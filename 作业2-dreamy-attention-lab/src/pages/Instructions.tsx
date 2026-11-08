import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Keyboard, LoaderCircle } from 'lucide-react';
import { EXPERIMENT_META } from '@shared/config';
import {
  isExperimentId,
  type ExperimentConfig,
  type ExperimentId,
  type MapAlignmentConfig,
  type PerceptualOrderingConfig,
  type VisualSearchConfig,
} from '@shared/types';
import { configKeyLabel } from '@/experiments/shared/keys';
import { PageHero } from '@/components/ui/PageHero';
import { api, type ConfigResponse } from '@/services/api';
import {
  cacheExperimentConfig,
  getParticipantId,
  hasActiveParticipantSession,
  hasRecordedConsent,
  readCachedExperimentConfig,
} from '@/services/localStore';
import { InstructionExample } from '@/experiments/instructions/ExampleStimuli';

interface TaskBrief {
  title: string;
  body: ReactNode;
  hint: string;
  note: string;
  controls: ReactNode;
}

export function InstructionsPage() {
  const { experimentId } = useParams();
  const navigate = useNavigate();
  const participantId = getParticipantId();
  const valid = experimentId ? isExperimentId(experimentId) : false;
  const id = valid ? (experimentId as ExperimentId) : null;
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingCache, setUsingCache] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [deviceRisk, setDeviceRisk] = useState(false);

  useEffect(() => {
    if (id !== 'visual-search' && id !== 'map-alignment') {
      setDeviceRisk(false);
      return;
    }
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    setDeviceRisk(coarse || window.innerWidth < 760);
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.experimentConfig(id);
      setData(response);
      cacheExperimentConfig(response);
      setUsingCache(false);
    } catch (loadError) {
      const cached = readCachedExperimentConfig(id);
      if (cached) {
        setData(cached);
        setUsingCache(true);
      } else {
        setError(
          loadError instanceof Error
            ? `无法读取实验配置：${loadError.message}`
            : '无法读取实验配置，请检查网络后重试。',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const meta = id ? EXPERIMENT_META[id] : null;
  const config = data?.config ?? null;

  const brief = useMemo(
    () => (id && config ? buildBrief(id, config) : null),
    [id, config],
  );

  if (!id) return <Navigate to="/experiments" replace />;
  if (!participantId || !hasRecordedConsent() || !hasActiveParticipantSession()) {
    return <Navigate to={`/enter/${id}`} replace />;
  }

  const begin = () => {
    if (!acknowledged) return;
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    navigate(`/experiment/${id}`);
  };

  return (
    <>
      <PageHero
        eyebrow={`Instructions · ${meta?.index}`}
        title="实验说明"
        english={meta?.enName ?? ''}
        breadcrumb={[
          { label: '首页', to: '/' },
          { label: '实验目录', to: '/experiments' },
          { label: meta?.zhName ?? '实验' },
        ]}
        aside={`${meta?.durationLabel ?? ''} · 先确认任务与按键，再开始练习。`}
      />

      {loading && (
        <div className="loading-screen">
          <LoaderCircle className="spinner" size={26} />
          正在读取实验参数…
        </div>
      )}

      {!loading && error && (
        <div className="form-card" style={{ marginBottom: 80 }}>
          <h2 className="section-title" style={{ fontSize: 26 }}>
            暂时无法加载实验
          </h2>
          <p className="field-hint" style={{ marginTop: 10 }}>
            {error}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button type="button" className="btn btn--primary" onClick={() => void load()}>
              重新加载
            </button>
            <Link to="/experiments" className="btn btn--soft">
              返回实验目录
            </Link>
          </div>
        </div>
      )}

      {!loading && data && config && meta && brief && (
        <div className="instruction-brief">
          {usingCache && (
            <div className="notice">
              当前使用本机缓存的配置 v{data.version}。如果研究者刚修改过参数，请刷新页面后重试。
            </div>
          )}
          {deviceRisk && (
            <div
              className="notice notice--lilac"
              role="status"
              style={{ display: 'flex', gap: 10 }}
            >
              <Keyboard size={16} strokeWidth={1.5} style={{ flex: 'none', marginTop: 2 }} />
              <span>
                本实验需要实体键盘和较宽的屏幕。当前设备可能是触屏或窄屏，建议改用电脑后再开始。
              </span>
            </div>
          )}

          <section className="instruction-block">
            <span className="eyebrow">What you will do</span>
            <h2 style={{ marginTop: 16 }}>
              <span className="num">01</span>
              {brief.title}
            </h2>
            <p>{brief.body}</p>
            <div className="example-frame">
              <InstructionExample id={id} />
            </div>
            <p className="field-hint" style={{ marginTop: 12 }}>
              {brief.hint}
            </p>
            <div className="notice" style={{ marginTop: 18 }}>
              {brief.note}
            </div>
          </section>

          <section className="instruction-block">
            <h2>
              <span className="num">02</span>
              如何作答
            </h2>
            {brief.controls}
          </section>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>我已理解任务与作答方式，准备好开始练习。</span>
          </label>

          <div className="instructions-cta" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={begin}
              disabled={!acknowledged}
            >
              开始练习阶段
              <ArrowRight size={16} strokeWidth={1.7} />
            </button>
            <Link to="/experiments" className="btn btn--soft btn--lg">
              <ArrowLeft size={15} strokeWidth={1.7} />
              返回实验目录
            </Link>
          </div>

          <p className="field-hint" style={{ marginTop: 2 }}>
            当前被试编号：{participantId} ·{' '}
            <Link to={`/enter/${id}?change=1`} className="link-arrow" style={{ fontSize: 11 }}>
              更换编号
            </Link>
          </p>
        </div>
      )}
    </>
  );
}

function formatTimeout(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} 秒`;
}

function buildBrief(id: ExperimentId, config: ExperimentConfig): TaskBrief {
  if (id === 'visual-search') {
    const cfg = config as VisualSearchConfig;
    return {
      title: '判断阵列中是否有红色 O',
      body: (
        <>
          每个试次先看注视点，再判断字母阵列中是否有
          <strong style={{ color: '#B94A4E' }}>红色 O</strong>。
          三个 Block 依次进行，每个 Block 先练习 2 次，再做正式试次。
        </>
      ),
      hint: '正式试次的字母数量和位置会变化。',
      note: '请尽量又快又准。第一个 Block 练习后可以选择是否启用摄像头；不启用也能完成实验。',
      controls: (
        <>
          <div className="key-row">
            <span className="keycap">
              <kbd>{cfg.targetKey.toUpperCase()}</kbd>存在红色 O
            </span>
            <span className="keycap">
              <kbd>{cfg.absentKey.toUpperCase()}</kbd>不存在红色 O
            </span>
          </div>
          <p className="field-hint" style={{ marginTop: 14 }}>
            每题最多 {formatTimeout(cfg.responseTimeoutMs)}；超时记为未作答，正式试次没有逐题反馈。
          </p>
        </>
      ),
    };
  }

  if (id === 'perceptual-ordering') {
    const cfg = config as PerceptualOrderingConfig;
    return {
      title: '按面积从小到大排序',
      body: (
        <>
          每个试次有 {cfg.rectanglesPerTrial} 个矩形。请按面积
          <strong>从小到大</strong>排列：最左侧最小，最右侧最大。
        </>
      ),
      hint: '不会显示面积数值，请只凭视觉大小判断。',
      note: '不要使用纸笔、测量工具或手指比划。',
      controls: (
        <>
          <p>拖动矩形到数字位置，或先点矩形再点位置；填满后提交。</p>
          <p className="field-hint" style={{ marginTop: 14 }}>
            提交前可以继续调整。
          </p>
        </>
      ),
    };
  }

  const cfg = config as MapAlignmentConfig;
  return {
    title: '指定建筑在你的哪个方向',
    body: (
      <>
        俯视校园地图中央是你的位置，地图方向固定。每次会用文字告诉你正面朝哪一栋建筑，
        金圈标出目标建筑。请判断目标建筑相对于你当前面朝方向的
        <strong>前方、后方、左方或右方</strong>。
      </>
    ),
    hint: '地图不旋转，但每次的朝向会变化（0°、90°、180°、270°）。右上角指南针显示北的方向。地图、朝向文字和问题同时出现，出现后即可按键。',
    note: '两个 Block 分别使用无人物线索和人物线索，顺序在被试间平衡；每个 Block 先练习 2 次，再完成 15 个正式试次。',
    controls: (
      <>
        <div className="key-row" style={{ flexWrap: 'wrap' }}>
          {(['front', 'back', 'left', 'right'] as const).map((direction) => (
            <span className="keycap" key={direction}>
              <kbd>{configKeyLabel(cfg.keys[direction])}</kbd>
              {directionName(direction)}
            </span>
          ))}
        </div>
        <p className="field-hint" style={{ marginTop: 14 }}>
          每题最多 {formatTimeout(cfg.responseTimeoutMs)}。
        </p>
      </>
    ),
  };
}

function directionName(direction: 'front' | 'back' | 'left' | 'right'): string {
  return {
    front: '前方',
    back: '后方',
    left: '左方',
    right: '右方',
  }[direction];
}
