import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  destructive = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="dialog-description">
              {description}
            </Dialog.Description>
          )}
          {children}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="btn btn--soft btn--sm">
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              className={`btn btn--sm ${destructive ? 'btn--danger' : 'btn--primary'}`}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
