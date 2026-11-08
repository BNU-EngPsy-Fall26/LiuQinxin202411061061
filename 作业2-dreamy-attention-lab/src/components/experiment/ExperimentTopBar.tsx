import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Wifi, WifiOff } from 'lucide-react';
import { BrandMark } from '@/components/brand/Logo';
import { Progress } from '@/components/ui/Progress';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import type { ExperimentPhase } from '@shared/types';

export function ExperimentTopBar({
  title,
  phase,
  current,
  total,
  blockLabel,
  blockCurrent,
  blockTotal,
  allowExit = true,
}: {
  title: string;
  phase: ExperimentPhase;
  current: number;
  total: number;
  blockLabel?: string;
  blockCurrent?: number;
  blockTotal?: number;
  allowExit?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const navigate = useNavigate();
  const sync = useSyncStatus();

  return (
    <>
      <header className="experiment-topbar">
        <div className="experiment-brand">
          <BrandMark className="brand-mark" />
          <span>Dreamy Attention Lab · {title}</span>
        </div>
        <div className="experiment-status">
          <span
            className={`sync-indicator${sync.pending > 0 ? ' is-pending' : ''}`}
            title={
              sync.pending > 0
                ? '数据已暂存在本机，正在等待上传'
                : '数据已逐试次保存'
            }
          >
            {sync.online ? <Wifi size={11} /> : <WifiOff size={11} />}
            <span className="dot" />
            {sync.pending > 0 ? `${sync.pending} 条待上传` : '已保存'}
          </span>
          <div className="progress-cluster">
            <span className="progress-label">
              {phase === 'practice'
                ? `练习 ${Math.min(current, total)} / ${total}`
                : blockLabel && blockTotal
                  ? `${blockLabel} · ${Math.min(blockCurrent ?? 0, blockTotal)} / ${blockTotal}`
                  : `正式 ${Math.min(current, total)} / ${total}`}
            </span>
            <Progress
              value={phase === 'practice' ? current : blockCurrent ?? current}
              max={phase === 'practice' ? total : blockTotal ?? total}
              label="当前 Block 进度"
            />
          </div>
          {allowExit && (
            <button
              type="button"
              className="experiment-exit"
              onClick={() => setConfirmOpen(true)}
            >
              <LogOut size={11} style={{ display: 'inline', marginRight: 4 }} />
              退出
            </button>
          )}
        </div>
      </header>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="结束本次参与？"
        description="当前进度已经保存。退出后本次会话会保持“未完成”状态，研究者仍可看到已上传的试次。如只是暂时离开，建议完成当前阶段后再退出。"
        confirmLabel="退出实验"
        cancelLabel="继续实验"
        destructive
        onConfirm={() => navigate('/experiments')}
      />
    </>
  );
}
