import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import type {
  ExperimentId,
  MapAlignmentConfig,
  PerceptualOrderingConfig,
  SessionSummary,
  VisualSearchConfig,
} from '@shared/types';
import { isExperimentId } from '@shared/types';
import { api, type ConfigResponse } from '@/services/api';
import {
  cacheExperimentConfig,
  getParticipantId,
  hasActiveParticipantSession,
  hasRecordedConsent,
  readCachedExperimentConfig,
} from '@/services/localStore';
import { useExperimentRuntime } from '@/experiments/shared/useExperimentRuntime';
import { VisualSearchTask } from '@/experiments/visual-search/VisualSearchTask';
import { PerceptualOrderingTask } from '@/experiments/perceptual-ordering/PerceptualOrderingTask';
import { MapAlignmentTask } from '@/experiments/map-alignment/MapAlignmentTask';

export function ExperimentRunnerPage() {
  const { experimentId } = useParams();
  const navigate = useNavigate();
  const participantId = getParticipantId();
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingCache, setUsingCache] = useState(false);

  const id: ExperimentId | null =
    experimentId && isExperimentId(experimentId) ? experimentId : null;

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
            ? loadError.message
            : '无法读取实验配置，请检查网络。',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return <Navigate to="/experiments" replace />;
  if (!participantId || !hasRecordedConsent() || !hasActiveParticipantSession()) {
    return <Navigate to={`/enter/${id}`} replace />;
  }

  if (loading) {
    return (
      <div className="experiment-page">
        <main className="experiment-main">
          <div className="runtime-panel">
            <LoaderCircle className="spinner" size={26} />
            <p className="runtime-lede">正在准备实验环境…</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="experiment-page">
        <main className="experiment-main">
          <div className="runtime-panel">
            <span className="runtime-eyebrow">Cannot start</span>
            <h1 className="runtime-title">实验暂时无法开始</h1>
            <p className="runtime-lede">{error || '未取得实验配置。'}</p>
            <div className="runtime-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void load()}
              >
                重新加载
              </button>
              <button
                type="button"
                className="btn btn--soft"
                onClick={() => navigate(`/instructions/${id}`)}
              >
                返回说明
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <ExperimentRun
      id={id}
      data={data}
      participantId={participantId}
      usingCache={usingCache}
      onComplete={(_summary, sessionId) => {
        // Completion goes straight to the detailed results. The old
        // /complete/:sessionId route remains only as a fallback for links that
        // were shared before this flow changed.
        navigate(
          `/results/${encodeURIComponent(id)}?participant=${encodeURIComponent(
            participantId,
          )}&session=${encodeURIComponent(sessionId)}`,
          { replace: true },
        );
      }}
    />
  );
}

function ExperimentRun({
  id,
  data,
  participantId,
  usingCache,
  onComplete,
}: {
  id: ExperimentId;
  data: ConfigResponse;
  participantId: string;
  usingCache: boolean;
  onComplete: (summary: SessionSummary, sessionId: string) => void;
}) {
  const runtime = useExperimentRuntime({
    participantId,
    experimentId: id,
    config: data.config,
    configVersion: data.version,
  });

  return (
    <>
      {usingCache && (
        <span className="sr-only" role="status">
          正在使用本机缓存配置 v{data.version}
        </span>
      )}
      {id === 'visual-search' && (
        <VisualSearchTask
          config={data.config as VisualSearchConfig}
          runtime={runtime}
          onComplete={onComplete}
        />
      )}
      {id === 'perceptual-ordering' && (
        <PerceptualOrderingTask
          config={data.config as PerceptualOrderingConfig}
          runtime={runtime}
          onComplete={onComplete}
        />
      )}
      {id === 'map-alignment' && (
        <MapAlignmentTask
          config={data.config as MapAlignmentConfig}
          runtime={runtime}
          onComplete={onComplete}
        />
      )}
    </>
  );
}
