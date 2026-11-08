import { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, RefreshCw } from 'lucide-react';
import type { ExperimentId } from '@shared/types';
import {
  readHw2Status,
  readHw2TrialBuffer,
  submitHw2Session,
  subscribeHw2Upload,
  type Hw2SubmissionStatus,
} from '@/services/hw2Upload';

/**
 * Slim status strip for the course-platform upload. It sits above the result
 * tabs and never changes the analysis panels themselves.
 */
export function Hw2UploadStatus({
  experimentId,
  sessionId,
}: {
  experimentId: ExperimentId;
  sessionId: string;
}) {
  const [status, setStatus] = useState<Hw2SubmissionStatus | null>(() =>
    readHw2Status(sessionId),
  );
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setStatus(readHw2Status(sessionId));
    const unsubscribe = subscribeHw2Upload(() =>
      setStatus(readHw2Status(sessionId)),
    );

    // If the result page was opened directly (for example after a reload
    // between completion and submission), the durable buffer is still here.
    // This is a fallback for the one automatic attempt, not a second upload.
    const buffer = readHw2TrialBuffer(sessionId);
    if (buffer && buffer.trials.length > 0 && !readHw2Status(sessionId)) {
      void submitHw2Session(experimentId, sessionId);
    }

    return unsubscribe;
  }, [experimentId, sessionId]);

  const retry = useCallback(async () => {
    setRetrying(true);
    setMessage('');
    const outcome = await submitHw2Session(experimentId, sessionId, {
      manual: true,
    });
    setRetrying(false);
    if (outcome.status === 'success') {
      setMessage('重新提交成功。');
    } else if (outcome.status === 'failed') {
      setMessage(outcome.error ?? '重新提交失败，本地数据仍然保留。');
    } else if (outcome.status === 'empty') {
      setMessage('没有找到本会话的本地待上传数据。');
    }
  }, [experimentId, sessionId]);

  if (!sessionId || !status) return null;

  if (status.status === 'success') {
    return (
      <div
        className="notice"
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          margin: '0 0 16px',
          padding: '10px 14px',
          fontSize: 11,
          color: '#506b58',
        }}
      >
        <Check size={13} strokeWidth={1.8} style={{ flex: 'none' }} />
        <span>
          本次实验数据已提交到课程数据收集平台
          {status.record_id ? ` · 记录 ${status.record_id}` : ''}。
          {status.warnings ? ` 平台提示：${status.warnings}` : ''}
        </span>
      </div>
    );
  }

  const pendingAge =
    status.status === 'pending'
      ? Date.now() - Date.parse(status.updated_at)
      : 0;
  const stalePending =
    status.status === 'pending' &&
    Number.isFinite(pendingAge) &&
    pendingAge > 60_000;

  if (status.status === 'pending' && !stalePending) {
    return (
      <div
        className="notice"
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          margin: '0 0 16px',
          padding: '10px 14px',
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        <LoaderCircle className="spinner" size={13} />
        <span>正在向课程数据收集平台提交本次实验数据…</span>
      </div>
    );
  }

  const failureText =
    status.status === 'failed'
      ? status.error || '网络不可用'
      : '可能网络中断，平台是否收到数据尚不确定';

  return (
    <div
      className="config-error"
      role="alert"
      style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
    >
      <span style={{ flex: 1, minWidth: 220 }}>
        课程平台提交{status.status === 'failed' ? '失败' : '状态未确认'}：
        {failureText}。本地数据已保留，可重试。
        {message ? ` ${message}` : ''}
      </span>
      <button
        type="button"
        className="btn btn--soft btn--sm"
        onClick={() => void retry()}
        disabled={retrying}
      >
        {retrying ? (
          <LoaderCircle className="spinner" size={13} />
        ) : (
          <RefreshCw size={13} strokeWidth={1.7} />
        )}
        {retrying ? '正在重试…' : '重试上传'}
      </button>
    </div>
  );
}
