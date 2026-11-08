export function StatusBadge({ status }: { status: 'completed' | 'in_progress' }) {
  return (
    <span
      className={`status-badge ${
        status === 'completed' ? 'status-badge--completed' : 'status-badge--progress'
      }`}
    >
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: 99,
          background: 'currentColor',
        }}
      />
      {status === 'completed' ? '已完成' : '进行中'}
    </span>
  );
}
