import type { MeasurementSamples } from '@/services/api';

export function MouseTrajectory({
  samples,
  compact = false,
}: {
  samples: MeasurementSamples['mouse_samples'];
  compact?: boolean;
}) {
  const points = samples
    .filter((sample) => sample.valid !== false)
    .map((sample) => {
      const x = numberValue(sample.normalized_x);
      const y = numberValue(sample.normalized_y);
      if (x === null || y === null) return null;
      return `${(x * 100).toFixed(2)},${((1 - y) * 100).toFixed(2)}`;
    })
    .filter((point): point is string => point !== null);
  if (points.length < 2) {
    return <div className="result-warning">该试次鼠标样本不足，无法绘制轨迹。</div>;
  }
  const start = points[0].split(',');
  const end = points[points.length - 1].split(',');
  return (
    <figure className={`result-trajectory${compact ? ' result-trajectory--compact' : ''}`}>
      <svg viewBox="0 0 100 100" role="img" aria-label="鼠标轨迹，刺激区域归一化坐标">
        <rect x="0" y="0" width="100" height="100" className="result-trajectory__bg" />
        <polyline points={points.join(' ')} className="result-trajectory__line" />
        <circle cx={start[0]} cy={start[1]} r="2" className="result-trajectory__start" />
        <circle cx={end[0]} cy={end[1]} r="2" className="result-trajectory__end" />
      </svg>
      <figcaption>
        鼠标轨迹（归一化刺激区域，左上为原点；绿点为起点，橙点为终点）。
        图中只含鼠标坐标，不叠加眼动采样。
      </figcaption>
    </figure>
  );
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
