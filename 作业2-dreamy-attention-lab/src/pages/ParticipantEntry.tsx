import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Dices,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { EXPERIMENT_META } from '@shared/config';
import { isExperimentId, type ExperimentId } from '@shared/types';
import { PageHero } from '@/components/ui/PageHero';
import {
  getParticipantId,
  hasActiveParticipantSession,
  markParticipantSessionActive,
  recordConsent,
  saveParticipantId,
} from '@/services/localStore';
import { ExperimentArt } from '@/components/experiments/ExperimentArt';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;

function generateAnonymousId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let result = '';
  for (const value of bytes) result += alphabet[value % alphabet.length];
  return `DCL-${result}`;
}

export function ParticipantEntryPage() {
  const { experimentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existing = getParticipantId();
  const changingParticipant = searchParams.get('change') === '1';
  const [participantId, setParticipantId] = useState(existing ?? '');
  const [consent, setConsent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');

  const experiment = useMemo(() => {
    if (!experimentId || !isExperimentId(experimentId)) return null;
    const id: ExperimentId = experimentId;
    return EXPERIMENT_META[id];
  }, [experimentId]);

  if (experimentId && !experiment) {
    return <Navigate to="/enter" replace />;
  }

  // The login is shared by both active experiments for this browser tab.
  // A fresh visit always passes through this page; after logging in once,
  // moving from one experiment to the other does not ask for the ID again.
  if (!changingParticipant && hasActiveParticipantSession()) {
    return (
      <Navigate
        to={experiment ? `/instructions/${experiment.id}` : '/experiments'}
        replace
      />
    );
  }

  const submit = () => {
    const trimmed = participantId.trim();
    if (!ID_PATTERN.test(trimmed)) {
      setError(
        '请输入 3–32 位被试编号，仅可使用英文字母、数字、连字符与下划线，并以字母或数字开头。',
      );
      return;
    }
    if (!consent || !acknowledged) {
      setError('请阅读并勾选下方两项确认后再继续。');
      return;
    }
    setError('');
    saveParticipantId(trimmed);
    recordConsent();
    markParticipantSessionActive(trimmed);
    navigate(experiment ? `/instructions/${experiment.id}` : '/experiments', {
      replace: true,
    });
  };

  return (
    <>
      <PageHero
        eyebrow={experiment ? `Login · ${experiment.index}` : 'Participant login'}
        title="被试登录"
        english="Shared participant login"
        breadcrumb={[
          { label: '首页', to: '/' },
          { label: '实验目录', to: '/experiments' },
          ...(experiment ? [{ label: experiment.zhName }] : []),
        ]}
        aside="两个实验共用同一次登录。请确认被试编号、数据使用方式与参与条件；登录后可在实验目录中选择任务，不会收集姓名、手机号或其他直接身份信息。"
      />

      <section className="section-sm" style={{ paddingTop: 18 }}>
        <div className="entry-grid">
          <div className="form-card">
            <span className="eyebrow">Participant identity</span>
            <h2 className="section-title" style={{ fontSize: 30, marginTop: 16 }}>
              你的被试编号
            </h2>
            <p className="field-hint" style={{ marginTop: 10, maxWidth: 560 }}>
              如果研究者已为你分配编号，请准确填写。没有编号时，可以生成一个匿名编号。
              同一编号将用于关联你在不同实验中的数据，但不包含任何姓名信息。
            </p>

            <div style={{ marginTop: 28 }}>
              <label className="field-label" htmlFor="participant-id">
                <span>Participant ID</span>
                {existing && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      color: '#728b7a',
                      fontSize: 10,
                    }}
                  >
                    <Check size={11} /> 已保存在本设备
                  </span>
                )}
              </label>
              <div className="input-row">
                <input
                  id="participant-id"
                  className="input input--mono"
                  value={participantId}
                  onChange={(event) => {
                    setParticipantId(event.target.value);
                    setError('');
                  }}
                  placeholder="例如 P-2026-041"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                  aria-describedby="participant-help"
                  aria-invalid={Boolean(error)}
                />
                <button
                  type="button"
                  className="btn btn--soft"
                  style={{ flex: 'none', minHeight: 52, borderRadius: 14 }}
                  onClick={() => {
                    setParticipantId(generateAnonymousId());
                    setError('');
                  }}
                >
                  <Dices size={15} strokeWidth={1.7} />
                  生成匿名编号
                </button>
              </div>
              <p id="participant-help" className="field-hint" style={{ marginTop: 9 }}>
                3–32 位；可使用英文字母、数字、- 和 _。编号无法用于识别你的真实身份。
              </p>
            </div>

            <hr className="hairline" style={{ margin: '28px 0' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="notice">
                <strong>本实验会记录什么？</strong>
                <br />
                你的按键、反应时、实验条件、刺激参数与操作过程。
                {!experiment || experiment.id === 'visual-search' ? (
                  <>
                    {' '}
                    视觉搜索实验还会同时记录实验区域内的鼠标轨迹，并在你单独同意后使用摄像头进行
                    WebGazer 注视估计。摄像头画面只在本地处理，原始视频不会上传或保存；
                    眼动结果是探索性近似指标，你可以拒绝开启摄像头并继续完成实验。
                    鼠标移动不会被当作眼动。
                  </>
                ) : (
                  ' 本实验不请求摄像头权限，不采集眼动或视频。'
                )}{' '}
                浏览器会随数据提交基础技术信息（屏幕尺寸、浏览器类型、时区）。
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => {
                    setConsent(event.target.checked);
                    setError('');
                  }}
                />
                <span>
                  我已阅读上述数据说明，理解参与是自愿的，并同意匿名行为数据用于本平台的研究分析。
                  我可在正式实验开始前随时退出。
                </span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => {
                    setAcknowledged(event.target.checked);
                    setError('');
                  }}
                />
                <span>
                  我理解需要尽量在安静、不分心的环境中完成实验，并将按照自己的真实知觉进行判断；
                  不会借助纸笔、外部计算工具或他人协助。
                </span>
              </label>
            </div>

            {error && (
              <p className="error-text" style={{ marginTop: 14 }} role="alert">
                {error}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 20,
                flexWrap: 'wrap',
                marginTop: 26,
              }}
            >
              <span className="status-inline">
                <LockKeyhole size={12} strokeWidth={1.6} />
                不上传姓名、联系方式或摄像头画面
              </span>
              <button type="button" className="btn btn--primary" onClick={submit}>
                {experiment ? '登录并继续' : '登录并选择实验'}
                <ArrowRight size={15} strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {experiment ? (
              <div
                className={`experiment-card experiment-card--${experiment.accent}`}
                style={{ minHeight: 'auto', padding: 24, borderRadius: 26 }}
              >
                <div className="experiment-card__top">
                  <span className="experiment-index">{experiment.index}</span>
                  <span className="experiment-outcome">{experiment.durationLabel}</span>
                </div>
                <div className="experiment-art" style={{ height: 150 }}>
                  <ExperimentArt id={experiment.id} />
                </div>
                <div className="experiment-card__body">
                  <div className="experiment-card__en">{experiment.enName}</div>
                  <h3 className="experiment-card__title" style={{ fontSize: 25 }}>
                    {experiment.zhName}
                  </h3>
                  <p className="experiment-card__tagline" style={{ minHeight: 'auto' }}>
                    {experiment.tagline}
                  </p>
                </div>
              </div>
            ) : (
              <div className="side-card">
                <div className="side-card__title">Shared login</div>
                <div className="fact-list">
                  <div className="fact">
                    <span>视觉搜索</span>
                    <strong>三个 Block · 约 10 分钟</strong>
                  </div>
                  <div className="fact">
                    <span>地图对齐</span>
                    <strong>三个提示条件 · 约 10 分钟</strong>
                  </div>
                  <div className="fact">
                    <span>登录</span>
                    <strong>一次登录 · 两项共用</strong>
                  </div>
                </div>
              </div>
            )}
            <div className="side-card">
              <div className="side-card__title">Session at a glance</div>
              <div className="fact-list">
                <div className="fact">
                  <span>流程</span>
                  <strong>说明 · 练习 · 正式</strong>
                </div>
                <div className="fact">
                  <span>设备建议</span>
                  <strong>桌面 / 笔记本</strong>
                </div>
                <div className="fact">
                  <span>数据保存</span>
                  <strong>逐试次 + 本地缓存</strong>
                </div>
                <div className="fact">
                  <span>参与费用</span>
                  <strong>免费 · 自愿</strong>
                </div>
              </div>
            </div>
            <div className="notice notice--lilac" style={{ display: 'flex', gap: 10 }}>
              <Sparkles size={16} strokeWidth={1.4} style={{ flex: 'none', marginTop: 2 }} />
              <span>
                实验没有“聪明”或“不聪明”的结果。请只按照当下真实看到的做出判断。
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                color: 'var(--muted-light)',
                fontSize: 10,
              }}
            >
              <ShieldCheck size={12} strokeWidth={1.6} />
              研究用途 · 匿名数据 · 可追溯条件
            </div>
            <Link
              to="/experiments"
              className="link-arrow"
              style={{ alignSelf: 'flex-start', fontSize: 11 }}
            >
              返回实验目录
            </Link>
          </aside>
        </div>
      </section>
    </>
  );
}
