import type { ReactNode } from 'react';

import { Button } from '../atoms/Button';
import { Sheet } from '../molecules/Sheet';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  text?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /** Destructive confirmations use a danger outline instead of the ink button. */
  tone?: 'default' | 'danger';
  loading?: boolean;
  children?: ReactNode;
}

/** Asks before doing something that is not easy to undo. */
export function ConfirmSheet({ visible, title, text, confirmLabel, onConfirm, onClose, tone = 'default', loading, children }: ConfirmSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      description={text}
      footer={
        <>
          <Button
            label={confirmLabel}
            onPress={onConfirm}
            variant={tone === 'danger' ? 'secondary' : 'primary'}
            tone={tone}
            size="lg"
            fullWidth
            loading={loading}
          />
          <Button label="Cancel" variant="ghost" onPress={onClose} fullWidth />
        </>
      }
    >
      {children}
    </Sheet>
  );
}
