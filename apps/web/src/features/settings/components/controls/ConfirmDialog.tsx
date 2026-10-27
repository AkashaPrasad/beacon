import { AlertDialog } from 'radix-ui';
import { useId, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { scrimClasses } from '@/components/ui/styles';
import { cn } from '@kestrel/ui';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /** Extra content between the description and the buttons (e.g. "Type DELETE"). */
  children?: ReactNode;
  confirmLabel: string;
  /** While true the confirm button shows its pending state and Cancel is disabled. */
  pending?: boolean;
  confirmDisabled?: boolean;
  tone?: 'danger' | 'neutral';
  onConfirm: () => void;
  'data-testid'?: string;
  confirmTestId?: string;
}

/**
 * Alert Dialog for the few irreversible actions (DESIGN §8 rule 6): removing a stored API key and
 * deleting the account. Focus starts on Cancel; Esc and the scrim close it unless an action is pending.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pending = false,
  confirmDisabled = false,
  tone = 'danger',
  onConfirm,
  confirmTestId,
  ...rest
}: ConfirmDialogProps) {
  const descriptionId = useId();
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={scrimClasses} />
        <AlertDialog.Content
          data-testid={rest['data-testid']}
          aria-describedby={descriptionId}
          className={cn(
            'fixed top-1/2 left-1/2 z-modal grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-overlay p-6 text-fg shadow-lg outline-none sm:max-w-md',
            'duration-fast data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[state=open]:ease-out',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:ease-in',
          )}
        >
          <div className="flex flex-col gap-2">
            <AlertDialog.Title className="text-h2 text-fg">{title}</AlertDialog.Title>
            <AlertDialog.Description id={descriptionId} className="text-body text-fg-secondary">
              {description}
            </AlertDialog.Description>
          </div>
          {children}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={confirmDisabled || pending}
              aria-busy={pending || undefined}
              data-testid={confirmTestId}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
