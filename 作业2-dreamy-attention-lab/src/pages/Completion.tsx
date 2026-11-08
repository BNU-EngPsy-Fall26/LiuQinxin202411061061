import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CloudUpload,
  Download,
  RefreshCw,
} from 'lucide-react';
import type {
  ExperimentId,
  ExperimentResult,
  SessionSummary,
} from '@shared/types';
import { isExperimentId } from '@shared/types';
import { EXPERIMENT_META } from '@shared/config';
import { BrandMark } from '@/components/brand/Logo';
import { api } from '@/services/api';
import {
  downloadQueueBackup,
  pendingItems,
  type QueueItem,
} from '@/services/offlineQueue';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import {
  readCachedExperimentConfig,
  readLocalSummary,
} from '@/services/localStore';
import { formatMs } from '@/utils/timing';

export function CompletionPage() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const queryExperiment = searchParams.get('experiment');
  const local = useMemo(
    () => (sessionId ? readLocalSummary(sessionId) : null),
    [sessionId],
  );
  const localExperiment: ExperimentId | null = local?.experimentId ?? null;
  const queryId: ExperimentId | null =
    queryExperiment && isExperimentId(queryExperiment) ? queryExperiment : null;
  const experimentId = localExperiment ?? queryId;
  const meta = experimentId ? EXPERIMENT_META[experimentId] : null;
  const [summary, setSummary] = useState<SessionSummary | null>(local?.summary ?? null);
  const [showResults, setShowResults] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState<QueueItem[]>([]);
  const sync = useSyncStatus();

  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    void api
      .result(sessionId)
      .then((result: ExperimentResult & { show_results: boolean }) => {
        if (!active) return;
        if (result.summary) setSummary(result.summary);
        setShowResults(result.show_results);
        setLoadError('');
      })
      .catch(() => {
        if (!active) return;
        const fallbackId = localExperiment ?? queryId;
        const cached = fallbackId ? readCachedExperimentConfig(fallbackId) : null;
        if (cached) setShowResults(cached.config.showResultsToParticipant);
        setLoadError('无法连接服务器，当前展示的是本机保存的完成信息。');
      });
    return () => {
      active = false;
    };
  }, [sessionId, localExperiment, queryId]);

  useEffect(() => {
    let active = true;
    void pendingItems().then((items) => {
      if (active) setPending(items);
    });
    return () => {
      active = false;
    };
  }, [sync.pending]);

  if (!sessionId) {
    return (
      <div className="completion-wrap">
        <div className="completion-hero">
          <h1 className="completion-title">没有找到本次会话</h1>
          <p className="completion-lede">
            完成链接不完整。请返回实验目录重新开始。
          </p>
          <div className="completion-actions">
            <Link to="/experiments" className="btn btn--primary">
              返回实验目录
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const reveal = showResults === true;
  const accuracy = summary?.accuracy;

  return (
    <div className="completion-wrap">
      <div className="completion-hero">
        <div className="completion-sigil">
          <BrandMark />
        </div>
        <span className="eyebrow">Session complete</span>
        <h1 className="completion-title" style={{ marginTop: 14 }}>
          实验已完成
        </h1>
        <p className="completion-lede">
          感谢你认真完成{meta ? `「${meta.zhName}」` : '本次实验'}。
          你的逐试次数据、反应时和实验条件已随进度保存，并会以匿名编号归档。
        </p>
      </div>

      {summary && (
        <div className="completion-stats">
          <div className="completion-stat">
            <div className="completion-stat__value">
              {summary.completed_trials}
              <span style={{ fontSize: 18, color: 'var(--muted-light)' }}>
                {' '}
                / {summary.total_trials}
              </span>
            </div>
            <div className="completion-stat__label">完成正式试次</div>
          </div>
          <div className="completion-stat">
            <div className="completion-stat__value">
              {reveal && accuracy !== null && accuracy !== undefined
                ? `${Math.round(accuracy * 100)}%`
                : reveal
                  ? '—'
                  : '已记录'}
            </div>
            <div className="completion-stat__label">
              {reveal ? '任务正确率' : '结果展示已关闭'}
            </div>
          </div>
          <div className="completion-stat">
            <div className="completion-stat__value" style={{ fontSize: 26 }}>
              {reveal
                ? formatMs(summary.mean_response_time_ms)
                : summary.practice_completed
                  ? '练习完成'
                  : '正式数据'}
            </div>
            <div className="completion-stat__label">
              {reveal ? '正确反应平均反应时' : '研究者可查看完整数据'}
            </div>
          </div>
        </div>
      )}

      {!reveal && summary && (
        <div className="completion-card">
          <p style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.9 }}>
            本次研究选择不向参与者即时展示正确率与反应时，以避免影响后续参与者的表现和实验假设。
            如你对自己的参与记录有疑问，可向研究者提供被试编号查询。
          </p>
        </div>
      )}

      <div className="completion-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              className="feedback-mark feedback-mark--correct"
              style={{ width: 34, height: 34, flex: 'none' }}
            >
              <Check size={16} />
            </span>
            <div>
              <strong
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 650,
                  color: 'var(--ink)',
                }}
              >
                {pending.length === 0 ? '数据已安全保存' : `${pending.length} 条记录暂存在本机`}
              </strong>
              <span
                style={{
                  color: 'var(--muted)',
                  fontSize: 11,
                  lineHeight: 1.75,
                  display: 'block',
                  marginTop: 4,
                }}
              >
                {pending.length === 0
                  ? `会话编号 ${sessionId.slice(0, 8)}… 已归档。`
                  : '网络恢复后会自动重试上传。你也可以先下载本地备份，再联系研究者。'}
              </span>
            </div>
          </div>
          <span className="sync-indicator" style={{ flex: 'none' }}>
            <CloudUpload size={12} />
            {sync.online ? '在线' : '离线'}
          </span>
        </div>

        {pending.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--soft btn--sm"
              onClick={() => void sync.retry()}
            >
              <RefreshCw size={13} strokeWidth={1.7} />
              立即重试上传
            </button>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => downloadQueueBackup(pending)}
            >
              <Download size={13} strokeWidth={1.7} />
              下载本地备份
            </button>
          </div>
        )}
      </div>

      {loadError && (
        <p className="completion-footnote" role="status">
          {loadError}
        </p>
      )}

      <div className="completion-actions">
        {reveal && experimentId && (
          <Link
            to={`/results/${experimentId}?session=${encodeURIComponent(sessionId)}`}
            className="btn btn--primary"
          >
            查看详细结果
            <ArrowRight size={15} strokeWidth={1.7} />
          </Link>
        )}
        <Link to="/experiments" className={reveal && experimentId ? 'btn btn--soft' : 'btn btn--primary'}>
          返回实验目录
          {!(reveal && experimentId) && <ArrowRight size={15} strokeWidth={1.7} />}
        </Link>
        <Link to="/" className="btn btn--soft">
          回到首页
        </Link>
      </div>

      <p className="completion-footnote">
        请在方便时向研究者提供你的被试编号
        {sessionId ? `，或会话编号 ${sessionId.slice(0, 8)}…` : ''}。
        <br />
        数据仅用于研究分析；如需撤回，请联系实验主试。
      </p>
    </div>
  );
}
