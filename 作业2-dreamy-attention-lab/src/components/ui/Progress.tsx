export function Progress({
  value,
  max,
  label,
  className = '',
}: {
  value: number;
  max: number;
  label?: string;
  className?: string;
}) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);
  const percent = (safeValue / safeMax) * 100;
  return (
    <div
      className={className}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      aria-label={label ?? '实验进度'}
    >
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
