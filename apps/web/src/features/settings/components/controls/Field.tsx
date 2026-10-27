import { AlertCircle } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, type ReactNode } from 'react';

import { tweens } from '@/features/onboarding/lib/motion';
import { cn } from '@kestrel/ui';

export interface FieldIds {
  controlId: string;
  labelId: string;
  helpId: string;
  errorId: string;
  /** Pass to the control's `aria-describedby`. */
  describedBy: string | undefined;
}

export interface FieldProps {
  label: ReactNode;
  /** Optional marker, e.g. "optional" or "required". */
  hint?: ReactNode;
  help?: ReactNode;
  error?: string | null;
  className?: string;
  /** Render prop so the control gets the right ids. */
  children: (ids: FieldIds) => ReactNode;
  /** Render the label as a <span> (for groups) instead of a <label for>. */
  asGroup?: boolean;
  'data-testid'?: string;
}

/**
 * DESIGN §6.1 forms: label above the control, helper in `small fg-tertiary`, errors in `small danger`
 * with an AlertCircle, linked through `aria-describedby` (DESIGN §9 forms).
 */
export function Field({ label, hint, help, error, className, children, asGroup, ...rest }: FieldProps) {
  const id = useId();
  const ids: FieldIds = {
    controlId: `${id}-control`,
    labelId: `${id}-label`,
    helpId: `${id}-help`,
    errorId: `${id}-error`,
    describedBy: [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined,
  };
  const Label = asGroup ? 'span' : 'label';
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)} data-testid={rest['data-testid']}>
      <div className="flex items-baseline justify-between gap-2">
        <Label
          id={ids.labelId}
          {...(!asGroup && { htmlFor: ids.controlId })}
          className="text-body font-medium text-fg"
        >
          {label}
        </Label>
        {hint && <span className="text-caption text-fg-tertiary">{hint}</span>}
      </div>
      {children(ids)}
      {help && (
        <p id={ids.helpId} className="text-small text-fg-tertiary">
          {help}
        </p>
      )}
      <AnimatePresence initial={false}>
        {error && (
          <m.p
            key="error"
            id={ids.errorId}
            role="alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tweens.fadeIn }}
            exit={{ opacity: 0, transition: tweens.fadeOut }}
            className="flex items-start gap-1.5 text-small text-danger"
          >
            <AlertCircle className="mt-px size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>{error}</span>
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}
